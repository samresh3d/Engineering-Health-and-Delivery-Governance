/**
 * TrendCalculator (pure computation core).
 *
 * Computes month-over-month direction, magnitude, and percentage change for a
 * metric across ordered periods, and produces the sparkline series used by the
 * Executive Summary cards and the Trends view.
 *
 * All functions in this module are pure: they never mutate their inputs and
 * never depend on external state, which keeps the logic property-testable and
 * backend-free.
 *
 * Requirements: 8.1 (trend series across periods), 8.2 (tooltip content),
 * 8.3 (zoom-range restriction), 9.3 (ascending-by-period ordering).
 */

import type { Period } from '../model/types';

/** Month-over-month movement of a metric between the two most recent periods. */
export type TrendDirection = 'Up' | 'Down' | 'Flat' | 'Unknown';

/** The result of computing a trend over an ordered list of metric values. */
export interface TrendResult {
  direction: TrendDirection;
  /**
   * Percentage change from the previous period to the current period. It is
   * `null` when the current or previous value is absent, or when the previous
   * value is zero (percentage change is undefined for a zero base).
   */
  percentChange: number | null;
  /** The ordered values, suitable for a sparkline series. */
  series: (number | null)[];
}

/**
 * Compute the month-over-month trend for a metric.
 *
 * The values MUST already be ordered ascending by period (use
 * {@link orderByPeriodKeyAscending} to order metric points first). The trend is
 * derived from the two most recent entries in the ordered list.
 *
 * @param orderedValues values ordered ascending by period; `null` marks an
 *   absent value for that period.
 * @returns the direction, percentage change, and the ordered sparkline series.
 */
export function computeTrend(orderedValues: (number | null)[]): TrendResult {
  // Preserve the ordered series for the sparkline without mutating the input.
  const series = orderedValues.slice();
  const n = series.length;

  // Fewer than two periods: no month-over-month comparison is possible.
  if (n < 2) {
    return { direction: 'Unknown', percentChange: null, series };
  }

  const current = series[n - 1];
  const previous = series[n - 2];

  // An absent current or previous value makes the trend indeterminate.
  if (current === null || previous === null) {
    return { direction: 'Unknown', percentChange: null, series };
  }

  let direction: TrendDirection;
  if (current > previous) {
    direction = 'Up';
  } else if (current < previous) {
    direction = 'Down';
  } else {
    direction = 'Flat';
  }

  // Percentage change is undefined when the previous (base) value is zero.
  const percentChange =
    previous === 0 ? null : ((current - previous) / previous) * 100;

  return { direction, percentChange, series };
}

/** A single point plotted on a trend chart, used by the tooltip formatter. */
export interface TrendTooltipPoint {
  period: Period;
  team: string;
  kpi: string;
  value: number | null;
}

/**
 * Render a human-readable period label, e.g. "Jan 2025".
 *
 * @param period the period to label.
 * @returns the month label combined with the year.
 */
export function formatPeriodLabel(period: Period): string {
  return `${period.month} ${period.year}`;
}

/**
 * Format the tooltip text for a trend data point.
 *
 * The returned text always contains the Period, Team, KPI, and value of the
 * point (Requirement 8.2). An absent value is rendered as "N/A".
 *
 * @param point the trend point to describe.
 * @returns a multi-line tooltip string containing all four fields.
 */
export function formatTrendTooltip(point: TrendTooltipPoint): string {
  const valueText = point.value === null ? 'N/A' : String(point.value);
  return [
    `Period: ${formatPeriodLabel(point.period)}`,
    `Team: ${point.team}`,
    `KPI: ${point.kpi}`,
    `Value: ${valueText}`,
  ].join('\n');
}

/** An inclusive range of periods, expressed by their stable period keys. */
export interface ZoomRange {
  /** The stable key of the earliest period in the range (e.g. "2025-01"). */
  startKey: string;
  /** The stable key of the latest period in the range (e.g. "2025-06"). */
  endKey: string;
}

/**
 * Restrict a list of period-bearing points to a selected zoom range,
 * inclusively.
 *
 * A point is retained if and only if its `period.key` falls within the range
 * (inclusive of both endpoints). Period keys are stable, lexicographically
 * sortable strings (e.g. "2025-01"), so string comparison matches chronological
 * order. The range endpoints may be supplied in any order.
 *
 * @param points period-bearing points to filter.
 * @param range the inclusive zoom range.
 * @returns a new array containing exactly the in-range points, order preserved.
 */
export function filterByZoomRange<T extends { period: Period }>(
  points: readonly T[],
  range: ZoomRange
): T[] {
  const lo = range.startKey <= range.endKey ? range.startKey : range.endKey;
  const hi = range.startKey <= range.endKey ? range.endKey : range.startKey;
  return points.filter((point) => point.period.key >= lo && point.period.key <= hi);
}

/**
 * Order period-bearing points ascending by their stable period key.
 *
 * Returns a new array; the input is not mutated. Period keys are stable,
 * lexicographically sortable strings (e.g. "2025-01"), so ascending string
 * order matches chronological order.
 *
 * @param points period-bearing points to order.
 * @returns a new array ordered ascending by `period.key`.
 */
export function orderByPeriodKeyAscending<T extends { period: Period }>(
  points: readonly T[]
): T[] {
  return points
    .slice()
    .sort((a, b) => (a.period.key < b.period.key ? -1 : a.period.key > b.period.key ? 1 : 0));
}

/**
 * Order a list of periods ascending by their stable period key.
 *
 * Returns a new array; the input is not mutated.
 *
 * @param periods the periods to order.
 * @returns a new array ordered ascending by `key`.
 */
export function orderPeriodsAscending(periods: readonly Period[]): Period[] {
  return periods
    .slice()
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
