import type Database from 'better-sqlite3';
import type { Division, DivisionWithProjects } from '../types/governance.types';
import type { IAuditLoggerService } from './audit-logger.service';
import { AuditLoggerService } from './audit-logger.service';
import { getDatabase } from '../database/connection.js';

/**
 * Interface for the Division Service.
 * Manages CRUD operations on divisions (track values) within a team,
 * and project-to-division assignment.
 */
export interface IDivisionService {
  /** List all divisions for a given team */
  listByTeam(teamId: string): Promise<Division[]>;

  /** Create a new division within a team */
  create(teamId: string, name: string, userId: string): Promise<Division>;

  /** Rename an existing division */
  rename(teamId: string, oldName: string, newName: string, userId: string): Promise<Division>;

  /** Delete a division (only if no projects assigned) */
  delete(teamId: string, divisionName: string, userId: string): Promise<void>;

  /** Assign a project to a division within the same team */
  assignProject(teamId: string, projectName: string, divisionName: string, userId: string): Promise<void>;

  /** Get projects grouped by division for a team */
  getProjectsByDivision(teamId: string): Promise<DivisionWithProjects[]>;
}

/** Validation error messages */
const DIVISION_ERRORS = {
  NAME_REQUIRED: 'Division name is required',
  NAME_TOO_LONG: 'Division name must not exceed 100 characters',
  DUPLICATE_NAME: 'A division with this name already exists in the team',
  NOT_FOUND: 'Division not found',
  HAS_PROJECTS: 'Cannot delete division with assigned projects. Reassign all projects first.',
  PROJECT_NOT_IN_TEAM: 'Project not found in this team',
  DIVISION_NOT_FOUND_FOR_ASSIGN: 'Division not found in this team',
} as const;

/**
 * Division Service implementation.
 *
 * "Division" is a presentation-layer rename of the existing `track` column in sprint_data.
 * There is no separate divisions table — divisions are distinct track values per team.
 */
export class DivisionService implements IDivisionService {
  private db: Database.Database;
  private auditLogger: IAuditLoggerService;

  constructor(db?: Database.Database, auditLogger?: IAuditLoggerService) {
    this.db = db ?? getDatabase();
    this.auditLogger = auditLogger ?? new AuditLoggerService(undefined, this.db);
  }

