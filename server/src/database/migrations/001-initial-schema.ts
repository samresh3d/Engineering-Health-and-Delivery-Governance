import type Database from 'better-sqlite3';

export const id = '001-initial-schema';
export const description = 'Create initial database schema with all 7 tables and indexes';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      rows_ingested INTEGER NOT NULL DEFAULT 0,
      status TEXT CHECK(status IN ('processing', 'success', 'failed')) DEFAULT 'processing',
      error_message TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS sprint_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upload_id TEXT NOT NULL REFERENCES uploads(id),
      sno INTEGER,
      team TEXT NOT NULL,
      track TEXT NOT NULL,
      project TEXT NOT NULL,
      portfolio TEXT NOT NULL,
      status TEXT,
      items_list TEXT,
      walkthrough_given_on TEXT,
      jira_id TEXT NOT NULL,
      estimated_effort_with_ai REAL,
      estimated_effort_without_ai REAL,
      actual_effort_with_ai REAL,
      ai_used TEXT CHECK(ai_used IN ('Y', 'N')),
      dev_start_date TEXT,
      dev_end_date TEXT,
      development_status TEXT,
      uat_delivery_date TEXT,
      uat_delivery_target TEXT,
      resources TEXT,
      go_live_planned_date TEXT,
      go_live_date TEXT,
      production_status TEXT,
      rollback TEXT CHECK(rollback IN ('Y', 'N')),
      rollback_reason TEXT,
      story_drop_reason TEXT,
      ingested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      UNIQUE(jira_id, team)
    );

    CREATE TABLE IF NOT EXISTS kpi_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi_name TEXT NOT NULL,
      value REAL,
      rag_status TEXT CHECK(rag_status IN ('green', 'amber', 'red')),
      percent_change REAL,
      team TEXT,
      portfolio TEXT,
      sprint TEXT,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      calculated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      insufficient_data INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS team_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_name TEXT NOT NULL UNIQUE,
      portfolio TEXT NOT NULL,
      capacity_hours_per_sprint REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS track_portfolio_mapping (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track TEXT NOT NULL UNIQUE,
      portfolio TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rag_thresholds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi_name TEXT NOT NULL UNIQUE,
      green_threshold REAL,
      amber_threshold REAL,
      red_threshold REAL,
      comparison_type TEXT CHECK(comparison_type IN ('above', 'below', 'trend')) NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      role TEXT CHECK(role IN ('Admin', 'Engineering_Manager', 'Delivery_Manager', 'Leadership')) NOT NULL,
      token TEXT NOT NULL
    );

    -- Indexes for sprint_data
    CREATE INDEX IF NOT EXISTS idx_sprint_data_team ON sprint_data(team);
    CREATE INDEX IF NOT EXISTS idx_sprint_data_portfolio ON sprint_data(portfolio);
    CREATE INDEX IF NOT EXISTS idx_sprint_data_project ON sprint_data(project);
    CREATE INDEX IF NOT EXISTS idx_sprint_data_dev_start ON sprint_data(dev_start_date);
    CREATE INDEX IF NOT EXISTS idx_sprint_data_jira_team ON sprint_data(jira_id, team);

    -- Index for kpi_results
    CREATE INDEX IF NOT EXISTS idx_kpi_results_lookup ON kpi_results(kpi_name, team, portfolio, period_start);
  `);
}
