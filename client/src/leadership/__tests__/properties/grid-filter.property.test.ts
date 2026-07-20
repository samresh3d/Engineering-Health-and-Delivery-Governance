/**
 * Property-based tests for the GridFilter service
 * (`client/src/leadership/services/grid-filter.ts`).
 *
 * Uses fast-check + Vitest and the shared, parser-consistent arbitraries in
 * `./arbitraries.ts` (`arbGridRows`, `arbModel`, `arbAuditTrail`). Each property
 * runs at least 100 times.
 *
 * Covers design correctness properties:
 *  - Property 14 — Grid filter returns exactly the matching rows (Req 7.2)
 *  - Property 15 — Filter options mirror present values          (Req 7.3, 7.5)
 *  - Property 16 — Clearing filters yields every row             (Req 7.4)
 *
 * Note (per the service contract): `filterRows` evaluates the Month/Team/
 * Pillar/KPI/Updated By dimensions and the `Approval_Status` members of
 * `selection.statuses`. Health-status members are handled elsewhere, so these
 * tests populate `statuses` with `ApprovalStatus` values only.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { filterRows, buildFilterOptions } from '../../services/grid-filter';
import { arbGridRows, arbModel, arbAuditTrail } from './arbitraries';
import type { EngineeringPillar } from '../../model/types';
import type {
  ApprovalStatus,
  GridFilterSelection,
  GridRow,
} from '../../model/editing-types';

const RUNS = { numRuns: 100 } as const;

/** The four approval-workflow states the service partitions the Status filter on. */
const APPROVAL_STATUSES: ReadonlyArray<ApprovalStatus> = [
  'Draft',
  'Pending Approval',
  'Approved',
  'Rejected',
];
const APPROVAL_STATUS_SET = new Set<string>(APPROVAL_STATUSES);

/** Preserve first-seen order while de-duplicating. */
function distinct<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/**
 * Build a `GridFilterSelection` arbitrary whose values are drawn from the
 * actual field values present in `rows` (so active filters genuinely match some
 * rows) while `fc.subarray` naturally also produces empty (inactive) dimensions.
 * `statuses` is drawn from the `ApprovalStatus` values present on the rows.
 */
function arbSelectionFor(rows: GridRow[]): fc.Arbitrary<GridFilterSelection> {
  const months = distinct(rows.map((r) => r.month));
  const teams = distinct(rows.map((r) => r.team));
  const pillars = distinct(
    rows.map((r) => r.pillar).filter((p): p is EngineeringPillar => p !== null)
  );
  const kpis = distinct(rows.map((r) => r.kpi));
  const updatedBy = distinct(
    rows.map((r) => r.updatedBy).filter((u): u is string => u !== null)
  );
  const approvalStatuses = distinct(
    rows
      .map((r) => r.approvalStatus)
      .filter((s): s is ApprovalStatus => s !== undefined)
  );

  return fc.record({
    months: fc.subarray(months),
    teams: fc.subarray(teams),
    pillars: fc.subarray(pillars),
    kpis: fc.subarray(kpis),
    statuses: fc.subarray(approvalStatuses) as fc.Arbitrary<
      GridFilterSelection['statuses']
    >,
    updatedBy: fc.subarray(updatedBy),
  });
}

/**
 * Independent re-implementation of the service's matching rule, used to compute
 * the expected filtered set. A dimension is active only when non-empty; active
 * dimensions combine with AND, values within a dimension with OR. Only the
 * `Approval_Status` members of `statuses` are evaluated (mirroring the service).
 */
function expectedMatches(row: GridRow, selection: GridFilterSelection): boolean {
  const approvalStatuses = selection.statuses.filter((s): s is ApprovalStatus =>
    APPROVAL_STATUS_SET.has(s)
  );

  if (selection.months.length > 0 && !selection.months.includes(row.month)) {
    return false;
  }
  if (selection.teams.length > 0 && !selection.teams.includes(row.team)) {
    return false;
  }
  if (selection.pillars.length > 0) {
    if (row.pillar === null || !selection.pillars.includes(row.pillar)) {
      return false;
    }
  }
  if (selection.kpis.length > 0 && !selection.kpis.includes(row.kpi)) {
    return false;
  }
  if (selection.updatedBy.length > 0) {
    if (row.updatedBy === null || !selection.updatedBy.includes(row.updatedBy)) {
      return false;
    }
  }
  if (approvalStatuses.length > 0) {
    if (
      row.approvalStatus === undefined ||
      !approvalStatuses.includes(row.approvalStatus)
    ) {
      return false;
    }
  }
  return true;
}