  /**
   * List all divisions (distinct track values) for a given team.
   * Returns each division with its project count.
   */
  async listByTeam(teamId: string): Promise<Division[]> {
    const stmt = this.db.prepare(`
      SELECT 
        track AS name,
        team AS teamId,
        COUNT(DISTINCT project) AS projectCount,
        MIN(ingested_at) AS createdAt
      FROM sprint_data
      WHERE team = @teamId
      GROUP BY track
      ORDER BY track ASC
    `);

    const rows = stmt.all({ teamId }) as Array<{
      name: string;
      teamId: string;
      projectCount: number;
      createdAt: string;
    }>;

    return rows.map((row, index) => ({
      id: index + 1,
      name: row.name,
      teamId: row.teamId,
      projectCount: row.projectCount,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Create a new division (track value) within a team.
   * Validates the name and checks for uniqueness (case-insensitive).
   * Logs the operation to the audit log.
   *
   * Note: Since divisions are just track values, "creating" a division means
   * inserting a placeholder row that establishes the track value. However,
   * since there's no separate divisions table, we validate and log the creation,
   * and the division becomes visible once projects are assigned to it.
   * For immediate visibility, we validate and return the division info.
   */
  async create(teamId: string, name: string, userId: string): Promise<Division> {
    const trimmedName = name.trim();

    // Validate name
    this.validateDivisionName(trimmedName);

    // Check uniqueness (case-insensitive) within team
    this.checkUniqueness(teamId, trimmedName);

    // Log to audit. Use record_id 0 since there's no single row being created.
    await this.auditLogger.log({
      userId,
      action: 'create',
      recordId: 0,
      recordType: 'sprint_data',
      teamId,
      modifiedFields: null,
    });

    return {
      id: 0,
      name: trimmedName,
      teamId,
      projectCount: 0,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Rename an existing division (track value) within a team.
   * Updates all sprint_data rows with the old track to the new track value.
   * Validates the new name and checks for uniqueness (case-insensitive).
   * Logs the operation to the audit log.
   */
  async rename(teamId: string, oldName: string, newName: string, userId: string): Promise<Division> {
    const trimmedNewName = newName.trim();

    // Validate new name
    this.validateDivisionName(trimmedNewName);

    // Verify old division exists
    const existsStmt = this.db.prepare(`
      SELECT COUNT(*) AS count FROM sprint_data 
      WHERE team = @teamId AND LOWER(track) = LOWER(@oldName)
    `);
    const existsResult = existsStmt.get({ teamId, oldName }) as { count: number };
    if (existsResult.count === 0) {
      throw new DivisionError(DIVISION_ERRORS.NOT_FOUND, 404);
    }

    // Check uniqueness of new name (case-insensitive), excluding the old name
    if (oldName.toLowerCase() !== trimmedNewName.toLowerCase()) {
      this.checkUniqueness(teamId, trimmedNewName);
    }

    // Update all sprint_data rows with the old track value to the new track value
    const updateStmt = this.db.prepare(`
      UPDATE sprint_data 
      SET track = @newName 
      WHERE team = @teamId AND LOWER(track) = LOWER(@oldName)
    `);
    const updateResult = updateStmt.run({ newName: trimmedNewName, teamId, oldName });

    // Log to audit
    await this.auditLogger.log({
      userId,
      action: 'update',
      recordId: 0,
      recordType: 'sprint_data',
      teamId,
      modifiedFields: ['track'],
    });

    // Get updated project count
    const countStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT project) AS projectCount 
      FROM sprint_data 
      WHERE team = @teamId AND LOWER(track) = LOWER(@newName)
    `);
    const countResult = countStmt.get({ teamId, newName: trimmedNewName }) as { projectCount: number };

    return {
      id: 0,
      name: trimmedNewName,
      teamId,
      projectCount: countResult.projectCount,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Delete a division (track value) within a team.
   * Rejects if there are any projects assigned to this division.
   * Logs the operation to the audit log.
   */
  async delete(teamId: string, divisionName: string, userId: string): Promise<void> {
    // Check if division exists
    const existsStmt = this.db.prepare(`
      SELECT COUNT(*) AS count FROM sprint_data 
      WHERE team = @teamId AND LOWER(track) = LOWER(@divisionName)
    `);
    const existsResult = existsStmt.get({ teamId, divisionName }) as { count: number };
    if (existsResult.count === 0) {
      throw new DivisionError(DIVISION_ERRORS.NOT_FOUND, 404);
    }

    // Check if any projects are assigned to this division
    const projectCountStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT project) AS projectCount 
      FROM sprint_data 
      WHERE team = @teamId AND LOWER(track) = LOWER(@divisionName)
    `);
    const projectCountResult = projectCountStmt.get({ teamId, divisionName }) as { projectCount: number };

    if (projectCountResult.projectCount > 0) {
      throw new DivisionError(DIVISION_ERRORS.HAS_PROJECTS, 400);
    }

    // Remove all sprint_data rows for this division in the team
    const deleteStmt = this.db.prepare(`
      DELETE FROM sprint_data 
      WHERE team = @teamId AND LOWER(track) = LOWER(@divisionName)
    `);
    deleteStmt.run({ teamId, divisionName });

    // Log to audit
    await this.auditLogger.log({
      userId,
      action: 'delete',
      recordId: 0,
      recordType: 'sprint_data',
      teamId,
      modifiedFields: null,
    });
  }

  /**
   * Assign a project to a division within the same team.
   * Updates the track field for all rows of the specified project within the team.
   */
  async assignProject(teamId: string, projectName: string, divisionName: string, userId: string): Promise<void> {
    // Verify project exists in the team
    const projectStmt = this.db.prepare(`
      SELECT COUNT(*) AS count FROM sprint_data 
      WHERE team = @teamId AND project = @projectName
    `);
    const projectResult = projectStmt.get({ teamId, projectName }) as { count: number };
    if (projectResult.count === 0) {
      throw new DivisionError(DIVISION_ERRORS.PROJECT_NOT_IN_TEAM, 400);
    }

    // Verify division exists in the team (case-insensitive check)
    const divisionStmt = this.db.prepare(`
      SELECT track FROM sprint_data 
      WHERE team = @teamId AND LOWER(track) = LOWER(@divisionName)
      LIMIT 1
    `);
    const divisionResult = divisionStmt.get({ teamId, divisionName }) as { track: string } | undefined;
    if (!divisionResult) {
      throw new DivisionError(DIVISION_ERRORS.DIVISION_NOT_FOUND_FOR_ASSIGN, 404);
    }

    // Use the exact track value from the database for consistency
    const actualTrackName = divisionResult.track;

    // Update all sprint_data rows for the project to the new track value
    const updateStmt = this.db.prepare(`
      UPDATE sprint_data 
      SET track = @divisionName 
      WHERE team = @teamId AND project = @projectName
    `);
    updateStmt.run({ divisionName: actualTrackName, teamId, projectName });

    // Log to audit
    await this.auditLogger.log({
      userId,
      action: 'update',
      recordId: 0,
      recordType: 'sprint_data',
      teamId,
      modifiedFields: ['track'],
    });
  }

  /**
   * Get projects grouped by division (track value) for a team.
   */
  async getProjectsByDivision(teamId: string): Promise<DivisionWithProjects[]> {
    const stmt = this.db.prepare(`
      SELECT track, project 
      FROM sprint_data 
      WHERE team = @teamId
      GROUP BY track, project
      ORDER BY track ASC, project ASC
    `);

    const rows = stmt.all({ teamId }) as Array<{ track: string; project: string }>;

    // Group projects by track (division)
    const divisionMap = new Map<string, string[]>();
    for (const row of rows) {
      const projects = divisionMap.get(row.track) || [];
      projects.push(row.project);
      divisionMap.set(row.track, projects);
    }

    const result: DivisionWithProjects[] = [];
    for (const [divisionName, projects] of divisionMap) {
      result.push({ divisionName, projects });
    }

    return result;
  }

  /**
   * Validate division name: non-empty after trimming, max 100 chars.
   */
  private validateDivisionName(name: string): void {
    if (!name || name.length === 0) {
      throw new DivisionError(DIVISION_ERRORS.NAME_REQUIRED, 400);
    }
    if (name.length > 100) {
      throw new DivisionError(DIVISION_ERRORS.NAME_TOO_LONG, 400);
    }
  }

  /**
   * Check that no division with the same name (case-insensitive) exists in the team.
   */
  private checkUniqueness(teamId: string, name: string): void {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) AS count FROM sprint_data 
      WHERE team = @teamId AND LOWER(track) = LOWER(@name)
    `);
    const result = stmt.get({ teamId, name }) as { count: number };
    if (result.count > 0) {
      throw new DivisionError(DIVISION_ERRORS.DUPLICATE_NAME, 400);
    }
  }
}

/**
 * Custom error class for division-related errors with HTTP status codes.
 */
export class DivisionError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'DivisionError';
    this.statusCode = statusCode;
  }
}
