/**
 * FilterController — pure global-filter derivation and application for the
 * Leadership Dashboard.
 *
 * Responsibilities (Requirement 10, 4.6):
 *  - `deriveOptions(model)` enumerates exactly the model's dimensions so every
 *    filter is populated from the data (Req 10.5). Business Unit options are
 *    present exactly when the Business Unit dimension exists (Req 4.5, 10.2),
 *    and `null` otherwise.
 *  - `applyFilters(model, selection)` returns exactly the metrics that satisfy
 *    every active (non-empty) filter criterion — a metric is included if and
 *    only if it matches all active dimensions (Req 6.4, 7.5, 10.4).
 *  - `emptySelection()` produces the cleared selection; applying it returns the
 *    complete dataset (Req 10.6).
 *
 * All functions are pure: no side effects, no mutation of the inputs, and a
 * defined result for every input. The `FilteredDataset.periods` are always
 * ordered ascending by `Period.key`.
 */

import type {
  DashboardModel,
  FilterSelection,
  FilterOptions,
  FilteredDataset,
  HealthStatus,
  KpiDefinition,
  MetricValue,
  Period,
} from '../model/types';
import { classify } from './health-classifier';

/** Canonical ordering for Status options so results are deterministic. */
const STATUS_ORDER: HealthStatus[] = ['Green', 'Amber', 'Red', 'Unknown'];

/**
 * Derive the available options for each filter from the model.
 *
 * Options mirror the model dimensions exactly. Month, Year, Team, KPI, and
 * Pillar options are drawn straight from the discovered dimensions. Status
 * options are the distinct health classifications actually present in the data.
 * Business Unit options are present only when the Business Unit dimension
 * exists on the model; otherwise the field is `null`.
 */
export function deriveOptions(model: DashboardModel): FilterOptions {
  const { dimensions } = model;

  return {
    months: distinctMonths(dimensions.periods),
    years: [...dimensions.years],
    teams: [...dimensions.teams],
    kpis: [...dimensions.kpis],
    pillars: [...dimensions.pillars],
    statuses: distinctStatuses(model),
    businessUnits:
      dimensions.businessUnits != null ? [...dimensions.businessUnits] : null,
  };
}

/**
 * Apply a `FilterSelection` to the model, producing the filtered dataset used
 * by every view.
 *
 * A metric is included if and only if it matches all active filter criteria.
 * An empty array for a given dimension means "no restriction on that
 * dimension"; a fully cleared selection therefore returns the whole dataset.
 * The resulting metrics and periods are ordered ascending by `Period.key`.
 */
export function applyFilters(
  model: DashboardModel,
  selection: FilterSelection
): FilteredDataset {
  const kpiByName = indexKpiDefinitions(model.kpiDefinitions);

  const matching = model.metrics.filter((metric) =>
    matchesSelection(metric, selection, kpiByName)
  );

  const metrics = [...matching].sort(byPeriodKey);
  const periods = distinctPeriods(metrics);
  const teams = distinctTeams(metrics);
  const kpiDefinitions = restrictKpiDefinitions(model.kpiDefinitions, metrics);

  return {
    metrics,
    kpiDefinitions,
    periods,
    teams,
    selection,
  };
}

/**
 * The cleared "select nothing / show everything" selection. Applying this
 * selection returns the full dataset (Req 10.6). Business Unit is intentionally
 * omitted; an absent Business Unit selection imposes no restriction.
 */
export function emptySelection(): FilterSelection {
  return {
    months: [],
    years: [],
    teams: [],
    kpis: [],
    pillars: [],
    statuses: [],
  };
}

// ---------------------------------------------------------------------------
// Internal helpers (pure)
// ---------------------------------------------------------------------------

/** Build a name → definition lookup so filtering by pillar/status is O(1). */
function indexKpiDefinitions(
  definitions: KpiDefinition[]
): Map<string, KpiDefinition> {
  const map = new Map<string, KpiDefinition>();
  for (const def of definitions) {
    map.set(def.name, def);
  }
  return map;
}

/**
 * Determine whether a metric satisfies every active filter criterion. An empty
 * selection array for a dimension imposes no restriction on that dimension.
 */
