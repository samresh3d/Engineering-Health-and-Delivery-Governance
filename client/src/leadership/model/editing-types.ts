/**
 * Editing types for the Leadership Data Management feature.
 *
 * These types describe the in-portal, editable KPI data layer: the flat
 * `GridRow` projection of the model, the audit-trail records, stored versions,
 * and the grid filter selection. They intentionally reuse the existing
 * `EngineeringPillar` and `DashboardModel` from `model/types.ts` rather than
 * redefining any part of the normalized model (Requirement 11.3).
 */

import type { EngineeringPillar, DashboardModel } from './types';

export type KpiType = 'Percentage' | 'Currency' | 'Number' | 'Text';
export type ApprovalStatus = 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected';

/** A single, uniquely identified record in the Data_Grid. */
export interface GridRow {
  /** Stable identity from (month, team, pillar, kpi). */
  id: string;
  month: string;
  year: number;
  periodKey: string;
  team: string;
  pillar: EngineeringPillar | null;
  kpi: string;
  kpiType: KpiType;
  target: number | null;         // from KpiDefinition.target
  actualValue: number | null;    // from MetricValue.value
  source: string | null;
  lastUpdated: string | null;    // ISO-8601, from latest Change_Record
  updatedBy: string | null;      // from latest Change_Record
  approvalStatus?: ApprovalStatus;
}

/** One audit-trail entry describing a single modification. */
export interface ChangeRecord {
  id: string;
  rowId: string;
  field: 'target' | 'actual';
  previousValue: number | string | null;
  newValue: number | string | null;
  updatedBy: string;
  timestamp: string;             // ISO-8601
  comments?: string;
  approvalStatus?: ApprovalStatus;
}

/** Ordered collection of change records. */
export type AuditTrail = ChangeRecord[];

/** A stored snapshot of the model for a reporting cycle. */
export interface Version {
  id: string;
  cycle: string;                 // e.g. "2025-01"
  createdAt: string;             // ISO-8601
  model: DashboardModel;
}

/** Active grid filter criteria (superset of dashboard filters). */
export interface GridFilterSelection {
  months: string[];
  teams: string[];
  pillars: EngineeringPillar[];
  kpis: string[];
  statuses: (ApprovalStatus | 'Green' | 'Amber' | 'Red' | 'Unknown')[];
  updatedBy: string[];
}
