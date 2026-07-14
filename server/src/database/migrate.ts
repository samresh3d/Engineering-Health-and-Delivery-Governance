import type Database from 'better-sqlite3';
import { getDatabase } from './connection';

/** Represents a migration module */
interface Migration {
  id: string;
  description: string;
  up: (db: Database.Database) => void;
}

/**
 * Load and return all migrations in order.
 * Returns a fresh array each time to avoid accumulation across multiple calls.
 */
async function loadMigrations(): Promise<Migration[]> {
  const migrations: Migration[] = [];
  const m001 = await import('./migrations/001-initial-schema');
  migrations.push(m001);
  return migrations;
}

/**
 * Ensure the internal migrations tracking table exists.
 */
function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);
}

/**
 * Get the set of already-applied migration IDs.
 */
function getAppliedMigrations(db: Database.Database): Set<string> {
  const rows = db.prepare('SELECT id FROM _migrations').all() as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

/**
 * Run all pending migrations inside a transaction.
 * If any migration fails, the transaction is rolled back, the error is logged,
 * and the process exits with code 1.
 */
export async function runMigrations(): Promise<void> {
  const migrations = await loadMigrations();

  const db = getDatabase();
  ensureMigrationsTable(db);

  const applied = getAppliedMigrations(db);
  const pending = migrations.filter((m) => !applied.has(m.id));

  if (pending.length === 0) {
    console.log('[migrate] All migrations already applied.');
    return;
  }

  console.log(`[migrate] Running ${pending.length} pending migration(s)...`);

  for (const migration of pending) {
    try {
      const runInTransaction = db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO _migrations (id, description) VALUES (?, ?)').run(
          migration.id,
          migration.description
        );
      });
      runInTransaction();
      console.log(`[migrate] ✓ Applied: ${migration.id} - ${migration.description}`);
    } catch (error) {
      console.error(`[migrate] ✗ Failed: ${migration.id} - ${migration.description}`);
      console.error(error);
      process.exit(1);
    }
  }

  console.log('[migrate] All migrations applied successfully.');
}
