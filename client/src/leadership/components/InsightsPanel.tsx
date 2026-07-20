/**
 * InsightsPanel — renders the Smart Leadership Insights (Req 11).
 *
 * Reads the filtered dataset from the module context
 * (`useLeadership().filtered`) and generates insights via the pure
 * {@link generateInsights} engine. The insights are grouped and labeled by
 * their type (`MoMChange`, `HighestForKpi`, `ConsistentlyExceeds`) and each
 * insight's message is displayed as a list item (Req 11.1).
 *
 * Because the panel derives its insights directly from `filtered`, it
 * regenerates automatically whenever the selected filters change (Req 11.5):
 * a new filtered dataset flows in from the hook and the component re-renders,
 * recomputing the insights from scratch.
 *
 * An empty state is shown when no workbook has been parsed (`filtered` is
 * `null`) or when the current dataset yields no insights.
 */
import { useMemo } from 'react';
import {
  generateInsights,
  type Insight,
  type InsightType,
} from '../services/insight-engine';
import { useLeadership } from '../state/useLeadership';

/**
 * Default month-over-month threshold (in percent) used to decide which
 * month-over-month changes are notable enough to surface as insights. A 10%
 * swing is a sensible executive-level default.
 */
const DEFAULT_MOM_THRESHOLD_PERCENT = 10;

/** Display metadata for each insight type, in the order groups are rendered. */
const INSIGHT_GROUPS: { type: InsightType; label: string }[] = [
  { type: 'MoMChange', label: 'Month-over-Month Changes' },
  { type: 'HighestForKpi', label: 'KPI Leaders' },
  { type: 'ConsistentlyExceeds', label: 'Consistently Exceeding Target' },
];

/** Partition insights by type, preserving the engine's deterministic order. */
function groupByType(insights: Insight[]): Map<InsightType, Insight[]> {
  const groups = new Map<InsightType, Insight[]>();
  for (const insight of insights) {
    const bucket = groups.get(insight.type);
    if (bucket) {
      bucket.push(insight);
    } else {
      groups.set(insight.type, [insight]);
    }
  }
  return groups;
}

/** A single labeled group of insights of the same type. */
function InsightGroup({
  type,
  label,
  insights,
}: {
  type: InsightType;
  label: string;
  insights: Insight[];
}) {
  return (
    <div data-testid={`insight-group-${type}`} style={{ marginBottom: 16 }}>
      <h3
        style={{
          margin: '0 0 8px',
          fontSize: 12,
          fontWeight: 600,
          color: '#6B7280',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {insights.map((insight, index) => (
          <li
            key={`${type}-${index}`}
            data-testid={`insight-item-${type}`}
            style={{
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: 6,
              padding: '10px 12px',
              marginBottom: 6,
              fontSize: 14,
              color: '#111827',
            }}
          >
            {insight.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The Insights panel. Generates and displays the leadership insights for the
 * current filtered dataset, grouped by type; shows an empty state when there
 * is no data or no insights.
 */
export default function InsightsPanel() {
  const { filtered } = useLeadership();

  // Regenerate insights whenever the filtered dataset changes (Req 11.5).
  const insights = useMemo(
    () =>
      filtered === null
        ? []
        : generateInsights(filtered, {
            momThresholdPercent: DEFAULT_MOM_THRESHOLD_PERCENT,
          }),
    [filtered]
  );

  if (filtered === null || insights.length === 0) {
    return (
      <section data-testid="insights-empty" aria-label="Leadership Insights">
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            color: '#6B7280',
            fontSize: 14,
          }}
        >
          {filtered === null
            ? 'No data available. Upload a workbook to see leadership insights.'
            : 'No insights for the current selection.'}
        </div>
      </section>
    );
  }

  const grouped = groupByType(insights);

  return (
    <section data-testid="insights-panel" aria-label="Leadership Insights">
      {INSIGHT_GROUPS.map(({ type, label }) => {
        const groupInsights = grouped.get(type);
        if (!groupInsights || groupInsights.length === 0) {
          return null;
        }
        return (
          <InsightGroup
            key={type}
            type={type}
            label={label}
            insights={groupInsights}
          />
        );
      })}
    </section>
  );
}
