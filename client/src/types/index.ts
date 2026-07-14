/**
 * Client-side type definitions matching the API contracts.
 */

/** Names of the 9 supported KPIs */
export type KpiName =
  | 'sprint_commitment'
  | 'release_success_rate'
  | 'deployment_frequency'
  | 'capacity_utilization'
  | 'ai_efficiency'
  | 'uat_predictability'
  | 'dev_cycle_time'
  | 'story_drop_rate'
  | 'rollback_rate';

/** RAG (Red/Amber/Green) status classification */
export type RagStatus = 'green' | 'amber' | 'red';

/** KPI result as returned by the dashboard API */
export interface KpiResult {
  kpiName: KpiName;
  value: number | null;
  ragStatus: RagStatus;
  percentChange: number | null;
  insufficientData: boolean;
}

/** Filters for querying KPI data */
export interface KpiFilter {
  team?: string;
  portfolio?: string;
  project?: string;
  startDate?: string;
  endDate?: string;
}

/** Result returned from a successful file upload */
export interface UploadResult {
  success: boolean;
  rowsIngested: number;
  uploadId: string;
  timestamp: string;
}

/** A single data point in a KPI trend chart */
export interface TrendDataPoint {
  period: string;
  value: number;
}

/** A validation error reported during file upload processing */
export interface ValidationError {
  row?: number;
  field: string;
  message: string;
}
