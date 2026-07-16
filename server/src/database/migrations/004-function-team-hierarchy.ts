import type Database from 'better-sqlite3';

export const id = '004-function-team-hierarchy';
export const description = 'Add Function-Team hierarchy, dropdown_options, and new sprint_data fields';

export function up(db: Database.Database): void {
  // --- 1. Create `functions` table ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS functions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);

  // --- 2. Create `teams` table ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      function_id INTEGER NOT NULL REFERENCES functions(id),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      UNIQUE(name, function_id)
    );
  `);

  // --- 3. Create `dropdown_options` table ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS dropdown_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      field_name TEXT NOT NULL,
      option_value TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      UNIQUE(field_name, option_value)
    );
  `);

  // --- 4. Add new columns to `sprint_data` ---
  db.exec(`ALTER TABLE sprint_data ADD COLUMN function_name TEXT NOT NULL DEFAULT 'Unassigned';`);
  db.exec(`ALTER TABLE sprint_data ADD COLUMN story_name TEXT;`);
  db.exec(`ALTER TABLE sprint_data ADD COLUMN actual_effort REAL;`);
  db.exec(`ALTER TABLE sprint_data ADD COLUMN definition_of_ready TEXT CHECK(definition_of_ready IN ('Y','N'));`);
  db.exec(`ALTER TABLE sprint_data ADD COLUMN definition_of_done TEXT CHECK(definition_of_done IN ('Y','N'));`);
  db.exec(`ALTER TABLE sprint_data ADD COLUMN refinement_closure_date TEXT;`);
  db.exec(`ALTER TABLE sprint_data ADD COLUMN uat_start_date TEXT;`);
  db.exec(`ALTER TABLE sprint_data ADD COLUMN uat_complete_date TEXT;`);
  db.exec(`ALTER TABLE sprint_data ADD COLUMN delay_reason TEXT;`);
  db.exec(`ALTER TABLE sprint_data ADD COLUMN delay_reason_description TEXT;`);

  // --- 5. Add `function_id` nullable column to `users` table ---
  db.exec(`ALTER TABLE users ADD COLUMN function_id INTEGER REFERENCES functions(id);`);

  // --- 6. Seed `functions` table with initial values ---
  const insertFunction = db.prepare('INSERT INTO functions (name) VALUES (?)');
  insertFunction.run('E-Com');
  insertFunction.run('MPro');
  insertFunction.run('Dolphin');
  insertFunction.run('IVC');

  // --- 7. Populate `function_name` for existing sprint_data records ---
  // Define portfolio-to-function mapping
  // Portfolios from track_portfolio_mapping map to Functions as follows:
  //   E-Commerce → E-Com
  //   mPro → MPro
  //   IBPS-Dolphin → Dolphin
  //   POSV/IVC → IVC
  //   IBPS-POS → IVC (POS-related)
  //   IBPS-Claims → E-Com (Claims is part of E-Com domain)
  // All other portfolios default to 'Unassigned'
  db.exec(`
    UPDATE sprint_data
    SET function_name = (
      SELECT CASE tpm.portfolio
        WHEN 'E-Commerce' THEN 'E-Com'
        WHEN 'mPro' THEN 'MPro'
        WHEN 'IBPS-Dolphin' THEN 'Dolphin'
        WHEN 'POSV/IVC' THEN 'IVC'
        WHEN 'IBPS-POS' THEN 'IVC'
        WHEN 'IBPS-Claims' THEN 'E-Com'
        ELSE 'Unassigned'
      END
      FROM track_portfolio_mapping tpm
      WHERE tpm.track = sprint_data.track
    )
    WHERE EXISTS (
      SELECT 1 FROM track_portfolio_mapping tpm WHERE tpm.track = sprint_data.track
    );
  `);

  // --- 8. Set function_name to 'Unassigned' for records with no mapping ---
  // (Already handled by DEFAULT 'Unassigned', but explicitly update any that didn't match)
  db.exec(`
    UPDATE sprint_data
    SET function_name = 'Unassigned'
    WHERE NOT EXISTS (
      SELECT 1 FROM track_portfolio_mapping tpm WHERE tpm.track = sprint_data.track
    );
  `);

  // --- 9. Populate `teams` from distinct team values grouped by mapped function ---
  db.exec(`
    INSERT INTO teams (name, function_id)
    SELECT DISTINCT sd.team, f.id
    FROM sprint_data sd
    JOIN functions f ON f.name = sd.function_name
    WHERE sd.function_name != 'Unassigned';
  `);

  // --- 10. Create indexes ---
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sprint_data_function ON sprint_data(function_name);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sprint_data_function_team ON sprint_data(function_name, team);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_teams_function_id ON teams(function_id);`);

  // --- 11. Seed `dropdown_options` with initial values ---
  const insertOption = db.prepare(
    'INSERT INTO dropdown_options (field_name, option_value, sort_order) VALUES (?, ?, ?)'
  );

  // Production Status options
  const productionStatusOptions = [
    'Deployed to Production',
    'In Progress',
    'Ready for Production',
    'Rolled Back',
    'Scheduled',
  ];
  productionStatusOptions.forEach((opt, idx) => {
    insertOption.run('production_status', opt, idx + 1);
  });

  // Story Status options
  const storyStatusOptions = [
    'Completed',
    'In Progress',
    'Not Started',
    'Dropped',
    'On Hold',
    'Carried Forward',
  ];
  storyStatusOptions.forEach((opt, idx) => {
    insertOption.run('story_status', opt, idx + 1);
  });

  // Delay Reason options
  const delayReasonOptions = [
    'Dependency on other team',
    'Resource unavailability',
    'Requirement change',
    'Technical complexity',
    'Environment issues',
    'Testing delays',
    'Vendor dependency',
    'Priority change',
  ];
  delayReasonOptions.forEach((opt, idx) => {
    insertOption.run('delay_reason', opt, idx + 1);
  });

  // --- 12. Seed eng_manager user function assignment to E-Com ---
  const ecomFunction = db.prepare("SELECT id FROM functions WHERE name = 'E-Com'").get() as { id: number } | undefined;
  if (ecomFunction) {
    db.prepare("UPDATE users SET function_id = ? WHERE username = 'eng_manager'").run(ecomFunction.id);
  }
}
