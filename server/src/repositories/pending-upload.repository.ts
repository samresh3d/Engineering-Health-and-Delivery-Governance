import type Database from 'better-sqlite3';
import { getDatabase } from '../database/connection';

export interface PendingUpload {
  id: string;
  rows: unknown[];
  functionId: number;
  userId: string;
  filename: string;
  newTeams: string[];
  expiresAt: Date;
  createdAt: Date;
}

export interface CreatePendingUploadInput {
  id: string;
  rows: unknown[];
  functionId: number;
  userId: string;
  filename: string;
  newTeams: string[];
}

/** TTL for pending uploads in milliseconds (15 minutes) */
const PENDING_UPLOAD_TTL_MS = 15 * 60 * 1000;

/**
 * Repository for managing pending upload records.
 * Pending uploads store parsed upload data while awaiting user confirmation
 * for new team creation.
 */
export class PendingUploadRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
  }

  /**
   * Create a new pending upload record with a 15-minute TTL.
   */
  create(input: CreatePendingUploadInput): PendingUpload {
    const expiresAt = new Date(Date.now() + PENDING_UPLOAD_TTL_MS);

    const stmt = this.db.prepare(
      `INSERT INTO pending_uploads (id, rows_json, function_id, user_id, filename, new_teams_json, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    stmt.run(
      input.id,
      JSON.stringify(input.rows),
      input.functionId,
      input.userId,
      input.filename,
      JSON.stringify(input.newTeams),
      expiresAt.toISOString()
    );

    return {
      id: input.id,
      rows: input.rows,
      functionId: input.functionId,
      userId: input.userId,
      filename: input.filename,
      newTeams: input.newTeams,
      expiresAt,
      createdAt: new Date(),
    };
  }

  /**
   * Retrieve a pending upload by ID. Returns null if not found or expired.
   */
  getById(id: string): PendingUpload | null {
    const row = this.db.prepare(
      `SELECT id, rows_json, function_id, user_id, filename, new_teams_json, expires_at, created_at
       FROM pending_uploads
       WHERE id = ?`
    ).get(id) as {
      id: string;
      rows_json: string;
      function_id: number;
      user_id: string;
      filename: string;
      new_teams_json: string;
      expires_at: string;
      created_at: string;
    } | undefined;

    if (!row) {
      return null;
    }

    const expiresAt = new Date(row.expires_at);

    // Check if expired
    if (expiresAt <= new Date()) {
      // Clean up expired record
      this.delete(id);
      return null;
    }

    return {
      id: row.id,
      rows: JSON.parse(row.rows_json),
      functionId: row.function_id,
      userId: row.user_id,
      filename: row.filename,
      newTeams: JSON.parse(row.new_teams_json),
      expiresAt,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Delete a pending upload by ID.
   * Returns true if a record was deleted, false if not found.
   */
  delete(id: string): boolean {
    const result = this.db.prepare(
      `DELETE FROM pending_uploads WHERE id = ?`
    ).run(id);

    return result.changes > 0;
  }

  /**
   * Remove all expired pending uploads.
   * Returns the number of records cleaned up.
   */
  cleanupExpired(): number {
    const now = new Date().toISOString();
    const result = this.db.prepare(
      `DELETE FROM pending_uploads WHERE expires_at <= ?`
    ).run(now);

    return result.changes;
  }
}
