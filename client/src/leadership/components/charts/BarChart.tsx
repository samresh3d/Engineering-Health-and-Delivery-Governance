/**
 * Thin ECharts bar-chart wrapper (supports clustered bars).
 *
 * Accepts plain data props (categories + named series) with no coupling to the
 * Dashboard_Model internals. Series carrying a Health_Status are colored via
 * the shared {@link ragColors} map for consistent Green/Amber/Red/Unknown
 * rendering (Requirements 5.8, 13.6, 7.2, 8.1).
 */
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { ChartSeries } from './LineChart';
import { ragColor } from './ragColors';

export interface BarChartProps {
  /** X-axis category labels (e.g. teams or period keys). */
  categories: string[];
  /** One or more data series; multiple series render as clustered bars. */
  series: ChartSeries[];
  /** Chart height in pixels. */
  height?: number;
  /** Enable a data-zoom range selector. */
  zoom?: boolean;
  onChartReady?: (instance: unknown) => void;
}

export default function BarChart({
  categories,
  series,
  height = 320,
  zoom = false,
  onChartReady,
}: BarChartProps) {
  const option: EChartsOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { show: series.length > 1 },
    grid: { left: 48, right: 24, top: 32, bottom: zoom ? 64 : 32 },
    xAxis: { type: 'category', data: categories },
    yAxis: { type: 'value' },
    dataZoom: zoom ? [{ type: 'slider' }, { type: 'inside' }] : undefined,
    series: series.map((s) => ({
      name: s.name,
      type: 'bar',
      data: s.data,
      ...(s.status ? { itemStyle: { color: ragColor(s.status) } } : {}),
    })),
  };

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      notMerge
      onChartReady={onChartReady}
    />
  );
}
