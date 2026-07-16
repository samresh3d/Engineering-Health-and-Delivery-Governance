import type {
  SprintDataRow,
  SprintDataRowExtended,
  KpiComputedResult,
  KpiFilter,
  KpiName,
  ThresholdConfig,
  TeamConfig,
} from '../types/index.js';
import type { AuditEntry, AuditFilter } from '../types/rbac-analytics.types';

/**
 * Repository interface for sprint data persistence operations.
 */
export interface ISprintDataRepository {
  /**
   * Bulk upsert sprint data rows within a transaction.
   * Uses INSERT OR REPLACE on UNIQUE(jira_id, team) constraint.
   * Persists all 29 fields including function_name, story_name, actual_effort,
   * DOR, DOD, refinement_closure_date, uat_start_date, uat_complete_date,
   * delay_reason, delay_reason_description.
   * @param rows - Array of sprint data rows (max 10,000)
   * @param uploadId - The upload ID to associate rows with
   * @returns Number of rows upserted
   * @throws Error if rows.length > 10,000
   */
  bulkUpsert(rows: (SprintDataRow | SprintDataRowExtended)[], uploadId: string): Promise<number>;

  /**
   * Find sprint data rows matching the provided filter.
   * Builds WHERE clauses dynamically based on which filter fields are provided.
   * Date range filtering applies to dev_start_date by default.
   */
  findByFilter(filter: KpiFilter): Promise<SprintDataRowExtended[]>;

  /**
   * Find a single sprint data row by JIRA ID and team (unique constraint).
   */
  findByJiraIdAndTeam(jiraId: string, team: string): Promise<SprintDataRowExtended | null>;

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

/**
 * Repository interface for audit log persistence operations.
 * Audit log entries are append-only — no update or delete operations are exposed.
 */
export interface IAuditLogRepository {
  /**
   * Insert an audit log entry. Accepts an optional db parameter
   * to participate in an external transaction.
   * @returns The inserted entry's ID.
   */
  insert(entry: Omit<AuditEntry, 'id' | 'timestamp'>, db?: unknown): number;

  /**
   * Query audit log entries with dynamic filters and pagination.
   * Results are ordered by timestamp descending (newest first).
   */
  query(filter: AuditFilter, limit?: number, offset?: number): AuditEntry[];

  /**
   * Get all audit log entries for a specific record.
   * Results are ordered by timestamp ascending (chronological).
   */
  getByRecordId(recordId: number): AuditEntry[];
}
