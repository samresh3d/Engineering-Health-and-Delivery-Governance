import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TrendDataPoint } from '../types';
import { colors } from '../theme';

interface KpiTrendChartProps {
  kpiName: string;
  data: TrendDataPoint[];
  title: string;
}

/**
 * KpiTrendChart — Recharts LineChart showing up to 6 sprint periods per KPI.
 * Requires a minimum of 2 data points to render; otherwise shows a message.
 */
export default function KpiTrendChart({ data, title }: KpiTrendChartProps) {
  if (data.length < 2) {
    return (
      <div
        style={{
          padding: '24px',
          textAlign: 'center',
          backgroundColor: colors.secondary,
          borderRadius: '8px',
          minHeight: '200px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
        role="img"
        aria-label={`${title} trend chart — not enough data`}
      >
        <h4 style={{ margin: '0 0 8px', color: colors.text }}>{title}</h4>
        <p style={{ color: '#666', margin: 0 }}>Not enough data</p>
      </div>
    );
  }

  // Limit to 6 most recent periods
  const chartData = data.slice(-6);

  return (
    <div
      style={{
        padding: '16px',
        backgroundColor: colors.background,
        borderRadius: '8px',
        border: '1px solid #e0e0e0',
      }}
      role="img"
      aria-label={`${title} trend chart`}
    >
      <h4 style={{ margin: '0 0 12px', color: colors.text }}>{title}</h4>
      <ResponsiveContainer width="100%" height={220}>
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
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={colors.primary}
            strokeWidth={2}
            dot={{ fill: colors.primary, r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
