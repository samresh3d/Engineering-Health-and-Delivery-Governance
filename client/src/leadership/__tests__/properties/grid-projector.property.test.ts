/**
 * Property-based tests for the GridProjector service
 * (`client/src/leadership/services/grid-projector.ts`).
 *
 * Uses the shared, parser-consistent arbitraries in `./arbitraries.ts`
 * (`arbModel`) and fast-check + Vitest. Each property runs at least 100 times.
 *
 * Covers design correctness properties:
 *  - Property 1  — Grid projection fidelity          (Req 1.3, 1.4, 1.5, 5.5)
 *  - Property 2  — Edit application updates only the intended target (Req 2.3, 2.4, 11.3)
 *  - Property 20 — Bulk delete removes exactly the selected rows      (Req 8.4)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import type { DashboardModel, KpiDefinition } from '../../model/types';
import {
  applyActual,
  applyTarget,
  removeRows,
  rowId,
  toRows,
} from '../../services/grid-projector';
import { arbModel } from './arbitraries';

const RUNS = { numRuns: 100 } as const;

/** KPI-name → definition lookup mirroring the projector's first-seen indexing. */
function indexDefinitions(defs: KpiDefinition[]): Map<string, KpiDefinition> {
  const map = new Map<string, KpiDefinition>();
  for (const def of defs) {
    if (!map.has(def.name)) map.set(def.name, def);
  }
  return map;
}

/** Recompute a metric's stable row id the same way the projector does. */
function idOfMetric(
  metric: DashboardModel['metrics'][number],
  defByName: Map<string, KpiDefinition>
): string {
  const pillar = defByName.get(metric.kpi)?.pillar ?? null;
  return rowId(metric.period.month, metric.team, pillar, metric.kpi);
}

/** A finite value or null — the domain of an editable numeric cell. */
const arbEditValue = fc.option(
  fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true }),
  { nil: null }
);

