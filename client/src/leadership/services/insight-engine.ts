/**
 * InsightEngine — pure Smart Leadership Insight generation for the Leadership
 * Dashboard.
 *
 * Generates leadership insights from a filtered dataset. Every insight is
 * derived solely from the teams, KPIs, periods, values, and targets present in
 * the dataset, so each insight is sound with respect to the data it describes
 * (Requirement 11.1, 11.5; design Property 18).
 *
 * Three kinds of insight are produced:
 *  - `MoMChange`            — a team's KPI value changed month-over-month by at
 *                             least the configured threshold (Req 11.2,
 *                             Property 19). Omitted entirely when the dataset
 *                             has fewer than two periods (Req 11.6, Property 22).
 *  - `HighestForKpi`        — a team holds the highest value among teams for a
 *                             KPI in a period (Req 11.3, Property 20).
 *  - `ConsistentlyExceeds`  — a team meets or exceeds its Target for every KPI
 *                             within an Engineering Pillar across every selected
 *                             period (Req 11.4, Property 21).
 *
 * All functions are pure: no side effects, no mutation of the inputs, and a
 * defined result for every input.
 */

import type {
  EngineeringPillar,
  FilteredDataset,
  KpiDefinition,
  MetricValue,
  Period,
} from '../model/types';
import {
  computeTrend,
  formatPeriodLabel,
  orderPeriodsAscending,
  type TrendDirection,
} from './trend-calculator';

/** The category of a generated insight. */
export type InsightType = 'MoMChange' | 'HighestForKpi' | 'ConsistentlyExceeds';

/** A single generated leadership insight. */
export interface Insight {
  type: InsightType;
  team: string;
  kpi?: string;
  pillar?: EngineeringPillar;
  direction?: TrendDirection;
  percentChange?: number;
  message: string;
}

/** Configuration controlling insight generation. */
export interface InsightConfig {
  /** Minimum absolute month-over-month percentage change to emit a MoM insight. */
  momThresholdPercent: number;
}

/**
 * Generate all leadership insights for a filtered dataset.
 *
 * @param data the filtered dataset produced by the FilterController.
 * @param config insight configuration (the MoM threshold).
 * @returns the generated insights, in a deterministic order.
 */
export function generateInsights(
  data: FilteredDataset,
  config: InsightConfig
): Insight[] {
  const periods = orderPeriodsAscending(data.periods);
  const valueIndex = indexValues(data.metrics);

  return [
    ...generateMoMInsights(data, periods, valueIndex, config),
    ...generateHighestInsights(data, periods, valueIndex),
    ...generateConsistentlyExceedsInsights(data, periods, valueIndex),
  ];
}

// ---------------------------------------------------------------------------
// Month-over-month change insights (Req 11.2, 11.6; Properties 19, 22)
// ---------------------------------------------------------------------------

/**
 * Emit a MoM insight for each team/KPI whose absolute percentage change between
 * the two most recent periods meets or exceeds the configured threshold.
 *
 * When the dataset has fewer than two periods, no MoM insights are produced
 * (Req 11.6, Property 22).
 */
function generateMoMInsights(
  data: FilteredDataset,
  periods: Period[],
  valueIndex: ValueIndex,
  config: InsightConfig
): Insight[] {
  if (periods.length < 2) {
    return [];
  }

  const previous = periods[periods.length - 2];
  const current = periods[periods.length - 1];
  const threshold = Math.abs(config.momThresholdPercent);

  const insights: Insight[] = [];
  for (const { team, kpi } of teamKpiPairs(data.metrics)) {
    const prevValue = lookup(valueIndex, team, kpi, previous.key);
    const currValue = lookup(valueIndex, team, kpi, current.key);

    const { direction, percentChange } = computeTrend([prevValue, currValue]);
    if (percentChange === null) {
      continue;
    }
    if (Math.abs(percentChange) < threshold) {
      continue;
    }

    insights.push({
      type: 'MoMChange',
      team,
      kpi,
      direction,
      percentChange,
      message: momMessage(team, kpi, direction, percentChange, previous, current),
    });
  }
  return insights;
}

/** Build the human-readable message for a MoM insight. */
function momMessage(
  team: string,
  kpi: string,
  direction: TrendDirection,
  percentChange: number,
  previous: Period,
  current: Period
): string {
  const magnitude = `${Math.abs(percentChange).toFixed(1)}%`;
  const window = `from ${formatPeriodLabel(previous)} to ${formatPeriodLabel(current)}`;
  let movement: string;
  if (direction === 'Up') {
    movement = `increased by ${magnitude}`;
  } else if (direction === 'Down') {
    movement = `decreased by ${magnitude}`;
  } else {
    movement = 'remained flat';
  }
  return `${team}'s ${kpi} ${movement} ${window}.`;
}

// ---------------------------------------------------------------------------
// Highest-team-for-KPI insights (Req 11.3; Property 20)
// ---------------------------------------------------------------------------

/**
 * For each KPI and period, emit an insight naming the team with the highest
 * value for that KPI in that period. Periods and KPIs with no present values
 * are skipped.
 */
function generateHighestInsights(
  data: FilteredDataset,
  periods: Period[],
  valueIndex: ValueIndex
): Insight[] {
  const insights: Insight[] = [];

  for (const kpi of kpiNames(data)) {
    for (const period of periods) {
      const leader = highestTeam(data.teams, valueIndex, kpi, period.key);
      if (leader === null) {
        continue;
      }
      insights.push({
        type: 'HighestForKpi',
        team: leader.team,
        kpi,
        message: `${leader.team} had the highest ${kpi} (${leader.value}) in ${formatPeriodLabel(
          period
        )}.`,
      });
    }
  }
  return insights;
}

