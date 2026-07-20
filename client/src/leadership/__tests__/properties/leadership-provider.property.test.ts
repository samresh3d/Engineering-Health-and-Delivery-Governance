/**
 * Property-based tests for the LeadershipProvider editing actions
 * (`client/src/leadership/state/LeadershipProvider.tsx`).
 *
 * These tests exercise the provider through its PUBLIC API only: they render
 * the provider and drive editing actions via the `useLeadership` hook using
 * `@testing-library/react`'s `renderHook` + `act`. A model is loaded by calling
 * `uploadWorkbook(buffer)` with a valid `KPIs` workbook produced by
 * `arbWorkbookBuffer()`; the projected rows are then read back with
 * `gridProjector.toRows(result.current.model!)`.
 *
 * The provider auto-saves to localStorage on every commit and restores on
 * mount, so each fast-check run clears localStorage before mounting to keep the
 * runs isolated (see `renderProvider`).
 *
 * Covers design correctness properties:
 *  - Property 4  — Invalid commit leaves the model unchanged                (Req 2.7)
 *  - Property 5  — Dashboards/derived recompute as a pure function of the
 *                  committed approved model                       (Req 2.9, 3.1, 3.5)
 *  - Property 17 — Bulk apply updates exactly the selected valid cells      (Req 8.1)
 *  - Property 18 — Paste populates aligned cells and preserves invalid targets
 *                                                                    (Req 8.2, 8.7)
 *  - Property 19 — Bulk update records one change per modified row          (Req 8.3)
 *
 * Framework: Vitest + fast-check, 100 iterations per property.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { createElement, type ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';

import { LeadershipProvider } from '../../state/LeadershipProvider';
import { useLeadership } from '../../state/useLeadership';
import type { LeadershipContextValue } from '../../state/LeadershipContext';
import { toRows } from '../../services/grid-projector';
import { validator } from '../../services/validator';
import { applyFilters, deriveOptions } from '../../services/filter-controller';
import { approvalService } from '../../services/approval-service';
import { filterRows } from '../../services/grid-filter';
import type { DashboardModel } from '../../model/types';
import type { KpiType } from '../../model/editing-types';
import { arbWorkbookBuffer } from './arbitraries';

const RUNS = { numRuns: 100 } as const;

/** A raw string that never parses to a number → invalid for any numeric type. */
const INVALID_RAW = 'not-a-number';

/** Render the provider hook after clearing localStorage so each run is isolated. */
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(LeadershipProvider, null, children);

function renderProvider() {
  localStorage.clear();
  return renderHook(() => useLeadership(), { wrapper });
}

/**
 * Coerce a validated value to the numeric shape the model stores — mirrors the
 * provider's own `asModelNumber` so expectations match how edits land in the
 * `DashboardModel`.
 */
