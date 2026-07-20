/**
 * IndicatorService — pure computation of the Visual_Indicators that apply to a
 * Data_Grid row (Requirement 9).
 *
 * A `GridRow` may carry zero or more indicators that flag notable data:
 *  - `below-target`      (Req 9.1) actual is below target for a higher-is-better KPI
 *  - `missing-data`      (Req 9.2) the actual value or the target is absent
 *  - `outlier`           (Req 9.3) the actual value is a dispersion outlier for its KPI
 *  - `recently-updated`  (Req 9.4) the row was modified within the recent-change window
 *  - `requires-attention`(Req 9.5) a composite of the actionable conditions above
 *
 * All logic is pure and total: it never throws, has no side effects, and returns
 * a defined result for every possible input, including absent (`null`) values,
 * targets, or timestamps.
 *
 * Below-target reuses the direction semantics of the existing
 * {@link classify} health classifier (see `health-classifier.ts`), which treats
 * a `HigherIsBetter` KPI as failing when the value is strictly below target.
 */

import type { GridRow } from '../model/editing-types';
import type { KpiDefinition } from '../model/types';
import { classify } from './health-classifier';

/** The set of visual indicators a row may carry. */
export type Indicator =
  | 'below-target'
  | 'missing-data'
  | 'outlier'
  | 'recently-updated'
  | 'requires-attention';

/** Context shared across rows for indicator computation. */
export interface IndicatorContext {
  /** Recent-change window, in milliseconds, for `recently-updated` (Req 9.4). */
  recentWindowMs: number;
  /** Per-KPI actual values, keyed by KPI name, used for outlier detection (Req 9.3). */
  kpiValues: Map<string, number[]>;
  /** Reference "now" timestamp, in epoch milliseconds, for `recently-updated`. */
  now: number;
}

/**
 * The number of standard deviations from the mean beyond which a value is
 * considered an outlier (Req 9.3). A standard 2σ dispersion test.
 */
const OUTLIER_SIGMA = 2;

/**
 * The minimum number of comparison values required before an outlier test is
 * meaningful. With fewer than three points a 2σ test cannot flag any member.
 */
const MIN_OUTLIER_SAMPLE = 3;

/**
 * Compute the visual indicators that apply to a single grid row.
 *
 * @param row the grid row under evaluation
 * @param def the KPI definition supplying the better-direction (and target semantics)
 * @param ctx shared context (recent window, per-KPI values, now)
 * @returns the indicators whose conditions hold, in a stable order; possibly empty
 */
export function indicatorsFor(
  row: GridRow,
  def: KpiDefinition,
  ctx: IndicatorContext,
): Indicator[] {
  const indicators: Indicator[] = [];

  const belowTarget = isBelowTarget(row, def);
  const missingData = isMissingData(row);
  const outlier = isOutlier(row, def, ctx);
  const recentlyUpdated = isRecentlyUpdated(row, ctx);

  // Req 9.5: requires-attention is a composite of the actionable conditions —
  // a row is flagged when it is below target, has missing data, or is an outlier.
  const requiresAttention = belowTarget || missingData || outlier;

  // Return in the fixed order of the Indicator union for deterministic output.
  if (belowTarget) indicators.push('below-target');
  if (missingData) indicators.push('missing-data');
  if (outlier) indicators.push('outlier');
  if (recentlyUpdated) indicators.push('recently-updated');
  if (requiresAttention) indicators.push('requires-attention');

  return indicators;
}

/**
 * Req 9.1: below-target applies when the KPI's better-direction is higher and
 * the (present) actual value is strictly below its (present) target. This mirrors
 * the {@link classify} health classifier's `Red` result for a `HigherIsBetter`
 * KPI, restricted to the strict below-target case the requirement describes.
 */
function isBelowTarget(row: GridRow, def: KpiDefinition): boolean {
  if (def.direction !== 'HigherIsBetter') {
    return false;
  }
  if (row.actualValue === null || row.target === null) {
    return false;
  }
  if (!isFinite(row.actualValue) || !isFinite(row.target)) {
    return false;
  }
  // Direction-aware: reuse the classifier so the semantics stay in one place.
  // For HigherIsBetter, `Red` means value < target (amber band aside), which is
  // exactly the below-target condition; guard the strict comparison to exclude
  // the amber-band case where the value is not actually below target.
  const status = classify({
    value: row.actualValue,
    target: row.target,
    direction: def.direction,
    amberBand: def.amberBand,
  });
  return status === 'Red' && row.actualValue < row.target;
}

/** Req 9.2: missing-data applies when the actual value or the target is absent. */
function isMissingData(row: GridRow): boolean {
  return row.actualValue === null || row.target === null;
}

/**
 * Req 9.3: outlier applies when the row's (present) actual value lies more than
 * {@link OUTLIER_SIGMA} standard deviations from the mean of the other values
 * for the same KPI. Uses the population standard deviation over the KPI's values
 * supplied in `ctx.kpiValues`. Requires at least {@link MIN_OUTLIER_SAMPLE}
 * finite comparison values and non-zero dispersion.
 */
function isOutlier(row: GridRow, def: KpiDefinition, ctx: IndicatorContext): boolean {
  const value = row.actualValue;
  if (value === null || !isFinite(value)) {
    return false;
  }

  const raw = ctx.kpiValues.get(def.name);
  if (!raw) {
    return false;
  }
  const values = raw.filter((v) => typeof v === 'number' && isFinite(v));
  if (values.length < MIN_OUTLIER_SAMPLE) {
    return false;
  }

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // With zero dispersion every value equals the mean; nothing is an outlier.
  if (stdDev === 0) {
    return false;
  }

  return Math.abs(value - mean) > OUTLIER_SIGMA * stdDev;
}

/**
 * Req 9.4: recently-updated applies when the row's `lastUpdated` timestamp
 * (ISO-8601) parses to a finite instant that falls within `ctx.recentWindowMs`
 * before `ctx.now` (inclusive). Absent or unparseable timestamps never qualify,
 * and a non-positive window disables the indicator.
 */
function isRecentlyUpdated(row: GridRow, ctx: IndicatorContext): boolean {
  if (row.lastUpdated === null || ctx.recentWindowMs <= 0) {
    return false;
  }
  const updatedAt = Date.parse(row.lastUpdated);
  if (Number.isNaN(updatedAt)) {
    return false;
  }
  const delta = ctx.now - updatedAt;
  return delta >= 0 && delta <= ctx.recentWindowMs;
}
