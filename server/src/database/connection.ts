import Database from 'better-sqlite3';
import path from 'path';

let db: Database.Database | null = null;

/**
 * Initialize and return a better-sqlite3 database connection with WAL mode enabled.
 * If a connection already exists, returns the existing instance.
 *
 * @param dbPath - Optional path to the SQLite database file. Defaults to `data/app.db` relative to project root.
 * @returns The initialized Database instance.
 */
export function initializeDatabase(dbPath?: string): Database.Database {
  if (db) {
    return db;
  }

  const resolvedPath = dbPath ?? path.resolve(process.cwd(), 'data', 'app.db');

  // Ensure the directory exists
  const dir = path.dirname(resolvedPath);
  const fs = require('fs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);

  // Enable WAL mode for concurrent reads
  db.pragma('journal_mode = WAL');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  return db;
}

/**
 * Get the current database instance. Throws if not initialized.
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection and reset the singleton.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
