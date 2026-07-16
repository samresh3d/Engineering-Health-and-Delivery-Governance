import { useEffect, useState, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { colors, ragColors } from '../theme';
import { getStoredUser } from '../auth';
import { getTrends } from '../api/client';
import type { AnalyticsFilter, TrendDataPoint } from '../api/client';
import type { KpiName } from '../types';

export type { TrendDataPoint } from '../api/client';

/** Team series data for multi-team overlay */
export interface TeamTrendSeries {
  team: string;
  data: TrendDataPoint[];
}

export interface KpiTrendChartProps {
  /** Current analytics filter state — re-fetches when this changes */
  filter?: AnalyticsFilter;
  /** Optional: pre-loaded single-team data (skips fetch if provided) */
  data?: TrendDataPoint[];
  /** Optional: pre-loaded multi-team data (skips fetch if provided) */
  multiTeamData?: TeamTrendSeries[];
  /** Chart title (used when data is provided directly) */
  title?: string;
  /** Initially selected KPI */
  initialKpi?: KpiName;
}

/** All 9 KPI options for the selector */
const KPI_OPTIONS: { value: KpiName; label: string }[] = [
  { value: 'sprint_commitment', label: 'Sprint Commitment' },
  { value: 'release_success_rate', label: 'Release Success Rate' },
  { value: 'deployment_frequency', label: 'Deployment Frequency' },
  { value: 'capacity_utilization', label: 'Capacity Utilization' },
  { value: 'ai_efficiency', label: 'AI Efficiency' },
  { value: 'uat_predictability', label: 'UAT Predictability' },
  { value: 'dev_cycle_time', label: 'Dev Cycle Time' },
  { value: 'story_drop_rate', label: 'Story Drop Rate' },
  { value: 'rollback_rate', label: 'Rollback Rate' },
];

/** Distinct colors for multi-team series lines */
const TEAM_COLORS = [
  '#6B0F2B', '#2196F3', '#4CAF50', '#FF9800', '#9C27B0',
  '#00BCD4', '#795548', '#E91E63', '#3F51B5', '#009688',
];

/** Map RAG status to the theme colors */
function ragColor(status: string | undefined): string {
  switch (status) {
    case 'green':
      return ragColors.green;
    case 'amber':
      return ragColors.amber;
    case 'red':
      return ragColors.red;
    default:
      return colors.primary;
  }
}

/** Custom dot that renders with RAG status color */
function RagDot(props: {
  cx?: number;
  cy?: number;
  payload?: TrendDataPoint;
  index?: number;
}) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;

  const fill = ragColor(payload.ragStatus);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={fill}
      stroke="#fff"
      strokeWidth={2}
    />
  );
}

/**
 * KpiTrendChart — Enhanced Recharts LineChart for KPI trend analysis.
 *
 * Features:
 * - Fetches trend data from /api/analytics/trends when filter changes
 * - KPI selector dropdown to choose which metric to display
 * - Multi-team series overlay for Leadership/Super_Admin
 * - RAG status colors on data points (green, amber, red)
 * - Insufficient data state when < 2 points available
 */
