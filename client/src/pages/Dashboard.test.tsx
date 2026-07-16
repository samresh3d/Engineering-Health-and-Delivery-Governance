import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';
import apiClient from '../api/client';
import * as auth from '../auth';
import type { KpiResult } from '../types';

vi.mock('../api/client');
vi.mock('../auth');

const mockKpis: KpiResult[] = [
  { kpiName: 'sprint_commitment', value: 85, ragStatus: 'green', percentChange: 5, insufficientData: false },
  { kpiName: 'release_success_rate', value: 92, ragStatus: 'green', percentChange: 2, insufficientData: false },
  { kpiName: 'deployment_frequency', value: 4, ragStatus: 'amber', percentChange: -1, insufficientData: false },
];

describe('Dashboard — role-based rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders LeadershipDashboard for Leadership role', () => {
    vi.mocked(auth.getStoredUser).mockReturnValue({
      userId: '1', username: 'leader', role: 'Leadership', token: 'tok', teamId: null,
    });
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));
    render(<Dashboard />);
    expect(screen.getByText('Loading leadership dashboard...')).toBeInTheDocument();
  });

  it('renders LeadershipDashboard for Super_Admin role', () => {
    vi.mocked(auth.getStoredUser).mockReturnValue({
      userId: '2', username: 'admin', role: 'Super_Admin', token: 'tok', teamId: null,
    });
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));
    render(<Dashboard />);
    expect(screen.getByText('Loading leadership dashboard...')).toBeInTheDocument();
  });

  it('renders EmDashboard for Engineering_Manager role', () => {
    vi.mocked(auth.getStoredUser).mockReturnValue({
      userId: '3', username: 'em', role: 'Engineering_Manager', token: 'tok', teamId: 'team-1',
    });
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));
    render(<Dashboard />);
    expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
  });

  it('renders default dashboard for Delivery_Manager role', async () => {
    vi.mocked(auth.getStoredUser).mockReturnValue({
      userId: '4', username: 'dm', role: 'Delivery_Manager', token: 'tok', teamId: 'team-2',
    });
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockKpis });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Delivery Health Overview')).toBeInTheDocument();
    });
  });

  it('renders default dashboard when no user is authenticated', async () => {
    vi.mocked(auth.getStoredUser).mockReturnValue(null);
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Delivery Health Overview')).toBeInTheDocument();
    });
  });
});

describe('DefaultDashboard (fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Use a non-Leadership, non-EM role to reach DefaultDashboard
    vi.mocked(auth.getStoredUser).mockReturnValue({
      userId: '5', username: 'user', role: 'Admin', token: 'tok', teamId: null,
    });
  });

  it('shows loading state initially', () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));
    render(<Dashboard />);
    expect(screen.getByText('Loading KPI data...')).toBeInTheDocument();
  });

  it('renders KPI tiles after successful fetch', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockKpis });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Sprint Commitment')).toBeInTheDocument();
    });
    expect(screen.getByText('Release Success Rate')).toBeInTheDocument();
    expect(screen.getByText('Deployment Frequency')).toBeInTheDocument();
  });

  it('shows error message on API failure', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load KPI data/)).toBeInTheDocument();
    });
  });

  it('calls the correct API endpoint', () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    render(<Dashboard />);
    expect(apiClient.get).toHaveBeenCalledWith('/api/dashboard/kpis');
  });
});
