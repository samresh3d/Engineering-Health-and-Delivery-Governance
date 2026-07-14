import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { initializeDatabase, getDatabase, closeDatabase } from '../../database/connection';
import { runMigrations } from '../../database/migrate';
import path from 'path';
import fs from 'fs';
import os from 'os';

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ehd-test-'));
  dbPath = path.join(tempDir, 'test.db');
});

afterEach(() => {
  closeDatabase();
  // Clean up temp files - ignore errors if files don't exist
  try {
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      fs.unlinkSync(path.join(tempDir, file));
    }
    fs.rmdirSync(tempDir);
  } catch {
    // Ignore cleanup errors in tests
  }
});

describe('Database Connection', () => {
  it('initializes a database with WAL mode', () => {
    const db = initializeDatabase(dbPath);
    const result = db.pragma('journal_mode', { simple: true });
    expect(result).toBe('wal');
  });

  it('enables foreign keys', () => {
    const db = initializeDatabase(dbPath);
    const result = db.pragma('foreign_keys', { simple: true });
    expect(result).toBe(1);
  });

  it('returns the same instance on subsequent calls', () => {
    const db1 = initializeDatabase(dbPath);
    const db2 = initializeDatabase(dbPath);
    expect(db1).toBe(db2);
  });

  it('getDatabase throws if not initialized', () => {
    expect(() => getDatabase()).toThrow('Database not initialized');
  });

  it('getDatabase returns instance after initialization', () => {
    initializeDatabase(dbPath);
    const db = getDatabase();
    expect(db).toBeDefined();
  });

  it('closeDatabase resets the singleton', () => {
    initializeDatabase(dbPath);
    closeDatabase();
    expect(() => getDatabase()).toThrow('Database not initialized');
  });
});

describe('Database Migrations', () => {
  it('creates all 7 tables and indexes on first run', async () => {
    initializeDatabase(dbPath);
    await runMigrations();

    const db = getDatabase();

    // Check all 7 tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_%' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('uploads');
    expect(tableNames).toContain('sprint_data');
    expect(tableNames).toContain('kpi_results');
    expect(tableNames).toContain('team_config');
    expect(tableNames).toContain('track_portfolio_mapping');
    expect(tableNames).toContain('rag_thresholds');
    expect(tableNames).toContain('users');

    // Check indexes exist
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
      .all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain('idx_sprint_data_team');
    expect(indexNames).toContain('idx_sprint_data_portfolio');
    expect(indexNames).toContain('idx_sprint_data_project');
    expect(indexNames).toContain('idx_sprint_data_dev_start');
    expect(indexNames).toContain('idx_sprint_data_jira_team');
    expect(indexNames).toContain('idx_kpi_results_lookup');
  });

  it('tracks applied migrations in _migrations table', async () => {
    initializeDatabase(dbPath);
    await runMigrations();

    const db = getDatabase();
    const rows = db.prepare('SELECT id, description FROM _migrations').all() as {
      id: string;
      description: string;
    }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('001-initial-schema');
    expect(rows[0].description).toBe('Create initial database schema with all 7 tables and indexes');
  });

  it('is idempotent - does not re-apply already applied migrations', async () => {
    initializeDatabase(dbPath);

    await runMigrations();
    await runMigrations(); // Run again - should not throw

    const db = getDatabase();
    const rows = db.prepare('SELECT id FROM _migrations').all();
    expect(rows).toHaveLength(1);
  });

  it('sprint_data table enforces UNIQUE(jira_id, team) constraint', async () => {
    initializeDatabase(dbPath);
    await runMigrations();

    const db = getDatabase();

    // Insert an upload first (foreign key)
    db.prepare("INSERT INTO uploads (id, file_name, uploaded_by) VALUES ('u1', 'test.xlsx', 'admin')").run();

    // Insert a sprint_data row
    db.prepare(
      `INSERT INTO sprint_data (upload_id, sno, team, track, project, portfolio, jira_id)
       VALUES ('u1', 1, 'TeamA', 'TrackX', 'ProjectY', 'PortfolioZ', 'JIRA-1')`
    ).run();

    // Duplicate should fail
    expect(() => {
      db.prepare(
        `INSERT INTO sprint_data (upload_id, sno, team, track, project, portfolio, jira_id)
         VALUES ('u1', 2, 'TeamA', 'TrackX', 'ProjectY', 'PortfolioZ', 'JIRA-1')`
      ).run();
    }).toThrow();
  });

  it('users table enforces role CHECK constraint', async () => {
    initializeDatabase(dbPath);
    await runMigrations();

    const db = getDatabase();

    // Valid role should work
    db.prepare("INSERT INTO users (id, username, role, token) VALUES ('1', 'admin', 'Admin', 'tok1')").run();

    // Invalid role should fail
    expect(() => {
      db.prepare(
        "INSERT INTO users (id, username, role, token) VALUES ('2', 'bad', 'InvalidRole', 'tok2')"
      ).run();
    }).toThrow();
  });
});
