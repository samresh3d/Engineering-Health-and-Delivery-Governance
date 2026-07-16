import type Database from 'better-sqlite3';

export const id = '007-pending-uploads';
export const description = 'Create pending_uploads table for new team confirmation flow';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_uploads (
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
}
