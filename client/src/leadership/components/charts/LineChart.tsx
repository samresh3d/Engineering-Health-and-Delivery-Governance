/**
 * Thin ECharts line-chart wrapper.
 *
 * Accepts plain data props (categories + named series) with no coupling to the
 * Dashboard_Model internals. When a series carries a Health_Status, the shared
 * {@link ragColors} map colors that series so Green/Amber/Red/Unknown render
 * consistently across views (Requirements 5.8, 13.6, 8.1).
 */
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { HealthStatus } from '../../model/types';
import { ragColor } from './ragColors';

/** One plottable series for a chart wrapper. */
export interface ChartSeries {
  /** Series label shown in legend/tooltip. */
  name: string;
  /** Ordered values aligned to the chart categories; `null` = gap. */
  data: (number | null)[];
  /** Optional health status used to color the series via {@link ragColors}. */
  status?: HealthStatus;
}

export interface LineChartProps {
  /** X-axis category labels (e.g. period keys). */
  categories: string[];
  /** One or more data series. */
  series: ChartSeries[];
  /** Enable a data-zoom range selector (Req 8.3). */
  zoom?: boolean;
  /** Chart height in pixels. */
  height?: number;
  /** Optional ECharts event/instance ref forwarding via onChartReady. */
  onChartReady?: (instance: unknown) => void;
}

export default function LineChart({
  categories,
  series,
  zoom = false,
  height = 320,
  onChartReady,
}: LineChartProps) {
  const option: EChartsOption = {
    tooltip: { trigger: 'axis' },
    legend: { show: series.length > 1 },
    grid: { left: 48, right: 24, top: 32, bottom: zoom ? 64 : 32 },
    xAxis: { type: 'category', data: categories, boundaryGap: false },
    yAxis: { type: 'value' },
    dataZoom: zoom ? [{ type: 'slider' }, { type: 'inside' }] : undefined,
    series: series.map((s) => ({
      name: s.name,
      type: 'line',
      data: s.data,
      connectNulls: false,
      ...(s.status
        ? { itemStyle: { color: ragColor(s.status) }, lineStyle: { color: ragColor(s.status) } }
        : {}),
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
