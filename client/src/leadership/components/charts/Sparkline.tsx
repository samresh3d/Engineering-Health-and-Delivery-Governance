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
  /**
   * Optional category labels aligned to `data` (e.g. month names). When
   * provided a hover tooltip is enabled showing "Label: value" for each point.
   */
  labels?: string[];
  /** Force-enable the hover tooltip even without labels. */
  showTooltip?: boolean;
  /** Optional value formatter for the tooltip. */
  formatValue?: (v: number) => string;
}

export default function Sparkline({
  data,
  status,
  area = false,
  width = '100%',
  height = 32,
  labels,
  showTooltip,
  formatValue,
}: SparklineProps) {
  const color = ragColor(status);
  const categories = labels ?? data.map((_, i) => String(i));
  const tooltipEnabled = showTooltip || Boolean(labels);

  const option: EChartsOption = {
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { type: 'category', show: false, boundaryGap: false, data: categories },
    yAxis: { type: 'value', show: false, scale: true },
    tooltip: tooltipEnabled
      ? {
          trigger: 'axis',
          confine: true,
          backgroundColor: '#0E1626',
          borderColor: '#1E293B',
          textStyle: { color: '#E5E7EB', fontSize: 11 },
          formatter: (params: unknown) => {
            const arr = params as { dataIndex: number; data: number | null }[];
            if (!arr || arr.length === 0) return '';
            const p = arr[0];
            const label = categories[p.dataIndex] ?? '';
            const v = p.data;
            const valText = v === null || v === undefined ? 'N/A' : formatValue ? formatValue(Number(v)) : String(v);
            return `${label}: <b>${valText}</b>`;
          },
        }
      : undefined,
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
