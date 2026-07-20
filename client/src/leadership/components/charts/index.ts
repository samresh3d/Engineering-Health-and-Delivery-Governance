/**
 * Barrel export for the Leadership Dashboard chart wrappers and shared RAG
 * color mapping. Views import chart wrappers from here so the shared
 * {@link ragColors} palette is applied consistently across every chart
 * (Requirements 5.8, 6.2, 13.6).
 */
export { ragColors, ragColor } from './ragColors';
export { default as LineChart } from './LineChart';
export { default as BarChart } from './BarChart';
export { default as HeatmapChart } from './HeatmapChart';
export { default as RadarChart } from './RadarChart';
export { default as Sparkline } from './Sparkline';
export { default as GaugeChart } from './GaugeChart';
export { default as DonutChart } from './DonutChart';
export { default as GroupedBarChart } from './GroupedBarChart';
export type { GaugeChartProps } from './GaugeChart';
export type { DonutChartProps, DonutSlice } from './DonutChart';
export type { GroupedBarChartProps, GroupedBarSeries } from './GroupedBarChart';
export type { ChartSeries, LineChartProps } from './LineChart';
export type { BarChartProps } from './BarChart';
export type { HeatmapChartProps, HeatmapCell } from './HeatmapChart';
export type { RadarChartProps, RadarIndicator, RadarSeries } from './RadarChart';
export type { SparklineProps } from './Sparkline';
