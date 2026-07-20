/**
 * ExecutiveSummaryView — the Leadership Dashboard's high-level summary (Req 6).
 *
 * Renders EXACTLY eight named KPI cards (Req 6.1):
 *   1. Overall Engineering Health
 *   2. Delivery Health
 *   3. Quality Health
 *   4. Sustainability Health
 *   5. Cost Health
 *   6. Teams On Target
 *   7. Teams At Risk
 *   8. Teams Off Target
 *
 * Each card shows the current value, the target, the month-over-month trend and
 * percentage change (via {@link computeTrend}), a color-coded Health_Status
 * (via {@link ragColor}), and a {@link Sparkline} (Req 6.2). When a card's
 * underlying value is absent for the selected period, an absent-value indicator
 * ("N/A") is shown instead of a number (Req 6.3).
 *
 * All card aggregates are derived directly from the filtered dataset
 * (`useLeadership().filtered`), so the cards recompute whenever filters change
 * (Req 6.4, design Property 11). The aggregation is factored into the pure,
 * exported {@link computeExecutiveSummary} function so it can be property-tested
 * independently of React.
 */
import type {
  EngineeringPillar,
  FilteredDataset,
  HealthStatus,
  KpiDefinition,
  MetricValue,
} from '../model/types';
import { classify } from '../services/health-classifier';
import {
  computeTrend,
  orderPeriodsAscending,
  type TrendDirection,
} from '../services/trend-calculator';
import { Sparkline, ragColor } from './charts';
import { useLeadership } from '../state/useLeadership';

/** The four Engineering Pillars that each get a dedicated health card. */
const PILLARS: EngineeringPillar[] = [
  'Delivery',
  'Quality',
  'Sustainability',
  'Cost',
];

