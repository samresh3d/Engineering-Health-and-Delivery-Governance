/**
 * KpiDrillDownView — single-KPI deep dive for the Leadership Dashboard (Req 9).
 *
 * For a selected KPI it renders four sections (Req 9.1):
 *   1. Historical trend — a line chart of the KPI's aggregate value across the
 *      available periods (with the target overlaid when present).
 *   2. Team comparison — a bar chart of each team's aggregate value.
 *   3. Target vs actual — the KPI's target next to its current actual value.
 *   4. Variance from target — the signed difference between actual and target.
 *
 * It identifies the best and worst performing team by the KPI's better-direction
 * (Req 9.2, design Property 16) via the pure, exported {@link bestWorstTeam}
 * helper, and it shows the monthly progression ordered strictly ascending by
 * period (Req 9.3) via {@link orderPeriodsAscending}.
 *
 * When the selected KPI has NO data for the current filters, a SINGLE
 * empty-state message is rendered for the WHOLE drill-down in place of all four
 * sections (Req 9.4) — never a partial mix of sections and empty placeholders.
 */
import { useMemo, useState } from 'react';
import type {
  Direction,
  FilteredDataset,
  KpiDefinition,
  MetricValue,
} from '../model/types';
import { orderPeriodsAscending } from '../services/trend-calculator';
import { BarChart, LineChart } from './charts';
import { useLeadership } from '../state/useLeadership';

/** A team paired with an aggregate value for a KPI. */
export interface TeamValue {
  team: string;
  value: number;
}

/** The best and worst performing team for a KPI (null when no data). */
export interface BestWorst {
  best: string | null;
  worst: string | null;
}

/**
 * Identify the best and worst performing team for a KPI given per-team values
 * and the KPI's better-direction (Req 9.2, design Property 16).
 *
 * For `HigherIsBetter` the best team has the maximum value and the worst has the
 * minimum; for `LowerIsBetter` the best team has the minimum value and the
 * worst has the maximum. Entries with non-finite values are ignored. When no
 * usable value remains, both `best` and `worst` are `null`. Ties resolve to the
 * first team achieving the extremum, so the result is deterministic.
 *
 * This function is pure and side-effect free so it can be property-tested
 * independently of React.
 *
 * @param teamValues per-team aggregate values for a single KPI.
 * @param direction the KPI's better-direction.
 * @returns the best and worst team names (or `null` when there is no data).
 */
export function bestWorstTeam(
  teamValues: readonly TeamValue[],
  direction: Direction
): BestWorst {
  const usable = teamValues.filter((tv) => Number.isFinite(tv.value));
  if (usable.length === 0) {
    return { best: null, worst: null };
  }

  let maxEntry = usable[0];
  let minEntry = usable[0];
  for (const entry of usable) {
    if (entry.value > maxEntry.value) {
      maxEntry = entry;
    }
    if (entry.value < minEntry.value) {
      minEntry = entry;
    }
  }

  // HigherIsBetter → best is the maximum; LowerIsBetter → best is the minimum.
  if (direction === 'HigherIsBetter') {
    return { best: maxEntry.team, worst: minEntry.team };
  }
  return { best: minEntry.team, worst: maxEntry.team };
}

/** Arithmetic mean of a list of numbers, or `null` when the list is empty. */
function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Present (non-null) values of a metric list. */
function presentValues(metrics: MetricValue[]): number[] {
  return metrics
    .map((m) => m.value)
    .filter((v): v is number => v !== null);
}

/** Aggregate value per team (mean of that team's present values for the KPI). */
export function perTeamAggregates(
  metrics: MetricValue[],
  teams: readonly string[]
): TeamValue[] {
  const result: TeamValue[] = [];
  for (const team of teams) {
    const value = mean(presentValues(metrics.filter((m) => m.team === team)));
    if (value !== null) {
      result.push({ team, value });
    }
  }
  return result;
}

/** Round a number to at most one decimal place for display. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Absent-value indicator shown when a value is unavailable. */
const ABSENT = 'N/A';

/** Format a numeric value, or the absent indicator when `null`. */
function formatNumber(value: number | null): string {
  return value === null ? ABSENT : String(round1(value));
}

/** Index KPI definitions by name for O(1) lookup. */
function indexDefinitions(
  definitions: KpiDefinition[]
): Map<string, KpiDefinition> {
  const byName = new Map<string, KpiDefinition>();
  for (const def of definitions) {
    byName.set(def.name, def);
  }
  return byName;
}

