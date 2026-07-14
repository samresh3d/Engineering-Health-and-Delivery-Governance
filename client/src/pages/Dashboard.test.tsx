import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';
import apiClient from '../api/client';
import type { KpiResult } from '../types';

vi.mock('../api/client');

const mockKpis: KpiResult[] = [
  { kpiName: 'sprint_commitment', value: 85, ragStatus: 'green', percentChange: 5, insufficientData: false },
  { kpiName: 'release_success_rate', value: 92, ragStatus: 'green', percentChange: 2, insufficientData: false },
  { kpiName: 'deployment_frequency', value: 4, ragStatus: 'amber', percentChange: -1, insufficientData: false },
];

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      expect(screen.getByText('Failed to load KPI data. Please try again later.')).toBeInTheDocument();
    });
  });

  it('calls the correct API endpoint', () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    render(<Dashboard />);
    expect(apiClient.get).toHaveBeenCalledWith('/api/dashboard/kpis');
  });
});
