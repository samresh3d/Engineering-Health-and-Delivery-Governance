import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AdminTeamDetail from './AdminTeamDetail';

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

const mockTeamDetail = {
  team: 'Team Alpha',
  portfolio: 'Digital',
  totalEntries: 12,
  distinctProjects: 3,
  entries: [
    {
      id: 1,
      sno: 1,
      team: 'Team Alpha',
      track: 'Backend',
      project: 'Project X',
      portfolio: 'Digital',
      jiraId: 'JIRA-101',
      status: 'Active',
      itemsList: null,
      walkthroughGivenOn: null,
      estimatedEffortWithAi: null,
      estimatedEffortWithoutAi: null,
      actualEffortWithAi: null,
      aiUsed: null,
      devStartDate: null,
      devEndDate: null,
      developmentStatus: 'In Progress',
      uatDeliveryDate: null,
      uatDeliveryTarget: null,
      resources: null,
      goLivePlannedDate: null,
      goLiveDate: null,
      productionStatus: null,
      rollback: null,
      rollbackReason: null,
      storyDropReason: null,
    },
    {
      id: 2,
      sno: 2,
      team: 'Team Alpha',
      track: 'Frontend',
      project: 'Project Y',
      portfolio: 'Digital',
      jiraId: 'JIRA-102',
      status: 'Completed',
      itemsList: null,
      walkthroughGivenOn: null,
      estimatedEffortWithAi: null,
      estimatedEffortWithoutAi: null,
      actualEffortWithAi: null,
      aiUsed: null,
      devStartDate: null,
      devEndDate: null,
      developmentStatus: 'Done',
      uatDeliveryDate: null,
      uatDeliveryTarget: null,
      resources: null,
      goLivePlannedDate: null,
      goLiveDate: null,
      productionStatus: null,
      rollback: null,
      rollbackReason: null,
      storyDropReason: null,
    },
  ],
};

function renderAdminTeamDetail(teamName: string = 'Team Alpha') {
  return render(
    <MemoryRouter initialEntries={[`/admin/teams/${encodeURIComponent(teamName)}`]}>
      <Routes>
        <Route path="/admin/teams/:teamName" element={<AdminTeamDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminTeamDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state initially', () => {
    vi.mocked(globalThis.fetch).mockReturnValue(new Promise(() => {}));

    renderAdminTeamDetail();

    expect(screen.getByTestId('team-detail-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading team details...')).toBeInTheDocument();
  });

  it('fetches team detail from API with auth token on mount', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockTeamDetail),
    } as Response);

    renderAdminTeamDetail('Team Alpha');

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/teams/Team%20Alpha',
        expect.objectContaining({
          headers: { Authorization: 'Bearer mock-token-12345678901234567890' },
        })
      );
    });
  });

  it('displays team name and portfolio after loading', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockTeamDetail),
    } as Response);

    renderAdminTeamDetail();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Team Alpha' })).toBeInTheDocument();
    });

    expect(screen.getByText('Portfolio: Digital')).toBeInTheDocument();
  });

  it('displays summary metrics (total entries and distinct projects)', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockTeamDetail),
    } as Response);

    renderAdminTeamDetail();

    await waitFor(() => {
      expect(screen.getByTestId('team-summary-metrics')).toBeInTheDocument();
    });

    expect(screen.getByText('Total Entries')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Distinct Projects')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('displays data table with team entries', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockTeamDetail),
    } as Response);

    renderAdminTeamDetail();

    await waitFor(() => {
      expect(screen.getByTestId('team-entries-table')).toBeInTheDocument();
    });

    // Check table headers
    expect(screen.getByText('Jira ID')).toBeInTheDocument();
    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(screen.getByText('Division')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Dev Status')).toBeInTheDocument();

    // Check table data
    expect(screen.getByText('JIRA-101')).toBeInTheDocument();
    expect(screen.getByText('Project X')).toBeInTheDocument();
    expect(screen.getByText('Backend')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();

    expect(screen.getByText('JIRA-102')).toBeInTheDocument();
    expect(screen.getByText('Project Y')).toBeInTheDocument();
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('shows error when fetch fails', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network error'));

    renderAdminTeamDetail();

    await waitFor(() => {
      expect(screen.getByTestId('team-detail-error')).toBeInTheDocument();
    });

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('shows "Team not found" error on 404 response', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Team not found' }),
    } as Response);

    renderAdminTeamDetail('NonExistentTeam');

    await waitFor(() => {
      expect(screen.getByTestId('team-detail-error')).toBeInTheDocument();
    });

    expect(screen.getByText('Team not found')).toBeInTheDocument();
  });

  it('shows generic error on non-ok response (non-404)', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal server error' }),
    } as Response);

    renderAdminTeamDetail();

    await waitFor(() => {
      expect(screen.getByTestId('team-detail-error')).toBeInTheDocument();
    });

    expect(screen.getByText('Failed to fetch team details')).toBeInTheDocument();
  });

  it('renders "Back to Teams" button', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockTeamDetail),
    } as Response);

    renderAdminTeamDetail();

    const backButton = screen.getByRole('button', { name: 'Back to Teams' });
    expect(backButton).toBeInTheDocument();
    expect(backButton).toHaveTextContent('← Back to Teams');
  });

  it('navigates to /admin/teams when "Back to Teams" button is clicked', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockTeamDetail),
    } as Response);

    renderAdminTeamDetail();

    const backButton = screen.getByRole('button', { name: 'Back to Teams' });
    fireEvent.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith('/admin/teams');
  });

  it('hides loading state after data loads', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockTeamDetail),
    } as Response);

    renderAdminTeamDetail();

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('team-detail-loading')).not.toBeInTheDocument();
  });

  it('shows empty entries message when team has no entries', async () => {
    const emptyTeam = {
      ...mockTeamDetail,
      totalEntries: 0,
      entries: [],
    };

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(emptyTeam),
    } as Response);

    renderAdminTeamDetail();

    await waitFor(() => {
      expect(screen.getByTestId('team-entries-empty')).toBeInTheDocument();
    });

    expect(screen.getByText('No entries found for this team.')).toBeInTheDocument();
  });

  it('displays dash for null/empty field values in the table', async () => {
    const teamWithNulls = {
      ...mockTeamDetail,
      entries: [
        {
          id: 3,
          sno: null,
          team: 'Team Alpha',
          track: '',
          project: 'Project Z',
          portfolio: 'Digital',
          jiraId: 'JIRA-200',
          status: null,
          itemsList: null,
          walkthroughGivenOn: null,
          estimatedEffortWithAi: null,
          estimatedEffortWithoutAi: null,
          actualEffortWithAi: null,
          aiUsed: null,
          devStartDate: null,
          devEndDate: null,
          developmentStatus: null,
          uatDeliveryDate: null,
          uatDeliveryTarget: null,
          resources: null,
          goLivePlannedDate: null,
          goLiveDate: null,
          productionStatus: null,
          rollback: null,
          rollbackReason: null,
          storyDropReason: null,
        },
      ],
    };

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(teamWithNulls),
    } as Response);

    renderAdminTeamDetail();

    await waitFor(() => {
      expect(screen.getByTestId('team-entries-table')).toBeInTheDocument();
    });

    // Check that null/empty values render as '—'
    const cells = screen.getAllByText('—');
    expect(cells.length).toBeGreaterThanOrEqual(3); // track, status, developmentStatus
  });
});
