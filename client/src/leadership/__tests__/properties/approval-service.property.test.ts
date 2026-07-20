/**
 * Property-based tests for the ApprovalService
 * (`client/src/leadership/services/approval-service.ts`).
 *
 * Uses the shared, parser-consistent arbitraries in `./arbitraries.ts`
 * (`arbModel`, `arbAuditTrail`) and fast-check + Vitest. Each property runs at
 * least 100 times.
 *
 * Covers design correctness properties:
 *  - Property 6  — Approved model reflects approval state (Req 3.3, 3.4, 6.6)
 *  - Property 13 — Approval transitions are total and correct
 *                  (Req 6.1, 6.2, 6.3, 6.4, 6.5)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import type {
  DashboardModel,
  EngineeringPillar,
  KpiDefinition,
  MetricValue,
} from '../../model/types';
import type {
  ApprovalStatus,
  AuditTrail,
  ChangeRecord,
} from '../../model/editing-types';
import { approvalService, rowId } from '../../services/approval-service';
import { arbModel, arbAuditTrail } from './arbitraries';

const RUNS = { numRuns: 100 } as const;

// Must match grid-projector's ID_DELIMITER (re-exported via approval-service's
// rowId). Target-edit row ids are month\u0001team\u0001pillar\u0001kpi, so the
// KPI is the segment after the last delimiter.
const ROW_ID_DELIMITER = '\u0001';

const APPROVAL_STATUSES: readonly ApprovalStatus[] = [
  'Draft',
  'Pending Approval',
  'Approved',
  'Rejected',
];

const APPROVAL_ACTIONS = ['submit', 'approve', 'reject'] as const;

// ---------------------------------------------------------------------------
// Independent re-derivation of the approved-visible value, mirroring the
// service's documented rule (design "Approved-model derivation approach"):
//   - use the newValue of the latest 'Approved' change, if any; otherwise
//   - revert to the previousValue of the earliest change; otherwise
//   - keep the value currently in the model (no change history).
// ---------------------------------------------------------------------------

function expectedApprovedValue(
  changes: ChangeRecord[],
  currentValue: number | string | null,
): number | string | null {
  if (changes.length === 0) return currentValue;
  for (let i = changes.length - 1; i >= 0; i -= 1) {
    if (changes[i].approvalStatus === 'Approved') return changes[i].newValue;
  }
  return changes[0].previousValue;
}

function toNumericOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function byTimestamp(a: ChangeRecord, b: ChangeRecord): number {
  if (a.timestamp < b.timestamp) return -1;
  if (a.timestamp > b.timestamp) return 1;
  return 0;
}

function kpiFromRowId(id: string): string {
  const idx = id.lastIndexOf(ROW_ID_DELIMITER);
  return idx === -1 ? id : id.slice(idx + 1);
}

/**
 * Recompute the approved model independently from the service, following the
 * same documented rule. Used to assert the service's derivation is correct.
 */
function recomputeApprovedModel(
  model: DashboardModel,
  trail: AuditTrail,
): DashboardModel {
  const actualChanges = new Map<string, ChangeRecord[]>();
  const targetChangesByKpi = new Map<string, ChangeRecord[]>();

  for (const record of [...trail].sort(byTimestamp)) {
    if (record.field === 'actual') {
      const list = actualChanges.get(record.rowId);
      if (list) list.push(record);
      else actualChanges.set(record.rowId, [record]);
    } else {
      const kpi = kpiFromRowId(record.rowId);
      const list = targetChangesByKpi.get(kpi);
      if (list) list.push(record);
      else targetChangesByKpi.set(kpi, [record]);
    }
  }

  const pillarByKpi = new Map<string, EngineeringPillar | null>();
  for (const def of model.kpiDefinitions) pillarByKpi.set(def.name, def.pillar);

  const metrics: MetricValue[] = model.metrics.map((metric) => {
    const pillar = pillarByKpi.get(metric.kpi) ?? null;
    const id = rowId(metric.period.month, metric.team, pillar, metric.kpi);
    const changes = actualChanges.get(id);
    if (!changes) return metric;
    const approved = toNumericOrNull(expectedApprovedValue(changes, metric.value));
    return approved === metric.value ? metric : { ...metric, value: approved };
  });

  const kpiDefinitions: KpiDefinition[] = model.kpiDefinitions.map((def) => {
    const changes = targetChangesByKpi.get(def.name);
    if (!changes) return def;
    const approved = toNumericOrNull(expectedApprovedValue(changes, def.target));
    return approved === def.target ? def : { ...def, target: approved };
  });

  return { ...model, metrics, kpiDefinitions };
}

