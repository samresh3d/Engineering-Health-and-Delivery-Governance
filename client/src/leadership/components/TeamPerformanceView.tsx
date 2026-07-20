/**
 * TeamPerformanceView — compares Teams across KPIs (Requirement 7).
 *
 * Renders a team-vs-KPI comparison across multiple visualizations from a single
 * derived model (Req 7.2):
 *   - a clustered {@link BarChart} (teams on the x-axis, one series per KPI),
 *   - a {@link LineChart} of each team's aggregate score across periods,
 *   - a RAG {@link HeatmapChart} of team × KPI health status,
 *   - a {@link RadarChart} with one series per team over the KPI axes,
 *   - a leaderboard (ranked list of teams by health score), and
 *   - a scorecard (team × KPI value table, color-coded by Health_Status).
 *
 * The comparison uses the KPIs named in Requirement 7.1, but only those that
 * are actually present in the parsed model — any listed KPI absent from
 * `filtered.kpiDefinitions` is omitted WITHOUT error (Req 7.3, design
 * Property 12). When no comparison KPI is available at all, a single
 * "No KPI data available for comparison" message is shown (Req 7.4).
 *
 * Everything is derived from `useLeadership().filtered`, so the whole view
 * recomputes whenever filters change (Req 7.5). The comparison math is factored
 * into the pure, exported {@link computeTeamComparison} function so it can be
 * property-tested independently of React.
 */
import type {
  FilteredDataset,
  HealthStatus,
  KpiDefinition,
  MetricValue,
} from '../model/types';
import { classify } from '../services/health-classifier';
import { orderByPeriodKeyAscending, orderPeriodsAscending } from '../services/trend-calculator';
import {
  BarChart,
  LineChart,
  HeatmapChart,
  RadarChart,
  ragColor,
  type ChartSeries,
  type HeatmapCell,
  type RadarSeries,
} from './charts';
import { useLeadership } from '../state/useLeadership';

/**
 * The KPIs compared in the Team Performance view, in the order listed in
 * Requirement 7.1. Only the entries whose name is present in the parsed model
 * are actually used; the rest are omitted without error (Req 7.3, Property 12).
 */
export const TEAM_COMPARISON_KPIS: readonly string[] = [
  'Team Health Score',
  'Sprint Commitment',
  'Release Success',
  'Technical Debt',
  'Production Stability',
  'MTTR',
  'Deployment Frequency',
  'Cloud Cost',
  'Throughput',
  'Resource Utilization',
];

/** Message shown when no comparison KPI is available (Req 7.4). */
export const NO_KPI_MESSAGE = 'No KPI data available for comparison';

/** A single team's cell for one KPI in the comparison. */
export interface TeamKpiCell {
  /** Representative (latest available) value for the team+KPI, or `null`. */
  value: number | null;
  /** Health classification of the representative value (Req 5). */
  status: HealthStatus;
}

/** One team's row in the leaderboard, ranked by health score. */
export interface LeaderboardEntry {
  team: string;
  /** Percentage (0–100) of classifiable comparison KPIs that are Green. */
  score: number;
  /** 1-based rank; ties share ranking order by team name. */
  rank: number;
}

/** The fully-derived comparison model consumed by the view. */
export interface TeamComparison {
  /** Comparison KPIs actually present in the model (subset of dimensions.kpis). */
  kpis: string[];
  /** Teams present in the filtered dataset, in dataset order. */
  teams: string[];
  /** Ordered period labels used for the per-period line chart. */
  periodLabels: string[];
  /** cells[team][kpi] → representative value + status. */
  cells: Record<string, Record<string, TeamKpiCell>>;
  /** perPeriodScore[team] → aggregate value per ordered period (for the line chart). */
  perPeriodScore: Record<string, (number | null)[]>;
  /** Teams ranked by health score, best first. */
  leaderboard: LeaderboardEntry[];
  /** True when there is at least one comparison KPI to render. */
  hasData: boolean;
}