/** Everything the view needs to render a drill-down for a single KPI. */
export interface DrillDownData {
  /** `true` when at least one non-null value exists for the KPI (Req 9.4). */
  hasData: boolean;
  direction: Direction;
  target: number | null;
  /** Current (latest-period) aggregate actual value across teams. */
  actual: number | null;
  /** Signed variance of actual from target (actual − target); null when N/A. */
  variance: number | null;
  /** Period keys ordered ascending, aligned to {@link trendSeries}. */
  periodKeys: string[];
  /** Aggregate KPI value per ordered period (null = absent for that period). */
  trendSeries: (number | null)[];
  /** Teams that have an aggregate value, aligned to {@link teamSeries}. */
  teams: string[];
  /** Aggregate KPI value per team, aligned to {@link teams}. */
  teamSeries: (number | null)[];
  /** Best and worst performing team by the KPI's direction. */
  bestWorst: BestWorst;
  /** Monthly progression: ordered periods with their aggregate value. */
  progression: { key: string; label: string; value: number | null }[];
}

/**
 * Compute the drill-down data for a single KPI from the filtered dataset.
 *
 * Pure and deterministic. Periods are ordered strictly ascending by period key
 * (Req 9.3). The current actual value and variance use the latest period that
 * has data. `hasData` is `false` when the KPI has no non-null value under the
 * current filters, which drives the single empty-state message (Req 9.4).
 */
export function computeDrillDown(
  data: FilteredDataset,
  kpiName: string
): DrillDownData {
  const definitions = indexDefinitions(data.kpiDefinitions);
  const def = definitions.get(kpiName) ?? null;
  const direction: Direction = def?.direction ?? 'HigherIsBetter';
  const target = def?.target ?? null;

  const kpiMetrics = data.metrics.filter((m) => m.kpi === kpiName);
  const hasData = kpiMetrics.some((m) => m.value !== null);

  const orderedPeriods = orderPeriodsAscending(data.periods);
  const periodKeys = orderedPeriods.map((p) => p.key);
  const trendSeries = orderedPeriods.map((period) =>
    mean(presentValues(kpiMetrics.filter((m) => m.period.key === period.key)))
  );

  const progression = orderedPeriods.map((period, i) => ({
    key: period.key,
    label: `${period.month} ${period.year}`,
    value: trendSeries[i],
  }));

  // Current actual = the latest ordered period that has a value.
  let actual: number | null = null;
  for (let i = trendSeries.length - 1; i >= 0; i -= 1) {
    if (trendSeries[i] !== null) {
      actual = trendSeries[i];
      break;
    }
  }
  const variance =
    actual !== null && target !== null ? actual - target : null;

  const teamAggregates = perTeamAggregates(kpiMetrics, data.teams);
  const teams = teamAggregates.map((t) => t.team);
  const teamSeries = teamAggregates.map((t) => t.value);
  const bestWorst = bestWorstTeam(teamAggregates, direction);

  return {
    hasData,
    direction,
    target,
    actual,
    variance,
    periodKeys,
    trendSeries,
    teams,
    teamSeries,
    bestWorst,
    progression,
  };
}

/** Shared card container styling matching the module's executive cards. */
const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E5E7EB',
  borderRadius: 8,
  padding: 16,
  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
};

/** Section heading used above each drill-down section. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        margin: '0 0 12px',
        fontSize: 13,
        fontWeight: 600,
        color: '#6B7280',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {children}
    </h3>
  );
}

export interface KpiDrillDownViewProps {
  /**
   * Optionally force the KPI to drill into. When omitted, the view provides a
   * select control listing the filtered KPIs (respecting the KPI search).
   */
  kpi?: string;
}

/**
 * The KPI Drill-Down view. Reads the filtered dataset from the module context,
 * lets the user pick a KPI, and renders the four drill-down sections — or a
 * single empty-state message when the KPI has no data for the current filters.
 */
