import type {
  SprintDataRow,
  KpiComputedResult,
  KpiFilter,
  KpiName,
  ThresholdConfig,
  TeamConfig,
} from '../types/index.js';

/**
 * Repository interface for sprint data persistence operations.
 */
export interface ISprintDataRepository {
  /**
   * Bulk upsert sprint data rows within a transaction.
   * Uses INSERT OR REPLACE on UNIQUE(jira_id, team) constraint.
   * @param rows - Array of sprint data rows (max 10,000)
   * @param uploadId - The upload ID to associate rows with
   * @returns Number of rows upserted
   * @throws Error if rows.length > 10,000
   */
  bulkUpsert(rows: SprintDataRow[], uploadId: string): Promise<number>;

  /**
   * Find sprint data rows matching the provided filter.
   * Builds WHERE clauses dynamically based on which filter fields are provided.
   * Date range filtering applies to dev_start_date by default.
   */
  findByFilter(filter: KpiFilter): Promise<SprintDataRow[]>;

  /**
   * Find a single sprint data row by JIRA ID and team (unique constraint).
   */
  findByJiraIdAndTeam(jiraId: string, team: string): Promise<SprintDataRow | null>;

  /**
   * Count the number of rows associated with a specific upload.
   */
  countByUpload(uploadId: string): Promise<number>;
}

/**
 * Repository interface for KPI computed results persistence.
 */
export interface IKpiResultsRepository {
  /**
   * Save a single KPI computed result.
   */
  save(result: KpiComputedResult): Promise<void>;

  /**
   * Save a batch of KPI computed results.
   */
  saveBatch(results: KpiComputedResult[]): Promise<void>;

  /**
   * Find the latest KPI results matching the provided filter.
   */
  findLatest(filter: KpiFilter): Promise<KpiComputedResult[]>;

  /**
   * Find trend data for a specific KPI, team, and number of periods.
   */
  findTrend(kpiName: KpiName, team: string, periods: number): Promise<KpiComputedResult[]>;
}

/**
 * Repository interface for configuration data (thresholds, teams, mappings).
 */
export interface IConfigRepository {
  /**
   * Get all RAG threshold configurations.
   */
  getThresholds(): Promise<ThresholdConfig[]>;

  /**
   * Get the threshold configuration for a specific KPI.
   */
  getThreshold(kpiName: KpiName): Promise<ThresholdConfig>;

  /**
   * Update a threshold configuration for a specific KPI.
   */
  updateThreshold(kpiName: KpiName, config: Partial<ThresholdConfig>): Promise<void>;

  /**
   * Get the configuration for a specific team.
   */
  getTeamConfig(teamName: string): Promise<TeamConfig | null>;

  /**
   * Get all team configurations.
   */
  getAllTeams(): Promise<TeamConfig[]>;

  /**
   * Insert or update a team configuration.
   */
  upsertTeamConfig(config: TeamConfig): Promise<void>;

  /**
   * Get the track-to-portfolio mapping as a dictionary.
   */
  getTrackPortfolioMapping(): Promise<Record<string, string>>;
}