/** Index KPI definitions by name for O(1) target/direction/amber lookup. */
function indexDefinitions(
  definitions: KpiDefinition[]
): Map<string, KpiDefinition> {
  const byName = new Map<string, KpiDefinition>();
  for (const def of definitions) {
    byName.set(def.name, def);
  }
  return byName;
}

/** Classify a value using a KPI definition; Unknown when the def is missing. */
function classifyValue(
  value: number | null,
  def: KpiDefinition | undefined
): HealthStatus {
  if (!def) {
    return 'Unknown';
  }
  return classify({
    value,
    target: def.target,
    direction: def.direction,
    amberBand: def.amberBand,
  });
}

/**
 * Resolve which of the Requirement 7.1 comparison KPIs are present in the
 * model. Matching is case-insensitive and trimmed; the canonical name as stored
 * in the model is preserved for display. Absent listed KPIs are omitted without
 * error (Req 7.3, Property 12).
 */
function resolvePresentKpis(definitions: KpiDefinition[]): string[] {
  const presentByLower = new Map<string, string>();
  for (const def of definitions) {
    presentByLower.set(def.name.trim().toLowerCase(), def.name);
  }
  const result: string[] = [];
  for (const listed of TEAM_COMPARISON_KPIS) {
    const match = presentByLower.get(listed.trim().toLowerCase());
    if (match !== undefined) {
      result.push(match);
    }
  }
  return result;
}

/**
 * Pick the representative value for a team+KPI: the latest available (non-null)
 * value across the ordered filtered periods. Returns `null` when the team has
 * no value for that KPI.
 */
function latestValue(metrics: MetricValue[]): number | null {
  const ordered = orderByPeriodKeyAscending(metrics);
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    if (ordered[i].value !== null) {
      return ordered[i].value;
    }
  }
  return null;
}

/**
 * Compute the full Team Performance comparison from the filtered dataset.
 *
 * Pure and deterministic: given a {@link FilteredDataset} it returns the
 * comparison KPIs present in the model, the per-team/per-KPI representative
 * values and health statuses, per-period aggregate scores, and a ranked
 * leaderboard. Because it recomputes entirely from the filtered dataset, the
 * view always stays consistent with the current filters (Req 7.5).
 */
export function computeTeamComparison(data: FilteredDataset): TeamComparison {
  const definitions = indexDefinitions(data.kpiDefinitions);
  const kpis = resolvePresentKpis(data.kpiDefinitions);
  const teams = data.teams.slice();
  const orderedPeriods = orderPeriodsAscending(data.periods);
  const periodLabels = orderedPeriods.map((p) => `${p.month} ${p.year}`);

  // Bucket metrics by team → kpi for representative-value lookup, and by
  // team → kpi → periodKey for the per-period aggregate line series.
  const byTeamKpi = new Map<string, MetricValue[]>();
  for (const metric of data.metrics) {
    const key = `${metric.team}\u0000${metric.kpi}`;
    const bucket = byTeamKpi.get(key);
    if (bucket) {
      bucket.push(metric);
    } else {
      byTeamKpi.set(key, [metric]);
    }
  }

  const cells: Record<string, Record<string, TeamKpiCell>> = {};
  const perPeriodScore: Record<string, (number | null)[]> = {};
  const leaderboard: LeaderboardEntry[] = [];

  for (const team of teams) {
    cells[team] = {};
    let classifiable = 0;
    let green = 0;

    for (const kpi of kpis) {
      const metrics = byTeamKpi.get(`${team}\u0000${kpi}`) ?? [];
      const value = latestValue(metrics);
      const status = classifyValue(value, definitions.get(kpi));
      cells[team][kpi] = { value, status };
      if (status !== 'Unknown') {
        classifiable += 1;
        if (status === 'Green') {
          green += 1;
        }
      }
    }

    // Per-period aggregate score: mean of the present comparison-KPI values
    // for the team in each ordered period (null when none present).
    perPeriodScore[team] = orderedPeriods.map((period) => {
      let sum = 0;
      let count = 0;
      for (const kpi of kpis) {
        const metrics = byTeamKpi.get(`${team}\u0000${kpi}`) ?? [];
        for (const metric of metrics) {
          if (metric.period.key === period.key && metric.value !== null) {
            sum += metric.value;
            count += 1;
          }
        }
      }
      return count === 0 ? null : sum / count;
    });

    const score = classifiable === 0 ? 0 : (green / classifiable) * 100;
    leaderboard.push({ team, score, rank: 0 });
  }

  // Rank by score descending, ties broken alphabetically by team for stability.
  leaderboard.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.team < b.team ? -1 : a.team > b.team ? 1 : 0
  );
  leaderboard.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  return {
    kpis,
    teams,
    periodLabels,
    cells,
    perPeriodScore,
    leaderboard,
    hasData: kpis.length > 0,
  };
}

