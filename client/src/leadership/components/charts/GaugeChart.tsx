/**
 * Thin ECharts gauge wrapper for the overall health score (0–100).
 *
 * Renders a single-value gauge with a colored progress arc and a large center
 * readout, matching the Overview's "Overall Engineering Health Score" tile.
 */
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

export interface GaugeChartProps {
  /** Value 0–100. */
  value: number;
  /** Arc/label color. */
  color?: string;
  /** Optional caption shown under the number (e.g. "Good"). */
  label?: string;
  height?: number;
}

export default function GaugeChart({
  value,
  color = '#22C55E',
  label,
  height = 220,
}: GaugeChartProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const option: EChartsOption = {
    series: [
      {
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 100,
        progress: {
          show: true,
          width: 14,
          roundCap: true,
          itemStyle: { color },
        },
        axisLine: {
          lineStyle: { width: 14, color: [[1, '#1E293B']] },
        },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        anchor: { show: false },
        title: {
          show: Boolean(label),
          offsetCenter: [0, '58%'],
          color,
          fontSize: 12,
          fontWeight: 600,
        },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, '0%'],
          fontSize: 34,
          fontWeight: 700,
          color: '#F8FAFC',
          formatter: (v: number) => `${Math.round(v)}`,
        },
        data: [{ value: clamped, name: label ?? '' }],
      },
    ],
  };

  return <ReactECharts option={option} style={{ height, width: '100%' }} notMerge />;
}
