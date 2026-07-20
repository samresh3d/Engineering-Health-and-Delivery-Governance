/**
 * GridFilter — pure grid-filter application and filter-option derivation for the
 * Leadership Data Management grid.
 *
 * Responsibilities (Requirements 7.2, 7.3, 7.4, 7.5):
 *  - `filterRows(rows, selection)` returns exactly the `GridRow`s that satisfy
 *    every active (non-empty) filter criterion. Dimensions combine with AND
 *    (a row must satisfy every active dimension); values within a single
 *    dimension combine with OR (a row satisfies a dimension when it matches any
 *    selected value). An empty array for a dimension imposes no restriction, so
 *    a fully cleared selection returns every row (Req 7.2, 7.4).
 *  - `buildFilterOptions(model, trail, approvalEnabled)` enumerates the options
 *    for each filter from the model's dimensions and the audit trail's distinct
 *    `Updated By` authors (Req 7.3, 7.5). The four `Approval_Status` values are
 *    included in the Status options only when the approval workflow is enabled;
 *    they are omitted otherwise (Req 7.5).
 *
 * All functions are pure: they never mutate their inputs and always return a
 * defined result for every input.
 *
 * Status filtering note: a `GridRow` carries an optional `approvalStatus` but no
 * pre-computed health status (that requires the row's `KpiDefinition`). This
 * service therefore evaluates the `Approval_Status` members of the Status
 * selection against `row.approvalStatus`. Health-status members
 * (`Green`/`Amber`/`Red`/`Unknown`) are intentionally not evaluated here; that
 * filtering is applied by the caller where the `KpiDefinition` is available.
 */

import type { DashboardModel, EngineeringPillar, HealthStatus } from '../model/types';
import type {
  ApprovalStatus,
  AuditTrail,
  GridFilterSelection,
  GridRow,
} from '../model/editing-types';

/** The available options for each grid filter, derived from the model + trail. */
export interface GridFilterOptions {
  months: string[];
  teams: string[];
  pillars: EngineeringPillar[];
  kpis: string[];
  /** Health-status options, plus the four Approval_Status values when enabled. */
  statuses: (HealthStatus | ApprovalStatus)[];
  updatedBy: string[];
}

/** The four approval-workflow states, in canonical lifecycle order. */
const APPROVAL_STATUSES: ApprovalStatus[] = [
  'Draft',
  'Pending Approval',
  'Approved',
  'Rejected',
];

/** Canonical health-status ordering so Status options are deterministic. */
const HEALTH_STATUSES: HealthStatus[] = ['Green', 'Amber', 'Red', 'Unknown'];

/** Set of approval-status labels, used to partition a mixed Status selection. */
const APPROVAL_STATUS_SET = new Set<string>(APPROVAL_STATUSES);

/**
 * Return exactly the rows that satisfy every active filter criterion.
 *
 * A dimension is "active" only when its selection array is non-empty; an empty
 * array imposes no restriction on that dimension. Dimensions combine with AND;
 * values within a dimension combine with OR. A fully cleared selection (every
 * array empty) therefore returns all rows unchanged (Req 7.2, 7.4).
 */
export function filterRows(
  rows: GridRow[],
  selection: GridFilterSelection
): GridRow[] {
  // Consider only the Approval_Status members of the Status selection here;
  // health-status members are handled by the KpiDefinition-aware caller.
  const approvalStatuses = selection.statuses.filter((status): status is ApprovalStatus =>
    APPROVAL_STATUS_SET.has(status)
  );

  return rows.filter((row) => matchesSelection(row, selection, approvalStatuses));
}

/**
 * Derive the available options for each grid filter.
 *
 * Month/Team/KPI/Pillar options come straight from the model's discovered
 * dimensions (Req 7.3). `Updated By` options are the distinct authors present in
 * the audit trail, in first-seen order (Req 7.3). Status options always include
 * the health statuses actually meaningful for the grid and additionally include
 * the four `Approval_Status` values when the approval workflow is enabled; when
 * it is disabled those approval values are omitted (Req 7.5).
 */
export function buildFilterOptions(
  model: DashboardModel,
  trail: AuditTrail,
  approvalEnabled: boolean
): GridFilterOptions {
  const { dimensions } = model;

  const statuses: (HealthStatus | ApprovalStatus)[] = [...HEALTH_STATUSES];
  if (approvalEnabled) {
    statuses.push(...APPROVAL_STATUSES);
  }

  return {
    months: distinctMonths(dimensions.periods),
    teams: [...dimensions.teams],
    pillars: [...dimensions.pillars],
    kpis: [...dimensions.kpis],
    statuses,
    updatedBy: distinctUpdatedBy(trail),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Determine whether a row satisfies every active filter criterion. An empty
 * selection array for a dimension imposes no restriction on that dimension.
 */
function matchesSelection(
  row: GridRow,
  selection: GridFilterSelection,
  approvalStatuses: ApprovalStatus[]
): boolean {
  if (isActive(selection.months) && !selection.months.includes(row.month)) {
    return false;
  }
  if (isActive(selection.teams) && !selection.teams.includes(row.team)) {
    return false;
  }
  if (isActive(selection.pillars)) {
    if (row.pillar === null || !selection.pillars.includes(row.pillar)) {
      return false;
    }
  }
  if (isActive(selection.kpis) && !selection.kpis.includes(row.kpi)) {
    return false;
  }
  if (isActive(selection.updatedBy)) {
    if (row.updatedBy === null || !selection.updatedBy.includes(row.updatedBy)) {
      return false;
    }
  }
  // Status dimension: only the Approval_Status members are evaluated here. When
  // approval statuses are selected, a row matches when its approvalStatus is one
  // of them; otherwise the approval portion imposes no restriction.
  if (approvalStatuses.length > 0) {
    if (row.approvalStatus === undefined || !approvalStatuses.includes(row.approvalStatus)) {
      return false;
    }
  }

  return true;
}

/** A dimension is active only when it restricts the result (non-empty). */
function isActive<T>(values: T[] | undefined): values is T[] {
  return Array.isArray(values) && values.length > 0;
}

/** Distinct month labels in ascending period-key order. */
function distinctMonths(periods: { month: string; key: string }[]): string[] {
  const ordered = [...periods].sort((a, b) => {
    if (a.key < b.key) return -1;
    if (a.key > b.key) return 1;
    return 0;
  });
  const seen = new Set<string>();
  const months: string[] = [];
  for (const period of ordered) {
    if (!seen.has(period.month)) {
      seen.add(period.month);
      months.push(period.month);
    }
  }
  return months;
}

/** Distinct `Updated By` authors present in the audit trail, first-seen order. */
function distinctUpdatedBy(trail: AuditTrail): string[] {
  const seen = new Set<string>();
  const authors: string[] = [];
  for (const record of trail) {
    if (!seen.has(record.updatedBy)) {
      seen.add(record.updatedBy);
      authors.push(record.updatedBy);
    }
  }
  return authors;
}
