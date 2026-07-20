/**
 * Overview aggregation — pure functions that turn a FilteredDataset into the
 * numbers the Overview dashboard renders (health scores, pillar deltas, target
 * achievement, team ranking, KPI stat strip, heatmap, radar, cost trend).
 *
 * All functions are pure and derive solely from the dataset, so the Overview
 * recomputes consistently whenever filters change.
 */
import type {
  EngineeringPillar,
  FilteredDataset,
  HealthStatus,
  KpiDefinition,
  MetricValue,
  Period,
} from '../model/types';
import { classify } from './health-classifier';
import { orderPeriodsAscending } from './trend-calculator';

/** Health score band → status for coloring the score readout. */
export function scoreStatus(score: number | null): HealthStatus {
  if (score === null) return 'Unknown';
  if (score >= 80) return 'Green';
  if (score >= 50) return 'Amber';
  return 'Red';
}

function indexDefs(defs: KpiDefinition[]): Map<string, KpiDefinition> {
  const m = new Map<string, KpiDefinition>();
  for (const d of defs) m.set(d.name, d);
  return m;
}

function classifyMetric(
  metric: MetricValue,
  defs: Map<string, KpiDefinition>
): HealthStatus {
  const def = defs.get(metric.kpi);
  if (!def) return 'Unknown';
  return classify({
    value: metric.value,
    target: def.target,
    direction: def.direction,
    amberBand: def.amberBand,
  });
}

/**
 * Percentage (0–100) of classifiable metrics in a period that are Green,
 * optionally restricted to a set of KPIs. Returns null when nothing classifies.
 */
function healthScore(
  metrics: MetricValue[],
  defs: Map<string, KpiDefinition>,
  periodKey: string,
  kpiFilter?: (kpi: string) => boolean
): number | null {
  let total = 0;
  let green = 0;
  for (const m of metrics) {
    if (m.period.key !== periodKey) continue;
    if (kpiFilter && !kpiFilter(m.kpi)) continue;
    const s = classifyMetric(m, defs);
    if (s === 'Unknown') continue;
    total += 1;
    if (s === 'Green') green += 1;
  }
  return total === 0 ? null : (green / total) * 100;
}

export interface ScoreCard {
  key: string;
  title: string;
  /** 0–100 score for the latest period. */
  value: number | null;
  /** Delta (points) vs the previous period. */
  delta: number | null;
  status: HealthStatus;
  /** Per-period series for the sparkline. */
  series: (number | null)[];
}

export interface OverviewModel {
  periods: Period[];
  latestPeriod: Period | null;
  previousPeriod: Period | null;
  overall: ScoreCard;
  pillars: ScoreCard[];
  aiAdoption: ScoreCard;
  /** Underlying KPI name backing the AI Adoption card (for drill-down), if any. */
  aiKpiName: string | null;
  targetAchievement: {
    onTarget: number;
    atRisk: number;
    offTarget: number;
    totalKpis: number;
  };
  teamRanking: { team: string; score: number; delta: number | null; rank: number }[];
  kpiStrip: KpiStat[];
  heatmap: { kpis: string[]; teams: string[]; status: HealthStatus[][] };
  radar: { indicators: string[]; current: number[]; previous: number[] };
  costTrend: { labels: string[]; values: number[]; total: number };
}

export interface KpiStat {
  kpi: string;
  value: number | null;
  target: number | null;
  status: HealthStatus;
  deltaPct: number | null;
  series: (number | null)[];
  unit: 'percent' | 'number' | 'currency';
}

const PILLARS: { pillar: EngineeringPillar; title: string }[] = [
  { pillar: 'Delivery', title: 'Delivery' },
  { pillar: 'Quality', title: 'Quality' },
  { pillar: 'Sustainability', title: 'Stability' },
  { pillar: 'Cost', title: 'Cost Efficiency' },
];

/* ------------------------- drill-down detail models ------------------------- */

export interface KpiCell {
  value: number | null;
  status: HealthStatus;
}

export interface TeamPillarRow {
  team: string;
  score: number | null;
  status: HealthStatus;
  series: (number | null)[];
}

export interface PillarDetail {
  title: string;
  pillar: EngineeringPillar;
  kpis: string[];
  teams: string[];
  periodLabels: string[];
  overallScore: number | null;
  teamRows: TeamPillarRow[];
  /** team -> kpi -> latest cell (value + status). */
  matrix: Record<string, Record<string, KpiCell>>;
}

