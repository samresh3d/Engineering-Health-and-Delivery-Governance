import axios from 'axios';
import { getStoredToken, clearAuth } from '../auth';
import type { KpiResult, RagStatus, ConfirmUploadRequest, ConfirmUploadResponse, DeclineUploadResponse } from '../types';

/**
 * Pre-configured Axios instance for API communication.
 * - Base URL points to the local Express server
 * - Request interceptor injects JWT token from stored auth
 * - Response interceptor handles 401 by clearing auth and redirecting to login
 */
const apiClient = axios.create({
  baseURL: 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach Authorization header from stored token
apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401 Unauthorized by clearing auth and redirecting
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      clearAuth();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;

// ─── Analytics Types ─────────────────────────────────────────────────────────

/** Filter parameters for analytics API calls */
export interface AnalyticsFilter {
  team?: string;
  engineeringManager?: string;
  functionName?: string;
  startDate?: string;
  endDate?: string;
  developmentStatus?: string;
  period?: 'month' | 'quarter' | 'year' | 'custom';
}

/** KPI scorecard response */
export interface KpiScorecardResponse {
  success: boolean;
  data: {
    kpis: KpiResult[];
    periodLabel: string;
    scope: string;
  };
}

/** Team comparison row */
export interface TeamComparisonRow {
  team: string;
  kpis: Record<string, { value: number | null; ragStatus: RagStatus }>;
}

/** Team comparison response */
export interface TeamComparisonResponse {
  success: boolean;
  data: TeamComparisonRow[];
}

/** Trend data point */
export interface TrendDataPoint {
  period: string;
  value: number | null;
  ragStatus: RagStatus;
}

/** Trend response */
export interface TrendResponse {
  success: boolean;
  data: TrendDataPoint[] | null;
  insufficientData?: boolean;
  message?: string;
}

/** Historical trends response (multiple KPIs) */
export interface HistoricalResponse {
  success: boolean;
  data: Record<string, TrendDataPoint[]> | null;
  insufficientData?: boolean;
  message?: string;
}

// ─── Export Types ────────────────────────────────────────────────────────────

/** Supported export formats */
export type ExportFormat = 'xlsx' | 'csv' | 'pdf';

/** Request body for report export */
export interface ExportRequestBody {
  format: ExportFormat;
  filter: AnalyticsFilter;
}

// ─── Audit Log Types ─────────────────────────────────────────────────────────

/** Audit log action types */
export type AuditAction = 'create' | 'update' | 'delete';

/** Audit log entry returned from the API */
export interface AuditLogEntry {
  id: number;
  userId: string;
  action: AuditAction;
  recordId: number;
  recordType: string;
  teamId: string;
  modifiedFields: string[] | null;
  timestamp: string;
}

/** Filter parameters for audit log queries */
export interface AuditLogFilter {
  userId?: string;
  action?: AuditAction;
  startDate?: string;
  endDate?: string;
  teamId?: string;
  limit?: number;
  offset?: number;
}

/** Audit log query response */
export interface AuditLogResponse {
  success: boolean;
  data: AuditLogEntry[];
}

/** Record history response */
export interface RecordHistoryResponse {
  success: boolean;
  data: AuditLogEntry[];
}

// ─── Analytics API Functions ─────────────────────────────────────────────────

/**
 * Get KPI scorecard for the current user's scope and applied filters.
 */
export async function getScorecard(filter?: AnalyticsFilter): Promise<KpiScorecardResponse> {
  const response = await apiClient.get<KpiScorecardResponse>('/api/analytics/scorecard', {
    params: filter,
  });
  return response.data;
}

/**
 * Get team comparison data. Available to Leadership and Super_Admin only.
 */
export async function getComparison(filter?: AnalyticsFilter): Promise<TeamComparisonResponse> {
  const response = await apiClient.get<TeamComparisonResponse>('/api/analytics/comparison', {
    params: filter,
  });
  return response.data;
}

/**
 * Get trend data for a specific KPI over time.
 */
export async function getTrends(kpiName: string, filter?: AnalyticsFilter): Promise<TrendResponse> {
  const response = await apiClient.get<TrendResponse>('/api/analytics/trends', {
    params: { kpiName, ...filter },
  });
  return response.data;
}

/**
 * Get historical trend data for multiple KPIs over time.
 */
export async function getHistorical(filter?: AnalyticsFilter): Promise<HistoricalResponse> {
  const response = await apiClient.get<HistoricalResponse>('/api/analytics/historical', {
    params: filter,
  });
  return response.data;
}

// ─── Export API Function ─────────────────────────────────────────────────────

/**
 * Generate and download a report export file.
 * Sends a POST request expecting a binary (blob) response, then triggers
 * a browser download using an object URL.
 */
export async function exportReport(request: ExportRequestBody): Promise<void> {
  const response = await apiClient.post('/api/reports/export', request, {
    responseType: 'blob',
  });

  // Extract filename from Content-Disposition header, fallback to a default
  const contentDisposition = response.headers['content-disposition'] as string | undefined;
  let filename = `report.${request.format}`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (match && match[1]) {
      filename = match[1].replace(/['"]/g, '');
    }
  }

  // Create a blob URL and trigger download
  const blob = new Blob([response.data], {
    type: response.headers['content-type'] as string,
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// ─── Audit Log API Functions ─────────────────────────────────────────────────

/**
 * Query audit log entries with optional filters. Restricted to Super_Admin.
 */
export async function getAuditLogs(filter?: AuditLogFilter): Promise<AuditLogResponse> {
  const response = await apiClient.get<AuditLogResponse>('/api/audit-logs', {
    params: filter,
  });
  return response.data;
}

/**
 * Get the full audit history for a specific record. Restricted to Super_Admin.
 */
export async function getRecordHistory(recordId: number): Promise<RecordHistoryResponse> {
  const response = await apiClient.get<RecordHistoryResponse>(`/api/audit-logs/record/${recordId}`);
  return response.data;
}

// ─── Submissions History Types ───────────────────────────────────────────────

/** A historical submission record (upload) */
export interface SubmissionRecord {
  id: string;
  fileName: string;
  uploadedBy: string;
  rowsIngested: number;
  status: string;
  uploadedAt: string;
  team: string | null;
}

/** Submissions history response */
export interface SubmissionsHistoryResponse {
  success: boolean;
  data: SubmissionRecord[];
  total: number;
  limit: number;
  offset: number;
}

/** Sprint entry record for historical view */
export interface SubmissionEntry {
  id: number;
  uploadId: string;
  team: string;
  track: string;
  project: string;
  portfolio: string;
  jiraId: string;
  developmentStatus: string | null;
  ingestedAt: string;
  [key: string]: unknown;
}

/** Submission entries response */
export interface SubmissionEntriesResponse {
  success: boolean;
  data: SubmissionEntry[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Submissions History API Functions ───────────────────────────────────────

/**
 * Get historical submissions (upload records) ordered by upload date descending.
 * Engineering Managers see only their assigned team's uploads.
 * Leadership/Super_Admin see all uploads.
 */
export async function getSubmissionsHistory(params?: {
  limit?: number;
  offset?: number;
}): Promise<SubmissionsHistoryResponse> {
  const response = await apiClient.get<SubmissionsHistoryResponse>('/api/submissions/history', {
    params,
  });
  return response.data;
}

/**
 * Get historical sprint data entries ordered by ingestion date descending.
 * Engineering Managers see only their assigned team's entries.
 * Leadership/Super_Admin see all entries.
 */
export async function getSubmissionEntries(params?: {
  limit?: number;
  offset?: number;
  uploadId?: string;
}): Promise<SubmissionEntriesResponse> {
  const response = await apiClient.get<SubmissionEntriesResponse>('/api/submissions/entries', {
    params,
  });
  return response.data;
}


// ─── Upload Confirmation API Functions ───────────────────────────────────────

/**
 * Confirm or decline a pending upload that contains new team names.
 * Called after the user receives a 409 response from POST /api/upload.
 *
 * @param request - Contains pendingUploadId and confirmed (true to create teams, false to cancel)
 * @returns Confirm response with ingestion results, or decline response with cancelled flag
 */
export async function confirmUpload(
  request: ConfirmUploadRequest
): Promise<ConfirmUploadResponse | DeclineUploadResponse> {
  const response = await apiClient.post<ConfirmUploadResponse | DeclineUploadResponse>(
    '/api/upload/confirm',
    request
  );
  return response.data;
}
