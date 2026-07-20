/**
 * ApprovalService — optional approval lifecycle for the Leadership Data
 * Management feature.
 *
 * This service is a set of pure, total functions over plain data (no React,
 * DOM, network, or storage coupling), matching the style of the module's other
 * computation-core services (`health-classifier`, `filter-controller`, ...).
 *
 * It provides two capabilities:
 *
 *  1. {@link ApprovalService.transition} — the Approval_Status state machine.
 *     Every (state, action) combination is defined (totality, Property 13);
 *     transitions that do not apply return the current status unchanged
 *     (Requirements 6.1–6.5).
 *
 *  2. {@link ApprovalService.approvedModel} — derives the model that drives the
 *     dashboards. When the workflow is disabled the full model is returned
 *     unchanged; when enabled, only changes whose `Approval_Status` is
 *     `'Approved'` are incorporated, and non-approved changes are reverted
 *     (Requirements 3.3, 3.4, 6.6 / Property 6).
 *
 * ### Approved-model derivation approach
 *
 * Committed edits are applied directly into the working `DashboardModel`
 * (`MetricValue.value` for Actual edits, `KpiDefinition.target` for Target
 * edits), so the working model reflects *all* changes regardless of approval
 * state. The `Audit_Trail` records the full change history for each grid row
 * (with `previousValue`/`newValue`/`approvalStatus`). To reconstruct the
 * approved-visible values we walk each affected target's change history and:
 *
 *  - use the `newValue` of the latest `'Approved'` change, if any; otherwise
 *  - revert to the `previousValue` of the earliest change (the value that
 *    existed before any editing occurred).
 *
 * Targets with no change history are left exactly as they are in the model.
 *
 * ### Assumptions
 *
 * Row ids are produced by `grid-projector.ts`, the canonical id scheme. This
 * service imports {@link rowId} from the projector (and re-exports it) so the
 * ids it reconstructs to match against the `Audit_Trail` are byte-for-byte
 * identical to the ids the provider stored. A Change_Record for a Target edit
 * carries a grid-row id of the form `month\u0001team\u0001pillar\u0001kpi`, but
 * a Target is per-KPI (it lives on `KpiDefinition`); the KPI is taken from the
 * final segment after the last `ID_DELIMITER`. KPI names are assumed not to
 * contain the projector's delimiter.
 */

import type { DashboardModel, EngineeringPillar, MetricValue, KpiDefinition } from '../model/types';
import type { ApprovalStatus, AuditTrail, ChangeRecord } from '../model/editing-types';
import { rowId, ID_DELIMITER } from './grid-projector';

export type { ApprovalStatus } from '../model/editing-types';

// Re-export the canonical row-id builder so existing importers of this module's
// `rowId` keep working while sharing the single grid-projector implementation.
export { rowId } from './grid-projector';

/** The lifecycle actions a user can take on a change. */
export type ApprovalAction = 'submit' | 'approve' | 'reject';

/** Public contract for the approval service (design §5). */
export interface IApprovalService {
  /**
   * Advance an `Approval_Status` according to the requested action. Total: any
   * (state, action) pair that does not correspond to a valid transition
   * returns `current` unchanged.
   */
  transition(current: ApprovalStatus, action: ApprovalAction): ApprovalStatus;
  /**
   * Derive the model that drives the dashboards. When `enabled` is `false` the
   * full model is returned unchanged; when `true` only `'Approved'` changes are
   * incorporated.
   */
  approvedModel(model: DashboardModel, trail: AuditTrail, enabled: boolean): DashboardModel;
}

/**
 * Advance `current` by `action`. Only the three meaningful transitions change
 * the status; everything else is the identity (Requirements 6.1–6.5, Property
 * 13 totality).
 *
 *  - `submit`  on `Draft`            → `Pending Approval`
 *  - `approve` on `Pending Approval` → `Approved`
 *  - `reject`  on `Pending Approval` → `Rejected`
 */
function transition(current: ApprovalStatus, action: ApprovalAction): ApprovalStatus {
  switch (action) {
    case 'submit':
      return current === 'Draft' ? 'Pending Approval' : current;
    case 'approve':
      return current === 'Pending Approval' ? 'Approved' : current;
    case 'reject':
      return current === 'Pending Approval' ? 'Rejected' : current;
    default:
      // Unreachable for well-typed callers; totality guard keeps the function
      // safe for any runtime input.
      return current;
  }
}