describe('GridFilter properties', () => {
  // Feature: leadership-data-management, Property 14: Grid filter returns exactly the matching rows — for any rows and selection, filterRows includes a row iff it satisfies every active filter criterion (AND across dimensions, OR within), and no others.
  it('Property 14: filterRows returns exactly the rows satisfying every active dimension', () => {
    fc.assert(
      fc.property(
        arbGridRows().chain((rows) =>
          arbSelectionFor(rows).map((selection) => ({ rows, selection }))
        ),
        ({ rows, selection }) => {
          const result = filterRows(rows, selection);

          // Recompute the expected set independently (order-preserving).
          const expected = rows.filter((row) => expectedMatches(row, selection));

          // Exactly the matching rows, in the original order, and no others.
          expect(result).toEqual(expected);

          // Every returned row genuinely satisfies the selection.
          for (const row of result) {
            expect(expectedMatches(row, selection)).toBe(true);
          }
          // Every excluded row genuinely fails the selection.
          const resultIds = new Set(result.map((r) => r.id));
          for (const row of rows) {
            if (!resultIds.has(row.id)) {
              expect(expectedMatches(row, selection)).toBe(false);
            }
          }

          // Result is a subset of the input rows.
          expect(result.length).toBeLessThanOrEqual(rows.length);
        }
      ),
      RUNS
    );
  });

  // Feature: leadership-data-management, Property 15: Filter options mirror present values — each grid filter's options equal the distinct values present for that dimension (Updated By from the audit trail); Approval_Status values appear in Status iff the approval workflow is enabled.
  it('Property 15: buildFilterOptions mirrors present values and gates approval statuses', () => {
    fc.assert(
      fc.property(
        arbModel().chain((model) =>
          arbAuditTrail(model).map((trail) => ({ model, trail }))
        ),
        fc.boolean(),
        ({ model, trail }, approvalEnabled) => {
          const options = buildFilterOptions(model, trail, approvalEnabled);

          const asSet = <T>(values: T[]) => new Set(values);

          // Month/Team/Pillar/KPI options equal the model dimensions (as sets).
          const expectedMonths = distinct(model.dimensions.periods.map((p) => p.month));
          expect(asSet(options.months)).toEqual(asSet(expectedMonths));
          expect(asSet(options.teams)).toEqual(asSet(model.dimensions.teams));
          expect(asSet(options.pillars)).toEqual(asSet(model.dimensions.pillars));
          expect(asSet(options.kpis)).toEqual(asSet(model.dimensions.kpis));

          // Options carry no duplicates.
          expect(options.months.length).toBe(new Set(options.months).size);
          expect(options.teams.length).toBe(new Set(options.teams).size);
          expect(options.pillars.length).toBe(new Set(options.pillars).size);
          expect(options.kpis.length).toBe(new Set(options.kpis).size);
          expect(options.updatedBy.length).toBe(new Set(options.updatedBy).size);

          // Updated By equals the distinct authors present in the audit trail.
          const expectedUpdatedBy = distinct(trail.map((r) => r.updatedBy));
          expect(asSet(options.updatedBy)).toEqual(asSet(expectedUpdatedBy));

          // Approval_Status gating (Req 7.5).
          const approvalPresent = APPROVAL_STATUSES.filter((s) =>
            options.statuses.includes(s)
          );
          if (approvalEnabled) {
            // All four approval statuses appear when enabled.
            expect(approvalPresent).toEqual([...APPROVAL_STATUSES]);
          } else {
            // None appear when disabled.
            expect(approvalPresent).toEqual([]);
          }
        }
      ),
      RUNS
    );
  });

  // Feature: leadership-data-management, Property 16: Clearing filters yields every row — applying a fully-cleared GridFilterSelection returns the complete set of rows.
  it('Property 16: filterRows with a cleared selection returns every row', () => {
    fc.assert(
      fc.property(arbGridRows(), (rows) => {
        const clearedSelection: GridFilterSelection = {
          months: [],
          teams: [],
          pillars: [],
          kpis: [],
          statuses: [],
          updatedBy: [],
        };

        const result = filterRows(rows, clearedSelection);

        // Every row is returned, in order.
        expect(result).toEqual(rows);
        expect(result.length).toBe(rows.length);
      }),
      RUNS
    );
  });
});
