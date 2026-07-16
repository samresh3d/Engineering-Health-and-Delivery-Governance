import type Database from 'better-sqlite3';
import type { TeamRecord } from '../types/hierarchy.types.js';
import { getDatabase } from '../database/connection.js';

/**
 * Repository interface for Team entity CRUD operations.
 */
export interface ITeamRepository {
  getByFunction(functionId: number): TeamRecord[];
  getById(id: number): TeamRecord | null;
  getByNameAndFunction(name: string, functionId: number): TeamRecord | null;
  create(name: string, functionId: number): TeamRecord;
  rename(id: number, newName: string): TeamRecord;
  delete(id: number): void;
  hasSprintData(id: number): boolean;
}

/**
 * Maps a database row (snake_case) to a TeamRecord (camelCase).
 */
function mapRowToTeamRecord(row: Record<string, unknown>): TeamRecord {
  return {
    id: row.id as number,
    name: row.name as string,
    functionId: row.function_id as number,
    createdAt: row.created_at as string,
  };
}

/**
 * SQLite implementation of the Team repository using better-sqlite3.
 * All operations are synchronous. Uses transactions for operations that
 * touch multiple tables (e.g., rename cascades to sprint_data).
 */
export class TeamRepository implements ITeamRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
  }

  /**
   * Get all teams for a given function, ordered by name ascending.
   * @param functionId - The parent function ID.
   * @returns Array of team records.
   */
  getByFunction(functionId: number): TeamRecord[] {
    const rows = this.db.prepare(
      'SELECT id, name, function_id, created_at FROM teams WHERE function_id = @functionId ORDER BY name ASC'
    ).all({ functionId }) as Record<string, unknown>[];
    return rows.map(mapRowToTeamRecord);
  }

  /**
   * Get a team by its ID.
   * @returns The team record or null if not found.
   */
  getById(id: number): TeamRecord | null {
    const row = this.db.prepare(
      'SELECT id, name, function_id, created_at FROM teams WHERE id = @id'
    ).get({ id }) as Record<string, unknown> | undefined;
    return row ? mapRowToTeamRecord(row) : null;
  }

  /**
   * Get a team by name within a specific function.
   * Uses exact name match (the UNIQUE constraint on teams is (name, function_id)).
   * @param name - The team name to look up.
   * @param functionId - The parent function ID.
   * @returns The team record or null if not found.
   */
  getByNameAndFunction(name: string, functionId: number): TeamRecord | null {
    const row = this.db.prepare(
      'SELECT id, name, function_id, created_at FROM teams WHERE name = @name AND function_id = @functionId'
    ).get({ name, functionId }) as Record<string, unknown> | undefined;
    return row ? mapRowToTeamRecord(row) : null;
  }

  /**
   * Create a new team under the specified function.
   * @param name - The team name (1-100 chars after trimming, not blank/whitespace-only).
   * @param functionId - The parent function ID (must exist in functions table).
   * @returns The created team record.
   * @throws Error if name is invalid, parent function doesn't exist, or duplicate within function.
   */
  create(name: string, functionId: number): TeamRecord {
    const trimmedName = name.trim();

    this.validateName(trimmedName);
    this.validateFunctionExists(functionId);
    this.checkDuplicate(trimmedName, functionId);

    const result = this.db.prepare(
      'INSERT INTO teams (name, function_id) VALUES (@name, @functionId)'
    ).run({ name: trimmedName, functionId });

    const id = result.lastInsertRowid as number;
    return this.getById(id)!;
  }

  /**
   * Rename a team. Updates both the teams table and all sprint_data.team
   * entries for the team's parent function atomically within a transaction.
   * @param id - The team ID to rename.
   * @param newName - The new name (1-100 chars after trimming, not blank/whitespace-only).
   * @returns The updated team record.
   * @throws Error if team not found, name invalid, or duplicate within same function.
   */
  rename(id: number, newName: string): TeamRecord {
    const trimmedName = newName.trim();

    this.validateName(trimmedName);

    const existing = this.getById(id);
    if (!existing) {
      throw new Error('Team not found');
    }

    // Check for duplicate within the same function, excluding the current team
    this.checkDuplicate(trimmedName, existing.functionId, id);

    const oldName = existing.name;

    // Get the function name for scoping the sprint_data update
    const functionRow = this.db.prepare(
      'SELECT name FROM functions WHERE id = @functionId'
    ).get({ functionId: existing.functionId }) as { name: string } | undefined;

    // Perform rename atomically: update teams.name + sprint_data.team for that function
    const renameTransaction = this.db.transaction(() => {
      this.db.prepare(
        'UPDATE teams SET name = @newName WHERE id = @id'
      ).run({ newName: trimmedName, id });

      if (functionRow) {
        this.db.prepare(
          'UPDATE sprint_data SET team = @newName WHERE team = @oldName AND function_name = @functionName'
        ).run({ newName: trimmedName, oldName, functionName: functionRow.name });
      }
    });

    renameTransaction();

    return this.getById(id)!;
  }

  /**
   * Delete a team by ID.
   * @param id - The team ID to delete.
   * @throws Error if team not found or has associated sprint data.
   */
  delete(id: number): void {
    const existing = this.getById(id);
    if (!existing) {
      throw new Error('Team not found');
    }

    if (this.hasSprintData(id)) {
      throw new Error('Cannot delete: Team has associated sprint data entries');
    }

    this.db.prepare('DELETE FROM teams WHERE id = @id').run({ id });
  }

  /**
   * Check whether a team has any associated sprint data entries.
   * Matches by team name within the parent function's function_name.
   * @param id - The team ID to check.
   * @returns true if at least one sprint data entry exists for this team.
   */
  hasSprintData(id: number): boolean {
    const team = this.getById(id);
    if (!team) {
      return false;
    }

    // Get the function name to scope the query
    const functionRow = this.db.prepare(
      'SELECT name FROM functions WHERE id = @functionId'
    ).get({ functionId: team.functionId }) as { name: string } | undefined;

    if (!functionRow) {
      return false;
    }

    const result = this.db.prepare(
      'SELECT COUNT(*) as count FROM sprint_data WHERE team = @teamName AND function_name = @functionName'
    ).get({ teamName: team.name, functionName: functionRow.name }) as { count: number };

    return result.count > 0;
  }

  /**
   * Validates team name constraints:
   * - Not empty or whitespace-only (after trimming)
   * - Between 1 and 100 characters
   */
  private validateName(name: string): void {
    if (!name || name.length === 0) {
      throw new Error('Team name must not be empty or whitespace-only');
    }
    if (name.length > 100) {
      throw new Error('Team name must not exceed 100 characters');
    }
  }

  /**
   * Validates that the parent function exists in the functions table.
   * @param functionId - The function ID to validate.
   * @throws Error if the function does not exist.
   */
  private validateFunctionExists(functionId: number): void {
    const row = this.db.prepare(
      'SELECT id FROM functions WHERE id = @functionId'
    ).get({ functionId }) as { id: number } | undefined;

    if (!row) {
      throw new Error('Parent Function does not exist');
    }
  }

  /**
   * Checks for duplicate team name within the same function.
   * @param name - The team name to check.
   * @param functionId - The function to check within.
   * @param excludeId - Optional team ID to exclude (for rename operations).
   * @throws Error if a duplicate is found.
   */
  private checkDuplicate(name: string, functionId: number, excludeId?: number): void {
    const existing = this.getByNameAndFunction(name, functionId);
    if (existing && existing.id !== excludeId) {
      throw new Error('A Team with this name already exists in this Function');
    }
  }
}
