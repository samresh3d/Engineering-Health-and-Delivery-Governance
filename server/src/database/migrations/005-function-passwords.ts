import type Database from 'better-sqlite3';

export const id = '005-function-passwords';
export const description = 'Add password column to functions table with default passwords';

export function up(db: Database.Database): void {
  // Add password column to functions table
  db.exec(`ALTER TABLE functions ADD COLUMN password TEXT;`);

  // Set default passwords for seeded functions
  const setPassword = db.prepare('UPDATE functions SET password = ? WHERE name = ?');
  setPassword.run('ecom123', 'E-Com');
  setPassword.run('mpro123', 'MPro');
  setPassword.run('dolphin123', 'Dolphin');
  setPassword.run('ivc123', 'IVC');
}