describe('GridProjector properties', () => {
  // Feature: leadership-data-management, Property 1: Grid projection fidelity — toRows produces exactly one GridRow per MetricValue with faithful identity/pillar/actual/target fields.
  it('Property 1: projects exactly one faithful GridRow per MetricValue', () => {
    fc.assert(
      fc.property(arbModel(), (model) => {
        const rows = toRows(model);
        const defByName = indexDefinitions(model.kpiDefinitions);

        // Exactly one row per metric.
        expect(rows.length).toBe(model.metrics.length);

        // toRows preserves metric order, so row[i] projects metric[i].
        rows.forEach((row, i) => {
          const metric = model.metrics[i];
          const def = defByName.get(metric.kpi);
          const expectedPillar = def?.pillar ?? null;

          // Identity fields equal the source period + metric identity.
          expect(row.month).toBe(metric.period.month);
          expect(row.year).toBe(metric.period.year);
          expect(row.periodKey).toBe(metric.period.key);
          expect(row.team).toBe(metric.team);
          expect(row.kpi).toBe(metric.kpi);

          // Pillar equals the KPI definition's pillar.
          expect(row.pillar).toBe(expectedPillar);

          // Actual value equals the metric's value; target equals the def's target.
          expect(row.actualValue).toBe(metric.value);
          expect(row.target).toBe(def?.target ?? null);

          // The id is the stable identity tuple, and matches the metric.
          expect(row.id).toBe(idOfMetric(metric, defByName));
        });
      }),
      RUNS
    );
  });

  // Feature: leadership-data-management, Property 2: Edit application updates only the intended target and yields a valid model — applyActual changes only the addressed MetricValue.value.
  it('Property 2a: applyActual updates only the addressed metric value', () => {
    fc.assert(
      fc.property(
        arbModel().chain((model) => {
          const rows = toRows(model);
          return fc.record({
            model: fc.constant(model),
            rowIndex: fc.nat({ max: rows.length - 1 }),
            value: arbEditValue,
          });
        }),
        ({ model, rowIndex, value }) => {
          const rows = toRows(model);
          const targetId = rows[rowIndex].id;
          const defByName = indexDefinitions(model.kpiDefinitions);

          const result = applyActual(model, targetId, value);

          // Definitions, dimensions, and source columns are untouched.
          expect(result.kpiDefinitions).toEqual(model.kpiDefinitions);
          expect(result.dimensions).toEqual(model.dimensions);
          expect(result.sourceColumns).toEqual(model.sourceColumns);

          // Metric list shape is preserved.
          expect(result.metrics.length).toBe(model.metrics.length);

          result.metrics.forEach((rm, i) => {
            const om = model.metrics[i];
            // Identity is never rewritten by an actual edit.
            expect(rm.team).toBe(om.team);
            expect(rm.kpi).toBe(om.kpi);
            expect(rm.period).toEqual(om.period);
            expect(rm.businessUnit).toBe(om.businessUnit);

            if (idOfMetric(om, defByName) !== targetId) {
              // Non-addressed metrics keep their value.
              expect(rm.value).toBe(om.value);
            }
          });

          // The addressed metric (first match) now holds the committed value.
          const firstMatch = model.metrics.findIndex(
            (m) => idOfMetric(m, defByName) === targetId
          );
          expect(firstMatch).toBeGreaterThanOrEqual(0);
          expect(result.metrics[firstMatch].value).toBe(value);
        }
      ),
      RUNS
    );
  });

  // Feature: leadership-data-management, Property 2: Edit application updates only the intended target and yields a valid model — applyTarget changes only the addressed KpiDefinition.target.
  it('Property 2b: applyTarget updates only the addressed KPI definition target', () => {
    fc.assert(
      fc.property(
        arbModel().chain((model) =>
          fc.record({
            model: fc.constant(model),
            kpi: fc.constantFrom(...model.kpiDefinitions.map((d) => d.name)),
            target: arbEditValue,
          })
        ),
        ({ model, kpi, target }) => {
          const result = applyTarget(model, kpi, target);

          // Metrics, dimensions, and source columns are untouched by a target edit.
          expect(result.metrics).toEqual(model.metrics);
          expect(result.dimensions).toEqual(model.dimensions);
          expect(result.sourceColumns).toEqual(model.sourceColumns);

          expect(result.kpiDefinitions.length).toBe(model.kpiDefinitions.length);

          result.kpiDefinitions.forEach((rd, i) => {
            const od = model.kpiDefinitions[i];
            if (od.name === kpi) {
              // Only the target field changes; every other field is preserved.
              expect(rd.target).toBe(target);
              expect({ ...rd, target: od.target }).toEqual(od);
            } else {
              // Unrelated definitions are identical.
              expect(rd).toEqual(od);
            }
          });
        }
      ),
      RUNS
    );
  });

  // Feature: leadership-data-management, Property 20: Bulk delete removes exactly the selected rows — removeRows removes exactly the rows whose ids are selected and preserves all others.
  it('Property 20: removeRows removes exactly the selected rows and preserves the rest', () => {
    fc.assert(
      fc.property(
        arbModel().chain((model) => {
          const ids = Array.from(new Set(toRows(model).map((r) => r.id)));
          return fc.record({
            model: fc.constant(model),
            selectedIds: fc.subarray(ids),
          });
        }),
        ({ model, selectedIds }) => {
          const defByName = indexDefinitions(model.kpiDefinitions);
          const selected = new Set(selectedIds);

          const result = removeRows(model, selectedIds);

          // Definitions, dimensions, and source columns are preserved.
          expect(result.kpiDefinitions).toEqual(model.kpiDefinitions);
          expect(result.dimensions).toEqual(model.dimensions);
          expect(result.sourceColumns).toEqual(model.sourceColumns);

          // Surviving metrics are exactly those whose id was NOT selected.
          const expectedMetrics = model.metrics.filter(
            (m) => !selected.has(idOfMetric(m, defByName))
          );
          expect(result.metrics).toEqual(expectedMetrics);

          // No surviving metric carries a selected id.
          for (const m of result.metrics) {
            expect(selected.has(idOfMetric(m, defByName))).toBe(false);
          }
        }
      ),
      RUNS
    );
  });
});