/** Team-wise breakdown of a pillar: per-team score, trend, and KPI matrix. */
export function computePillarDetail(
  data: FilteredDataset,
  pillar: EngineeringPillar,
  title: string
): PillarDetail {
  const defs = indexDefs(data.kpiDefinitions);
  const periods = orderPeriodsAscending(data.periods);
  const periodKeys = periods.map((p) => p.key);
  const latestKey = periodKeys.length ? periodKeys[periodKeys.length - 1] : '';
  const kpis = data.kpiDefinitions.filter((d) => d.pillar === pillar).map((d) => d.name);
  const inPillar = (kpi: string) => defs.get(kpi)?.pillar === pillar;

  const teamRows: TeamPillarRow[] = data.teams.map((team) => {
    const teamMetrics = data.metrics.filter((m) => m.team === team);
    const series = periodKeys.map((k) => healthScore(teamMetrics, defs, k, inPillar));
    const score = series.length ? series[series.length - 1] : null;
    return { team, score, status: scoreStatus(score), series };
  });
  teamRows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const matrix: Record<string, Record<string, KpiCell>> = {};
  for (const team of data.teams) {
    matrix[team] = {};
    for (const kpi of kpis) {
      let cell: KpiCell = { value: null, status: 'Unknown' };
      for (const m of data.metrics) {
        if (m.team === team && m.kpi === kpi && m.period.key === latestKey) {
          cell = { value: m.value, status: classifyMetric(m, defs) };
        }
      }
      matrix[team][kpi] = cell;
    }
  }

  const overallScore = healthScore(data.metrics, defs, latestKey, inPillar);

  return {
    title,
    pillar,
    kpis,
    teams: data.teams,
    periodLabels: periods.map((p) => `${p.month} '${String(p.year).slice(2)}`),
    overallScore,
    teamRows,
    matrix,
  };
}

export interface TeamKpiRow {
  team: string;
  value: number | null;
  status: HealthStatus;
  deltaPct: number | null;
  series: (number | null)[];
}

export interface KpiDetail {
  kpi: string;
  target: number | null;
  periodLabels: string[];
  teamRows: TeamKpiRow[];
  best: string | null;
  worst: string | null;
}

/** Team-wise breakdown of a single KPI: per-team latest value, trend, best/worst. */
export function computeKpiDetail(data: FilteredDataset, kpi: string): KpiDetail {
  const defs = indexDefs(data.kpiDefinitions);
  const def = defs.get(kpi) ?? null;
  const periods = orderPeriodsAscending(data.periods);
  const periodKeys = periods.map((p) => p.key);

  const teamRows: TeamKpiRow[] = data.teams.map((team) => {
    const series = periodKeys.map((k) => {
      for (const m of data.metrics) {
        if (m.team === team && m.kpi === kpi && m.period.key === k) return m.value;
      }
      return null;
    });
    const value = series.length ? series[series.length - 1] : null;
    const prev = series.length > 1 ? series[series.length - 2] : null;
    const deltaPct = value !== null && prev !== null && prev !== 0 ? ((value - prev) / prev) * 100 : null;
    const status =
      def && value !== null
        ? classify({ value, target: def.target, direction: def.direction, amberBand: def.amberBand })
        : 'Unknown';
    return { team, value, status, deltaPct, series };
  });

  // Best / worst by direction, ignoring absent values.
  const present = teamRows.filter((r) => r.value !== null) as (TeamKpiRow & { value: number })[];
  let best: string | null = null;
  let worst: string | null = null;
  if (present.length > 0) {
    const higher = (def?.direction ?? 'HigherIsBetter') === 'HigherIsBetter';
    const sorted = [...present].sort((a, b) => (higher ? b.value - a.value : a.value - b.value));
    best = sorted[0].team;
    worst = sorted[sorted.length - 1].team;
  }

  return {
    kpi,
    target: def?.target ?? null,
    periodLabels: periods.map((p) => `${p.month} '${String(p.year).slice(2)}`),
    teamRows,
    best,
    worst,
  };
}

/** Mean of present values for a KPI in a period, across teams. */
function meanForKpiPeriod(
  metrics: MetricValue[],
  kpi: string,
  periodKey: string
): number | null {
  let sum = 0;
  let n = 0;
  for (const m of metrics) {
    if (m.kpi === kpi && m.period.key === periodKey && m.value !== null) {
      sum += m.value;
      n += 1;
    }
  }
  return n === 0 ? null : sum / n;
}

