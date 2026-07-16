/**
 * Types and interfaces for RBAC, Reporting & Analytics feature.
 */

import type { KpiResult } from './index';

/** User roles supported by the platform */
export type UserRole = 'Engineering_Manager' | 'Leadership' | 'Super_Admin' | 'Admin' | 'Delivery_Manager';

/** Authenticated user context with team assignment */
export interface UserContext {
  userId: string;
  role: UserRole;
  teamId: string | null; // null for Leadership and Super_Admin
}

/** Result of an authorization check */
export interface AuthorizationResult {
  permitted: boolean;
  scopedTeam: string | null; // team to filter by, null means all teams
  errorMessage?: string;
}

/** Data scope derived from user permissions */
export interface DataScope {
  type: 'single_team' | 'all_teams';
  teamId: string | null; // non-null only for single_team
}

/** Audit log action types */
export type AuditAction = 'create' | 'update' | 'delete';

/** An entry in the immutable audit log */
export interface AuditEntry {
  id?: number;
  userId: string;
  action: AuditAction;
  recordId: number;
  recordType: 'sprint_data';
  teamId: string;
  modifiedFields: string[] | null; // null for create/delete, field names for update
  timestamp: string; // UTC ISO 8601
}

/** Filter criteria for querying audit log entries */
export interface AuditFilter {
  userId?: string;
  action?: AuditAction;
  startDate?: string;
  endDate?: string;
  teamId?: string;
}

/** Multi-dimensional filter for analytics queries */
export interface AnalyticsFilter {
  team?: string;
  engineeringManager?: string;
  functionName?: string;
  startDate?: string;
  endDate?: string;
  developmentStatus?: string;
  period?: 'month' | 'quarter' | 'year' | 'custom';
}

/** A row in the team comparison table */
export interface TeamComparisonRow {
  team: string;
  kpis: Record<string, { value: number | null; ragStatus: string }>;
}

/** A single data point in a trend time series */
export interface TrendDataPoint {
  period: string;
  value: number | null;
  ragStatus: string;
}

/** KPI scorecard response with all KPI results for a scope/period */
export interface KpiScorecard {
  kpis: KpiResult[];
  periodLabel: string;
  scope: string; // team name or "Organization"
}

/** Supported export formats */
export type ExportFormat = 'xlsx' | 'csv' | 'pdf';

/** Request to generate an export file */
export interface ExportRequest {
  format: ExportFormat;
  filter: AnalyticsFilter;
  userScope: DataScope;
  requestedBy: string;
  requestedAt: string;
}

/** Result of an export generation */
export interface ExportResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}
