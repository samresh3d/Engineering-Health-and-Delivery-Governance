/**
 * GroupedBarChart — month-wise grouped vertical bars for comparing KPI values.
 *
 * Each category (month) gets a group of bars, one per series (KPI). A selected
 * series can be highlighted while the rest are muted, per-series target/
 * reference lines can be drawn, and hover tooltips show exact values.
 */
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

export interface GroupedBarSeries {
  name: string;
  data: (number | null)[];
  color: string;
  /** Optional target/reference value → drawn as a dashed line. */
  target?: number | null;
  /** When true, render this series muted (lower opacity). */
  muted?: boolean;
  /** Optional unit hint for the tooltip ("%" etc.). */
  unitSuffix?: string;
}

export interface GroupedBarChartProps {
  categories: string[];
  series: GroupedBarSeries[];
  height?: number;
}

export default function GroupedBarChart({ categories, series, height = 260 }: GroupedBarChartProps) {
  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      backgroundColor: '#0E1626',
      borderColor: '#1E293B',
      textStyle: { color: '#E5E7EB', fontSize: 12 },
    },
    legend: {
      show: true,
      textStyle: { color: '#94A3B8', fontSize: 11 },
      top: 0,
      type: 'scroll',
    },
    grid: { left: 44, right: 16, top: 34, bottom: 28 },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { color: '#94A3B8', fontSize: 11 },
      axisLine: { lineStyle: { color: '#1E293B' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#64748B', fontSize: 11 },
      splitLine: { lineStyle: { color: '#172033' } },
    },
    series: series.map((s) => ({
      name: s.name,
      type: 'bar' as const,
      data: s.data,
      itemStyle: {
        color: s.color,
        opacity: s.muted ? 0.32 : 1,
        borderRadius: [3, 3, 0, 0],
      },
      emphasis: { focus: 'series' as const },
      // Draw a dashed target/reference line for this series when provided.
      markLine:
        s.target !== undefined && s.target !== null
          ? {
              silent: true,
              symbol: 'none',
              lineStyle: { color: s.color, type: 'dashed' as const, opacity: s.muted ? 0.25 : 0.7 },
              label: {
                show: !s.muted,
                position: 'insideEndTop' as const,
                color: s.color,
                fontSize: 10,
                formatter: `${s.name} target`,
              },
              data: [{ yAxis: s.target }],
            }
          : undefined,
    })),
  };

  return <ReactECharts option={option} style={{ height, width: '100%' }} notMerge />;
}
