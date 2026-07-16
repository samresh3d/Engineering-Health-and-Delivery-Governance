import type Database from 'better-sqlite3';

export const id = '003-audit-logs-and-team-id';
export const description = 'Add team_id to users table and create audit_logs table';

export function up(db: Database.Database): void {
  // Add team_id column to users table
  db.exec(`ALTER TABLE users ADD COLUMN team_id TEXT;`);

  // Add index for user team lookups
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_team ON users(team_id);`);

  // Create audit_logs table (append-only)
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
  `);

  // Create indexes for audit_logs
  db.exec(`CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);`);
  db.exec(`CREATE INDEX idx_audit_logs_record ON audit_logs(record_id);`);
  db.exec(`CREATE INDEX idx_audit_logs_team ON audit_logs(team_id);`);
  db.exec(`CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);`);
  db.exec(`CREATE INDEX idx_audit_logs_action ON audit_logs(action);`);
}
