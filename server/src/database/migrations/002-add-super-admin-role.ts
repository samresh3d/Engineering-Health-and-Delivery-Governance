import type Database from 'better-sqlite3';

export const id = '002-add-super-admin-role';
export const description = 'Add Super_Admin role to users table CHECK constraint';

export function up(db: Database.Database): void {
  // SQLite doesn't support ALTER TABLE to modify CHECK constraints.
  // Recreate the table with the updated constraint.
  db.exec(`
    CREATE TABLE users_new (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      role TEXT CHECK(role IN ('Admin', 'Engineering_Manager', 'Delivery_Manager', 'Leadership', 'Super_Admin')) NOT NULL,
      token TEXT NOT NULL
    );
    INSERT INTO users_new SELECT * FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
  `);
}
