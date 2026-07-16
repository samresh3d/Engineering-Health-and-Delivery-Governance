import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FilterBar from './FilterBar';
import apiClient from '../api/client';
import * as auth from '../auth';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('../auth', () => ({
  getRole: vi.fn(),
  getStoredToken: vi.fn(),
  getStoredUser: vi.fn(),
  clearAuth: vi.fn(),
}));

const mockGet = vi.mocked(apiClient.get);
const mockGetRole = vi.mocked(auth.getRole);

describe('FilterBar', () => {
  const onFilterChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: Engineering_Manager role (no Function filter visible)
    mockGetRole.mockReturnValue('Engineering_Manager');
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/filters/portfolios') {
        return Promise.resolve({ data: ['IBPS-POS', 'mPro', 'E-Commerce'] });
      }
      if (url === '/api/filters/functions') {
        return Promise.resolve({ data: { success: true, data: ['E-Com', 'MPro', 'Dolphin', 'IVC'] } });
      }
      if (url.startsWith('/api/filters/teams')) {
        return Promise.resolve({ data: { success: true, data: ['Team Alpha', 'Team Beta'] } });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it('renders portfolio and team dropdowns', async () => {
    render(<FilterBar onFilterChange={onFilterChange} />);

    expect(screen.getByLabelText('Select portfolio')).toBeInTheDocument();
    expect(screen.getByLabelText('Select team')).toBeInTheDocument();
    expect(screen.getByLabelText('Start date')).toBeInTheDocument();
    expect(screen.getByLabelText('End date')).toBeInTheDocument();
  });

  it('does NOT show Function filter for Engineering_Manager users (Req 11.6)', async () => {
    mockGetRole.mockReturnValue('Engineering_Manager');
    render(<FilterBar onFilterChange={onFilterChange} />);

    expect(screen.queryByLabelText('Select function')).not.toBeInTheDocument();
  });

  it('shows Function filter for Leadership users (Req 11.5)', async () => {
    mockGetRole.mockReturnValue('Leadership');
    render(<FilterBar onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Select function')).toBeInTheDocument();
    });
  });

  it('shows Function filter for Super_Admin users (Req 11.5)', async () => {
    mockGetRole.mockReturnValue('Super_Admin');
    render(<FilterBar onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Select function')).toBeInTheDocument();
    });
  });

  it('fetches functions on mount for Leadership/Super_Admin', async () => {
    mockGetRole.mockReturnValue('Leadership');
    render(<FilterBar onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/filters/functions');
    });

    await waitFor(() => {
      expect(screen.getByText('E-Com')).toBeInTheDocument();
      expect(screen.getByText('MPro')).toBeInTheDocument();
    });
  });

  it('does NOT fetch functions for Engineering_Manager', async () => {
    mockGetRole.mockReturnValue('Engineering_Manager');
    render(<FilterBar onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/filters/portfolios');
    });

    expect(mockGet).not.toHaveBeenCalledWith('/api/filters/functions');
  });

  it('fetches portfolios on mount', async () => {
    render(<FilterBar onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/filters/portfolios');
    });

    await waitFor(() => {
      expect(screen.getByText('IBPS-POS')).toBeInTheDocument();
    });
  });

  it('cascades Team dropdown when Function is selected (Req 11.2)', async () => {
    mockGetRole.mockReturnValue('Leadership');
    mockGet.mockImplementation((url: string, config?: { params?: Record<string, string> }) => {
      if (url === '/api/filters/functions') {
        return Promise.resolve({ data: { success: true, data: ['E-Com', 'MPro'] } });
      }
      if (url === '/api/filters/portfolios') {
        return Promise.resolve({ data: ['IBPS-POS'] });
      }
      if (url === '/api/filters/teams') {
        if (config?.params?.functionName === 'E-Com') {
          return Promise.resolve({
            data: { success: true, data: [{ teamName: 'Retail' }, { teamName: 'Claims' }] },
          });
        }
        return Promise.resolve({
          data: { success: true, data: ['Team Alpha', 'Team Beta'] },
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(<FilterBar onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(screen.getByText('E-Com')).toBeInTheDocument();
    });

    // Select a Function
    fireEvent.change(screen.getByLabelText('Select function'), {
      target: { value: 'E-Com' },
    });

    // Should fetch teams with functionName parameter
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/filters/teams', {
        params: { functionName: 'E-Com' },
      });
    });

    // Team dropdown should show only E-Com teams
    await waitFor(() => {
      expect(screen.getByText('Retail')).toBeInTheDocument();
      expect(screen.getByText('Claims')).toBeInTheDocument();
    });
  });

  it('shows all teams when no Function is selected (Req 11.8)', async () => {
    mockGetRole.mockReturnValue('Leadership');
    render(<FilterBar onFilterChange={onFilterChange} />);

    // On mount with no Function selected, teams should be fetched without functionName param
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/filters/teams', {
        params: {},
      });
    });
  });

  it('calls onFilterChange with functionName when Function is selected', async () => {
    mockGetRole.mockReturnValue('Leadership');
    render(<FilterBar onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(screen.getByText('E-Com')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Select function'), {
      target: { value: 'E-Com' },
    });

    expect(onFilterChange).toHaveBeenCalledWith({ functionName: 'E-Com' });
  });

  it('resets team when Function changes', async () => {
    mockGetRole.mockReturnValue('Leadership');
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/filters/functions') {
        return Promise.resolve({ data: { success: true, data: ['E-Com', 'MPro'] } });
      }
      if (url === '/api/filters/portfolios') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/api/filters/teams') {
        return Promise.resolve({ data: { success: true, data: ['Team Alpha', 'Team Beta'] } });
      }
      return Promise.resolve({ data: [] });
    });

    render(<FilterBar onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });

    // Select a team
    fireEvent.change(screen.getByLabelText('Select team'), {
      target: { value: 'Team Alpha' },
    });

    // Then change Function
    fireEvent.change(screen.getByLabelText('Select function'), {
      target: { value: 'MPro' },
    });

    // Team should be cleared in the emitted filter
    expect(onFilterChange).toHaveBeenLastCalledWith({ functionName: 'MPro' });
  });

  it('calls onFilterChange when portfolio is selected', async () => {
    render(<FilterBar onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(screen.getByText('IBPS-POS')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Select portfolio'), {
      target: { value: 'mPro' },
    });

    expect(onFilterChange).toHaveBeenCalledWith({ portfolio: 'mPro' });
  });

  it('calls onFilterChange when team is selected', async () => {
    render(<FilterBar onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Select team'), {
      target: { value: 'Team Alpha' },
    });

    expect(onFilterChange).toHaveBeenCalledWith({ team: 'Team Alpha' });
  });

  it('calls onFilterChange with date range', async () => {
    render(<FilterBar onFilterChange={onFilterChange} />);

    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2024-01-01' },
    });

    expect(onFilterChange).toHaveBeenCalledWith({ startDate: '2024-01-01' });

    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2024-06-30' },
    });

    expect(onFilterChange).toHaveBeenCalledWith({
      startDate: '2024-01-01',
      endDate: '2024-06-30',
    });
  });

  it('resets team when portfolio changes', async () => {
    render(<FilterBar onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });

    // Select a team
    fireEvent.change(screen.getByLabelText('Select team'), {
      target: { value: 'Team Alpha' },
    });

    // Then change portfolio
    fireEvent.change(screen.getByLabelText('Select portfolio'), {
      target: { value: 'E-Commerce' },
    });

    // Team should be cleared in the emitted filter
    expect(onFilterChange).toHaveBeenLastCalledWith({ portfolio: 'E-Commerce' });
  });
});