/**
 * Find the team with the maximum present value for a KPI in a period. Returns
 * `null` when no team has a present value. Ties resolve to the first team in
 * the dataset's team order, keeping the result deterministic.
 */
function highestTeam(
  teams: string[],
  valueIndex: ValueIndex,
  kpi: string,
  periodKey: string
): { team: string; value: number } | null {
  let best: { team: string; value: number } | null = null;
  for (const team of teams) {
    const value = lookup(valueIndex, team, kpi, periodKey);
    if (value === null) {
      continue;
    }
    if (best === null || value > best.value) {
      best = { team, value };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Consistently-exceeds-target insights (Req 11.4; Property 21)
// ---------------------------------------------------------------------------

/**
 * Emit a `ConsistentlyExceeds` insight for each team/pillar where the team
 * meets or exceeds its Target for every KPI in that pillar across every
 * selected period.
 *
 * The condition requires at least one KPI in the pillar and at least one
 * period; every (KPI, period) pair must have a present value and a present
 * target, and the value must meet or exceed the target in the KPI's better
 * direction. Any absent value or target fails the condition.
 */
function generateConsistentlyExceedsInsights(
  data: FilteredDataset,
  periods: Period[],
  valueIndex: ValueIndex
): Insight[] {
  if (periods.length === 0) {
    return [];
  }

  const insights: Insight[] = [];
  const pillars = pillarsInDataset(data.kpiDefinitions);

  for (const team of data.teams) {
    for (const pillar of pillars) {
      const pillarKpis = data.kpiDefinitions.filter((def) => def.pillar === pillar);
      if (pillarKpis.length === 0) {
        continue;
      }

      if (
        exceedsForAll(team, pillarKpis, periods, valueIndex)
      ) {
        insights.push({
          type: 'ConsistentlyExceeds',
          team,
          pillar,
          message: `${team} consistently meets or exceeds Target across all ${pillar} KPIs for every selected period.`,
        });
      }
    }
  }
  return insights;
}

/**
 * Determine whether a team meets or exceeds Target for every given KPI across
 * every given period. Absent values or targets cause the check to fail.
 */
function exceedsForAll(
  team: string,
  pillarKpis: KpiDefinition[],
  periods: Period[],
  valueIndex: ValueIndex
): boolean {
  for (const def of pillarKpis) {
    if (def.target === null) {
      return false;
    }
    for (const period of periods) {
      const value = lookup(valueIndex, team, def.name, period.key);
      if (value === null) {
        return false;
      }
      if (!meetsOrExceeds(value, def.target, def.direction)) {
        return false;
      }
    }
  }
  return true;
}

/** True when `value` is at least as good as `target` given the direction. */
function meetsOrExceeds(
  value: number,
  target: number,
  direction: KpiDefinition['direction']
): boolean {
  return direction === 'HigherIsBetter' ? value >= target : value <= target;
}

// ---------------------------------------------------------------------------
// Shared helpers (pure)
// ---------------------------------------------------------------------------

/** A team/KPI value lookup keyed by `team \u0000 kpi \u0000 periodKey`. */
type ValueIndex = Map<string, number | null>;

/** Build a lookup of metric values by (team, KPI, period key). */
function indexValues(metrics: MetricValue[]): ValueIndex {
  const index: ValueIndex = new Map();
  for (const metric of metrics) {
    const key = valueKey(metric.team, metric.kpi, metric.period.key);
    if (!index.has(key)) {
      index.set(key, metric.value);
    }
  }
  return index;
}

/** Compose the composite key used by {@link ValueIndex}. */
function valueKey(team: string, kpi: string, periodKey: string): string {
  return `${team}\u0000${kpi}\u0000${periodKey}`;
}

/** Look up a metric value, returning `null` when absent or missing. */
function lookup(
  index: ValueIndex,
  team: string,
  kpi: string,
  periodKey: string
): number | null {
  const value = index.get(valueKey(team, kpi, periodKey));
  return value === undefined ? null : value;
}

/** Distinct (team, KPI) pairs present in the metrics, in first-seen order. */
function teamKpiPairs(metrics: MetricValue[]): { team: string; kpi: string }[] {
  const seen = new Set<string>();
  const pairs: { team: string; kpi: string }[] = [];
  for (const metric of metrics) {
    const key = `${metric.team}\u0000${metric.kpi}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push({ team: metric.team, kpi: metric.kpi });
    }
  }
  return pairs;
}

/** KPI names present in the dataset, preferring the defined KPI order. */
function kpiNames(data: FilteredDataset): string[] {
  if (data.kpiDefinitions.length > 0) {
    return data.kpiDefinitions.map((def) => def.name);
  }
  const seen = new Set<string>();
  const names: string[] = [];
  for (const metric of data.metrics) {
    if (!seen.has(metric.kpi)) {
      seen.add(metric.kpi);
      names.push(metric.kpi);
    }
  }
  return names;
}

/** Distinct Engineering Pillars present among the dataset's KPI definitions. */
function pillarsInDataset(definitions: KpiDefinition[]): EngineeringPillar[] {
  const seen = new Set<EngineeringPillar>();
  const pillars: EngineeringPillar[] = [];
  for (const def of definitions) {
    if (def.pillar !== null && !seen.has(def.pillar)) {
      seen.add(def.pillar);
      pillars.push(def.pillar);
    }
  }
  return pillars;
}
