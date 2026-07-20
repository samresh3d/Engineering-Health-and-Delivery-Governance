/**
 * TrendsView — month-on-month trend analysis for every KPI (Requirement 8).
 *
 * For each KPI present in the filtered dataset the view renders BOTH a
 * {@link LineChart} and a {@link BarChart} across the available Periods, ordered
 * ascending by period key (Req 8.1). Categories are the ordered period labels
 * and there is one series per selected Team that has at least one value for that
 * KPI — teams with no data for the KPI produce no series (Req 8.4, design
 * Property 15).
 *
 * Each chart:
 *   - shows a hover tooltip containing the Period, Team, KPI, and value, built
 *     with {@link formatTrendTooltip} (Req 8.2, Property 13),
 *   - enables a zoom-range selector via ECharts `dataZoom` (Req 8.3), and
 *   - offers a PNG export control that captures the chart through the ECharts
 *     instance `getDataURL()` and hands it to {@link ExportService.exportChartToPng}
 *     to trigger a download (Req 8.5).
 *
 * All chart data is derived from `useLeadership().filtered`, so the whole view
 * recomputes whenever filters change. The series computation is factored into
 * the pure, exported {@link computeTrends} function so it can be property-tested
 * independently of React (design Property 15).
 */
import { useCallback, useRef } from 'react';
import type { FilteredDataset, Period } from '../model/types';
import {
  formatTrendTooltip,
  orderPeriodsAscending,
} from '../services/trend-calculator';
import { exportService } from '../services/export-service';
import { LineChart, BarChart, type ChartSeries } from './charts';
import { useLeadership } from '../state/useLeadership';

/** The trend data for a single KPI: ordered categories + one series per team. */
export interface KpiTrend {
  /** The KPI name. */
  kpi: string;
  /** Ordered period objects backing the categories (for tooltip labeling). */
  periods: Period[];
  /** Category labels (period labels) ordered ascending by period key. */
  categories: string[];
  /** One series per selected team that has at least one value for the KPI. */
  series: ChartSeries[];
}

/** Separator used to build composite lookup keys without delimiter clashes. */
const SEP = '\u0000';

/**
 * Compute the per-KPI trend chart data from the filtered dataset.
 *
 * Pure and deterministic. For every KPI present in `data.kpiDefinitions` it
 * builds the ascending-ordered period categories and, for each selected team,
 * a value series aligned to those periods (`null` where the team has no value
 * for that period). A team is only included when it has at least one non-null
 * value for the KPI, so the number of series equals the number of selected
 * teams with data for that KPI (Req 8.4, design Property 15).
 *
 * @param data the current filtered dataset.
 * @returns one {@link KpiTrend} per KPI, in `kpiDefinitions` order.
 */
export function computeTrends(data: FilteredDataset): KpiTrend[] {
  const orderedPeriods = orderPeriodsAscending(data.periods);
  const categories = orderedPeriods.map((p) => `${p.month} ${p.year}`);

  // Lookup: team + kpi + periodKey → value. Prefer a non-null value when the
  // dataset happens to carry more than one cell for the same coordinate.
  const valueByKey = new Map<string, number | null>();
  for (const metric of data.metrics) {
    const key = `${metric.team}${SEP}${metric.kpi}${SEP}${metric.period.key}`;
    const existing = valueByKey.get(key);
    if (existing === undefined || existing === null) {
      valueByKey.set(key, metric.value);
    }
  }

  return data.kpiDefinitions.map((def) => {
    const series: ChartSeries[] = [];
    for (const team of data.teams) {
      const seriesData = orderedPeriods.map((period) => {
        const value = valueByKey.get(`${team}${SEP}${def.name}${SEP}${period.key}`);
        return value === undefined ? null : value;
      });
      // Only teams with at least one value for this KPI produce a series.
      if (seriesData.some((value) => value !== null)) {
        series.push({ name: team, data: seriesData });
      }
    }
    return { kpi: def.name, periods: orderedPeriods, categories, series };
  });
}

/** Minimal shape of the ECharts instance exposed via `onChartReady`. */
interface EChartsLike {
  getDataURL: (opts?: {
    type?: string;
    pixelRatio?: number;
    backgroundColor?: string;
  }) => string;
  setOption: (option: Record<string, unknown>, notMerge?: boolean) => void;
}

