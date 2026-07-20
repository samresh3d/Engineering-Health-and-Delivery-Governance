/**
 * Thin ECharts radar-chart wrapper.
 *
 * Accepts plain data props (indicators + named series) with no coupling to the
 * Dashboard_Model internals. Series carrying a Health_Status are colored via
 * the shared {@link ragColors} map for consistent rendering
 * (Requirements 5.8, 13.6, 7.2).
 */
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { HealthStatus } from '../../model/types';
import { ragColor } from './ragColors';

/** A radar axis definition. */
export interface RadarIndicator {
  name: string;
  max?: number;
}

/** One radar series: a set of values aligned to the indicators. */
export interface RadarSeries {
  name: string;
  values: (number | null)[];
  status?: HealthStatus;
}

export interface RadarChartProps {
  indicators: RadarIndicator[];
  series: RadarSeries[];
  height?: number;
  onChartReady?: (instance: unknown) => void;
}

export default function RadarChart({
  indicators,
  series,
  height = 360,
  onChartReady,
}: RadarChartProps) {
  const option: EChartsOption = {
    tooltip: {},
    legend: { show: series.length > 1 },
    radar: {
      indicator: indicators.map((i) => ({ name: i.name, max: i.max })),
    },
    series: [
      {
        type: 'radar',
        data: series.map((s) => ({
          name: s.name,
          value: s.values.map((v) => (v == null ? 0 : v)),
          ...(s.status
            ? { itemStyle: { color: ragColor(s.status) }, lineStyle: { color: ragColor(s.status) } }
            : {}),
        })),
      },
    ],
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