/** Map a Health_Status to the ordinal used by the RAG heat-map scale. */
function statusOrdinal(status: HealthStatus): number {
  switch (status) {
    case 'Red':
      return 0;
    case 'Amber':
      return 1;
    case 'Green':
      return 2;
    default:
      return 3;
  }
}

/** Absent-value indicator for scorecard cells with no value. */
const ABSENT = '—';

/** Format a representative value for display, or the absent indicator. */
function formatCellValue(value: number | null): string {
  if (value === null) {
    return ABSENT;
  }
  return String(Math.round(value * 100) / 100);
}

/** A titled panel wrapper used for each visualization block. */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: 8,
        padding: 16,
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
      }}
    >
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
        {title}
      </h3>
      {children}
    </div>
  );
}

/** Clustered bar chart: teams on the x-axis, one series per comparison KPI. */
function ComparisonBarChart({ comparison }: { comparison: TeamComparison }) {
  const series: ChartSeries[] = comparison.kpis.map((kpi) => ({
    name: kpi,
    data: comparison.teams.map((team) => comparison.cells[team][kpi].value),
  }));
  return <BarChart categories={comparison.teams} series={series} />;
}

/** Line chart: each team's per-period aggregate comparison score. */
function ComparisonLineChart({ comparison }: { comparison: TeamComparison }) {
  const series: ChartSeries[] = comparison.teams.map((team) => ({
    name: team,
    data: comparison.perPeriodScore[team],
  }));
  return <LineChart categories={comparison.periodLabels} series={series} />;
}

/** RAG heat map of team (y) × KPI (x) health status. */
function ComparisonHeatmap({ comparison }: { comparison: TeamComparison }) {
  const data: HeatmapCell[] = [];
  comparison.teams.forEach((team, yIndex) => {
    comparison.kpis.forEach((kpi, xIndex) => {
      data.push([xIndex, yIndex, statusOrdinal(comparison.cells[team][kpi].status)]);
    });
  });
  return (
    <HeatmapChart
      xLabels={comparison.kpis}
      yLabels={comparison.teams}
      data={data}
      ragScale
    />
  );
}

/** Radar chart: one series per team across the KPI axes. */
function ComparisonRadar({ comparison }: { comparison: TeamComparison }) {
  // Per-KPI max across teams so each axis scales to its own data range.
  const indicators = comparison.kpis.map((kpi) => {
    let max = 0;
    for (const team of comparison.teams) {
      const value = comparison.cells[team][kpi].value;
      if (value !== null && value > max) {
        max = value;
      }
    }
    return { name: kpi, max: max > 0 ? max : undefined };
  });
  const series: RadarSeries[] = comparison.teams.map((team) => ({
    name: team,
    values: comparison.kpis.map((kpi) => comparison.cells[team][kpi].value),
  }));
  return <RadarChart indicators={indicators} series={series} />;
}