/** One item within an ECharts axis-trigger tooltip callback. */
interface TooltipParam {
  seriesName?: string;
  dataIndex: number;
  value?: unknown;
}

/**
 * Build an ECharts axis tooltip formatter that renders Period, Team, KPI, and
 * value for every series at the hovered period, using the shared
 * {@link formatTrendTooltip} for each line (Req 8.2, Property 13).
 */
function makeTooltipFormatter(periods: Period[], kpi: string) {
  return (params: TooltipParam | TooltipParam[]): string => {
    const items = Array.isArray(params) ? params : [params];
    if (items.length === 0) {
      return '';
    }
    const period = periods[items[0].dataIndex];
    if (period === undefined) {
      return '';
    }
    return items
      .map((item) => {
        const raw = item.value;
        const value = raw === null || raw === undefined ? null : Number(raw);
        return formatTrendTooltip({
          period,
          team: item.seriesName ?? '',
          kpi,
          value,
        });
      })
      .join('\n\n')
      .replace(/\n/g, '<br/>');
  };
}

/** Trigger a browser download for an exported PNG blob. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Sanitize a label into a safe file-name fragment. */
function toFileFragment(label: string): string {
  return label.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'chart';
}

interface TrendChartProps {
  kind: 'line' | 'bar';
  trend: KpiTrend;
}

/**
 * A single trend chart (line or bar) for one KPI with a zoom range, a
 * period/team/KPI/value tooltip, and a PNG export control. The ECharts instance
 * is captured on ready so the custom tooltip formatter can be applied and
 * `getDataURL()` used for export.
 */
function TrendChart({ kind, trend }: TrendChartProps) {
  const chartRef = useRef<EChartsLike | null>(null);

  const handleReady = useCallback(
    (instance: unknown) => {
      const chart = instance as EChartsLike;
      chartRef.current = chart;
      // Merge a custom axis tooltip formatter onto the wrapper's option so the
      // tooltip lists Period, Team, KPI, and value for the hovered period.
      chart.setOption({
        tooltip: {
          trigger: 'axis',
          formatter: makeTooltipFormatter(trend.periods, trend.kpi),
        },
      });
    },
    [trend.periods, trend.kpi]
  );

  const handleExport = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const dataUrl = chart.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#FFFFFF',
    });
    const blob = exportService.exportChartToPng(dataUrl);
    triggerDownload(blob, `${toFileFragment(trend.kpi)}-${kind}.png`);
  }, [kind, trend.kpi]);

  const Chart = kind === 'line' ? LineChart : BarChart;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          data-testid={`trend-export-${kind}-${trend.kpi}`}
          onClick={handleExport}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#2563EB',
            background: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: 6,
            padding: '4px 10px',
            cursor: 'pointer',
          }}
        >
          Export PNG
        </button>
      </div>
      <Chart
        categories={trend.categories}
        series={trend.series}
        zoom
        onChartReady={handleReady}
      />
    </div>
  );
}

/** A titled panel wrapper used for each KPI's chart pair. */
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

/**
 * The Trends view. Reads the filtered dataset from the module context and
 * renders a line chart and a bar chart per KPI across the available periods;
 * shows an empty state when no workbook has been parsed or no KPIs are present.
 */
export default function TrendsView() {
  const { filtered } = useLeadership();

  if (filtered === null) {
    return (
      <div
        data-testid="trends-empty"
        style={{ padding: 24, textAlign: 'center', color: '#6B7280', fontSize: 14 }}
      >
        No data available. Upload a workbook to view month-on-month trends.
      </div>
    );
  }

  const trends = computeTrends(filtered);

  if (trends.length === 0) {
    return (
      <div
        data-testid="trends-no-kpi"
        style={{ padding: 24, textAlign: 'center', color: '#6B7280', fontSize: 14 }}
      >
        No KPI data available for trend analysis.
      </div>
    );
  }

  return (
    <section
      data-testid="trends"
      aria-label="Month-on-month Trends"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      {trends.map((trend) => (
        <Panel key={trend.kpi} title={trend.kpi}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            <TrendChart kind="line" trend={trend} />
            <TrendChart kind="bar" trend={trend} />
          </div>
        </Panel>
      ))}
    </section>
  );
}
