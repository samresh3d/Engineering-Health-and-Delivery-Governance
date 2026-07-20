/**
 * Thin ECharts doughnut wrapper for the "KPI Target Achievement" tile.
 *
 * Shows the split of On Target / At Risk / Off Target with a large center
 * readout (e.g. "8 of 15").
 */
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  slices: DonutSlice[];
  /** Big number shown in the center. */
  centerValue?: string;
  /** Small caption under the center number. */
  centerLabel?: string;
  height?: number;
}

export default function DonutChart({
  slices,
  centerValue,
  centerLabel,
  height = 200,
}: DonutChartProps) {
  const option: EChartsOption = {
    tooltip: { trigger: 'item', formatter: '{b}: {c}' },
    legend: { show: false },
    series: [
      {
        type: 'pie',
        radius: ['62%', '84%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: slices.map((s) => ({
          value: s.value,
          name: s.name,
          itemStyle: { color: s.color, borderColor: '#121A2A', borderWidth: 2 },
        })),
      },
    ],
    graphic:
      centerValue !== undefined
        ? [
            {
              type: 'text',
              left: 'center',
              top: '40%',
              style: {
                text: centerValue,
                align: 'center',
                fill: '#F8FAFC',
                fontSize: 30,
                fontWeight: 700,
              },
            },
            {
              type: 'text',
              left: 'center',
              top: '58%',
              style: {
                text: centerLabel ?? '',
                align: 'center',
                fill: '#94A3B8',
                fontSize: 12,
              },
            },
          ]
        : undefined,
  };

  return <ReactECharts option={option} style={{ height, width: '100%' }} notMerge />;
}