/**
 * Resolve the approved-visible value for a single target given its change
 * history and the value currently held in the working model.
 *
 * @param changes chronologically ordered changes for one (rowId, field)
 * @param currentValue the value presently in the working model
 */
function approvedValueFor(
  changes: ChangeRecord[],
  currentValue: number | string | null,
): number | string | null {
  if (changes.length === 0) {
    // Nothing was ever edited here — the model value stands.
    return currentValue;
  }
  // Latest Approved change wins; later non-approved changes are excluded.
  for (let i = changes.length - 1; i >= 0; i -= 1) {
    if (changes[i].approvalStatus === 'Approved') {
      return changes[i].newValue;
    }
  }
  // No approved change exists: revert to the value before any editing.
  return changes[0].previousValue;
}

/** Coerce an audit value to the numeric shape used by the model's value/target. */
function toNumericOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Chronological comparison of two change records by ISO-8601 timestamp. */
function byTimestamp(a: ChangeRecord, b: ChangeRecord): number {
  if (a.timestamp < b.timestamp) return -1;
  if (a.timestamp > b.timestamp) return 1;
  return 0;
}

/**
 * Extract the KPI name from a grid-projector row id — its final segment after
 * the last {@link ID_DELIMITER}. The projector composes target-edit ids as
 * `month\u0001team\u0001pillar\u0001kpi`, so the KPI is the trailing segment.
 */
function kpiFromRowId(id: string): string {
  const idx = id.lastIndexOf(ID_DELIMITER);
  return idx === -1 ? id : id.slice(idx + 1);
}

/**
 * Derive the approved model. Returns the full model unchanged when the workflow
 * is disabled; otherwise reverts every non-approved change so only `'Approved'`
 * changes remain visible (Requirements 3.3, 3.4, 6.6).
 *
 * The result is a fresh, immutable `DashboardModel`; the input model is never
 * mutated.
 */
function approvedModel(model: DashboardModel, trail: AuditTrail, enabled: boolean): DashboardModel {
  // Req 3.4 / A4: disabled workflow ⇒ all saved data drives the dashboards.
  if (!enabled) {
    return model;
  }

  // Index the change history by row id, keeping the two fields separate and in
  // chronological order.
  const actualChanges = new Map<string, ChangeRecord[]>();
  const targetChangesByKpi = new Map<string, ChangeRecord[]>();

  for (const record of [...trail].sort(byTimestamp)) {
    if (record.field === 'actual') {
      const list = actualChanges.get(record.rowId);
      if (list) list.push(record);
      else actualChanges.set(record.rowId, [record]);
    } else {
      // Target edits are per-KPI; group by the KPI parsed from the row id.
      const kpi = kpiFromRowId(record.rowId);
      const list = targetChangesByKpi.get(kpi);
      if (list) list.push(record);
      else targetChangesByKpi.set(kpi, [record]);
    }
  }

  // Pillar lookup so a metric's row id can be reconstructed for matching.
  const pillarByKpi = new Map<string, EngineeringPillar | null>();
  for (const def of model.kpiDefinitions) {
    pillarByKpi.set(def.name, def.pillar);
  }

  // Revert Actual values to their approved-visible value.
  const metrics: MetricValue[] = model.metrics.map((metric) => {
    const pillar = pillarByKpi.get(metric.kpi) ?? null;
    const id = rowId(metric.period.month, metric.team, pillar, metric.kpi);
    const changes = actualChanges.get(id);
    if (!changes) return metric;
    const approved = toNumericOrNull(approvedValueFor(changes, metric.value));
    return approved === metric.value ? metric : { ...metric, value: approved };
  });

  // Revert Target values (per KPI definition) to their approved-visible value.
  const kpiDefinitions: KpiDefinition[] = model.kpiDefinitions.map((def) => {
    const changes = targetChangesByKpi.get(def.name);
    if (!changes) return def;
    const approved = toNumericOrNull(approvedValueFor(changes, def.target));
    return approved === def.target ? def : { ...def, target: approved };
  });

  return { ...model, metrics, kpiDefinitions };
}

/** Default, stateless instance of the approval service. */
export const approvalService: IApprovalService = {
  transition,
  approvedModel,
};

export default approvalService;
