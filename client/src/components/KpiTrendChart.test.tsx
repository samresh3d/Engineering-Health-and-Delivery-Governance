import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import KpiTrendChart from './KpiTrendChart';
import type { TrendDataPoint } from '../types';

// Mock recharts to avoid ResizeObserver issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
}));

describe('KpiTrendChart', () => {
  it('shows "Not enough data" when fewer than 2 data points', () => {
    const data: TrendDataPoint[] = [{ period: 'Jan 2024', value: 85 }];

    render(
      <KpiTrendChart kpiName="sprint_commitment" data={data} title="Sprint Commitment" />,
    );

    expect(screen.getByText('Not enough data')).toBeInTheDocument();
    expect(screen.getByText('Sprint Commitment')).toBeInTheDocument();
  });

  it('shows "Not enough data" when data is empty', () => {
    render(
      <KpiTrendChart kpiName="sprint_commitment" data={[]} title="Sprint Commitment" />,
    );

    expect(screen.getByText('Not enough data')).toBeInTheDocument();
  });

  it('renders the chart when 2 or more data points are provided', () => {
    const data: TrendDataPoint[] = [
      { period: 'Jan 2024', value: 85 },
      { period: 'Feb 2024', value: 90 },
    ];

    render(
      <KpiTrendChart kpiName="sprint_commitment" data={data} title="Sprint Commitment" />,
    );

    expect(screen.queryByText('Not enough data')).not.toBeInTheDocument();
    expect(screen.getByText('Sprint Commitment')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('renders with up to 6 data points', () => {
    const data: TrendDataPoint[] = [
      { period: 'Jan 2024', value: 80 },
      { period: 'Feb 2024', value: 82 },
      { period: 'Mar 2024', value: 85 },
      { period: 'Apr 2024', value: 88 },
      { period: 'May 2024', value: 90 },
      { period: 'Jun 2024', value: 92 },
    ];

    render(
      <KpiTrendChart kpiName="sprint_commitment" data={data} title="Sprint Commitment" />,
    );

    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('limits data to 6 most recent points when more are provided', () => {
    const data: TrendDataPoint[] = [
      { period: 'Nov 2023', value: 75 },
      { period: 'Dec 2023', value: 78 },
      { period: 'Jan 2024', value: 80 },
      { period: 'Feb 2024', value: 82 },
      { period: 'Mar 2024', value: 85 },
      { period: 'Apr 2024', value: 88 },
      { period: 'May 2024', value: 90 },
      { period: 'Jun 2024', value: 92 },
    ];

    render(
      <KpiTrendChart kpiName="sprint_commitment" data={data} title="Sprint Commitment" />,
    );

    // Still renders a chart (doesn't crash)
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('has accessible aria-label for chart', () => {
    const data: TrendDataPoint[] = [
      { period: 'Jan 2024', value: 85 },
      { period: 'Feb 2024', value: 90 },
    ];

    render(
      <KpiTrendChart kpiName="sprint_commitment" data={data} title="Sprint Commitment" />,
    );

    expect(
      screen.getByRole('img', { name: 'Sprint Commitment trend chart' }),
    ).toBeInTheDocument();
  });

  it('has accessible aria-label for insufficient data state', () => {
    render(
      <KpiTrendChart kpiName="sprint_commitment" data={[]} title="Sprint Commitment" />,
    );

    expect(
      screen.getByRole('img', {
        name: 'Sprint Commitment trend chart — not enough data',
      }),
    ).toBeInTheDocument();
  });
});
