import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ConfigRepository } from '../../repositories/config.repository.js';
import type { KpiName, ThresholdConfig, TeamConfig } from '../../types/index.js';

function createInMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE rag_thresholds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi_name TEXT NOT NULL UNIQUE,
      green_threshold REAL,
      amber_threshold REAL,
      red_threshold REAL,
      comparison_type TEXT CHECK(comparison_type IN ('above', 'below', 'trend')) NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE team_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_name TEXT NOT NULL UNIQUE,
      portfolio TEXT NOT NULL,
      capacity_hours_per_sprint REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE track_portfolio_mapping (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track TEXT NOT NULL UNIQUE,
      portfolio TEXT NOT NULL
    );
  `);

  return db;
}

function seedThresholds(db: Database.Database): void {
  const stmt = db.prepare(`
    INSERT INTO rag_thresholds (kpi_name, green_threshold, amber_threshold, red_threshold, comparison_type)
    VALUES (@kpiName, @green, @amber, @red, @compType)
  `);

  const thresholds = [
    { kpiName: 'sprint_commitment', green: 90, amber: 75, red: 60, compType: 'above' },
    { kpiName: 'deployment_frequency', green: 10, amber: 5, red: 2, compType: 'above' },
    { kpiName: 'rollback_rate', green: 5, amber: 10, red: 20, compType: 'below' },
  ];

  for (const t of thresholds) {
    stmt.run(t);
  }
}

function seedTeams(db: Database.Database): void {
  const stmt = db.prepare(`
    INSERT INTO team_config (team_name, portfolio, capacity_hours_per_sprint, updated_at)
    VALUES (@teamName, @portfolio, @capacity, @updatedAt)
  `);

  const teams = [
    { teamName: 'Team Alpha', portfolio: 'IBPS-POS', capacity: 160, updatedAt: '2024-01-01T00:00:00Z' },
    { teamName: 'Team Beta', portfolio: 'mPro', capacity: 120, updatedAt: '2024-01-01T00:00:00Z' },
    { teamName: 'Team Gamma', portfolio: 'E-Commerce', capacity: 200, updatedAt: '2024-01-01T00:00:00Z' },
  ];

  for (const t of teams) {
    stmt.run(t);
  }
}

function seedMappings(db: Database.Database): void {
  const stmt = db.prepare(`
    INSERT INTO track_portfolio_mapping (track, portfolio) VALUES (@track, @portfolio)
  `);

  const mappings = [
    { track: 'IBPS-POS', portfolio: 'IBPS-POS' },
    { track: 'mPro', portfolio: 'mPro' },
    { track: 'E-Commerce', portfolio: 'E-Commerce' },
  ];

  for (const m of mappings) {
    stmt.run(m);
  }
}

describe('ConfigRepository', () => {
  let db: Database.Database;
  let repo: ConfigRepository;

  beforeEach(() => {
    db = createInMemoryDb();
    repo = new ConfigRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getThresholds', () => {
    it('should return all threshold configurations', async () => {
      seedThresholds(db);

      const thresholds = await repo.getThresholds();
      expect(thresholds).toHaveLength(3);
      expect(thresholds.map(t => t.kpiName).sort()).toEqual([
        'deployment_frequency',
        'rollback_rate',
        'sprint_commitment',
      ]);
    });

    it('should return empty array when no thresholds exist', async () => {
      const thresholds = await repo.getThresholds();
      expect(thresholds).toHaveLength(0);
    });

    it('should map snake_case columns to camelCase fields', async () => {
      seedThresholds(db);

      const thresholds = await repo.getThresholds();
      const sprint = thresholds.find(t => t.kpiName === 'sprint_commitment')!;
      expect(sprint.greenThreshold).toBe(90);
      expect(sprint.amberThreshold).toBe(75);
      expect(sprint.redThreshold).toBe(60);
      expect(sprint.comparisonType).toBe('above');
    });
  });

  describe('getThreshold', () => {
    it('should return threshold for a specific KPI', async () => {
      seedThresholds(db);

      const threshold = await repo.getThreshold('sprint_commitment');
      expect(threshold.kpiName).toBe('sprint_commitment');
      expect(threshold.greenThreshold).toBe(90);
      expect(threshold.comparisonType).toBe('above');
    });

    it('should throw when KPI threshold not found', async () => {
      await expect(repo.getThreshold('ai_efficiency')).rejects.toThrow(
        'Threshold configuration not found for KPI: ai_efficiency'
      );
    });
  });

  describe('updateThreshold', () => {
    it('should update an existing threshold partially', async () => {
      seedThresholds(db);

      await repo.updateThreshold('sprint_commitment', { greenThreshold: 95 });

      const updated = await repo.getThreshold('sprint_commitment');
      expect(updated.greenThreshold).toBe(95);
      // Other values should remain unchanged
      expect(updated.amberThreshold).toBe(75);
      expect(updated.redThreshold).toBe(60);
    });

    it('should update multiple fields at once', async () => {
      seedThresholds(db);

      await repo.updateThreshold('sprint_commitment', {
        greenThreshold: 95,
        amberThreshold: 80,
        redThreshold: 65,
        comparisonType: 'below',
      });

      const updated = await repo.getThreshold('sprint_commitment');
      expect(updated.greenThreshold).toBe(95);
      expect(updated.amberThreshold).toBe(80);
      expect(updated.redThreshold).toBe(65);
      expect(updated.comparisonType).toBe('below');
    });

    it('should insert a new threshold if not existing', async () => {
      await repo.updateThreshold('ai_efficiency', {
        greenThreshold: 30,
        amberThreshold: 15,
        redThreshold: 5,
        comparisonType: 'above',
      });

      const threshold = await repo.getThreshold('ai_efficiency');
      expect(threshold.kpiName).toBe('ai_efficiency');
      expect(threshold.greenThreshold).toBe(30);
    });
  });

  describe('getTeamConfig', () => {
    it('should return team config for existing team', async () => {
      seedTeams(db);

      const config = await repo.getTeamConfig('Team Alpha');
      expect(config).not.toBeNull();
      expect(config!.teamName).toBe('Team Alpha');
      expect(config!.portfolio).toBe('IBPS-POS');
      expect(config!.capacityHoursPerSprint).toBe(160);
    });

    it('should return null for non-existing team', async () => {
      const config = await repo.getTeamConfig('NonExistent');
      expect(config).toBeNull();
    });
  });

  describe('getAllTeams', () => {
    it('should return all teams ordered by team_name', async () => {
      seedTeams(db);

      const teams = await repo.getAllTeams();
      expect(teams).toHaveLength(3);
      expect(teams[0].teamName).toBe('Team Alpha');
      expect(teams[1].teamName).toBe('Team Beta');
      expect(teams[2].teamName).toBe('Team Gamma');
    });

    it('should return empty array when no teams exist', async () => {
      const teams = await repo.getAllTeams();
      expect(teams).toHaveLength(0);
    });
  });

  describe('upsertTeamConfig', () => {
    it('should insert a new team config', async () => {
      const config: TeamConfig = {
        teamName: 'New Team',
        portfolio: 'New Portfolio',
        capacityHoursPerSprint: 180,
        updatedAt: '2024-02-01T00:00:00Z',
      };

      await repo.upsertTeamConfig(config);

      const result = await repo.getTeamConfig('New Team');
      expect(result).not.toBeNull();
      expect(result!.teamName).toBe('New Team');
      expect(result!.portfolio).toBe('New Portfolio');
      expect(result!.capacityHoursPerSprint).toBe(180);
    });

    it('should update existing team config on conflict', async () => {
      seedTeams(db);

      const updated: TeamConfig = {
        teamName: 'Team Alpha',
        portfolio: 'Updated Portfolio',
        capacityHoursPerSprint: 200,
        updatedAt: '2024-02-15T00:00:00Z',
      };

      await repo.upsertTeamConfig(updated);

      const result = await repo.getTeamConfig('Team Alpha');
      expect(result!.portfolio).toBe('Updated Portfolio');
      expect(result!.capacityHoursPerSprint).toBe(200);
      expect(result!.updatedAt).toBe('2024-02-15T00:00:00Z');
    });
  });

  describe('getTrackPortfolioMapping', () => {
    it('should return track-to-portfolio mapping as dictionary', async () => {
      seedMappings(db);

      const mapping = await repo.getTrackPortfolioMapping();
      expect(mapping).toEqual({
        'IBPS-POS': 'IBPS-POS',
        'mPro': 'mPro',
        'E-Commerce': 'E-Commerce',
      });
    });

    it('should return empty object when no mappings exist', async () => {
      const mapping = await repo.getTrackPortfolioMapping();
      expect(mapping).toEqual({});
    });
  });
});
