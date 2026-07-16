import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AdminTeams from './AdminTeams';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../auth', () => ({
  getStoredToken: vi.fn(() => 'mock-token-12345678901234567890'),
}));

const mockTeams = {
  teams: [
    { team: 'Team Alpha', portfolio: 'Digital', entryCount: 12 },
    { team: 'Team Beta', portfolio: 'Core Banking', entryCount: 8 },
    { team: 'Team Gamma', portfolio: 'Digital', entryCount: 5 },
    { team: 'Team Delta', portfolio: 'Insurance', entryCount: 1 },
  ],
};

function renderAdminTeams() {
  return render(
    <MemoryRouter initialEntries={['/admin/teams']}>
      <Routes>
        <Route path="/admin/teams" element={<AdminTeams />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminTeams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state initially', () => {
    vi.mocked(globalThis.fetch).mockReturnValue(new Promise(() => {})); // never resolves

    renderAdminTeams();

    expect(screen.getByTestId('teams-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading teams...')).toBeInTheDocument();
  });

  it('fetches teams from API with auth token on mount', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTeams),
    } as Response);

    renderAdminTeams();

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/teams?',
        expect.objectContaining({
          headers: { Authorization: 'Bearer mock-token-12345678901234567890' },
        })
      );
    });
  });

  it('displays team cards after loading', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTeams),
    } as Response);

    renderAdminTeams();

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });

    expect(screen.getByText('Team Beta')).toBeInTheDocument();
    expect(screen.getByText('Team Gamma')).toBeInTheDocument();
    expect(screen.getByText('Team Delta')).toBeInTheDocument();
  });

  it('displays portfolio and entry count for each team', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTeams),
    } as Response);

    renderAdminTeams();

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });

    // Two teams have 'Digital' portfolio
    expect(screen.getAllByText('Portfolio: Digital')).toHaveLength(2);
    expect(screen.getByText('Portfolio: Core Banking')).toBeInTheDocument();
    expect(screen.getByText('Portfolio: Insurance')).toBeInTheDocument();
    expect(screen.getByText('12 entries')).toBeInTheDocument();
    expect(screen.getByText('8 entries')).toBeInTheDocument();
    expect(screen.getByText('1 entry')).toBeInTheDocument();
  });

  it('shows error message when fetch fails', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network error'));

    renderAdminTeams();

    await waitFor(() => {
      expect(screen.getByTestId('teams-error')).toBeInTheDocument();
    });

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('shows error when response is not ok', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);

    renderAdminTeams();

    await waitFor(() => {
      expect(screen.getByTestId('teams-error')).toBeInTheDocument();
    });

    expect(screen.getByText('Failed to fetch teams')).toBeInTheDocument();
  });

  it('shows empty state when no teams returned', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ teams: [] }),
    } as Response);

    renderAdminTeams();

    await waitFor(() => {
      expect(screen.getByTestId('teams-empty')).toBeInTheDocument();
    });

    expect(screen.getByText('No teams found.')).toBeInTheDocument();
  });

  it('renders search input', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTeams),
    } as Response);

    renderAdminTeams();

    const searchInput = screen.getByLabelText('Search teams');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveAttribute('placeholder', 'Search teams...');
  });

  it('sends search query parameter when typing in search', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTeams),
    } as Response);

    renderAdminTeams();

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText('Search teams');
    fireEvent.change(searchInput, { target: { value: 'alpha' } });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/teams?search=alpha',
        expect.objectContaining({
          headers: { Authorization: 'Bearer mock-token-12345678901234567890' },
        })
      );
    });
  });

  it('renders portfolio dropdown with distinct portfolios', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTeams),
    } as Response);

    renderAdminTeams();

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });

    const dropdown = screen.getByLabelText('Filter by portfolio');
    expect(dropdown).toBeInTheDocument();

    // Should have 'All Portfolios' + distinct portfolio options
    const options = dropdown.querySelectorAll('option');
    expect(options).toHaveLength(4); // All Portfolios, Core Banking, Digital, Insurance
    expect(options[0]).toHaveTextContent('All Portfolios');
    expect(options[1]).toHaveTextContent('Core Banking');
    expect(options[2]).toHaveTextContent('Digital');
    expect(options[3]).toHaveTextContent('Insurance');
  });

  it('sends portfolio query parameter when selecting a portfolio', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTeams),
    } as Response);

    renderAdminTeams();

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });

    const dropdown = screen.getByLabelText('Filter by portfolio');
    fireEvent.change(dropdown, { target: { value: 'Digital' } });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/teams?portfolio=Digital',
        expect.objectContaining({
          headers: { Authorization: 'Bearer mock-token-12345678901234567890' },
        })
      );
    });
  });

  it('navigates to team detail when clicking a team card', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTeams),
    } as Response);

    renderAdminTeams();

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });

    const teamCard = screen.getByRole('button', { name: 'View team Team Alpha' });
    fireEvent.click(teamCard);

    expect(mockNavigate).toHaveBeenCalledWith('/admin/teams/Team%20Alpha');
  });

  it('navigates to team detail when pressing Enter on a team card', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTeams),
    } as Response);

    renderAdminTeams();

    await waitFor(() => {
      expect(screen.getByText('Team Beta')).toBeInTheDocument();
    });

    const teamCard = screen.getByRole('button', { name: 'View team Team Beta' });
    fireEvent.keyDown(teamCard, { key: 'Enter' });

    expect(mockNavigate).toHaveBeenCalledWith('/admin/teams/Team%20Beta');
  });

  it('displays the Teams heading', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTeams),
    } as Response);

    renderAdminTeams();

    expect(screen.getByRole('heading', { name: 'Teams' })).toBeInTheDocument();
  });

  it('hides loading state after data loads', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTeams),
    } as Response);

    renderAdminTeams();

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('teams-loading')).not.toBeInTheDocument();
  });
});
