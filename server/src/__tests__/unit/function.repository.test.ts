import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { FunctionRepository } from '../../repositories/function.repository.js';

function createInMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE functions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      function_id INTEGER NOT NULL REFERENCES functions(id),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      UNIQUE(name, function_id)
    );

    CREATE TABLE uploads (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      rows_ingested INTEGER NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'success',
      uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE sprint_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upload_id TEXT NOT NULL REFERENCES uploads(id),
      sno INTEGER,
      team TEXT NOT NULL,
      track TEXT NOT NULL,
      project TEXT NOT NULL,
      portfolio TEXT NOT NULL,
      jira_id TEXT NOT NULL,
      function_name TEXT NOT NULL DEFAULT 'Unassigned',
      ingested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      UNIQUE(jira_id, team)
    );
  `);

  // Create a default upload for sprint_data entries
  db.prepare(
    `INSERT INTO uploads (id, file_name, uploaded_by, rows_ingested, status)
     VALUES ('upload-1', 'test.xlsx', 'user1', 0, 'success')`
  ).run();

  return db;
}

describe('FunctionRepository', () => {
  let db: Database.Database;
  let repo: FunctionRepository;

  beforeEach(() => {
    db = createInMemoryDb();
    repo = new FunctionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getAll', () => {
    it('should return an empty array when no functions exist', () => {
      const result = repo.getAll();
      expect(result).toEqual([]);
    });

    it('should return all functions ordered by name ascending', () => {
      db.prepare("INSERT INTO functions (name) VALUES ('Zebra')").run();
      db.prepare("INSERT INTO functions (name) VALUES ('Alpha')").run();
      db.prepare("INSERT INTO functions (name) VALUES ('Middle')").run();

      const result = repo.getAll();
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Alpha');
      expect(result[1].name).toBe('Middle');
      expect(result[2].name).toBe('Zebra');
    });

    it('should return records with id, name, and createdAt', () => {
      db.prepare("INSERT INTO functions (name) VALUES ('TestFunc')").run();

      const result = repo.getAll();
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name', 'TestFunc');
      expect(result[0]).toHaveProperty('createdAt');
      expect(result[0].id).toBeGreaterThan(0);
    });
  });

  describe('getById', () => {
    it('should return a function by its ID', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO functions (name) VALUES ('TestFunc')").run();
      const id = lastInsertRowid as number;

      const result = repo.getById(id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(id);
      expect(result!.name).toBe('TestFunc');
    });

    it('should return null for non-existent ID', () => {
      const result = repo.getById(9999);
      expect(result).toBeNull();
    });
  });

  describe('getByName', () => {
    it('should find a function by exact name', () => {
      db.prepare("INSERT INTO functions (name) VALUES ('E-Com')").run();

      const result = repo.getByName('E-Com');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('E-Com');
    });

    it('should find a function case-insensitively', () => {
      db.prepare("INSERT INTO functions (name) VALUES ('E-Com')").run();

      const result = repo.getByName('e-com');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('E-Com');
    });

    it('should find a function with different casing', () => {
      db.prepare("INSERT INTO functions (name) VALUES ('E-Com')").run();

      const result = repo.getByName('E-COM');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('E-Com');
    });

    it('should return null for non-existent name', () => {
      const result = repo.getByName('NonExistent');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a function with a valid name', () => {
      const result = repo.create('NewFunction');
      expect(result.id).toBeGreaterThan(0);
      expect(result.name).toBe('NewFunction');
      expect(result.createdAt).toBeDefined();
    });

    it('should trim whitespace from the name', () => {
      const result = repo.create('  Trimmed  ');
      expect(result.name).toBe('Trimmed');
    });

    it('should reject empty name', () => {
      expect(() => repo.create('')).toThrow('Function name must not be empty or whitespace-only');
    });

    it('should reject whitespace-only name', () => {
      expect(() => repo.create('   ')).toThrow('Function name must not be empty or whitespace-only');
    });

    it('should reject name longer than 100 characters', () => {
      const longName = 'A'.repeat(101);
      expect(() => repo.create(longName)).toThrow('Function name must not exceed 100 characters');
    });

    it('should accept name with exactly 100 characters', () => {
      const name100 = 'A'.repeat(100);
      const result = repo.create(name100);
      expect(result.name).toBe(name100);
    });

    it('should reject duplicate name (case-insensitive)', () => {
      repo.create('MyFunction');
      expect(() => repo.create('myfunction')).toThrow('A Function with this name already exists');
    });

    it('should reject duplicate name (same case)', () => {
      repo.create('MyFunction');
      expect(() => repo.create('MyFunction')).toThrow('A Function with this name already exists');
    });

    it('should reject duplicate name (different case)', () => {
      repo.create('MyFunction');
      expect(() => repo.create('MYFUNCTION')).toThrow('A Function with this name already exists');
    });
  });

  describe('rename', () => {
    let funcId: number;

    beforeEach(() => {
      const created = repo.create('OriginalName');
      funcId = created.id;
    });

    it('should rename a function successfully', () => {
      const result = repo.rename(funcId, 'NewName');
      expect(result.id).toBe(funcId);
      expect(result.name).toBe('NewName');
    });

    it('should trim whitespace from new name', () => {
      const result = repo.rename(funcId, '  Trimmed  ');
      expect(result.name).toBe('Trimmed');
    });

    it('should update sprint_data.function_name atomically', () => {
      // Insert sprint_data rows referencing the function
      db.prepare(
        `INSERT INTO sprint_data (upload_id, team, track, project, portfolio, jira_id, function_name)
         VALUES ('upload-1', 'TeamA', 'Track1', 'Proj1', 'Port1', 'J-1', 'OriginalName')`
      ).run();
      db.prepare(
        `INSERT INTO sprint_data (upload_id, team, track, project, portfolio, jira_id, function_name)
         VALUES ('upload-1', 'TeamB', 'Track1', 'Proj1', 'Port1', 'J-2', 'OriginalName')`
      ).run();
      db.prepare(
        `INSERT INTO sprint_data (upload_id, team, track, project, portfolio, jira_id, function_name)
         VALUES ('upload-1', 'TeamC', 'Track1', 'Proj1', 'Port1', 'J-3', 'OtherFunction')`
      ).run();

      repo.rename(funcId, 'RenamedFunction');

      // Verify sprint_data rows with old name are updated
      const updatedRows = db.prepare(
        "SELECT COUNT(*) as count FROM sprint_data WHERE function_name = 'RenamedFunction'"
      ).get() as { count: number };
      expect(updatedRows.count).toBe(2);

      // Verify other function's rows are not touched
      const otherRows = db.prepare(
        "SELECT COUNT(*) as count FROM sprint_data WHERE function_name = 'OtherFunction'"
      ).get() as { count: number };
      expect(otherRows.count).toBe(1);

      // Verify no rows with old name remain
      const oldRows = db.prepare(
        "SELECT COUNT(*) as count FROM sprint_data WHERE function_name = 'OriginalName'"
      ).get() as { count: number };
      expect(oldRows.count).toBe(0);
    });

    it('should throw for non-existent function', () => {
      expect(() => repo.rename(9999, 'NewName')).toThrow('Function not found');
    });

    it('should reject empty new name', () => {
      expect(() => repo.rename(funcId, '')).toThrow('Function name must not be empty or whitespace-only');
    });

    it('should reject whitespace-only new name', () => {
      expect(() => repo.rename(funcId, '   ')).toThrow('Function name must not be empty or whitespace-only');
    });

    it('should reject new name longer than 100 characters', () => {
      const longName = 'B'.repeat(101);
      expect(() => repo.rename(funcId, longName)).toThrow('Function name must not exceed 100 characters');
    });

    it('should reject duplicate new name (case-insensitive)', () => {
      repo.create('ExistingFunc');
      expect(() => repo.rename(funcId, 'existingfunc')).toThrow('A Function with this name already exists');
    });

    it('should allow renaming to same name with different case', () => {
      // Renaming "OriginalName" to "originalname" should be allowed (same function)
      const result = repo.rename(funcId, 'originalname');
      expect(result.name).toBe('originalname');
    });
  });

  describe('delete', () => {
    it('should delete a function with no associated teams', () => {
      const created = repo.create('ToDelete');
      repo.delete(created.id);

      const result = repo.getById(created.id);
      expect(result).toBeNull();
    });

    it('should throw for non-existent function', () => {
      expect(() => repo.delete(9999)).toThrow('Function not found');
    });

    it('should throw when function has associated teams', () => {
      const created = repo.create('HasTeams');
      db.prepare(
        "INSERT INTO teams (name, function_id) VALUES ('TeamA', @functionId)"
      ).run({ functionId: created.id });

      expect(() => repo.delete(created.id)).toThrow('Cannot delete: Function has associated Teams');
    });

    it('should not affect other functions', () => {
      const func1 = repo.create('Func1');
      const func2 = repo.create('Func2');

      repo.delete(func1.id);

      expect(repo.getById(func1.id)).toBeNull();
      expect(repo.getById(func2.id)).not.toBeNull();
    });
  });

  describe('hasTeams', () => {
    it('should return false when no teams exist for function', () => {
      const created = repo.create('NoTeams');
      expect(repo.hasTeams(created.id)).toBe(false);
    });

    it('should return true when teams exist for function', () => {
      const created = repo.create('WithTeams');
      db.prepare(
        "INSERT INTO teams (name, function_id) VALUES ('Team1', @functionId)"
      ).run({ functionId: created.id });

      expect(repo.hasTeams(created.id)).toBe(true);
    });

    it('should return true when multiple teams exist', () => {
      const created = repo.create('MultiTeams');
      db.prepare(
        "INSERT INTO teams (name, function_id) VALUES ('Team1', @functionId)"
      ).run({ functionId: created.id });
      db.prepare(
        "INSERT INTO teams (name, function_id) VALUES ('Team2', @functionId)"
      ).run({ functionId: created.id });

      expect(repo.hasTeams(created.id)).toBe(true);
    });

    it('should not count teams from other functions', () => {
      const func1 = repo.create('Func1');
      const func2 = repo.create('Func2');
      db.prepare(
        "INSERT INTO teams (name, function_id) VALUES ('Team1', @functionId)"
      ).run({ functionId: func2.id });

      expect(repo.hasTeams(func1.id)).toBe(false);
      expect(repo.hasTeams(func2.id)).toBe(true);
    });
  });
});