/** Leaderboard: teams ranked by health score, best first. */
function Leaderboard({ comparison }: { comparison: TeamComparison }) {
  return (
    <ol
      data-testid="team-performance-leaderboard"
      style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      {comparison.leaderboard.map((entry) => (
        <li
          key={entry.team}
          data-testid={`leaderboard-row-${entry.team}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            border: '1px solid #E5E7EB',
            borderRadius: 6,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: '#F3F4F6',
                color: '#111827',
                fontSize: 12,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {entry.rank}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{entry.team}</span>
          </span>
          <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 600 }}>
            {Math.round(entry.score)}%
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Scorecard: team × KPI table of representative values, color-coded by status. */
function Scorecard({ comparison }: { comparison: TeamComparison }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        data-testid="team-performance-scorecard"
        style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}
      >
        <thead>
          <tr>
            <th
              style={{
                textAlign: 'left',
                padding: '8px 12px',
                borderBottom: '2px solid #E5E7EB',
                color: '#6B7280',
                position: 'sticky',
                left: 0,
                background: '#FFFFFF',
              }}
            >
              Team
            </th>
            {comparison.kpis.map((kpi) => (
              <th
                key={kpi}
                style={{
                  textAlign: 'right',
                  padding: '8px 12px',
                  borderBottom: '2px solid #E5E7EB',
                  color: '#6B7280',
                  whiteSpace: 'nowrap',
                }}
              >
                {kpi}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparison.teams.map((team) => (
            <tr key={team}>
              <td
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid #F3F4F6',
                  fontWeight: 600,
                  color: '#111827',
                  position: 'sticky',
                  left: 0,
                  background: '#FFFFFF',
                }}
              >
                {team}
              </td>
              {comparison.kpis.map((kpi) => {
                const cell = comparison.cells[team][kpi];
                const color = ragColor(cell.status);
                return (
                  <td
                    key={kpi}
                    title={cell.status}
                    style={{
                      textAlign: 'right',
                      padding: '8px 12px',
                      borderBottom: '1px solid #F3F4F6',
                      borderLeft: `3px solid ${color}`,
                      color: '#111827',
                    }}
                  >
                    {formatCellValue(cell.value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The Team Performance view. Reads the filtered dataset from the module context
 * and renders the multi-chart comparison; shows an empty state when no workbook
 * has been parsed and a single "no KPI data" message when no comparison KPI is
 * available for the current filters (Req 7.4).
 */
export default function TeamPerformanceView() {
  const { filtered } = useLeadership();

  if (filtered === null) {
    return (
      <div
        data-testid="team-performance-empty"
        style={{ padding: 24, textAlign: 'center', color: '#6B7280', fontSize: 14 }}
      >
        No data available. Upload a workbook to compare team performance.
      </div>
    );
  }

  const comparison = computeTeamComparison(filtered);

  if (!comparison.hasData) {
    return (
      <div
        data-testid="team-performance-no-kpi"
        style={{ padding: 24, textAlign: 'center', color: '#6B7280', fontSize: 14 }}
      >
        {NO_KPI_MESSAGE}
      </div>
    );
  }

  return (
    <section
      data-testid="team-performance"
      aria-label="Team Performance"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
        }}
      >
        <Panel title="KPI comparison (clustered bars)">
          <ComparisonBarChart comparison={comparison} />
        </Panel>
        <Panel title="Aggregate score over time">
          <ComparisonLineChart comparison={comparison} />
        </Panel>
        <Panel title="Health heat map">
          <ComparisonHeatmap comparison={comparison} />
        </Panel>
        <Panel title="Team profiles (radar)">
          <ComparisonRadar comparison={comparison} />
        </Panel>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
        }}
      >
        <Panel title="Leaderboard">
          <Leaderboard comparison={comparison} />
        </Panel>
        <Panel title="Scorecard">
          <Scorecard comparison={comparison} />
        </Panel>
      </div>
    </section>
  );
}
