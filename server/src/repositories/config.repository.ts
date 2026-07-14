import type Database from 'better-sqlite3';
import type { KpiName, ThresholdConfig, TeamConfig } from '../types/index.js';
import type { IConfigRepository } from './interfaces.js';
import { getDatabase } from '../database/connection.js';

/**
 * Maps a database row (snake_case) to a ThresholdConfig (camelCase).
 */
function mapRowToThreshold(row: Record<string, unknown>): ThresholdConfig {
  return {
    kpiName: row.kpi_name as KpiName,
    greenThreshold: row.green_threshold as number,
    amberThreshold: row.amber_threshold as number,
    redThreshold: row.red_threshold as number,
    comparisonType: row.comparison_type as ThresholdConfig['comparisonType'],
  };
}

/**
 * Maps a database row (snake_case) to a TeamConfig (camelCase).
 */
function mapRowToTeamConfig(row: Record<string, unknown>): TeamConfig {
  return {
    id: row.id as number,
    teamName: row.team_name as string,
    portfolio: row.portfolio as string,
    capacityHoursPerSprint: row.capacity_hours_per_sprint as number,
    updatedAt: row.updated_at as string,
  };
}

/**
 * SQLite implementation of the configuration repository using better-sqlite3.
 */
export class ConfigRepository implements IConfigRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
  }

  /**
   * Get all RAG threshold configurations.
   */
  async getThresholds(): Promise<ThresholdConfig[]> {
    const stmt = this.db.prepare('SELECT * FROM rag_thresholds');
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map(mapRowToThreshold);
  }

  /**
   * Get the threshold configuration for a specific KPI.
   * Throws if not found.
   */
  async getThreshold(kpiName: KpiName): Promise<ThresholdConfig> {
    const stmt = this.db.prepare(
      'SELECT * FROM rag_thresholds WHERE kpi_name = @kpiName'
    );
    const row = stmt.get({ kpiName }) as Record<string, unknown> | undefined;

    if (!row) {
      throw new Error(`Threshold configuration not found for KPI: ${kpiName}`);
    }

    return mapRowToThreshold(row);
  }

  /**
   * Update a threshold configuration for a specific KPI.
   * Uses INSERT OR REPLACE to handle both insert and update cases.
   */
  async updateThreshold(kpiName: KpiName, config: Partial<ThresholdConfig>): Promise<void> {
    // First, try to get the existing threshold
    const existing = this.db.prepare(
      'SELECT * FROM rag_thresholds WHERE kpi_name = @kpiName'
    ).get({ kpiName }) as Record<string, unknown> | undefined;

    if (existing) {
      // Build dynamic UPDATE
      const updates: string[] = [];
      const params: Record<string, unknown> = { kpiName };

      if (config.greenThreshold !== undefined) {
        updates.push('green_threshold = @greenThreshold');
        params.greenThreshold = config.greenThreshold;
      }
      if (config.amberThreshold !== undefined) {
        updates.push('amber_threshold = @amberThreshold');
        params.amberThreshold = config.amberThreshold;
      }
      if (config.redThreshold !== undefined) {
        updates.push('red_threshold = @redThreshold');
        params.redThreshold = config.redThreshold;
      }
      if (config.comparisonType !== undefined) {
        updates.push('comparison_type = @comparisonType');
        params.comparisonType = config.comparisonType;
      }

      updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");

      const sql = `UPDATE rag_thresholds SET ${updates.join(', ')} WHERE kpi_name = @kpiName`;
      this.db.prepare(sql).run(params);
    } else {
      // Insert new threshold
      const stmt = this.db.prepare(`
        INSERT INTO rag_thresholds (kpi_name, green_threshold, amber_threshold, red_threshold, comparison_type)
        VALUES (@kpiName, @greenThreshold, @amberThreshold, @redThreshold, @comparisonType)
      `);
      stmt.run({
        kpiName,
        greenThreshold: config.greenThreshold ?? 0,
        amberThreshold: config.amberThreshold ?? 0,
        redThreshold: config.redThreshold ?? 0,
        comparisonType: config.comparisonType ?? 'above',
      });
    }
  }

  /**
   * Get the configuration for a specific team.
   */
  async getTeamConfig(teamName: string): Promise<TeamConfig | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM team_config WHERE team_name = @teamName'
    );
    const row = stmt.get({ teamName }) as Record<string, unknown> | undefined;
    return row ? mapRowToTeamConfig(row) : null;
  }

  /**
   * Get all team configurations.
   */
  async getAllTeams(): Promise<TeamConfig[]> {
    const stmt = this.db.prepare('SELECT * FROM team_config ORDER BY team_name ASC');
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map(mapRowToTeamConfig);
  }

  /**
   * Insert or update a team configuration.
   * Uses INSERT OR REPLACE on the UNIQUE(team_name) constraint.
   */
  async upsertTeamConfig(config: TeamConfig): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO team_config (team_name, portfolio, capacity_hours_per_sprint, updated_at)
      VALUES (@teamName, @portfolio, @capacityHoursPerSprint, @updatedAt)
      ON CONFLICT(team_name) DO UPDATE SET
        portfolio = excluded.portfolio,
        capacity_hours_per_sprint = excluded.capacity_hours_per_sprint,
        updated_at = excluded.updated_at
    `);

    stmt.run({
      teamName: config.teamName,
      portfolio: config.portfolio,
      capacityHoursPerSprint: config.capacityHoursPerSprint,
      updatedAt: config.updatedAt,
    });
  }

  /**
   * Get the track-to-portfolio mapping as a dictionary.
   */
  async getTrackPortfolioMapping(): Promise<Record<string, string>> {
    const stmt = this.db.prepare('SELECT track, portfolio FROM track_portfolio_mapping');
    const rows = stmt.all() as Array<{ track: string; portfolio: string }>;

    const mapping: Record<string, string> = {};
    for (const row of rows) {
      mapping[row.track] = row.portfolio;
    }
    return mapping;
  }
}
