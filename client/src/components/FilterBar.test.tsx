import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FilterBar from './FilterBar';
import apiClient from '../api/client';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockGet = vi.mocked(apiClient.get);

describe('FilterBar', () => {
  const onFilterChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/filters/portfolios') {
        return Promise.resolve({ data: ['IBPS-POS', 'mPro', 'E-Commerce'] });
      }
      if (url.startsWith('/api/filters/teams')) {
        return Promise.resolve({ data: ['Team Alpha', 'Team Beta'] });
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

  it('fetches portfolios on mount', async () => {
    render(<FilterBar onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/filters/portfolios');
    });

    await waitFor(() => {
      expect(screen.getByText('IBPS-POS')).toBeInTheDocument();
    });
  });

  it('fetches teams filtered by portfolio when portfolio changes', async () => {
    render(<FilterBar onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(screen.getByText('IBPS-POS')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Select portfolio'), {
      target: { value: 'IBPS-POS' },
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/filters/teams', {
        params: { portfolio: 'IBPS-POS' },
      });
    });
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
