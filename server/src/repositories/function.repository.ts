import type Database from 'better-sqlite3';
import type { FunctionRecord } from '../types/hierarchy.types.js';
import { getDatabase } from '../database/connection.js';

/**
 * Repository interface for Function entity CRUD operations.
 */
export interface IFunctionRepository {
  getAll(): FunctionRecord[];
  getById(id: number): FunctionRecord | null;
  getByName(name: string): FunctionRecord | null;
  create(name: string): FunctionRecord;
  rename(id: number, newName: string): FunctionRecord;
  delete(id: number): void;
  hasTeams(id: number): boolean;
}

/**
 * Maps a database row (snake_case) to a FunctionRecord (camelCase).
 */
function mapRowToFunctionRecord(row: Record<string, unknown>): FunctionRecord {
  return {
    id: row.id as number,
    name: row.name as string,
    createdAt: row.created_at as string,
  };
}

/**
 * SQLite implementation of the Function repository using better-sqlite3.
 * All operations are synchronous. Uses transactions for operations that
 * touch multiple tables (e.g., rename cascades to sprint_data).
 */
export class FunctionRepository implements IFunctionRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
  }

  /**
   * Get all functions ordered by name ascending.
   */
  getAll(): FunctionRecord[] {
    const rows = this.db.prepare(
      'SELECT id, name, created_at FROM functions ORDER BY name ASC'
    ).all() as Record<string, unknown>[];
    return rows.map(mapRowToFunctionRecord);
  }

  /**
   * Get a function by its ID.
   * @returns The function record or null if not found.
   */
  getById(id: number): FunctionRecord | null {
    const row = this.db.prepare(
      'SELECT id, name, created_at FROM functions WHERE id = @id'
    ).get({ id }) as Record<string, unknown> | undefined;
    return row ? mapRowToFunctionRecord(row) : null;
  }

  /**
   * Get a function by name using case-insensitive comparison.
   * Relies on COLLATE NOCASE on the name column.
   * @returns The function record or null if not found.
   */
  getByName(name: string): FunctionRecord | null {
    const row = this.db.prepare(
      'SELECT id, name, created_at FROM functions WHERE name = @name COLLATE NOCASE'
    ).get({ name }) as Record<string, unknown> | undefined;
    return row ? mapRowToFunctionRecord(row) : null;
  }

  /**
   * Create a new function with the given name.
   * @param name - The function name (1-100 chars, not blank/whitespace-only).
   * @returns The created function record.
   * @throws Error if name is invalid or a duplicate exists (case-insensitive).
   */
  create(name: string): FunctionRecord {
    const trimmedName = name.trim();

    this.validateName(trimmedName);
    this.checkDuplicate(trimmedName);

    const result = this.db.prepare(
      'INSERT INTO functions (name) VALUES (@name)'
    ).run({ name: trimmedName });

    const id = result.lastInsertRowid as number;
    return this.getById(id)!;
  }

  /**
   * Rename a function. Updates both the functions table and all
   * sprint_data.function_name entries atomically within a transaction.
   * @param id - The function ID to rename.
   * @param newName - The new name (1-100 chars, not blank/whitespace-only).
   * @returns The updated function record.
   * @throws Error if function not found, name invalid, or duplicate exists.
   */
  rename(id: number, newName: string): FunctionRecord {
    const trimmedName = newName.trim();

    this.validateName(trimmedName);

    const existing = this.getById(id);
    if (!existing) {
      throw new Error('Function not found');
    }

    // Check for duplicate, excluding the current function
    this.checkDuplicate(trimmedName, id);

    const oldName = existing.name;

    // Perform rename atomically: update functions.name + all sprint_data.function_name
    const renameTransaction = this.db.transaction(() => {
      this.db.prepare(
        'UPDATE functions SET name = @newName WHERE id = @id'
      ).run({ newName: trimmedName, id });

      this.db.prepare(
        'UPDATE sprint_data SET function_name = @newName WHERE function_name = @oldName'
      ).run({ newName: trimmedName, oldName });
    });

    renameTransaction();

    return this.getById(id)!;
  }

  /**
   * Delete a function by ID.
   * @param id - The function ID to delete.
   * @throws Error if function not found or has associated teams.
   */
  delete(id: number): void {
    const existing = this.getById(id);
    if (!existing) {
      throw new Error('Function not found');
    }

    if (this.hasTeams(id)) {
      throw new Error('Cannot delete: Function has associated Teams');
    }

    this.db.prepare('DELETE FROM functions WHERE id = @id').run({ id });
  }

  /**
   * Check whether a function has any associated teams.
   * @param id - The function ID to check.
   * @returns true if at least one team is associated.
   */
  hasTeams(id: number): boolean {
    const result = this.db.prepare(
      'SELECT COUNT(*) as count FROM teams WHERE function_id = @id'
    ).get({ id }) as { count: number };
    return result.count > 0;
  }

  /**
   * Validates function name constraints:
   * - Not empty or whitespace-only
   * - Between 1 and 100 characters
   */
  private validateName(name: string): void {
    if (!name || name.length === 0) {
      throw new Error('Function name must not be empty or whitespace-only');
    }
    if (name.length > 100) {
      throw new Error('Function name must not exceed 100 characters');
    }
  }

  /**
   * Checks for duplicate function name (case-insensitive).
   * @param name - The name to check.
   * @param excludeId - Optional ID to exclude (for rename operations).
   * @throws Error if a duplicate is found.
   */
  private checkDuplicate(name: string, excludeId?: number): void {
    const existing = this.getByName(name);
    if (existing && existing.id !== excludeId) {
      throw new Error('A Function with this name already exists');
    }
  }
}
