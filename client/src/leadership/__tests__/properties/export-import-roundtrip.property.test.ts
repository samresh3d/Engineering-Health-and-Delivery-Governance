/**
 * Property-based test for the Excel export / import round trip
 * (`services/csv-export.ts` `toWorkbook` → `services/import-service.ts`
 * `importService.importWorkbook(..., 'replace')`).
 *
 * Uses fast-check + Vitest and the shared, parser-consistent `arbModel()`
 * generator from `./arbitraries.ts`. Runs at least 100 iterations.
 *
 * Covers design correctness property:
 *  - Property 9 — Export/import round trip preserves the model
 *    (Req 4.5, 4.7, 11.5)
 *
 * Equivalence definition
 * -----------------------
 * The export/parse pipeline may legitimately normalize some *incidental* fields
 * — most notably `KpiDefinition.pillar`/`direction`, which the parser re-derives
 * from the KPI-name mapping (`lookupKpiPillar`) when re-reading the workbook,
 * and month-label canonicalization. Property 9 does NOT require those incidental
 * fields to survive verbatim; it requires the *meaningful content* to be
 * preserved. We therefore assert the invariants the property names explicitly:
 *
 *   - same set of teams (`dimensions.teams`)
 *   - same set of KPI names
 *   - same set of periods (by `period.key`) and years
 *   - per KPI: same target (null stays null)
 *   - per (team, kpi, periodKey): same metric value (absent/null preserved as
 *     null, since the exporter writes absent values as empty cells that
 *     re-parse to null)
 *
 * A genuine round-trip data-loss bug (a metric value or target that changes)
 * would fail these assertions rather than being hidden.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { toWorkbook } from '../../services/csv-export';
import { importService } from '../../services/import-service';
import type { DashboardModel } from '../../model/types';
import { arbModel } from './arbitraries';

const RUNS = { numRuns: 100 } as const;

/** Sorted, de-duplicated copy of a string list (for order-insensitive compare). */
function sortedSet(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** Numeric-or-null equality that treats `-0` and `0` as equal. */
function valueEq(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  // `===` treats -0 === 0 as true, which is the intended value equality here.
  return a === b;
}

/** Map each KPI name to its definition target. */
function targetByKpi(model: DashboardModel): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const def of model.kpiDefinitions) map.set(def.name, def.target);
  return map;
}

/** Map the (team, kpi, periodKey) identity tuple to the metric value. */
function valueByIdentity(model: DashboardModel): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const m of model.metrics) {
    map.set([m.team, m.kpi, m.period.key].join('\u0000'), m.value);
  }
  return map;
}

describe('Export/import round trip — Property 9: preserves the model', () => {
  // Feature: leadership-data-management, Property 9: Export/import round trip preserves the model
  it('re-importing an exported workbook in replace mode yields an equivalent model', () => {
    fc.assert(
      fc.property(arbModel(), (model) => {
        // 1. Export the model to a workbook via the existing export service.
        const buffer = toWorkbook(model);

        // 2. Re-import the workbook in replace mode.
        const result = importService.importWorkbook(null, buffer, 'replace');
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const reimported = result.model;

        // 3a. Same set of teams.
        expect(sortedSet(reimported.dimensions.teams)).toEqual(
          sortedSet(model.dimensions.teams)
        );

        // 3b. Same set of KPI names (compared via the definitions).
        expect(sortedSet(reimported.kpiDefinitions.map((d) => d.name))).toEqual(
          sortedSet(model.kpiDefinitions.map((d) => d.name))
        );

        // 3c. Same set of periods (by key) and same set of years.
        expect(sortedSet(reimported.dimensions.periods.map((p) => p.key))).toEqual(
          sortedSet(model.dimensions.periods.map((p) => p.key))
        );
        expect([...new Set(reimported.dimensions.years)].sort((a, b) => a - b)).toEqual(
          [...new Set(model.dimensions.years)].sort((a, b) => a - b)
        );

        // 3d. Per KPI: same target (null stays null).
        const expectedTargets = targetByKpi(model);
        const actualTargets = targetByKpi(reimported);
        expect(sortedSet([...actualTargets.keys()])).toEqual(
          sortedSet([...expectedTargets.keys()])
        );
        for (const [kpi, target] of expectedTargets) {
          expect(valueEq(actualTargets.get(kpi) ?? null, target)).toBe(true);
        }

        // 3e. Per (team, kpi, periodKey): same metric value (absent/null preserved).
        const expectedValues = valueByIdentity(model);
        const actualValues = valueByIdentity(reimported);

        // Identity key-sets match exactly (no rows lost or spuriously added).
        expect(sortedSet([...actualValues.keys()])).toEqual(
          sortedSet([...expectedValues.keys()])
        );
        // No duplicate identity tuples were produced by the round trip.
        expect(actualValues.size).toBe(reimported.metrics.length);

        for (const [identity, value] of expectedValues) {
          expect(actualValues.has(identity)).toBe(true);
          expect(valueEq(actualValues.get(identity) ?? null, value)).toBe(true);
        }
      }),
      RUNS
    );
  });
});