function asModelNumber(value: number | string | null): number | null {
  if (value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Map of rowId → Actual Value for a model's projected rows. */
function actualById(model: DashboardModel): Map<string, number | null> {
  return new Map(toRows(model).map((r) => [r.id, r.actualValue]));
}

/** The normalized value an `actual` edit of `raw` lands as, for a KPI type. */
function expectedActual(raw: string, kpiType: KpiType): number | null {
  const result = validator.validate(raw, kpiType);
  return result.ok ? asModelNumber(result.value) : null;
}

/** Deep clone of a JSON-serializable model for before/after comparison. */
function cloneModel(model: DashboardModel): DashboardModel {
  return JSON.parse(JSON.stringify(model)) as DashboardModel;
}

/** Load a valid workbook into the provider and assert a model is present. */
function loadModel(
  result: { current: LeadershipContextValue },
  buffer: ArrayBuffer
): DashboardModel {
  act(() => {
    result.current.uploadWorkbook(buffer);
  });
  const model = result.current.model;
  expect(model).not.toBeNull();
  return model as DashboardModel;
}

describe('LeadershipProvider editing properties', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Feature: leadership-data-management, Property 4: Invalid commit leaves the model unchanged — committing an invalid raw input for a cell's KPI_Type rejects the edit and leaves the model (and audit trail) untouched.
  it('Property 4: an invalid commit leaves the model and audit trail unchanged', () => {
    fc.assert(
      fc.property(
        fc.record({
          buffer: arbWorkbookBuffer(),
          rowPick: fc.nat(),
          field: fc.constantFrom<'actual' | 'target'>('actual', 'target'),
        }),
        ({ buffer, rowPick, field }) => {
          const { result, unmount } = renderProvider();
          try {
            const model = loadModel(result, buffer);
            const rows = toRows(model);
            const row = rows[rowPick % rows.length];
            // All workbook-derived rows are numeric (a KPI definition always
            // exists), so INVALID_RAW is genuinely invalid; guard anyway.
            fc.pre(row.kpiType !== 'Text');

            const modelBefore = cloneModel(result.current.model as DashboardModel);
            const auditLenBefore = result.current.auditTrail.length;

            act(() => {
              result.current.commitEdit(row.id, field, INVALID_RAW);
            });

            // The rejected edit must not change the model or the audit trail.
            expect(result.current.model).toEqual(modelBefore);
            expect(result.current.auditTrail.length).toBe(auditLenBefore);
          } finally {
            unmount();
          }
        }
      ),
      RUNS
    );
  });

  // Feature: leadership-data-management, Property 5: Dashboards and derived fields recompute as a pure function of the committed approved model — with approval disabled (default), filtered/options equal recomputing applyFilters/deriveOptions over the approved model.
  it('Property 5 (approval disabled): filtered/options equal a pure recompute over the approved model', () => {
    fc.assert(
      fc.property(
        fc.record({
          buffer: arbWorkbookBuffer(),
          rowPick: fc.nat(),
          raw: fc.integer({ min: 1, max: 100_000 }).map(String),
        }),
        ({ buffer, rowPick, raw }) => {
          const { result, unmount } = renderProvider();
          try {
            const model = loadModel(result, buffer);
            const rows = toRows(model);
            const row = rows[rowPick % rows.length];

            act(() => {
              result.current.commitEdit(row.id, 'actual', raw);
            });

            const {
              model: current,
              auditTrail,
              approvalEnabled,
              selection,
            } = result.current;
            expect(approvalEnabled).toBe(false);

            const approved = approvalService.approvedModel(
              current as DashboardModel,
              auditTrail,
              approvalEnabled
            );

            // Dashboards (filtered) and derived options are a pure function of
            // the approved model + current selection.
            expect(result.current.filtered).toEqual(applyFilters(approved, selection));
            expect(result.current.options).toEqual(deriveOptions(approved));

            // With approval disabled, the working model already drives the
            // dashboards: the committed value is present in the approved model.
            const expected = expectedActual(raw, row.kpiType);
            expect(actualById(approved).get(row.id)).toBe(expected);
          } finally {
            unmount();
          }
        }
      ),
      RUNS
    );
  });

  // Feature: leadership-data-management, Property 5: Dashboards and derived fields recompute as a pure function of the committed approved model — with approval enabled, an un-approved edit stays in the working model but is excluded from the approved model driving the dashboards until it is approved.
  it('Property 5 (approval enabled): un-approved edits are excluded from dashboards until approved', () => {
    fc.assert(
      fc.property(
        fc.record({
          buffer: arbWorkbookBuffer(),
          rowPick: fc.nat(),
          raw: fc.integer({ min: 1, max: 100_000 }).map(String),
        }),
        ({ buffer, rowPick, raw }) => {
          const { result, unmount } = renderProvider();
          try {
            const model = loadModel(result, buffer);
            const rows = toRows(model);
            const row = rows[rowPick % rows.length];
            const previousValue = row.actualValue;
            const expected = expectedActual(raw, row.kpiType);

            act(() => {
              result.current.setApprovalEnabled(true);
            });
            act(() => {
              result.current.commitEdit(row.id, 'actual', raw);
            });

            // --- Un-approved (Draft) edit -----------------------------------
            {
              const { model: current, auditTrail, approvalEnabled, selection } =
                result.current;
              expect(approvalEnabled).toBe(true);

              const approved = approvalService.approvedModel(
                current as DashboardModel,
                auditTrail,
                approvalEnabled
              );

              // Pure-recompute property still holds.
              expect(result.current.filtered).toEqual(applyFilters(approved, selection));
              expect(result.current.options).toEqual(deriveOptions(approved));

              // The working model carries the edit; the approved model does not
              // (it reverts the un-approved change) — verified only when the
              // edit actually changed the value.
              expect(actualById(current as DashboardModel).get(row.id)).toBe(expected);
              if (expected !== previousValue) {
                expect(actualById(approved).get(row.id)).toBe(previousValue);
              }
            }

            // --- Approve the edit (Draft → Pending Approval → Approved) ------
            act(() => {
              result.current.submitForApproval(row.id);
            });
            act(() => {
              result.current.approve(row.id);
            });

            {
              const { model: current, auditTrail, approvalEnabled, selection } =
                result.current;
              const approved = approvalService.approvedModel(
                current as DashboardModel,
                auditTrail,
                approvalEnabled
              );

              // Pure-recompute property still holds after the transitions.
              expect(result.current.filtered).toEqual(applyFilters(approved, selection));
              expect(result.current.options).toEqual(deriveOptions(approved));

              // Once approved, the edit drives the dashboards.
              expect(actualById(approved).get(row.id)).toBe(expected);
            }
          } finally {
            unmount();
          }
        }
      ),
      RUNS
    );
  });

  // Feature: leadership-data-management, Property 17: Bulk apply updates exactly the selected valid cells — bulkEdit sets every selected valid cell to the normalized value and leaves non-selected cells unchanged.
  it('Property 17: bulk apply updates exactly the selected valid cells', () => {
    fc.assert(
      fc.property(
        fc.record({
          buffer: arbWorkbookBuffer(),
          picks: fc.array(fc.nat(), { maxLength: 12 }),
          raw: fc.integer({ min: 1, max: 100_000 }).map(String),
        }),
        ({ buffer, picks, raw }) => {
          const { result, unmount } = renderProvider();
          try {
            const model = loadModel(result, buffer);
            const rows = toRows(model);
            const ids = rows.map((r) => r.id);
            const rowById = new Map(rows.map((r) => [r.id, r]));

            const selectedIds = Array.from(
              new Set(picks.map((n) => ids[n % ids.length]))
            );
            const selected = new Set(selectedIds);
            const before = actualById(model);

            act(() => {
              result.current.bulkEdit(selectedIds, 'actual', raw);
            });

            const after = actualById(result.current.model as DashboardModel);

            for (const id of ids) {
              if (selected.has(id)) {
                // Selected valid cells hold the committed normalized value.
                const expected = expectedActual(raw, rowById.get(id)!.kpiType);
                expect(after.get(id)).toBe(expected);
              } else {
                // Non-selected cells are unchanged.
                expect(after.get(id)).toBe(before.get(id));
              }
            }
          } finally {
            unmount();
          }
        }
      ),
      RUNS
    );
  });

  // Feature: leadership-data-management, Property 18: Paste populates aligned cells and preserves invalid targets — pasteCells fills consecutive visible cells from the anchor with normalized valid values, leaving invalid target cells at their prior value.
  it('Property 18: paste populates aligned valid cells and preserves invalid targets', () => {
    const arbCell = fc.oneof(
      fc.integer({ min: 1, max: 100_000 }).map(String), // valid numeric
      fc.constantFrom(INVALID_RAW, 'abc', 'xyz', '--') // invalid
    );
    fc.assert(
      fc.property(
        fc.record({
          buffer: arbWorkbookBuffer(),
          anchorPick: fc.nat(),
          matrix: fc.array(fc.array(arbCell, { minLength: 1, maxLength: 3 }), {
            minLength: 1,
            maxLength: 3,
          }),
        }),
        ({ buffer, anchorPick, matrix }) => {
          const { result, unmount } = renderProvider();
          try {
            const model = loadModel(result, buffer);

            // Mirror the provider's alignment: visible rows are the grid-filter
            // view of the projected rows (default filter → all rows in order).
            const visible = filterRows(toRows(model), result.current.gridFilter);
            const anchorIndex = anchorPick % visible.length;
            const anchor = visible[anchorIndex];

            // Expected values by id: start from the current actuals, then apply
            // valid pasted cells row-major from the anchor; invalid cells keep
            // their prior value.
            const expected = actualById(model);
            const values = matrix.flat();
            for (let i = 0; i < values.length; i += 1) {
              const target = visible[anchorIndex + i];
              if (!target) break;
              const res = validator.validate(values[i], target.kpiType);
              if (res.ok) {
                expected.set(target.id, asModelNumber(res.value));
              }
            }

            act(() => {
              result.current.pasteCells(anchor.id, 'actual', matrix);
            });

            const after = actualById(result.current.model as DashboardModel);
            for (const [id, value] of expected) {
              expect(after.get(id)).toBe(value);
            }
          } finally {
            unmount();
          }
        }
      ),
      RUNS
    );
  });

  // Feature: leadership-data-management, Property 19: Bulk update records one change per modified row — a bulk update that modifies N rows appends exactly N change records, one per row, each carrying the correct rowId/field/newValue.
  it('Property 19: bulk update records exactly one change per modified row', () => {
    fc.assert(
      fc.property(
        fc.record({
          buffer: arbWorkbookBuffer(),
          picks: fc.array(fc.nat(), { maxLength: 12 }),
          raw: fc.integer({ min: 1, max: 100_000 }).map(String),
        }),
        ({ buffer, picks, raw }) => {
          const { result, unmount } = renderProvider();
          try {
            const model = loadModel(result, buffer);
            const rows = toRows(model);
            const ids = rows.map((r) => r.id);
            const rowById = new Map(rows.map((r) => [r.id, r]));

            const selectedIds = Array.from(
              new Set(picks.map((n) => ids[n % ids.length]))
            );
            const auditLenBefore = result.current.auditTrail.length;

            act(() => {
              result.current.bulkEdit(selectedIds, 'actual', raw);
            });

            // Every selected row is valid for an `actual` numeric edit, so the
            // trail grows by exactly the number of selected rows.
            const trail = result.current.auditTrail;
            expect(trail.length).toBe(auditLenBefore + selectedIds.length);

            const appended = trail.slice(auditLenBefore);
            appended.forEach((record, i) => {
              const id = selectedIds[i];
              const kpiType = rowById.get(id)!.kpiType;
              const expectedNewValue = validator.validate(raw, kpiType);
              expect(record.rowId).toBe(id);
              expect(record.field).toBe('actual');
              expect(expectedNewValue.ok).toBe(true);
              if (expectedNewValue.ok) {
                expect(record.newValue).toBe(expectedNewValue.value);
              }
            });
          } finally {
            unmount();
          }
        }
      ),
      RUNS
    );
  });
});
