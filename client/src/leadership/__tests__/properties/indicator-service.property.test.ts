/**
 * Property test for the IndicatorService (Task 4.2).
 *
 * Feature: leadership-data-management, Property 22: Visual indicators are
 * exactly those whose conditions hold.
 *
 * For any generated (row, def, ctx), `indicatorsFor` must return EXACTLY the
 * set of indicators whose independently-recomputed conditions hold — no more,
 * no fewer:
 *  - below-target      (Req 9.1) HigherIsBetter and present actual strictly < present target (classify → Red)
 *  - missing-data      (Req 9.2) actualValue or target is null
 *  - outlier           (Req 9.3) 2σ population dispersion over ctx.kpiValues[def.name], ≥3 finite samples, non-zero stddev
 *  - recently-updated  (Req 9.4) row.lastUpdated parses to an instant within [now - recentWindowMs, now]
 *  - requires-attention(Req 9.5) below-target OR missing-data OR outlier
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { indicatorsFor } from '../../services/indicator-service';
import type { Indicator, IndicatorContext } from '../../services/indicator-service';
import { classify } from '../../services/health-classifier';
import type { AmberBand, Direction, KpiDefinition } from '../../model/types';
import type { GridRow } from '../../model/editing-types';
import { arbGridRows } from './arbitraries';

// ---------------------------------------------------------------------------
// Local, self-contained generators (mirroring the shared arbitraries' ranges)
// ---------------------------------------------------------------------------

const DIRECTIONS: readonly Direction[] = ['HigherIsBetter', 'LowerIsBetter'];

const arbFinite = fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true });

const arbAmberBand: fc.Arbitrary<AmberBand | null> = fc.option(
  fc.tuple(arbFinite, arbFinite).map(([a, b]) => ({
    lower: Math.min(a, b),
    upper: Math.max(a, b),
  })),
  { nil: null },
);

const arbDef: fc.Arbitrary<KpiDefinition> = fc.record({
  name: fc
    .tuple(fc.constantFrom('Velocity', 'Coverage', 'Cost', 'Rate', 'Score'), fc.integer({ min: 0, max: 5 }))
    .map(([base, n]) => `${base}-${n}`),
  pillar: fc.constant(null),
  direction: fc.constantFrom(...DIRECTIONS),
  target: fc.option(arbFinite, { nil: null }),
  amberBand: arbAmberBand,
});

/** A fallback row for the (rare) case an empty rows array is generated. */
const FALLBACK_ROW: GridRow = {
  id: 'fallback',
  month: 'Jan',
  year: 2024,
  periodKey: '2024-01',
  team: 'Team-0',
  pillar: null,
  kpi: 'Score-0',
  kpiType: 'Number',
  target: null,
  actualValue: null,
  source: null,
  lastUpdated: null,
  updatedBy: null,
};

interface Case {
  row: GridRow;
  def: KpiDefinition;
  ctx: IndicatorContext;
}

/**
 * Generate a (row, def, ctx) triple. The kpiValues map keys `def.name` so that
 * outliers can trigger; `now` is drawn near the row's `lastUpdated` so that
 * recently-updated exercises both sides of the window boundary.
 */
