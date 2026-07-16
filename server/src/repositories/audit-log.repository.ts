import type Database from 'better-sqlite3';
import type { AuditEntry, AuditAction, AuditFilter } from '../types/rbac-analytics.types';
import { getDatabase } from '../database/connection.js';

/**
 * Repository interface for audit log database operations.
 */
export interface IAuditLogRepository {
  /**
   * Insert an audit log entry within the provided transaction or standalone.
   * Returns the inserted entry's id.
   */
  insert(entry: Omit<AuditEntry, 'id' | 'timestamp'>, db?: Database.Database): number;

  /**
   * Query audit log entries with dynamic filters and pagination.
   */
  query(filter: AuditFilter, limit?: number, offset?: number): AuditEntry[];

  /**
   * Get all audit log entries for a specific record, ordered by timestamp ascending.
   */
  getByRecordId(recordId: number): AuditEntry[];
}

/**
 * Maps a database row (snake_case) to an AuditEntry (camelCase).
 */
function mapRowToAuditEntry(row: Record<string, unknown>): AuditEntry {
  const modifiedFieldsRaw = row.modified_fields as string | null;
  return {
    id: row.id as number,
    userId: row.user_id as string,
    action: row.action as AuditAction,
    recordId: row.record_id as number,
    recordType: row.record_type as 'sprint_data',
    teamId: row.team_id as string,
    modifiedFields: modifiedFieldsRaw ? JSON.parse(modifiedFieldsRaw) : null,
    timestamp: row.timestamp as string,
  };
}

/**
 * SQLite implementation of the audit log repository using better-sqlite3.
 * All operations are synchronous (better-sqlite3 is synchronous) but wrapped
 * in async interfaces for consistency with the service layer.
 */
export class AuditLogRepository implements IAuditLogRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
  }

  /**
   * Insert an audit log entry. Accepts an optional db parameter to participate
   * in an external transaction (for transactional writes with data mutations).
   *
   * The timestamp is generated server-side in UTC ISO 8601 format.
   */
  insert(entry: Omit<AuditEntry, 'id' | 'timestamp'>, db?: Database.Database): number {
    const database = db ?? this.db;
    const timestamp = new Date().toISOString();
    const modifiedFieldsJson = entry.modifiedFields
      ? JSON.stringify(entry.modifiedFields)
      : null;

    const stmt = database.prepare(`
      INSERT INTO audit_logs (user_id, action, record_id, record_type, team_id, modified_fields, timestamp)
      VALUES (@userId, @action, @recordId, @recordType, @teamId, @modifiedFields, @timestamp)
    `);

    const result = stmt.run({
      userId: entry.userId,
      action: entry.action,
      recordId: entry.recordId,
      recordType: entry.recordType,
      teamId: entry.teamId,
      modifiedFields: modifiedFieldsJson,
      timestamp,
    });

    return result.lastInsertRowid as number;
  }

  /**
   * Query audit log entries with dynamic filters and pagination.
   * Supports filtering by userId, action, startDate, endDate, and teamId.
   * Results are ordered by timestamp descending (newest first).
   */
  query(filter: AuditFilter, limit: number = 100, offset: number = 0): AuditEntry[] {
    const conditions: string[] = [];
    const params: Record<string, string | number> = {};

    if (filter.userId) {
      conditions.push('user_id = @userId');
      params.userId = filter.userId;
    }

    if (filter.action) {
      conditions.push('action = @action');
      params.action = filter.action;
    }

    if (filter.startDate) {
      conditions.push('timestamp >= @startDate');
      params.startDate = filter.startDate;
    }

    if (filter.endDate) {
      // Include the full end date day by comparing with the next day
      conditions.push('timestamp <= @endDate');
      params.endDate = filter.endDate + 'T23:59:59.999Z';
    }

    if (filter.teamId) {
      conditions.push('team_id = @teamId');
      params.teamId = filter.teamId;
    }

    let sql = 'SELECT * FROM audit_logs';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY timestamp DESC';
    sql += ' LIMIT @limit OFFSET @offset';

    params.limit = limit;
    params.offset = offset;

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(params) as Record<string, unknown>[];
    return rows.map(mapRowToAuditEntry);
  }

  /**
   * Get all audit log entries for a specific record, ordered by timestamp ascending (chronological).
   */
  getByRecordId(recordId: number): AuditEntry[] {
    const stmt = this.db.prepare(
      'SELECT * FROM audit_logs WHERE record_id = @recordId ORDER BY timestamp ASC'
    );
    const rows = stmt.all({ recordId }) as Record<string, unknown>[];
    return rows.map(mapRowToAuditEntry);
  }
}
