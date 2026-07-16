import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AuditLogRepository } from '../../repositories/audit-log.repository';
import { AuditLoggerService } from '../../services/audit-logger.service';
import type { AuditEntry } from '../../types/rbac-analytics.types';

function createInMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      action TEXT CHECK(action IN ('create', 'update', 'delete')) NOT NULL,
      record_id INTEGER NOT NULL,
      record_type TEXT NOT NULL DEFAULT 'sprint_data',
      team_id TEXT NOT NULL,
      modified_fields TEXT,
      timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
    CREATE INDEX idx_audit_logs_record ON audit_logs(record_id);
    CREATE INDEX idx_audit_logs_team ON audit_logs(team_id);
    CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
    CREATE INDEX idx_audit_logs_action ON audit_logs(action);
  `);

  return db;
}

describe('AuditLoggerService', () => {
  let db: Database.Database;
  let repository: AuditLogRepository;
  let service: AuditLoggerService;

  beforeEach(() => {
    db = createInMemoryDb();
    repository = new AuditLogRepository(db);
    service = new AuditLoggerService(repository, db);
  });

  afterEach(() => {
    db.close();
  });

  describe('log', () => {
    it('should insert an audit log entry for a create action', async () => {
      await service.log({
        userId: 'user-1',
        action: 'create',
        recordId: 42,
        recordType: 'sprint_data',
        teamId: 'Team Alpha',
        modifiedFields: null,
      });

      const entries = await service.getRecordHistory(42);
      expect(entries).toHaveLength(1);
      expect(entries[0].userId).toBe('user-1');
      expect(entries[0].action).toBe('create');
      expect(entries[0].recordId).toBe(42);
      expect(entries[0].recordType).toBe('sprint_data');
      expect(entries[0].teamId).toBe('Team Alpha');
      expect(entries[0].modifiedFields).toBeNull();
      expect(entries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should insert an audit log entry for an update action with modified fields', async () => {
      await service.log({
        userId: 'user-2',
        action: 'update',
        recordId: 100,
        recordType: 'sprint_data',
        teamId: 'Team Beta',
        modifiedFields: ['development_status', 'dev_end_date'],
      });

      const entries = await service.getRecordHistory(100);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('update');
      expect(entries[0].modifiedFields).toEqual(['development_status', 'dev_end_date']);
    });

    it('should insert an audit log entry for a delete action', async () => {
      await service.log({
        userId: 'admin-1',
        action: 'delete',
        recordId: 77,
        recordType: 'sprint_data',
        teamId: 'Team Gamma',
        modifiedFields: null,
      });

      const entries = await service.getRecordHistory(77);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('delete');
      expect(entries[0].modifiedFields).toBeNull();
    });

    it('should generate a valid UTC ISO 8601 timestamp', async () => {
      const before = new Date().toISOString();

      await service.log({
        userId: 'user-1',
        action: 'create',
        recordId: 1,
        recordType: 'sprint_data',
        teamId: 'Team Alpha',
        modifiedFields: null,
      });

      const after = new Date().toISOString();
      const entries = await service.getRecordHistory(1);
      const ts = entries[0].timestamp;

      expect(ts >= before).toBe(true);
      expect(ts <= after).toBe(true);
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      // Seed audit log entries
      await service.log({ userId: 'user-1', action: 'create', recordId: 1, recordType: 'sprint_data', teamId: 'Team Alpha', modifiedFields: null });
      await service.log({ userId: 'user-2', action: 'update', recordId: 2, recordType: 'sprint_data', teamId: 'Team Beta', modifiedFields: ['status'] });
      await service.log({ userId: 'user-1', action: 'update', recordId: 1, recordType: 'sprint_data', teamId: 'Team Alpha', modifiedFields: ['dev_end_date'] });
      await service.log({ userId: 'admin-1', action: 'delete', recordId: 3, recordType: 'sprint_data', teamId: 'Team Alpha', modifiedFields: null });
    });

    it('should return all entries when no filter is applied', async () => {
      const results = await service.query({});
      expect(results).toHaveLength(4);
    });

    it('should filter by userId', async () => {
      const results = await service.query({ userId: 'user-1' });
      expect(results).toHaveLength(2);
      expect(results.every(e => e.userId === 'user-1')).toBe(true);
    });

    it('should filter by action', async () => {
      const results = await service.query({ action: 'update' });
      expect(results).toHaveLength(2);
      expect(results.every(e => e.action === 'update')).toBe(true);
    });

    it('should filter by teamId', async () => {
      const results = await service.query({ teamId: 'Team Beta' });
      expect(results).toHaveLength(1);
      expect(results[0].teamId).toBe('Team Beta');
    });

    it('should combine multiple filters with AND logic', async () => {
      const results = await service.query({ userId: 'user-1', action: 'create' });
      expect(results).toHaveLength(1);
      expect(results[0].action).toBe('create');
      expect(results[0].userId).toBe('user-1');
    });

    it('should return results ordered by timestamp descending', async () => {
      const results = await service.query({});
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].timestamp >= results[i + 1].timestamp).toBe(true);
      }
    });

    it('should respect limit parameter', async () => {
      const results = await service.query({}, 2);
      expect(results).toHaveLength(2);
    });

    it('should respect offset parameter', async () => {
      const all = await service.query({});
      const offset = await service.query({}, 100, 2);
      expect(offset).toHaveLength(2);
      expect(offset[0].id).toBe(all[2].id);
    });

    it('should return empty array for non-matching filter', async () => {
      const results = await service.query({ userId: 'nonexistent' });
      expect(results).toHaveLength(0);
    });
  });

  describe('getRecordHistory', () => {
    it('should return entries ordered by timestamp ascending (chronological)', async () => {
      await service.log({ userId: 'user-1', action: 'create', recordId: 10, recordType: 'sprint_data', teamId: 'Team Alpha', modifiedFields: null });
      await service.log({ userId: 'user-1', action: 'update', recordId: 10, recordType: 'sprint_data', teamId: 'Team Alpha', modifiedFields: ['status'] });
      await service.log({ userId: 'admin-1', action: 'delete', recordId: 10, recordType: 'sprint_data', teamId: 'Team Alpha', modifiedFields: null });

      const history = await service.getRecordHistory(10);
      expect(history).toHaveLength(3);
      expect(history[0].action).toBe('create');
      expect(history[1].action).toBe('update');
      expect(history[2].action).toBe('delete');

      // Verify chronological ordering
      for (let i = 0; i < history.length - 1; i++) {
        expect(history[i].timestamp <= history[i + 1].timestamp).toBe(true);
      }
    });

    it('should return empty array for non-existent record', async () => {
      const history = await service.getRecordHistory(99999);
      expect(history).toHaveLength(0);
    });

    it('should only return entries for the specified record', async () => {
      await service.log({ userId: 'user-1', action: 'create', recordId: 20, recordType: 'sprint_data', teamId: 'Team Alpha', modifiedFields: null });
      await service.log({ userId: 'user-1', action: 'create', recordId: 21, recordType: 'sprint_data', teamId: 'Team Alpha', modifiedFields: null });

      const history = await service.getRecordHistory(20);
      expect(history).toHaveLength(1);
      expect(history[0].recordId).toBe(20);
    });
  });

  describe('withAuditLog (transactional)', () => {
    beforeEach(() => {
      // Create a simple table for testing transactional behavior
      db.exec(`
        CREATE TABLE test_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          value TEXT NOT NULL
        );
      `);
    });

    it('should commit both data mutation and audit log on success', async () => {
      const result = await service.withAuditLog(
        (txDb) => {
          const stmt = txDb.prepare('INSERT INTO test_data (value) VALUES (@value)');
          const info = stmt.run({ value: 'test-value' });
          return info.lastInsertRowid as number;
        },
        {
          userId: 'user-1',
          action: 'create',
          recordId: 1,
          recordType: 'sprint_data',
          teamId: 'Team Alpha',
          modifiedFields: null,
        }
      );

      expect(result).toBe(1);

      // Verify data was inserted
      const dataRow = db.prepare('SELECT * FROM test_data WHERE id = 1').get() as any;
      expect(dataRow.value).toBe('test-value');

      // Verify audit log was created
      const auditEntries = await service.getRecordHistory(1);
      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0].action).toBe('create');
    });

    it('should rollback both if the data mutation fails', async () => {
      await expect(
        service.withAuditLog(
          (_txDb) => {
            throw new Error('Mutation failed');
          },
          {
            userId: 'user-1',
            action: 'create',
            recordId: 2,
            recordType: 'sprint_data',
            teamId: 'Team Alpha',
            modifiedFields: null,
          }
        )
      ).rejects.toThrow('Mutation failed');

      // Verify no audit log was created
      const auditEntries = await service.getRecordHistory(2);
      expect(auditEntries).toHaveLength(0);
    });

    it('should rollback the data mutation if audit log insert fails', async () => {
      // Create a service with a bad repository that will fail on insert
      const brokenDb = createInMemoryDb();
      // Drop the audit_logs table to cause insert failure
      brokenDb.exec('DROP TABLE audit_logs');
      brokenDb.exec(`
        CREATE TABLE test_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          value TEXT NOT NULL
        );
      `);

      const brokenRepo = new AuditLogRepository(brokenDb);
      const brokenService = new AuditLoggerService(brokenRepo, brokenDb);

      await expect(
        brokenService.withAuditLog(
          (txDb) => {
            const stmt = txDb.prepare('INSERT INTO test_data (value) VALUES (@value)');
            stmt.run({ value: 'should-not-persist' });
            return 1;
          },
          {
            userId: 'user-1',
            action: 'create',
            recordId: 3,
            recordType: 'sprint_data',
            teamId: 'Team Alpha',
            modifiedFields: null,
          }
        )
      ).rejects.toThrow();

      // Verify data mutation was rolled back
      const dataRow = brokenDb.prepare('SELECT COUNT(*) as count FROM test_data').get() as any;
      expect(dataRow.count).toBe(0);

      brokenDb.close();
    });

    it('should return the mutation function result on success', async () => {
      const result = await service.withAuditLog(
        (txDb) => {
          txDb.prepare('INSERT INTO test_data (value) VALUES (@value)').run({ value: 'v1' });
          return { inserted: true, id: 42 };
        },
        {
          userId: 'user-1',
          action: 'create',
          recordId: 42,
          recordType: 'sprint_data',
          teamId: 'Team Alpha',
          modifiedFields: null,
        }
      );

      expect(result).toEqual({ inserted: true, id: 42 });
    });
  });
});