export default function KpiTrendChart({
  filter,
  data: externalData,
  multiTeamData: externalMultiTeam,
  title,
  initialKpi = 'sprint_commitment',
}: KpiTrendChartProps) {
  const [selectedKpi, setSelectedKpi] = useState<KpiName>(initialKpi);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [multiTeamSeries, setMultiTeamSeries] = useState<TeamTrendSeries[]>([]);
  const [loading, setLoading] = useState(false);
  const [insufficientData, setInsufficientData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const user = getStoredUser();
  const isMultiTeamRole = user?.role === 'Leadership' || user?.role === 'Super_Admin';

  // If external data is provided directly, use it without fetching
  const useExternalData = externalData !== undefined || externalMultiTeam !== undefined;

  const fetchTrendData = useCallback(async () => {
    if (useExternalData) return;

    setLoading(true);
    setError(null);
    setInsufficientData(false);

    try {
      const response = await getTrends(selectedKpi, filter);

      if (response.insufficientData) {
        setInsufficientData(true);
        setTrendData([]);
        setMultiTeamSeries([]);
      } else if (response.data) {
        // Check if the response contains multi-team data (array of arrays or keyed by team)
        if (Array.isArray(response.data)) {
          setTrendData(response.data);
          setMultiTeamSeries([]);
          // Still insufficient if fewer than 2 points
          if (response.data.length < 2) {
            setInsufficientData(true);
          }
        }
      } else {
        setTrendData([]);
        setMultiTeamSeries([]);
        setInsufficientData(true);
      }
    } catch (err) {
      setError('Failed to load trend data');
      setTrendData([]);
      setMultiTeamSeries([]);
    } finally {
      setLoading(false);
    }
  }, [selectedKpi, filter, useExternalData]);

  useEffect(() => {
    fetchTrendData();
  }, [fetchTrendData]);

  // Resolve which data to display
  const displayData = useExternalData ? (externalData ?? []) : trendData;
  const displayMultiTeam = useExternalData ? (externalMultiTeam ?? []) : multiTeamSeries;
  const hasMultiTeam = displayMultiTeam.length > 0;

  // Determine if there's insufficient data
  const showInsufficientMessage =
    insufficientData ||
    (!loading && !error && !hasMultiTeam && displayData.length < 2);

  const chartTitle = title ?? KPI_OPTIONS.find((k) => k.value === selectedKpi)?.label ?? selectedKpi;

  // Insufficient data state
  if (showInsufficientMessage && !loading) {
    return (
      <div
        style={{
          padding: '24px',
          backgroundColor: colors.secondary,
          borderRadius: '8px',
          border: `1px solid ${colors.border}`,
        }}
      >
        {/* KPI Selector */}
        {!useExternalData && (
          <div style={{ marginBottom: '16px' }}>
            <select
              value={selectedKpi}
              onChange={(e) => setSelectedKpi(e.target.value as KpiName)}
              aria-label="Select KPI for trend"
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: `1px solid ${colors.border}`,
                fontSize: '14px',
                fontWeight: 500,
                color: colors.text,
                background: colors.background,
                cursor: 'pointer',
              }}
            >
              {KPI_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div
          style={{
            textAlign: 'center',
            minHeight: '200px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          role="img"
          aria-label={`${chartTitle} trend chart — not enough data`}
        >
          <h4 style={{ margin: '0 0 8px', color: colors.text }}>{chartTitle}</h4>
          <p style={{ color: '#666', margin: 0 }}>
            Not enough data points for trend analysis
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div
        style={{
          padding: '24px',
          backgroundColor: colors.secondary,
          borderRadius: '8px',
          border: `1px solid ${colors.border}`,
          textAlign: 'center',
          minHeight: '280px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p style={{ color: colors.textSecondary, fontSize: '14px' }}>
          Loading trend data...
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        style={{
          padding: '24px',
          backgroundColor: '#FFF5F5',
          borderRadius: '8px',
          border: '1px solid #FED7D7',
          textAlign: 'center',
          minHeight: '200px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p style={{ color: colors.red, fontSize: '14px', marginBottom: '8px' }}>
          ⚠️ {error}
        </p>
        <button
          onClick={fetchTrendData}
          style={{
            padding: '6px 16px',
            background: colors.primary,
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Build chart data for multi-team overlay
  if (hasMultiTeam && isMultiTeamRole) {
    return renderMultiTeamChart(displayMultiTeam, chartTitle, selectedKpi, setSelectedKpi, useExternalData);
  }

  // Single-team line chart with RAG-colored dots
  // Limit to 6 most recent periods
  const chartData = displayData.slice(-6);

  return (
    <div
      style={{
        padding: '16px',
        backgroundColor: colors.background,
        borderRadius: '8px',
        border: `1px solid ${colors.border}`,
      }}
      role="img"
      aria-label={`${chartTitle} trend chart`}
    >
      {/* KPI Selector */}
      {!useExternalData && (
        <div style={{ marginBottom: '12px' }}>
          <select
            value={selectedKpi}
            onChange={(e) => setSelectedKpi(e.target.value as KpiName)}
            aria-label="Select KPI for trend"
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: `1px solid ${colors.border}`,
              fontSize: '14px',
              fontWeight: 500,
              color: colors.text,
              background: colors.background,
              cursor: 'pointer',
            }}
          >
            {KPI_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <h4 style={{ margin: '0 0 12px', color: colors.text }}>{chartTitle}</h4>

      <ResponsiveContainer width="100%" height={260}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 12, fill: colors.text }}
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 12, fill: colors.text }} tickLine={false} />
          <Tooltip
            contentStyle={{ fontSize: '13px', borderRadius: '4px' }}
            formatter={(value: number, _name: string, entry: { payload?: TrendDataPoint }) => {
              const status = entry.payload?.ragStatus;
              return [
                <span key="val" style={{ color: ragColor(status) }}>
                  {value}
                </span>,
                'Value',
              ];
            }}
            labelFormatter={(label: string) => `Period: ${label}`}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={colors.primary}
            strokeWidth={2}
            dot={<RagDot />}
            activeDot={{ r: 7, stroke: colors.primary, strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* RAG Legend */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          justifyContent: 'center',
          marginTop: '8px',
          fontSize: '12px',
          color: colors.textSecondary,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: ragColors.green, display: 'inline-block' }} />
          Green
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: ragColors.amber, display: 'inline-block' }} />
          Amber
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: ragColors.red, display: 'inline-block' }} />
          Red
        </span>
      </div>
    </div>
  );
}

/**
 * Renders a multi-team overlay chart with a line per team.
 * Each team gets a distinct color. Data points still show RAG status on hover.
 */
function renderMultiTeamChart(
  series: TeamTrendSeries[],
  chartTitle: string,
  selectedKpi: KpiName,
  setSelectedKpi: (kpi: KpiName) => void,
  useExternalData: boolean,
) {
  // Merge all team data into a single array keyed by period
  const periodMap = new Map<string, Record<string, number | null>>();

  for (const teamSeries of series) {
    for (const point of teamSeries.data) {
      if (!periodMap.has(point.period)) {
        periodMap.set(point.period, {});
      }
      const entry = periodMap.get(point.period)!;
      entry[teamSeries.team] = point.value;
    }
  }

  // Convert map to array for Recharts
  const chartData = Array.from(periodMap.entries()).map(([period, values]) => ({
    period,
    ...values,
  }));

  // Check insufficient data for multi-team
  if (chartData.length < 2) {
    return (
      <div
        style={{
          padding: '24px',
          backgroundColor: colors.secondary,
          borderRadius: '8px',
          border: `1px solid ${colors.border}`,
          textAlign: 'center',
          minHeight: '200px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
        role="img"
        aria-label={`${chartTitle} trend chart — not enough data`}
      >
        <h4 style={{ margin: '0 0 8px', color: colors.text }}>{chartTitle}</h4>
        <p style={{ color: '#666', margin: 0 }}>
          Not enough data points for trend analysis
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '16px',
        backgroundColor: colors.background,
        borderRadius: '8px',
        border: `1px solid ${colors.border}`,
      }}
      role="img"
      aria-label={`${chartTitle} trend chart — multi-team`}
    >
      {/* KPI Selector */}
      {!useExternalData && (
        <div style={{ marginBottom: '12px' }}>
          <select
            value={selectedKpi}
            onChange={(e) => setSelectedKpi(e.target.value as KpiName)}
            aria-label="Select KPI for trend"
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: `1px solid ${colors.border}`,
              fontSize: '14px',
              fontWeight: 500,
              color: colors.text,
              background: colors.background,
              cursor: 'pointer',
            }}
          >
            {KPI_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <h4 style={{ margin: '0 0 12px', color: colors.text }}>
        {chartTitle} — Team Comparison
      </h4>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 12, fill: colors.text }}
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 12, fill: colors.text }} tickLine={false} />
          <Tooltip
            contentStyle={{ fontSize: '13px', borderRadius: '4px' }}
            labelFormatter={(label: string) => `Period: ${label}`}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
          />
          {series.map((teamSeries, index) => (
            <Line
              key={teamSeries.team}
              type="monotone"
              dataKey={teamSeries.team}
              name={teamSeries.team}
              stroke={TEAM_COLORS[index % TEAM_COLORS.length]}
              strokeWidth={2}
              dot={{ fill: TEAM_COLORS[index % TEAM_COLORS.length], r: 4 }}
              activeDot={{ r: 6 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