/** Find a KPI name present in the dataset matching any of the given aliases. */
function findKpi(defs: KpiDefinition[], aliases: string[]): string | null {
  const norm = (s: string) => s.trim().toLowerCase();
  const set = new Set(aliases.map(norm));
  for (const d of defs) {
    if (set.has(norm(d.name))) return d.name;
    // loose contains match
    for (const a of aliases) {
      if (norm(d.name).includes(norm(a))) return d.name;
    }
  }
  return null;
}

function kpiUnit(name: string, target: number | null): KpiStat['unit'] {
  const n = name.toLowerCase();
  if (n.includes('cost')) return 'currency';
  if (
    n.includes('commitment') ||
    n.includes('coverage') ||
    n.includes('compliance') ||
    n.includes('utilization') ||
    n.includes('success') ||
    n.includes('availability') ||
    n.includes('efficiency') ||
    (target !== null && target > 1 && target <= 100 && n.includes('%'))
  ) {
    return 'percent';
  }
  return 'number';
}

/** Build the complete Overview model from a filtered dataset. */
export function computeOverview(data: FilteredDataset): OverviewModel {
  const defs = indexDefs(data.kpiDefinitions);
  const periods = orderPeriodsAscending(data.periods);
  const periodKeys = periods.map((p) => p.key);
  const latestPeriod = periods.length > 0 ? periods[periods.length - 1] : null;
  const previousPeriod = periods.length > 1 ? periods[periods.length - 2] : null;

  const buildScore = (
    key: string,
    title: string,
    kpiFilter?: (kpi: string) => boolean
  ): ScoreCard => {
    const series = periodKeys.map((k) => healthScore(data.metrics, defs, k, kpiFilter));
    const value = series.length ? series[series.length - 1] : null;
    const prev = series.length > 1 ? series[series.length - 2] : null;
    const delta = value !== null && prev !== null ? value - prev : null;
    return { key, title, value, delta, status: scoreStatus(value), series };
  };

  const pillarByKpi = new Map<string, EngineeringPillar | null>();
  for (const d of data.kpiDefinitions) pillarByKpi.set(d.name, d.pillar);

  const pillars = PILLARS.map((p) =>
    buildScore(p.pillar, p.title, (kpi) => pillarByKpi.get(kpi) === p.pillar)
  );
  const overall = buildScore('overall', 'Overall Engineering Health');

  // AI adoption: mean of the AI Efficiency KPI over periods (already a %).
  const aiKpi = findKpi(data.kpiDefinitions, ['AI Efficiency', 'AI Adoption', 'AI']);
  const aiSeries = periodKeys.map((k) =>
    aiKpi ? meanForKpiPeriod(data.metrics, aiKpi, k) : null
  );
  const aiValue = aiSeries.length ? aiSeries[aiSeries.length - 1] : null;
  const aiPrev = aiSeries.length > 1 ? aiSeries[aiSeries.length - 2] : null;
  const aiAdoption: ScoreCard = {
    key: 'ai',
    title: 'AI Adoption',
    value: aiValue,
    delta: aiValue !== null && aiPrev !== null ? aiValue - aiPrev : null,
    status: scoreStatus(aiValue),
    series: aiSeries,
  };

  // Target achievement across KPIs for the latest period: a KPI is On/At-Risk/
  // Off based on the worst status across teams for that KPI in the latest period.
  const latestKey = latestPeriod?.key ?? '';
  let onTarget = 0;
  let atRisk = 0;
  let offTarget = 0;
  for (const def of data.kpiDefinitions) {
    let worst: HealthStatus = 'Unknown';
    for (const m of data.metrics) {
      if (m.kpi !== def.name || m.period.key !== latestKey) continue;
      const s = classifyMetric(m, defs);
      if (s === 'Red') worst = 'Red';
      else if (s === 'Amber' && worst !== 'Red') worst = 'Amber';
      else if (s === 'Green' && worst !== 'Red' && worst !== 'Amber') worst = 'Green';
    }
    if (worst === 'Green') onTarget += 1;
    else if (worst === 'Amber') atRisk += 1;
    else if (worst === 'Red') offTarget += 1;
  }

  // Team ranking by health score (latest period), delta vs previous.
  const teamRanking = data.teams
    .map((team) => {
      const score = (k: string) =>
        healthScore(
          data.metrics.filter((m) => m.team === team),
          defs,
          k
        ) ?? 0;
      const cur = latestKey ? score(latestKey) : 0;
      const prev = previousPeriod ? score(previousPeriod.key) : null;
      return { team, score: cur, delta: prev !== null ? cur - prev : null, rank: 0 };
    })
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.team < b.team ? -1 : 1));
  teamRanking.forEach((t, i) => (t.rank = i + 1));

  // KPI stat strip: a curated set of headline KPIs if present, else the first few.
  const stripAliases = [
    ['Sprint Commitment'],
    ['Release Success Rate', 'Release Success'],
    ['Deployment Frequency'],
    ['Team Capacity Utilization', 'Capacity Utilization'],
    ['Defect density', 'Defect Density'],
    ['Technical Debt Backlog', 'Technical Debt'],
    ['Run/Cloud Cost', 'Cloud Cost'],
    ['AI Efficiency'],
  ];
  const chosen: string[] = [];
  for (const aliases of stripAliases) {
    const name = findKpi(data.kpiDefinitions, aliases);
    if (name && !chosen.includes(name)) chosen.push(name);
  }
  for (const d of data.kpiDefinitions) {
    if (chosen.length >= 8) break;
    if (!chosen.includes(d.name)) chosen.push(d.name);
  }
  const kpiStrip: KpiStat[] = chosen.slice(0, 8).map((kpi) => {
    const def = defs.get(kpi) ?? null;
    const series = periodKeys.map((k) => meanForKpiPeriod(data.metrics, kpi, k));
    const value = series.length ? series[series.length - 1] : null;
    const prev = series.length > 1 ? series[series.length - 2] : null;
    const deltaPct =
      value !== null && prev !== null && prev !== 0
        ? ((value - prev) / prev) * 100
        : null;
    const status =
      def && value !== null
        ? classify({ value, target: def.target, direction: def.direction, amberBand: def.amberBand })
        : 'Unknown';
    return {
      kpi,
      value,
      target: def?.target ?? null,
      status,
      deltaPct,
      series,
      unit: kpiUnit(kpi, def?.target ?? null),
    };
  });

  // Heatmap: KPI (rows) x team (cols) worst status for the latest period.
  const heatKpis = data.kpiDefinitions.map((d) => d.name);
  const heatStatus: HealthStatus[][] = heatKpis.map((kpi) =>
    data.teams.map((team) => {
      let worst: HealthStatus = 'Unknown';
      for (const m of data.metrics) {
        if (m.kpi !== kpi || m.team !== team || m.period.key !== latestKey) continue;
        const s = classifyMetric(m, defs);
        if (s === 'Red') worst = 'Red';
        else if (s === 'Amber' && worst !== 'Red') worst = 'Amber';
        else if (s === 'Green' && worst !== 'Red' && worst !== 'Amber') worst = 'Green';
      }
      return worst;
    })
  );

  // Radar: pillar scores + AI, current vs previous period.
  const radarPillars = [...pillars, aiAdoption];
  const radar = {
    indicators: radarPillars.map((p) => p.title),
    current: radarPillars.map((p) => Math.round(p.value ?? 0)),
    previous: radarPillars.map((p) => {
      const s = p.series;
      return Math.round(s.length > 1 ? s[s.length - 2] ?? 0 : 0);
    }),
  };

  // Cost trend: total Run/Cloud Cost per period.
  const costKpi = findKpi(data.kpiDefinitions, ['Run/Cloud Cost', 'Cloud Cost', 'Cost']);
  const costValues = periodKeys.map((k) => {
    if (!costKpi) return 0;
    let sum = 0;
    for (const m of data.metrics) {
      if (m.kpi === costKpi && m.period.key === k && m.value !== null) sum += m.value;
    }
    return sum;
  });
  const costTrend = {
    labels: periods.map((p) => `${p.month} '${String(p.year).slice(2)}`),
    values: costValues,
    total: costValues.length ? costValues[costValues.length - 1] : 0,
  };

  return {
    periods,
    latestPeriod,
    previousPeriod,
    overall,
    pillars,
    aiAdoption,
    aiKpiName: aiKpi,
    targetAchievement: {
      onTarget,
      atRisk,
      offTarget,
      totalKpis: data.kpiDefinitions.length,
    },
    teamRanking,
    kpiStrip,
    heatmap: { kpis: heatKpis, teams: data.teams, status: heatStatus },
    radar,
    costTrend,
  };
}
