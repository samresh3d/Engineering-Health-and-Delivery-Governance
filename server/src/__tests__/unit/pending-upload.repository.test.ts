import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { PendingUploadRepository } from '../../repositories/pending-upload.repository.js';

function createInMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE pending_uploads (
      id TEXT PRIMARY KEY,
      rows_json TEXT NOT NULL,
      function_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      new_teams_json TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE INDEX idx_pending_uploads_expires_at ON pending_uploads(expires_at);
    CREATE INDEX idx_pending_uploads_user_id ON pending_uploads(user_id);
  `);

  return db;
}

describe('PendingUploadRepository', () => {
  let db: Database.Database;
  let repo: PendingUploadRepository;

  beforeEach(() => {
    db = createInMemoryDb();
    repo = new PendingUploadRepository(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  describe('create', () => {
    it('should create a pending upload and return it', () => {
      const input = {
        id: 'test-uuid-123',
        rows: [{ Team: 'Beta', Track: 'Web' }],
        functionId: 1,
        userId: 'user-abc',
        filename: 'sprint-data.xlsx',
        newTeams: ['Beta'],
      };

      const result = repo.create(input);

      expect(result.id).toBe('test-uuid-123');
      expect(result.rows).toEqual([{ Team: 'Beta', Track: 'Web' }]);
      expect(result.functionId).toBe(1);
      expect(result.userId).toBe('user-abc');
      expect(result.filename).toBe('sprint-data.xlsx');
      expect(result.newTeams).toEqual(['Beta']);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should set expiry to approximately 15 minutes from now', () => {
      const before = Date.now();
      const result = repo.create({
        id: 'test-uuid-456',
        rows: [],
        functionId: 1,
        userId: 'user-abc',
        filename: 'test.xlsx',
        newTeams: ['Alpha'],
      });
      const after = Date.now();

      const fifteenMinMs = 15 * 60 * 1000;
      const expiresMs = result.expiresAt.getTime();

      expect(expiresMs).toBeGreaterThanOrEqual(before + fifteenMinMs);
      expect(expiresMs).toBeLessThanOrEqual(after + fifteenMinMs);
    });

    it('should store multiple rows as JSON', () => {
      const rows = [
        { Team: 'Beta', Track: 'Web', Project: 'P1' },
        { Team: 'Gamma', Track: 'Mobile', Project: 'P2' },
        { Team: 'Beta', Track: 'API', Project: 'P3' },
      ];

      repo.create({
        id: 'multi-rows',
        rows,
        functionId: 2,
        userId: 'user-xyz',
        filename: 'data.xlsx',
        newTeams: ['Beta', 'Gamma'],
      });

      const retrieved = repo.getById('multi-rows');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.rows).toEqual(rows);
      expect(retrieved!.newTeams).toEqual(['Beta', 'Gamma']);
    });
  });

  describe('getById', () => {
    it('should retrieve a pending upload by ID', () => {
      repo.create({
        id: 'find-me',
        rows: [{ Team: 'Delta' }],
        functionId: 3,
        userId: 'user-find',
        filename: 'find.xlsx',
        newTeams: ['Delta'],
      });

      const result = repo.getById('find-me');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('find-me');
      expect(result!.rows).toEqual([{ Team: 'Delta' }]);
      expect(result!.functionId).toBe(3);
      expect(result!.userId).toBe('user-find');
      expect(result!.filename).toBe('find.xlsx');
      expect(result!.newTeams).toEqual(['Delta']);
    });

    it('should return null for non-existent ID', () => {
      const result = repo.getById('does-not-exist');
      expect(result).toBeNull();
    });

    it('should return null and delete expired record', () => {
      // Manually insert an expired record
      const expiredDate = new Date(Date.now() - 1000).toISOString();
      db.prepare(
        `INSERT INTO pending_uploads (id, rows_json, function_id, user_id, filename, new_teams_json, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('expired-id', '[]', 1, 'user', 'file.xlsx', '["Team1"]', expiredDate);

      const result = repo.getById('expired-id');
      expect(result).toBeNull();

      // Verify the record was cleaned up
      const raw = db.prepare('SELECT * FROM pending_uploads WHERE id = ?').get('expired-id');
      expect(raw).toBeUndefined();
    });

    it('should return a valid record that has not expired yet', () => {
      const futureDate = new Date(Date.now() + 60000).toISOString();
      db.prepare(
        `INSERT INTO pending_uploads (id, rows_json, function_id, user_id, filename, new_teams_json, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('valid-id', '[{"Team":"X"}]', 5, 'user-v', 'valid.xlsx', '["X"]', futureDate);

      const result = repo.getById('valid-id');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('valid-id');
      expect(result!.newTeams).toEqual(['X']);
    });
  });

  describe('delete', () => {
    it('should delete an existing pending upload and return true', () => {
      repo.create({
        id: 'delete-me',
        rows: [],
        functionId: 1,
        userId: 'user',
        filename: 'del.xlsx',
        newTeams: ['A'],
      });

      const result = repo.delete('delete-me');
      expect(result).toBe(true);

      // Verify deletion
      const raw = db.prepare('SELECT * FROM pending_uploads WHERE id = ?').get('delete-me');
      expect(raw).toBeUndefined();
    });

    it('should return false when deleting non-existent record', () => {
      const result = repo.delete('no-such-id');
      expect(result).toBe(false);
    });

    it('should not affect other records', () => {
      repo.create({
        id: 'keep-me',
        rows: [{ a: 1 }],
        functionId: 1,
        userId: 'user',
        filename: 'keep.xlsx',
        newTeams: ['B'],
      });
      repo.create({
        id: 'remove-me',
        rows: [{ a: 2 }],
        functionId: 1,
        userId: 'user',
        filename: 'remove.xlsx',
        newTeams: ['C'],
      });

      repo.delete('remove-me');

      const kept = repo.getById('keep-me');
      expect(kept).not.toBeNull();
      expect(kept!.id).toBe('keep-me');
    });
  });

  describe('cleanupExpired', () => {
    it('should remove all expired records and return count', () => {
      const pastDate = new Date(Date.now() - 60000).toISOString();
      db.prepare(
        `INSERT INTO pending_uploads (id, rows_json, function_id, user_id, filename, new_teams_json, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('exp-1', '[]', 1, 'u', 'f.xlsx', '[]', pastDate);
      db.prepare(
        `INSERT INTO pending_uploads (id, rows_json, function_id, user_id, filename, new_teams_json, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('exp-2', '[]', 1, 'u', 'f.xlsx', '[]', pastDate);

      const cleaned = repo.cleanupExpired();
      expect(cleaned).toBe(2);

      const remaining = db.prepare('SELECT COUNT(*) as count FROM pending_uploads').get() as { count: number };
      expect(remaining.count).toBe(0);
    });

    it('should not remove non-expired records', () => {
      const futureDate = new Date(Date.now() + 600000).toISOString();
      const pastDate = new Date(Date.now() - 60000).toISOString();

      db.prepare(
        `INSERT INTO pending_uploads (id, rows_json, function_id, user_id, filename, new_teams_json, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('still-valid', '[]', 1, 'u', 'f.xlsx', '[]', futureDate);
      db.prepare(
        `INSERT INTO pending_uploads (id, rows_json, function_id, user_id, filename, new_teams_json, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('already-expired', '[]', 1, 'u', 'f.xlsx', '[]', pastDate);

      const cleaned = repo.cleanupExpired();
      expect(cleaned).toBe(1);

      const valid = repo.getById('still-valid');
      expect(valid).not.toBeNull();
    });

    it('should return 0 when no expired records exist', () => {
      const futureDate = new Date(Date.now() + 600000).toISOString();
      db.prepare(
        `INSERT INTO pending_uploads (id, rows_json, function_id, user_id, filename, new_teams_json, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('future-1', '[]', 1, 'u', 'f.xlsx', '[]', futureDate);

      const cleaned = repo.cleanupExpired();
      expect(cleaned).toBe(0);
    });
  });
});
