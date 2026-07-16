import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import KpiTrendChart from './KpiTrendChart';
import type { TrendDataPoint, TeamTrendSeries } from './KpiTrendChart';

// Mock recharts to avoid ResizeObserver issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: ({ name, dataKey }: { name?: string; dataKey?: string }) => (
    <div data-testid="line" data-name={name} data-key={dataKey} />
  ),
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

// Mock the auth module
vi.mock('../auth', () => ({
  getStoredUser: vi.fn(() => ({
    userId: 'user-1',
    username: 'testuser',
    role: 'Engineering_Manager',
    token: 'test-token',
    teamId: 'team-alpha',
  })),
  getStoredToken: vi.fn(() => 'test-token'),
  clearAuth: vi.fn(),
}));

// Mock the API client
vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
  getTrends: vi.fn(),
}));

import { getStoredUser } from '../auth';
import { getTrends } from '../api/client';

const mockGetStoredUser = getStoredUser as ReturnType<typeof vi.fn>;
const mockGetTrends = getTrends as ReturnType<typeof vi.fn>;

describe('KpiTrendChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStoredUser.mockReturnValue({
      userId: 'user-1',
      username: 'testuser',
      role: 'Engineering_Manager',
      token: 'test-token',
      teamId: 'team-alpha',
    });
    mockGetTrends.mockResolvedValue({
      success: true,
      data: [],
      insufficientData: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Insufficient data state', () => {
    it('shows "Not enough data points for trend analysis" when data has fewer than 2 points', () => {
      const data: TrendDataPoint[] = [
        { period: 'Jan 2024', value: 85, ragStatus: 'green' },
      ];

      render(
        <KpiTrendChart data={data} title="Sprint Commitment" />,
      );

      expect(
        screen.getByText('Not enough data points for trend analysis'),
      ).toBeInTheDocument();
      expect(screen.getByText('Sprint Commitment')).toBeInTheDocument();
    });

    it('shows insufficient data message when data is empty', () => {
      render(<KpiTrendChart data={[]} title="Sprint Commitment" />);

      expect(
        screen.getByText('Not enough data points for trend analysis'),
      ).toBeInTheDocument();
    });

    it('has accessible aria-label for insufficient data state', () => {
      render(<KpiTrendChart data={[]} title="Sprint Commitment" />);

      expect(
        screen.getByRole('img', {
          name: 'Sprint Commitment trend chart — not enough data',
        }),
      ).toBeInTheDocument();
    });
  });

  describe('Single-team chart rendering', () => {
    it('renders the line chart when 2 or more data points are provided', () => {
      const data: TrendDataPoint[] = [
        { period: 'Jan 2024', value: 85, ragStatus: 'green' },
        { period: 'Feb 2024', value: 90, ragStatus: 'green' },
      ];

      render(<KpiTrendChart data={data} title="Sprint Commitment" />);

      expect(
        screen.queryByText('Not enough data points for trend analysis'),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Sprint Commitment')).toBeInTheDocument();
      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });

    it('renders with up to 6 data points', () => {
      const data: TrendDataPoint[] = [
        { period: 'Jan 2024', value: 80, ragStatus: 'green' },
        { period: 'Feb 2024', value: 82, ragStatus: 'green' },
        { period: 'Mar 2024', value: 85, ragStatus: 'amber' },
        { period: 'Apr 2024', value: 88, ragStatus: 'green' },
        { period: 'May 2024', value: 90, ragStatus: 'green' },
        { period: 'Jun 2024', value: 92, ragStatus: 'green' },
      ];

      render(<KpiTrendChart data={data} title="Sprint Commitment" />);

      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });

    it('has accessible aria-label for chart', () => {
      const data: TrendDataPoint[] = [
        { period: 'Jan 2024', value: 85, ragStatus: 'green' },
        { period: 'Feb 2024', value: 90, ragStatus: 'green' },
      ];

      render(<KpiTrendChart data={data} title="Sprint Commitment" />);

      expect(
        screen.getByRole('img', { name: 'Sprint Commitment trend chart' }),
      ).toBeInTheDocument();
    });

    it('displays RAG legend under the chart', () => {
      const data: TrendDataPoint[] = [
        { period: 'Jan 2024', value: 85, ragStatus: 'green' },
        { period: 'Feb 2024', value: 70, ragStatus: 'red' },
      ];

      render(<KpiTrendChart data={data} title="Sprint Commitment" />);

      expect(screen.getByText('Green')).toBeInTheDocument();
      expect(screen.getByText('Amber')).toBeInTheDocument();
      expect(screen.getByText('Red')).toBeInTheDocument();
    });
  });

  describe('Multi-team series overlay', () => {
    beforeEach(() => {
      // Set user to Leadership so multi-team chart renders
      mockGetStoredUser.mockReturnValue({
        userId: 'user-2',
        username: 'leader',
        role: 'Leadership',
        token: 'test-token',
        teamId: null,
      });
    });

    it('renders multi-team chart with Legend for Leadership users', () => {
      const multiTeamData: TeamTrendSeries[] = [
        {
          team: 'Team Alpha',
          data: [
            { period: 'Jan 2024', value: 85, ragStatus: 'green' },
            { period: 'Feb 2024', value: 90, ragStatus: 'green' },
          ],
        },
        {
          team: 'Team Beta',
          data: [
            { period: 'Jan 2024', value: 80, ragStatus: 'amber' },
            { period: 'Feb 2024', value: 82, ragStatus: 'green' },
          ],
        },
      ];

      render(
        <KpiTrendChart
          multiTeamData={multiTeamData}
          title="Sprint Commitment"
        />,
      );

      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
      expect(screen.getByTestId('legend')).toBeInTheDocument();
      // Should have two Line elements
      const lines = screen.getAllByTestId('line');
      expect(lines.length).toBe(2);
    });

    it('renders multi-team chart for Super_Admin users', () => {
      mockGetStoredUser.mockReturnValue({
        userId: 'user-3',
        username: 'admin',
        role: 'Super_Admin',
        token: 'test-token',
        teamId: null,
      });

      const multiTeamData: TeamTrendSeries[] = [
        {
          team: 'Team Alpha',
          data: [
            { period: 'Jan 2024', value: 85, ragStatus: 'green' },
            { period: 'Feb 2024', value: 90, ragStatus: 'green' },
          ],
        },
        {
          team: 'Team Beta',
          data: [
            { period: 'Jan 2024', value: 75, ragStatus: 'red' },
            { period: 'Feb 2024', value: 80, ragStatus: 'amber' },
          ],
        },
      ];

      render(
        <KpiTrendChart
          multiTeamData={multiTeamData}
          title="Sprint Commitment"
        />,
      );

      expect(
        screen.getByRole('img', {
          name: 'Sprint Commitment trend chart — multi-team',
        }),
      ).toBeInTheDocument();
    });

    it('shows insufficient data when multi-team data has < 2 periods', () => {
      const multiTeamData: TeamTrendSeries[] = [
        {
          team: 'Team Alpha',
          data: [{ period: 'Jan 2024', value: 85, ragStatus: 'green' }],
        },
        {
          team: 'Team Beta',
          data: [{ period: 'Jan 2024', value: 80, ragStatus: 'amber' }],
        },
      ];

      render(
        <KpiTrendChart
          multiTeamData={multiTeamData}
          title="Sprint Commitment"
        />,
      );

      expect(
        screen.getByText('Not enough data points for trend analysis'),
      ).toBeInTheDocument();
    });
  });

  describe('KPI selector', () => {
    it('renders KPI selector dropdown when no external data is provided', async () => {
      mockGetTrends.mockResolvedValue({
        success: true,
        data: [
          { period: 'Jan 2024', value: 85, ragStatus: 'green' },
          { period: 'Feb 2024', value: 90, ragStatus: 'green' },
        ],
      });

      render(<KpiTrendChart />);

      await waitFor(() => {
        expect(screen.getByLabelText('Select KPI for trend')).toBeInTheDocument();
      });
    });

    it('does not render KPI selector when external data is provided', () => {
      const data: TrendDataPoint[] = [
        { period: 'Jan 2024', value: 85, ragStatus: 'green' },
        { period: 'Feb 2024', value: 90, ragStatus: 'green' },
      ];

      render(<KpiTrendChart data={data} title="Sprint Commitment" />);

      expect(screen.queryByLabelText('Select KPI for trend')).not.toBeInTheDocument();
    });

    it('calls getTrends with selected KPI when selector changes', async () => {
      mockGetTrends.mockResolvedValue({
        success: true,
        data: [
          { period: 'Jan 2024', value: 85, ragStatus: 'green' },
          { period: 'Feb 2024', value: 90, ragStatus: 'green' },
        ],
      });

      render(<KpiTrendChart />);

      await waitFor(() => {
        expect(mockGetTrends).toHaveBeenCalledWith('sprint_commitment', undefined);
      });

      const select = screen.getByLabelText('Select KPI for trend');
      fireEvent.change(select, { target: { value: 'deployment_frequency' } });

      await waitFor(() => {
        expect(mockGetTrends).toHaveBeenCalledWith('deployment_frequency', undefined);
      });
    });
  });

  describe('Filter prop and re-fetching', () => {
    it('re-fetches when filter prop changes', async () => {
      mockGetTrends.mockResolvedValue({
        success: true,
        data: [
          { period: 'Jan 2024', value: 85, ragStatus: 'green' },
          { period: 'Feb 2024', value: 90, ragStatus: 'green' },
        ],
      });

      const { rerender } = render(<KpiTrendChart filter={{ team: 'alpha' }} />);

      await waitFor(() => {
        expect(mockGetTrends).toHaveBeenCalledWith('sprint_commitment', { team: 'alpha' });
      });

      rerender(<KpiTrendChart filter={{ team: 'beta' }} />);

      await waitFor(() => {
        expect(mockGetTrends).toHaveBeenCalledWith('sprint_commitment', { team: 'beta' });
      });
    });

    it('shows loading state while fetching', () => {
      // Make getTrends never resolve during this test
      mockGetTrends.mockReturnValue(new Promise(() => {}));

      render(<KpiTrendChart />);

      expect(screen.getByText('Loading trend data...')).toBeInTheDocument();
    });

    it('handles API errors gracefully', async () => {
      mockGetTrends.mockRejectedValue(new Error('Network error'));

      render(<KpiTrendChart />);

      await waitFor(() => {
        expect(screen.getByText(/Failed to load trend data/)).toBeInTheDocument();
      });
    });

    it('shows insufficient data when API returns insufficientData flag', async () => {
      mockGetTrends.mockResolvedValue({
        success: true,
        data: null,
        insufficientData: true,
        message: 'Not enough data',
      });

      render(<KpiTrendChart />);

      await waitFor(() => {
        expect(
          screen.getByText('Not enough data points for trend analysis'),
        ).toBeInTheDocument();
      });
    });
  });
});
