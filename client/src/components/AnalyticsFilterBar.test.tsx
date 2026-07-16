import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AnalyticsFilterBar from './AnalyticsFilterBar';
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
const mockGetStoredUser = vi.mocked(auth.getStoredUser);

describe('AnalyticsFilterBar', () => {
  const onFilterChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: Leadership role (has cross-function visibility)
    mockGetStoredUser.mockReturnValue({ userId: '1', username: 'leader1', role: 'Leadership', token: 'tok', teamId: null });
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/filters/functions') {
        return Promise.resolve({ data: { success: true, data: ['E-Com', 'MPro', 'Dolphin', 'IVC'] } });
      }
      if (url === '/api/filters/teams') {
        return Promise.resolve({ data: { success: true, data: [{ teamName: 'Team Alpha' }, { teamName: 'Team Beta' }] } });
      }
      if (url === '/api/users/me') {
        return Promise.resolve({ data: { success: true, data: { username: 'leader1', role: 'Leadership' } } });
      }
      if (url === '/api/admin/users') {
        return Promise.resolve({ data: { users: [{ username: 'em1', role: 'Engineering_Manager' }] } });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it('renders the Function dropdown for Leadership users (Req 11.5)', async () => {
    render(<AnalyticsFilterBar filter={{}} onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Select function')).toBeInTheDocument();
    });
  });

  it('renders the Function dropdown for Super_Admin users (Req 11.4, 11.5)', async () => {
    mockGetStoredUser.mockReturnValue({ userId: '2', username: 'admin1', role: 'Super_Admin', token: 'tok', teamId: null });
    render(<AnalyticsFilterBar filter={{}} onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Select function')).toBeInTheDocument();
    });
  });

  it('does NOT render the Function dropdown for Engineering_Manager (Req 11.6)', async () => {
    mockGetStoredUser.mockReturnValue({ userId: '3', username: 'em1', role: 'Engineering_Manager', token: 'tok', teamId: 't1' });
    render(<AnalyticsFilterBar filter={{}} onFilterChange={onFilterChange} />);

    expect(screen.queryByLabelText('Select function')).not.toBeInTheDocument();
  });

  it('fetches functions on mount for Leadership', async () => {
    render(<AnalyticsFilterBar filter={{}} onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/filters/functions');
    });

    await waitFor(() => {
      expect(screen.getByText('E-Com')).toBeInTheDocument();
      expect(screen.getByText('MPro')).toBeInTheDocument();
      expect(screen.getByText('Dolphin')).toBeInTheDocument();
      expect(screen.getByText('IVC')).toBeInTheDocument();
    });
  });

  it('does NOT fetch functions for Engineering_Manager', async () => {
    mockGetStoredUser.mockReturnValue({ userId: '3', username: 'em1', role: 'Engineering_Manager', token: 'tok', teamId: 't1' });
    render(<AnalyticsFilterBar filter={{}} onFilterChange={onFilterChange} />);

    // Allow time for effects to run
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/filters/teams', { params: {} });
    });

    expect(mockGet).not.toHaveBeenCalledWith('/api/filters/functions');
  });

  it('emits functionName when a Function is selected', async () => {
    render(<AnalyticsFilterBar filter={{}} onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(screen.getByText('E-Com')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Select function'), {
      target: { value: 'E-Com' },
    });

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'E-Com', team: undefined }),
    );
  });

  it('clears team when Function changes (Req 11.2 cascade)', async () => {
    render(
      <AnalyticsFilterBar
        filter={{ functionName: 'E-Com', team: 'Team Alpha' }}
        onFilterChange={onFilterChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('MPro')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Select function'), {
      target: { value: 'MPro' },
    });

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'MPro', team: undefined }),
    );
  });

  it('shows all functions in dropdown when "All Functions" is selected (Req 11.1)', async () => {
    render(
      <AnalyticsFilterBar
        filter={{ functionName: 'E-Com' }}
        onFilterChange={onFilterChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('E-Com')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Select function'), {
      target: { value: '' },
    });

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: undefined, team: undefined }),
    );
  });

  it('shows empty state message when Function has no teams/data (Req 11.7)', async () => {
    mockGet.mockImplementation((url: string, config?: { params?: Record<string, string> }) => {
      if (url === '/api/filters/functions') {
        return Promise.resolve({ data: { success: true, data: ['E-Com', 'EmptyFunc'] } });
      }
      if (url === '/api/filters/teams') {
        if (config?.params?.functionName === 'EmptyFunc') {
          return Promise.resolve({ data: { success: true, data: [] } });
        }
        return Promise.resolve({ data: { success: true, data: [{ teamName: 'Team Alpha' }] } });
      }
      if (url === '/api/users/me') {
        return Promise.resolve({ data: { success: true } });
      }
      if (url === '/api/admin/users') {
        return Promise.resolve({ data: { users: [] } });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <AnalyticsFilterBar
        filter={{ functionName: 'EmptyFunc' }}
        onFilterChange={onFilterChange}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/No data available for the selected Function "EmptyFunc"/),
      ).toBeInTheDocument();
    });
  });

  it('hides empty state message when Function has data', async () => {
    render(<AnalyticsFilterBar filter={{ functionName: 'E-Com' }} onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });

    expect(screen.queryByText(/No data available/)).not.toBeInTheDocument();
  });

  it('clears empty state on reset', async () => {
    mockGet.mockImplementation((url: string, config?: { params?: Record<string, string> }) => {
      if (url === '/api/filters/functions') {
        return Promise.resolve({ data: { success: true, data: ['EmptyFunc'] } });
      }
      if (url === '/api/filters/teams') {
        if (config?.params?.functionName === 'EmptyFunc') {
          return Promise.resolve({ data: { success: true, data: [] } });
        }
        return Promise.resolve({ data: { success: true, data: [{ teamName: 'Team Alpha' }] } });
      }
      if (url === '/api/users/me') {
        return Promise.resolve({ data: { success: true } });
      }
      if (url === '/api/admin/users') {
        return Promise.resolve({ data: { users: [] } });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <AnalyticsFilterBar
        filter={{ functionName: 'EmptyFunc' }}
        onFilterChange={onFilterChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/No data available/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Clear all filters'));

    expect(onFilterChange).toHaveBeenCalledWith({});
  });

  it('fetches teams with functionName param when Function is selected', async () => {
    render(
      <AnalyticsFilterBar
        filter={{ functionName: 'E-Com' }}
        onFilterChange={onFilterChange}
      />,
    );

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/filters/teams', {
        params: { functionName: 'E-Com' },
      });
    });
  });

  it('fetches teams without functionName param when no Function is selected (Req 11.8)', async () => {
    render(<AnalyticsFilterBar filter={{}} onFilterChange={onFilterChange} />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/filters/teams', { params: {} });
    });
  });
});
