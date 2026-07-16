import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AdminDashboard from './AdminDashboard';
import apiClient from '../../api/client';

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockAnalytics = {
  totalTeams: 12,
  totalEntries: 458,
  recentUploads: 7,
  pendingItems: 23,
};

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('displays loading skeletons while data is loading', () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {})); // never resolves
    render(<AdminDashboard />);

    const skeletons = screen.getAllByTestId('loading-skeleton');
    expect(skeletons).toHaveLength(4);
  });

  it('fetches analytics from /api/admin/analytics', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockAnalytics });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/api/admin/analytics');
    });
  });

  it('displays 4 stat cards with correct data after loading', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockAnalytics });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('stat-card-total-teams')).toBeInTheDocument();
    });

    expect(screen.getByTestId('stat-card-total-teams')).toHaveTextContent('12');
    expect(screen.getByTestId('stat-card-total-entries')).toHaveTextContent('458');
    expect(screen.getByTestId('stat-card-recent-uploads')).toHaveTextContent('7');
    expect(screen.getByTestId('stat-card-pending-items')).toHaveTextContent('23');
  });

  it('displays stat card labels', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockAnalytics });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Total Teams')).toBeInTheDocument();
    });

    expect(screen.getByText('Total Entries')).toBeInTheDocument();
    expect(screen.getByText('Recent Uploads')).toBeInTheDocument();
    expect(screen.getByText('Pending Items')).toBeInTheDocument();
  });

  it('displays error message when API call fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load analytics data/)).toBeInTheDocument();
    });
  });

  it('does not show loading skeletons after data loads', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockAnalytics });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('stat-card-total-teams')).toBeInTheDocument();
    });

    expect(screen.queryAllByTestId('loading-skeleton')).toHaveLength(0);
  });

  it('renders page title and subtitle', () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));
    render(<AdminDashboard />);

    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Platform-wide analytics overview')).toBeInTheDocument();
  });

  it('formats large numbers with locale string', async () => {
    const largeData = {
      totalTeams: 1500,
      totalEntries: 12345,
      recentUploads: 999,
      pendingItems: 2000,
    };
    vi.mocked(apiClient.get).mockResolvedValue({ data: largeData });
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('stat-card-total-entries')).toHaveTextContent('12,345');
    });
  });
});
