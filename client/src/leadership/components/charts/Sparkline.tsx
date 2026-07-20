/**
 * Thin ECharts sparkline wrapper — a minimal line chart without axes, legend,
 * or grid, sized for inline use inside Executive Summary cards (Req 6.2).
 *
 * Accepts a plain array of values with no coupling to the Dashboard_Model
 * internals. An optional Health_Status colors the line via the shared
 * {@link ragColors} map for consistent Green/Amber/Red/Unknown rendering
 * (Requirements 5.8, 13.6).
 */
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { HealthStatus } from '../../model/types';
import { ragColor } from './ragColors';

export interface SparklineProps {
  /** Ordered values; `null` entries are gaps. */
  data: (number | null)[];
  /** Optional health status used to color the line. */
  status?: HealthStatus;
  /** Show area fill under the line. */
  area?: boolean;
  /** Width in px, or a CSS width string (defaults to full container width). */
  width?: number | string;
  height?: number;
}

export default function Sparkline({
  data,
  status,
  area = false,
  width = '100%',
  height = 32,
}: SparklineProps) {
  const color = ragColor(status);
  const option: EChartsOption = {
    // No axes, grid padding, tooltip, or legend — minimal inline chart.
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { type: 'category', show: false, boundaryGap: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value', show: false, scale: true },
    series: [
      {
        type: 'line',
        data,
        showSymbol: false,
        smooth: true,
        connectNulls: true,
        lineStyle: { color, width: 1.5 },
        itemStyle: { color },
        ...(area ? { areaStyle: { color, opacity: 0.15 } } : {}),
      },
    ],
  };

  return <ReactECharts option={option} style={{ height, width }} notMerge />;
}