export default function KpiDrillDownView({ kpi }: KpiDrillDownViewProps) {
  const { filtered, search } = useLeadership();
  const [selected, setSelected] = useState<string | null>(kpi ?? null);

  // Candidate KPIs: names present in the dataset, narrowed by the KPI search.
  const kpiNames = useMemo(() => {
    if (filtered === null) {
      return [];
    }
    const term = search.trim().toLowerCase();
    return filtered.kpiDefinitions
      .map((d) => d.name)
      .filter((name) => term === '' || name.toLowerCase().includes(term));
  }, [filtered, search]);

  // Resolve the effective KPI: an explicit prop wins, else the current
  // selection when still available, else the first candidate.
  const activeKpi =
    kpi ??
    (selected !== null && kpiNames.includes(selected) ? selected : kpiNames[0]) ??
    null;

  if (filtered === null) {
    return (
      <div
        data-testid="drilldown-empty"
        style={{
          padding: 24,
          textAlign: 'center',
          color: '#6B7280',
          fontSize: 14,
        }}
      >
        No data available. Upload a workbook to drill into a KPI.
      </div>
    );
  }

  const drill = activeKpi !== null ? computeDrillDown(filtered, activeKpi) : null;

  return (
    <section data-testid="kpi-drilldown" aria-label="KPI Drill Down">
      {/* KPI selector (hidden when a KPI is forced via prop) */}
      {kpi === undefined && (
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="drilldown-kpi-select"
            style={{ fontSize: 13, fontWeight: 600, marginRight: 8, color: '#374151' }}
          >
            KPI
          </label>
          <select
            id="drilldown-kpi-select"
            data-testid="drilldown-kpi-select"
            value={activeKpi ?? ''}
            onChange={(e) => setSelected(e.target.value)}
            disabled={kpiNames.length === 0}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #D1D5DB',
              fontSize: 14,
            }}
          >
            {kpiNames.length === 0 && <option value="">No KPIs</option>}
            {kpiNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Single empty-state for the WHOLE drill-down (Req 9.4) */}
      {drill === null || !drill.hasData ? (
        <div
          data-testid="drilldown-no-data"
          style={{
            padding: 24,
            textAlign: 'center',
            color: '#6B7280',
            fontSize: 14,
            ...cardStyle,
          }}
        >
          {activeKpi === null
            ? 'No KPI data available for the current filters.'
            : `No data available for "${activeKpi}" under the current filters.`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Section 1: Historical trend */}
          <div data-testid="drilldown-trend" style={cardStyle}>
            <SectionTitle>Historical Trend — {activeKpi}</SectionTitle>
            <LineChart
              categories={drill.periodKeys}
              series={[
                { name: activeKpi as string, data: drill.trendSeries },
                ...(drill.target !== null
                  ? [
                      {
                        name: 'Target',
                        data: drill.periodKeys.map(() => drill.target),
                      },
                    ]
                  : []),
              ]}
            />
          </div>

          {/* Section 2: Team comparison */}
          <div data-testid="drilldown-team-comparison" style={cardStyle}>
            <SectionTitle>Team Comparison</SectionTitle>
            <BarChart
              categories={drill.teams}
              series={[{ name: activeKpi as string, data: drill.teamSeries }]}
            />
            <div
              style={{
                display: 'flex',
                gap: 24,
                marginTop: 12,
                fontSize: 13,
                color: '#374151',
              }}
            >
              <span data-testid="drilldown-best-team">
                Best team: <strong>{drill.bestWorst.best ?? ABSENT}</strong>
              </span>
              <span data-testid="drilldown-worst-team">
                Lowest team: <strong>{drill.bestWorst.worst ?? ABSENT}</strong>
              </span>
            </div>
          </div>

          {/* Section 3 + 4: Target vs actual and variance */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            <div data-testid="drilldown-target-vs-actual" style={cardStyle}>
              <SectionTitle>Target vs Actual</SectionTitle>
              <div style={{ display: 'flex', gap: 24, fontSize: 14, color: '#111827' }}>
                <span>
                  Target: <strong>{formatNumber(drill.target)}</strong>
                </span>
                <span>
                  Actual: <strong>{formatNumber(drill.actual)}</strong>
                </span>
              </div>
            </div>

            <div data-testid="drilldown-variance" style={cardStyle}>
              <SectionTitle>Variance from Target</SectionTitle>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>
                {drill.variance === null
                  ? ABSENT
                  : `${drill.variance > 0 ? '+' : ''}${round1(drill.variance)}`}
              </span>
            </div>
          </div>

          {/* Monthly progression (ascending by period — Req 9.3) */}
          <div data-testid="drilldown-progression" style={cardStyle}>
            <SectionTitle>Monthly Progression</SectionTitle>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#6B7280' }}>
                  <th style={{ padding: '4px 8px' }}>Period</th>
                  <th style={{ padding: '4px 8px' }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {drill.progression.map((row) => (
                  <tr key={row.key} style={{ borderTop: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '4px 8px', color: '#374151' }}>{row.label}</td>
                    <td style={{ padding: '4px 8px', color: '#111827' }}>
                      {formatNumber(row.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