const arbCase: fc.Arbitrary<Case> = fc
  .record({
    rows: arbGridRows(),
    rowIdx: fc.nat(),
    def: arbDef,
    windowMs: fc.oneof(
      fc.constant(0),
      fc.integer({ min: 1, max: 30 * 24 * 60 * 60 * 1000 }),
    ),
  })
  .chain((base) => {
    const row = base.rows.length > 0 ? base.rows[base.rowIdx % base.rows.length] : FALLBACK_ROW;

    const anchor =
      row.lastUpdated !== null && !Number.isNaN(Date.parse(row.lastUpdated))
        ? Date.parse(row.lastUpdated)
        : Date.UTC(2023, 0, 1);

    // kpiValues for def.name: sometimes a tight cluster (± the row's actual
    // value) so outliers trigger, sometimes an arbitrary array (incl. too-few
    // or zero-dispersion samples).
    const clustered = fc
      .array(fc.double({ min: -10, max: 10, noNaN: true }), { minLength: 3, maxLength: 6 })
      .map((arr) =>
        row.actualValue !== null && isFinite(row.actualValue) ? [...arr, row.actualValue] : arr,
      );
    const plain = fc.array(arbFinite, { maxLength: 8 });
    const valuesArb = fc.oneof(plain, clustered);

    // now near the anchor to hit the recent-window boundary, or arbitrary.
    const span = 2 * base.windowMs + 10;
    const nowArb = fc.oneof(
      fc.integer({ min: anchor - span, max: anchor + span }),
      fc.integer({ min: Date.UTC(2018, 0, 1), max: Date.UTC(2027, 0, 1) }),
    );

    return fc.tuple(valuesArb, nowArb).map(([values, now]): Case => ({
      row,
      def: base.def,
      ctx: {
        recentWindowMs: base.windowMs,
        kpiValues: new Map<string, number[]>([[base.def.name, values]]),
        now,
      },
    }));
  });

// ---------------------------------------------------------------------------
// Independent recomputation of each indicator's condition
// ---------------------------------------------------------------------------

function expectBelowTarget(row: GridRow, def: KpiDefinition): boolean {
  if (def.direction !== 'HigherIsBetter') return false;
  if (row.actualValue === null || row.target === null) return false;
  if (!isFinite(row.actualValue) || !isFinite(row.target)) return false;
  const status = classify({
    value: row.actualValue,
    target: row.target,
    direction: def.direction,
    amberBand: def.amberBand,
  });
  return status === 'Red' && row.actualValue < row.target;
}

function expectMissingData(row: GridRow): boolean {
  return row.actualValue === null || row.target === null;
}

function expectOutlier(row: GridRow, def: KpiDefinition, ctx: IndicatorContext): boolean {
  const value = row.actualValue;
  if (value === null || !isFinite(value)) return false;
  const raw = ctx.kpiValues.get(def.name);
  if (!raw) return false;
  const values = raw.filter((v) => typeof v === 'number' && isFinite(v));
  if (values.length < 3) return false;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return false;
  return Math.abs(value - mean) > 2 * stdDev;
}

function expectRecentlyUpdated(row: GridRow, ctx: IndicatorContext): boolean {
  if (row.lastUpdated === null || ctx.recentWindowMs <= 0) return false;
  const updatedAt = Date.parse(row.lastUpdated);
  if (Number.isNaN(updatedAt)) return false;
  const delta = ctx.now - updatedAt;
  return delta >= 0 && delta <= ctx.recentWindowMs;
}

/** Build the expected indicator list in the service's fixed union order. */
function expectedIndicators(row: GridRow, def: KpiDefinition, ctx: IndicatorContext): Indicator[] {
  const belowTarget = expectBelowTarget(row, def);
  const missingData = expectMissingData(row);
  const outlier = expectOutlier(row, def, ctx);
  const recentlyUpdated = expectRecentlyUpdated(row, ctx);
  const requiresAttention = belowTarget || missingData || outlier;

  const out: Indicator[] = [];
  if (belowTarget) out.push('below-target');
  if (missingData) out.push('missing-data');
  if (outlier) out.push('outlier');
  if (recentlyUpdated) out.push('recently-updated');
  if (requiresAttention) out.push('requires-attention');
  return out;
}

describe('Property 22: Visual indicators are exactly those whose conditions hold', () => {
  it('returns exactly the indicators whose independently-recomputed conditions hold', () => {
    fc.assert(
      fc.property(arbCase, ({ row, def, ctx }) => {
        const actual = indicatorsFor(row, def, ctx);
        const expected = expectedIndicators(row, def, ctx);

        // Exact set (and, since order is fixed by the union, exact sequence).
        expect(actual).toEqual(expected);
      }),
      { numRuns: 300 },
    );
  });
});
