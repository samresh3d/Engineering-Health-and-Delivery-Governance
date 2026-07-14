/**
 * Core domain types for the Engineering Health & Delivery Governance Platform.
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

/** A single row of sprint delivery data ingested from Excel */
export interface SprintDataRow {
  id?: number;
  uploadId: string;
  sno: number;
  team: string;
  track: string;
  project: string;
  portfolio: string;
  status: string | null;
  itemsList: string | null;
  walkthroughGivenOn: string | null;
  jiraId: string;
  estimatedEffortWithoutAi: number | null;
  actualEffortWithAi: number | null;
  aiUsed: 'Y' | 'N' | null;
  devStartDate: string | null;
  devEndDate: string | null;
  developmentStatus: string | null;
  uatDeliveryDate: string | null;
  uatDeliveryTarget: string | null;
  resources: string | null;
  goLivePlannedDate: string | null;
  goLiveDate: string | null;
  productionStatus: string | null;
  rollback: 'Y' | 'N' | null;
  rollbackReason: string | null;
  storyDropReason: string | null;
  ingestedAt: string;
}

/** A computed KPI result stored in the database */
export interface KpiComputedResult {
  id?: number;
  kpiName: KpiName;
  value: number | null;
  ragStatus: RagStatus;
  percentChange: number | null;
  team: string | null;
  portfolio: string | null;
  sprint: string | null;
  periodStart: string;
  periodEnd: string;
  calculatedAt: string;
  insufficientData: boolean;
}

/** Team configuration including capacity */
export interface TeamConfig {
  id?: number;
  teamName: string;
  portfolio: string;
  capacityHoursPerSprint: number;
  updatedAt: string;
}

/** Record tracking an upload operation */
export interface UploadRecord {
  id: string;
  fileName: string;
  uploadedBy: string;
  rowsIngested: number;
  status: 'processing' | 'success' | 'failed';
  errorMessage: string | null;
  uploadedAt: string;
}

/** KPI result returned to the client */
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

/** RAG threshold configuration for a KPI */
export interface ThresholdConfig {
  kpiName: KpiName;
  greenThreshold: number;
  amberThreshold: number;
  redThreshold: number;
  comparisonType: 'above' | 'below' | 'trend';
}

/** Decoded JWT token payload */
export interface DecodedToken {
  userId: string;
  role: 'Admin' | 'Engineering_Manager' | 'Delivery_Manager' | 'Leadership';
  iat: number;
  exp: number;
}
