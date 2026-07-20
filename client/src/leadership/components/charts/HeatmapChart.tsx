/**
 * Thin ECharts heat-map wrapper.
 *
 * Accepts plain data props (x/y labels + [xIndex, yIndex, value] cells) with no
 * coupling to the Dashboard_Model internals. An optional discrete RAG mode maps
 * cell values (0=Red, 1=Amber, 2=Green, 3=Unknown) to the shared {@link ragColors}
 * palette so health heat maps render consistently (Requirements 5.8, 13.6, 7.2).
 */
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { ragColors } from './ragColors';

/** A single heat-map cell: [xIndex, yIndex, value]. */
export type HeatmapCell = [number, number, number | null];

export interface HeatmapChartProps {
  /** X-axis category labels. */
  xLabels: string[];
  /** Y-axis category labels. */
  yLabels: string[];
  /** Cells referencing xLabels/yLabels by index. */
  data: HeatmapCell[];
  /**
   * When true, render a discrete RAG scale using the shared palette where cell
   * values are ordinals: 0=Red, 1=Amber, 2=Green, 3=Unknown.
   */
  ragScale?: boolean;
  /** Numeric range for the continuous color scale (ignored when ragScale). */
  min?: number;
  max?: number;
  height?: number;
  onChartReady?: (instance: unknown) => void;
}

export default function HeatmapChart({
  xLabels,
  yLabels,
  data,
  ragScale = false,
  min = 0,
  max = 100,
  height = 360,
  onChartReady,
}: HeatmapChartProps) {
  const visualMap: EChartsOption['visualMap'] = ragScale
    ? {
        type: 'piecewise',
        min: 0,
        max: 3,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        pieces: [
          { value: 0, label: 'Red', color: ragColors.Red },
          { value: 1, label: 'Amber', color: ragColors.Amber },
          { value: 2, label: 'Green', color: ragColors.Green },
          { value: 3, label: 'Unknown', color: ragColors.Unknown },
        ],
      }
    : {
        type: 'continuous',
        min,
        max,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        inRange: { color: [ragColors.Red, ragColors.Amber, ragColors.Green] },
      };

  const option: EChartsOption = {
    tooltip: { position: 'top' },
    grid: { left: 96, right: 24, top: 24, bottom: 64, containLabel: true },
    xAxis: { type: 'category', data: xLabels, splitArea: { show: true } },
    yAxis: { type: 'category', data: yLabels, splitArea: { show: true } },
    visualMap,
    series: [
      {
        type: 'heatmap',
        data,
        label: { show: false },
        emphasis: { itemStyle: { shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.3)' } },
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