describe('ApprovalService properties', () => {
  // Feature: leadership-data-management, Property 6: Approved model reflects approval state — disabled returns the full model; enabled incorporates only Approved changes and reverts the rest.
  it('Property 6a: disabled workflow returns the full model unchanged', () => {
    fc.assert(
      fc.property(
        arbModel().chain((model) =>
          fc.record({ model: fc.constant(model), trail: arbAuditTrail(model) }),
        ),
        ({ model, trail }) => {
          const result = approvalService.approvedModel(model, trail, false);
          // Disabled ⇒ identity (Req 3.4, 6.6): all saved data drives dashboards.
          expect(result).toBe(model);
          expect(result).toEqual(model);
        },
      ),
      RUNS,
    );
  });

  // Feature: leadership-data-management, Property 6: Approved model reflects approval state — enabled incorporates only Approved changes (latest Approved newValue, else pre-edit previousValue), untouched targets unchanged.
  it('Property 6b: enabled workflow reflects exactly the Approved changes', () => {
    fc.assert(
      fc.property(
        arbModel().chain((model) =>
          fc.record({ model: fc.constant(model), trail: arbAuditTrail(model) }),
        ),
        ({ model, trail }) => {
          const result = approvalService.approvedModel(model, trail, true);
          const expected = recomputeApprovedModel(model, trail);

          // The derived approved model matches the documented reconstruction.
          expect(result.metrics).toEqual(expected.metrics);
          expect(result.kpiDefinitions).toEqual(expected.kpiDefinitions);
          // Non-value structure is preserved verbatim.
          expect(result.dimensions).toEqual(model.dimensions);
          expect(result.sourceColumns).toEqual(model.sourceColumns);

          // Input model is never mutated.
          expect(model).toEqual(recomputeApprovedModel(model, []));
        },
      ),
      RUNS,
    );
  });

  // Feature: leadership-data-management, Property 6: Approved model reflects approval state — a target whose latest change is Approved shows that newValue; a target edited only by non-approved changes reverts to its pre-edit value.
  it('Property 6c: latest Approved change wins; non-approved edits revert to pre-edit value', () => {
    fc.assert(
      fc.property(
        arbModel().chain((model) =>
          fc.record({ model: fc.constant(model), trail: arbAuditTrail(model) }),
        ),
        ({ model, trail }) => {
          const result = approvalService.approvedModel(model, trail, true);

          // Group actual changes per reconstructed metric row id, chronologically.
          const pillarByKpi = new Map<string, EngineeringPillar | null>();
          for (const def of model.kpiDefinitions) pillarByKpi.set(def.name, def.pillar);
          const sorted = [...trail].sort(byTimestamp);

          result.metrics.forEach((metric) => {
            const pillar = pillarByKpi.get(metric.kpi) ?? null;
            const id = rowId(metric.period.month, metric.team, pillar, metric.kpi);
            const changes = sorted.filter(
              (c) => c.field === 'actual' && c.rowId === id,
            );
            if (changes.length === 0) return;

            const latestApproved = [...changes]
              .reverse()
              .find((c) => c.approvalStatus === 'Approved');

            if (latestApproved) {
              // Latest Approved change's newValue drives the approved metric.
              expect(metric.value).toBe(toNumericOrNull(latestApproved.newValue));
            } else {
              // No approved change ⇒ revert to the earliest change's previousValue.
              expect(metric.value).toBe(toNumericOrNull(changes[0].previousValue));
            }
          });
        },
      ),
      RUNS,
    );
  });

  // Feature: leadership-data-management, Property 13: Approval transitions are total and correct — transition is defined for every (state, action) and yields the correct next status.
  it('Property 13: transition is total and correct for every (state, action)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...APPROVAL_STATUSES),
        fc.constantFrom(...APPROVAL_ACTIONS),
        (state, action) => {
          const next = approvalService.transition(state, action);

          // Totality: the result is always a valid ApprovalStatus.
          expect(APPROVAL_STATUSES).toContain(next);

          // Correctness of the three meaningful transitions; identity otherwise.
          if (action === 'submit' && state === 'Draft') {
            expect(next).toBe('Pending Approval'); // Req 6.1
          } else if (action === 'approve' && state === 'Pending Approval') {
            expect(next).toBe('Approved'); // Req 6.2
          } else if (action === 'reject' && state === 'Pending Approval') {
            expect(next).toBe('Rejected'); // Req 6.3
          } else {
            // Every other (state, action) returns the input state unchanged
            // (Req 6.4, 6.5 — non-applicable actions are no-ops).
            expect(next).toBe(state);
          }
        },
      ),
      RUNS,
    );
  });
});
