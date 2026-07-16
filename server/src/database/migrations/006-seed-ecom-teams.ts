import type Database from 'better-sqlite3';

export const id = '006-seed-ecom-teams';
export const description = 'Seed teams for E-Com function from production sprint data';

export function up(db: Database.Database): void {
  // Get the E-Com function ID
  const ecomFunction = db.prepare("SELECT id FROM functions WHERE name = 'E-Com'").get() as
    | { id: number }
    | undefined;

  if (!ecomFunction) {
    // If E-Com function doesn't exist, create it
    const result = db.prepare("INSERT INTO functions (name) VALUES ('E-Com')").run();
    seedTeams(db, Number(result.lastInsertRowid));
  } else {
    seedTeams(db, ecomFunction.id);
  }
}

function seedTeams(db: Database.Database, functionId: number): void {
  const teams = [
    'Savings SPA1',
    'Reinstatement Journey Neo',
    'Payment and Whatsapp Journey',
    'Partner Portal',
    'Term SPA1 (NOP)',
    'NEO 3',
    'NR',
    'SPA2',
    'Axis (Banca)',
    'YBL Integration (Banca)',
    'COAID',
  ];

  const insertTeam = db.prepare(
    'INSERT OR IGNORE INTO teams (name, function_id) VALUES (?, ?)'
  );

  for (const team of teams) {
    insertTeam.run(team, functionId);
  }
}
