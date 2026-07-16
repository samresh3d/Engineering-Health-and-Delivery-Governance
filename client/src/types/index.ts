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
  functionName?: string;
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

/** Response returned when an upload contains unregistered team names (HTTP 409) */
export interface NewTeamConfirmationResponse {
  requiresConfirmation: true;
  newTeams: string[];
  pendingUploadId: string;
  message: string;
}

/** Request body for confirming or declining a pending upload */
export interface ConfirmUploadRequest {
  pendingUploadId: string;
  confirmed: boolean;
}

/** Response returned after confirming a pending upload */
export interface ConfirmUploadResponse {
  success: true;
  rowsIngested: number;
  uploadId: string;
  timestamp: string;
  teamsCreated: string[];
}

/** Response returned after declining a pending upload */
export interface DeclineUploadResponse {
  success: true;
  cancelled: true;
}

/** Union type representing all possible upload API responses */
export type UploadApiResponse =
  | UploadResult
  | NewTeamConfirmationResponse;

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