/** A single computed Executive Summary card. */
export interface ExecutiveSummaryCard {
  /** Stable id for keys/tests. */
  id: string;
  /** The card's display title (one of the eight named cards). */
  title: string;
  /**
   * The current (latest-period) aggregate value, or `null` when the value is
   * absent for the selected period (Req 6.3). Health cards are a 0–100 percent
   * of on-target metrics; team-count cards are a whole-number team count.
   */
  value: number | null;
  /** The card's target, or `null` when not applicable. */
  target: number | null;
  /** Unit suffix for display ("%" for health cards, "" for team counts). */
  unit: string;
  /** Color-coded Health_Status for the card (Req 6.2). */
  status: HealthStatus;
  /** Month-over-month trend direction across the ordered periods (Req 6.2). */
  direction: TrendDirection;
  /** Month-over-month percentage change, or `null` when undefined (Req 6.2). */
  percentChange: number | null;
  /** Ordered per-period series for the card's Sparkline (Req 6.2). */
  series: (number | null)[];
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

/** Classify a single metric using its KPI definition; Unknown when undefined. */
function classifyMetric(
  metric: MetricValue,
  definitions: Map<string, KpiDefinition>
): HealthStatus {
  const def = definitions.get(metric.kpi);
  if (!def) {
    return 'Unknown';
  }
  return classify({
    value: metric.value,
    target: def.target,
    direction: def.direction,
    amberBand: def.amberBand,
  });
}

/**
 * Health score for one period: the percentage (0–100) of classifiable metrics
 * (matching `kpiFilter`) in that period whose status is Green ("on target").
 * Returns `null` when no metric in scope can be classified for the period, so
 * the card shows an absent-value indicator (Req 6.3).
 */
function healthScoreForPeriod(
  metrics: MetricValue[],
  definitions: Map<string, KpiDefinition>,
  periodKey: string,
  kpiFilter: (kpi: string) => boolean
): number | null {
  let classifiedCount = 0;
  let greenCount = 0;
  for (const metric of metrics) {
    if (metric.period.key !== periodKey || !kpiFilter(metric.kpi)) {
      continue;
    }
    const status = classifyMetric(metric, definitions);
    if (status === 'Unknown') {
      continue;
    }
    classifiedCount += 1;
    if (status === 'Green') {
      greenCount += 1;
    }
  }
  if (classifiedCount === 0) {
    return null;
  }
  return (greenCount / classifiedCount) * 100;
}

/**
 * Aggregate status for a team in a period using a worst-status-wins rollup:
 * any Red → Red (Off Target), else any Amber → Amber (At Risk), else any
 * Green → Green (On Target), else Unknown.
 */
function teamStatusForPeriod(
  metrics: MetricValue[],
  definitions: Map<string, KpiDefinition>,
  periodKey: string,
  team: string
): HealthStatus {
  let hasRed = false;
  let hasAmber = false;
  let hasGreen = false;
  for (const metric of metrics) {
    if (metric.period.key !== periodKey || metric.team !== team) {
      continue;
    }
    const status = classifyMetric(metric, definitions);
    if (status === 'Red') {
      hasRed = true;
    } else if (status === 'Amber') {
      hasAmber = true;
    } else if (status === 'Green') {
      hasGreen = true;
    }
  }
  if (hasRed) return 'Red';
  if (hasAmber) return 'Amber';
  if (hasGreen) return 'Green';
  return 'Unknown';
}

/** Number of teams whose aggregate status equals `target` in a period. */
function teamCountForPeriod(
  metrics: MetricValue[],
  definitions: Map<string, KpiDefinition>,
  teams: string[],
  periodKey: string,
  target: HealthStatus
): number {
  let count = 0;
  for (const team of teams) {
    if (teamStatusForPeriod(metrics, definitions, periodKey, team) === target) {
      count += 1;
    }
  }
  return count;
}

/** Classify a 0–100 health-score into a Health_Status band for the card color. */
function scoreStatus(score: number | null): HealthStatus {
  if (score === null) {
    return 'Unknown';
  }
  if (score >= 80) return 'Green';
  if (score >= 50) return 'Amber';
  return 'Red';
}

/** Build a health card (Overall or a specific pillar) from the dataset. */
function buildHealthCard(
  id: string,
  title: string,
  data: FilteredDataset,
  definitions: Map<string, KpiDefinition>,
  periodKeys: string[],
  kpiFilter: (kpi: string) => boolean
): ExecutiveSummaryCard {
  const series = periodKeys.map((key) =>
    healthScoreForPeriod(data.metrics, definitions, key, kpiFilter)
  );
  const trend = computeTrend(series);
  const value = series.length > 0 ? series[series.length - 1] : null;
  return {
    id,
    title,
    value,
    target: 100,
    unit: '%',
    status: scoreStatus(value),
    direction: trend.direction,
    percentChange: trend.percentChange,
    series,
  };
}

/** Build a team-count card (On Target / At Risk / Off Target). */
function buildTeamCountCard(
  id: string,
  title: string,
  status: HealthStatus,
  target: number | null,
  data: FilteredDataset,
  definitions: Map<string, KpiDefinition>,
  periodKeys: string[]
): ExecutiveSummaryCard {
  const series = periodKeys.map((key) =>
    teamCountForPeriod(data.metrics, definitions, data.teams, key, status)
  );
  const trend = computeTrend(series);
  const value = series.length > 0 ? series[series.length - 1] : null;
  return {
    id,
    title,
    value,
    target,
    unit: '',
    // The team-count card's own color reflects the category it represents:
    // On Target=Green, At Risk=Amber, Off Target=Red.
    status,
    direction: trend.direction,
    percentChange: trend.percentChange,
    series,
  };
}

/**
 * Compute all eight Executive Summary cards from the filtered dataset.
 *
 * Pure and deterministic: given a {@link FilteredDataset} it returns the eight
 * named cards in fixed order, each value being an aggregate computed directly
 * over `data.metrics`. Because it recomputes from the filtered dataset, the
 * cards always stay consistent with the current filters (Req 6.4, Property 11).
 */
export function computeExecutiveSummary(
  data: FilteredDataset
): ExecutiveSummaryCard[] {
  const definitions = indexDefinitions(data.kpiDefinitions);
  // Order periods ascending so the sparkline series and month-over-month trend
  // read left-to-right in chronological order (latest period is last).
  const periodKeys = orderPeriodsAscending(data.periods).map((p) => p.key);

  // Map KPI name → pillar so pillar cards only aggregate their own KPIs.
  const pillarByKpi = new Map<string, EngineeringPillar | null>();
  for (const def of data.kpiDefinitions) {
    pillarByKpi.set(def.name, def.pillar);
  }

  const cards: ExecutiveSummaryCard[] = [];

  // 1. Overall Engineering Health — aggregates across all pillars/KPIs.
  cards.push(
    buildHealthCard(
      'overall-health',
      'Overall Engineering Health',
      data,
      definitions,
      periodKeys,
      () => true
    )
  );

  // 2–5. One health card per Engineering Pillar.
  for (const pillar of PILLARS) {
    cards.push(
      buildHealthCard(
        `${pillar.toLowerCase()}-health`,
        `${pillar} Health`,
        data,
        definitions,
        periodKeys,
        (kpi) => pillarByKpi.get(kpi) === pillar
      )
    );
  }

  const totalTeams = data.teams.length;

  // 6. Teams On Target (Green).
  cards.push(
    buildTeamCountCard(
      'teams-on-target',
      'Teams On Target',
      'Green',
      totalTeams,
      data,
      definitions,
      periodKeys
    )
  );

  // 7. Teams At Risk (Amber) — the ideal count is zero.
  cards.push(
    buildTeamCountCard(
      'teams-at-risk',
      'Teams At Risk',
      'Amber',
      0,
      data,
      definitions,
      periodKeys
    )
  );

  // 8. Teams Off Target (Red) — the ideal count is zero.
  cards.push(
    buildTeamCountCard(
      'teams-off-target',
      'Teams Off Target',
      'Red',
      0,
      data,
      definitions,
      periodKeys
    )
  );

  return cards;
}

/** Absent-value indicator shown when a card value is absent (Req 6.3). */
const ABSENT_INDICATOR = 'N/A';

/** Format a numeric card value with its unit, or the absent indicator. */
function formatValue(value: number | null, unit: string): string {
  if (value === null) {
    return ABSENT_INDICATOR;
  }
  // Round health percentages to one decimal; team counts are whole numbers.
  const rounded = unit === '%' ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded}${unit}`;
}

/** Format a target value with its unit, or an em dash when not applicable. */
function formatTarget(target: number | null, unit: string): string {
  if (target === null) {
    return '—';
  }
  const rounded = unit === '%' ? Math.round(target * 10) / 10 : Math.round(target);
  return `${rounded}${unit}`;
}

/** Format the month-over-month change with a direction arrow (Req 6.2). */
function formatPercentChange(
  direction: TrendDirection,
  percentChange: number | null
): string {
  if (percentChange === null) {
    if (direction === 'Flat') return '→ 0%';
    return `${ABSENT_INDICATOR}`;
  }
  const magnitude = Math.abs(Math.round(percentChange * 10) / 10);
  if (percentChange > 0) return `↑ ${magnitude}%`;
  if (percentChange < 0) return `↓ ${magnitude}%`;
  return '→ 0%';
}

/** Presentational card for a single Executive Summary aggregate. */
function SummaryCard({ card }: { card: ExecutiveSummaryCard }) {
  const color = ragColor(card.status);
  const absent = card.value === null;
  const changeColor =
    card.direction === 'Up'
      ? '#28A745'
      : card.direction === 'Down'
        ? '#DC3545'
        : '#6B7280';

  return (
    <div
      data-testid={`summary-card-${card.id}`}
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderLeft: `4px solid ${color}`,
        borderRadius: 8,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
      }}
    >
      {/* Title + status dot */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#6B7280',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {card.title}
        </span>
        <span
          aria-label={`status ${card.status}`}
          title={card.status}
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
        />
      </div>

      {/* Current value / absent indicator */}
      <div>
        {absent ? (
          <span
            data-testid={`summary-value-absent-${card.id}`}
            style={{ fontSize: 22, color: '#9AA0A6', fontStyle: 'italic' }}
          >
            {ABSENT_INDICATOR}
          </span>
        ) : (
          <span style={{ fontSize: 28, fontWeight: 700, color: '#111827' }}>
            {formatValue(card.value, card.unit)}
          </span>
        )}
      </div>

      {/* Target + month-over-month change */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12,
          color: '#6B7280',
        }}
      >
        <span>Target: {formatTarget(card.target, card.unit)}</span>
        <span style={{ color: changeColor, fontWeight: 600 }}>
          {formatPercentChange(card.direction, card.percentChange)}
        </span>
      </div>

      {/* Sparkline of the per-period series */}
      <Sparkline data={card.series} status={card.status} area />
    </div>
  );
}

/**
 * The Executive Summary view. Reads the filtered dataset from the module
 * context and renders the eight aggregate cards; shows an empty state when no
 * workbook has been parsed yet.
 */
export default function ExecutiveSummaryView() {
  const { filtered } = useLeadership();

  if (filtered === null) {
    return (
      <div
        data-testid="executive-summary-empty"
        style={{
          padding: 24,
          textAlign: 'center',
          color: '#6B7280',
          fontSize: 14,
        }}
      >
        No data available. Upload a workbook to see the executive summary.
      </div>
    );
  }

  const cards = computeExecutiveSummary(filtered);

  return (
    <section data-testid="executive-summary" aria-label="Executive Summary">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        {cards.map((card) => (
          <SummaryCard key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}
