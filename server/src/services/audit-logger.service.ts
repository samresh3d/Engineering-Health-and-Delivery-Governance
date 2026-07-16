import type Database from 'better-sqlite3';
import type { AuditEntry, AuditFilter } from '../types/rbac-analytics.types';
import { AuditLogRepository, type IAuditLogRepository } from '../repositories/audit-log.repository';
import { getDatabase } from '../database/connection.js';

/**
 * Interface for the Audit Logger Service.
 * Provides methods to log data mutations, query audit entries, and retrieve record history.
 */
export interface IAuditLoggerService {
  /** Log a data mutation event. Must be called within the same transaction as the data mutation. */
  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void>;

  /** Query audit log entries with filters and pagination. */
  query(filter: AuditFilter, limit?: number, offset?: number): Promise<AuditEntry[]>;

  /** Get audit history for a specific record, ordered chronologically. */
  getRecordHistory(recordId: number): Promise<AuditEntry[]>;

  /**
   * Execute a data mutation and its corresponding audit log entry within a single transaction.
   * If either the mutation or the audit log insert fails, both are rolled back.
   *
   * @param mutationFn - Function that performs the data mutation. Receives the db instance.
   * @param auditEntry - The audit entry to log (without id and timestamp).
   * @returns The result of the mutation function.
   */
  withAuditLog<T>(
    mutationFn: (db: Database.Database) => T,
    auditEntry: Omit<AuditEntry, 'id' | 'timestamp'>
  ): Promise<T>;
}

/**
 * Audit Logger Service implementation.
 *
 * Key behaviors:
 * - Audit log writes MUST NOT fail silently. If an audit log insert fails,
 *   the originating data mutation transaction MUST be rolled back.
 * - Audit log entries are immutable — no UPDATE or DELETE operations.
 * - Timestamps are generated in UTC ISO 8601 format.
 * - The `modified_fields` column stores a JSON array of field names for updates, NULL for create/delete.
 * - Query results for `getRecordHistory` are ordered by timestamp ascending (chronological).
 */
export class AuditLoggerService implements IAuditLoggerService {
  private repository: IAuditLogRepository;
  private db: Database.Database;

  constructor(repository?: IAuditLogRepository, db?: Database.Database) {
    this.db = db ?? getDatabase();
    this.repository = repository ?? new AuditLogRepository(this.db);
  }

  /**
   * Log a data mutation event.
   * This performs a standalone insert — for transactional guarantees with data mutations,
   * use `withAuditLog` instead.
   *
   * @throws Error if the audit log insert fails
   */
  async log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
    this.repository.insert(entry, this.db);
  }

  /**
   * Query audit log entries with dynamic filters and pagination.
   *
   * @param filter - Filter criteria (userId, action, startDate, endDate, teamId)
   * @param limit - Maximum number of results (default: 100)
   * @param offset - Number of results to skip (default: 0)
   * @returns Array of matching audit entries ordered by timestamp descending
   */
  async query(filter: AuditFilter, limit?: number, offset?: number): Promise<AuditEntry[]> {
    return this.repository.query(filter, limit, offset);
  }

  /**
   * Get the complete audit history for a specific record.
   *
   * @param recordId - The ID of the record to get history for
   * @returns Array of audit entries ordered by timestamp ascending (chronological)
   */
  async getRecordHistory(recordId: number): Promise<AuditEntry[]> {
    return this.repository.getByRecordId(recordId);
  }

  /**
   * Execute a data mutation and its corresponding audit log entry within a single transaction.
   * If either the mutation or the audit log insert fails, the entire transaction is rolled back.
   *
   * This ensures the audit log is never out of sync with the actual data state.
   *
   * @param mutationFn - Function that performs the data mutation. Receives the db instance.
   * @param auditEntry - The audit entry to log (without id and timestamp).
   * @returns The result of the mutation function.
   * @throws Error if either the mutation or audit log insert fails (both are rolled back)
   */
  async withAuditLog<T>(
    mutationFn: (db: Database.Database) => T,
    auditEntry: Omit<AuditEntry, 'id' | 'timestamp'>
  ): Promise<T> {
    const transaction = this.db.transaction(() => {
      // Execute the data mutation first
      const result = mutationFn(this.db);

      // Insert the audit log entry within the same transaction
      // If this fails, the entire transaction (including the data mutation) rolls back
      this.repository.insert(auditEntry, this.db);

      return result;
    });

    return transaction();
  }
}