function matchesSelection(
  metric: MetricValue,
  selection: FilterSelection,
  kpiByName: Map<string, KpiDefinition>
): boolean {
  if (isActive(selection.months) && !selection.months.includes(metric.period.month)) {
    return false;
  }
  if (isActive(selection.years) && !selection.years.includes(metric.period.year)) {
    return false;
  }
  if (isActive(selection.teams) && !selection.teams.includes(metric.team)) {
    return false;
  }
  if (isActive(selection.kpis) && !selection.kpis.includes(metric.kpi)) {
    return false;
  }

  const def = kpiByName.get(metric.kpi);

  if (isActive(selection.pillars)) {
    const pillar = def?.pillar ?? null;
    if (pillar === null || !selection.pillars.includes(pillar)) {
      return false;
    }
  }

  if (isActive(selection.statuses)) {
    const status = classifyMetric(metric, def);
    if (!selection.statuses.includes(status)) {
      return false;
    }
  }

  const businessUnits = selection.businessUnits;
  if (businessUnits != null && isActive(businessUnits)) {
    const bu = metric.businessUnit ?? null;
    if (bu === null || !businessUnits.includes(bu)) {
      return false;
    }
  }

  return true;
}

/** A selection dimension is active only when it restricts the result. */
function isActive<T>(values: T[] | undefined): values is T[] {
  return Array.isArray(values) && values.length > 0;
}

/** Classify a metric against its KPI definition, defaulting to Unknown. */
function classifyMetric(
  metric: MetricValue,
  def: KpiDefinition | undefined
): HealthStatus {
  return classify({
    value: metric.value,
    target: def?.target ?? null,
    direction: def?.direction ?? 'HigherIsBetter',
    amberBand: def?.amberBand ?? null,
  });
}

/** Distinct month labels in ascending period-key order. */
function distinctMonths(periods: Period[]): string[] {
  const ordered = [...periods].sort(periodKeyCompare);
  const seen = new Set<string>();
  const months: string[] = [];
  for (const period of ordered) {
    if (!seen.has(period.month)) {
      seen.add(period.month);
      months.push(period.month);
    }
  }
  return months;
}

/** Distinct statuses present across the model's metrics, in canonical order. */
function distinctStatuses(model: DashboardModel): HealthStatus[] {
  const kpiByName = indexKpiDefinitions(model.kpiDefinitions);
  const present = new Set<HealthStatus>();
  for (const metric of model.metrics) {
    present.add(classifyMetric(metric, kpiByName.get(metric.kpi)));
  }
  return STATUS_ORDER.filter((status) => present.has(status));
}

/** Distinct periods from the given metrics, ordered ascending by key. */
function distinctPeriods(metrics: MetricValue[]): Period[] {
  const byKey = new Map<string, Period>();
  for (const metric of metrics) {
    if (!byKey.has(metric.period.key)) {
      byKey.set(metric.period.key, metric.period);
    }
  }
  return [...byKey.values()].sort(periodKeyCompare);
}

/** Distinct team names from the given metrics, in first-seen order. */
function distinctTeams(metrics: MetricValue[]): string[] {
  const seen = new Set<string>();
  const teams: string[] = [];
  for (const metric of metrics) {
    if (!seen.has(metric.team)) {
      seen.add(metric.team);
      teams.push(metric.team);
    }
  }
  return teams;
}

/** KPI definitions restricted to KPIs present in the filtered metrics. */
function restrictKpiDefinitions(
  definitions: KpiDefinition[],
  metrics: MetricValue[]
): KpiDefinition[] {
  const present = new Set(metrics.map((metric) => metric.kpi));
  return definitions.filter((def) => present.has(def.name));
}

/** Sort comparator: metrics ascending by their period key. */
function byPeriodKey(a: MetricValue, b: MetricValue): number {
  return periodKeyCompare(a.period, b.period);
}

/** Ascending comparison on `Period.key`. */
function periodKeyCompare(a: Period, b: Period): number {
  if (a.key < b.key) return -1;
  if (a.key > b.key) return 1;
  return 0;
}
