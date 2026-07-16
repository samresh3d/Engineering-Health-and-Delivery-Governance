import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AdminEntries from './AdminEntries';

// Mock getStoredToken
vi.mock('../../auth', () => ({
  getStoredToken: () => 'mock-token-12345678901234567890',
}));

function createMockEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    team: 'Team Alpha',
    track: 'Track A',
    project: 'Project X',
    portfolio: 'Portfolio 1',
    jiraId: 'JIRA-001',
    developmentStatus: 'In Progress',
    status: null,
    sno: 1,
    itemsList: null,
    walkthroughGivenOn: null,
    estimatedEffortWithAi: null,
    estimatedEffortWithoutAi: null,
    actualEffortWithAi: null,
    aiUsed: null,
    devStartDate: null,
    devEndDate: null,
    uatDeliveryDate: null,
    uatDeliveryTarget: null,
    resources: null,
    goLivePlannedDate: null,
    goLiveDate: null,
    productionStatus: null,
    rollback: null,
    rollbackReason: null,
    storyDropReason: null,
    ...overrides,
  };
}

function mockFetchResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
  });
}

describe('AdminEntries', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = undefined as unknown as typeof fetch;
  });

  it('renders loading state initially', () => {
    fetchSpy.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<AdminEntries />);
    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
  });

  it('displays entries in a table after fetching', async () => {
    const entries = [
      createMockEntry({ id: 1, jiraId: 'JIRA-001', team: 'Alpha' }),
      createMockEntry({ id: 2, jiraId: 'JIRA-002', team: 'Beta' }),
    ];
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ entries, total: 2, limit: 25, offset: 0 }) as never
    );

    render(<AdminEntries />);

    await waitFor(() => {
      expect(screen.getByText('JIRA-001')).toBeInTheDocument();
      expect(screen.getByText('JIRA-002')).toBeInTheDocument();
    });

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('displays error message when fetch fails', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error'));
    render(<AdminEntries />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error');
    });
  });

  it('shows pagination info correctly', async () => {
    const entries = Array.from({ length: 25 }, (_, i) =>
      createMockEntry({ id: i + 1, jiraId: `JIRA-${String(i + 1).padStart(3, '0')}` })
    );
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ entries, total: 50, limit: 25, offset: 0 }) as never
    );

    render(<AdminEntries />);

    await waitFor(() => {
      expect(screen.getByText('Showing 1–25 of 50')).toBeInTheDocument();
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });
  });

  it('navigates to next page when Next is clicked', async () => {
    const entries = Array.from({ length: 25 }, (_, i) =>
      createMockEntry({ id: i + 1, jiraId: `JIRA-${String(i + 1).padStart(3, '0')}` })
    );
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ entries, total: 50, limit: 25, offset: 0 }) as never
    );

    render(<AdminEntries />);

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });

    const page2Entries = Array.from({ length: 25 }, (_, i) =>
      createMockEntry({ id: i + 26, jiraId: `JIRA-${String(i + 26).padStart(3, '0')}` })
    );
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ entries: page2Entries, total: 50, limit: 25, offset: 25 }) as never
    );

    fireEvent.click(screen.getByLabelText('Next page'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('converts row to edit mode when Edit is clicked', async () => {
    const entries = [createMockEntry({ id: 1, jiraId: 'JIRA-100', team: 'TeamX' })];
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ entries, total: 1, limit: 25, offset: 0 }) as never
    );

    render(<AdminEntries />);

    await waitFor(() => {
      expect(screen.getByText('JIRA-100')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Edit entry 1'));

    // Input fields should appear with current values
    expect(screen.getByLabelText('Edit jiraId')).toHaveValue('JIRA-100');
    expect(screen.getByLabelText('Edit team')).toHaveValue('TeamX');
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('reverts row when Cancel is clicked in edit mode', async () => {
    const entries = [createMockEntry({ id: 1, jiraId: 'JIRA-100', team: 'TeamX' })];
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ entries, total: 1, limit: 25, offset: 0 }) as never
    );

    render(<AdminEntries />);

    await waitFor(() => {
      expect(screen.getByText('JIRA-100')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Edit entry 1'));
    fireEvent.change(screen.getByLabelText('Edit jiraId'), { target: { value: 'CHANGED' } });
    fireEvent.click(screen.getByText('Cancel'));

    // Should revert to display mode with original value
    expect(screen.getByText('JIRA-100')).toBeInTheDocument();
    expect(screen.queryByLabelText('Edit jiraId')).not.toBeInTheDocument();
  });

  it('sends PUT request when Save is clicked', async () => {
    const entries = [createMockEntry({ id: 5, jiraId: 'JIRA-005', team: 'Original' })];
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ entries, total: 1, limit: 25, offset: 0 }) as never
    );

    render(<AdminEntries />);

    await waitFor(() => {
      expect(screen.getByText('JIRA-005')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Edit entry 5'));
    fireEvent.change(screen.getByLabelText('Edit team'), { target: { value: 'Updated Team' } });

    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ ...entries[0], team: 'Updated Team' }) as never
    );

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/entries/5',
        expect.objectContaining({ method: 'PUT' })
      );
    });
  });

  it('shows delete confirmation modal when Delete is clicked', async () => {
    const entries = [createMockEntry({ id: 1 })];
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ entries, total: 1, limit: 25, offset: 0 }) as never
    );

    render(<AdminEntries />);

    await waitFor(() => {
      expect(screen.getByLabelText('Delete entry 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Delete entry 1'));

    expect(screen.getByRole('dialog', { name: 'Delete confirmation' })).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this entry? This action cannot be undone.')).toBeInTheDocument();
  });

  it('deletes entry when Confirm is clicked in delete modal', async () => {
    const entries = [createMockEntry({ id: 3 })];
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ entries, total: 1, limit: 25, offset: 0 }) as never
    );

    render(<AdminEntries />);

    await waitFor(() => {
      expect(screen.getByLabelText('Delete entry 3')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Delete entry 3'));

    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ success: true, id: 3 }) as never
    );

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/entries/3',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  it('closes delete modal without deleting when Cancel is clicked', async () => {
    const entries = [createMockEntry({ id: 1 })];
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ entries, total: 1, limit: 25, offset: 0 }) as never
    );

    render(<AdminEntries />);

    await waitFor(() => {
      expect(screen.getByLabelText('Delete entry 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Delete entry 1'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Click Cancel button in modal
    const modal = screen.getByRole('dialog');
    fireEvent.click(within(modal).getByText('Cancel'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens Add Entry modal when Add Entry button is clicked', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ entries: [], total: 0, limit: 25, offset: 0 }) as never
    );

    render(<AdminEntries />);

    await waitFor(() => {
      expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Add Entry'));

    expect(screen.getByRole('dialog', { name: 'Add entry' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Jira ID/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Team/)).toBeInTheDocument();
  });

  it('sends POST request when Add Entry form is submitted', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ entries: [], total: 0, limit: 25, offset: 0 }) as never
    );

    render(<AdminEntries />);

    await waitFor(() => {
      expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Add Entry'));

    const modal = screen.getByRole('dialog');
    fireEvent.change(within(modal).getByLabelText(/Jira ID/), { target: { value: 'NEW-001' } });
    fireEvent.change(within(modal).getByLabelText(/Team/), { target: { value: 'New Team' } });
    fireEvent.change(within(modal).getByLabelText(/Division/), { target: { value: 'New Track' } });
    fireEvent.change(within(modal).getByLabelText(/Project/), { target: { value: 'New Project' } });
    fireEvent.change(within(modal).getByLabelText(/Portfolio/), { target: { value: 'New Portfolio' } });

    const newEntry = createMockEntry({
      id: 99,
      jiraId: 'NEW-001',
      team: 'New Team',
      track: 'New Track',
      project: 'New Project',
      portfolio: 'New Portfolio',
    });
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(newEntry, 201) as never);

    fireEvent.click(within(modal).getByText('Create Entry'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/entries',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('displays error from failed PUT without changing row data', async () => {
    const entries = [createMockEntry({ id: 7, jiraId: 'JIRA-007', team: 'OrigTeam' })];
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ entries, total: 1, limit: 25, offset: 0 }) as never
    );

    render(<AdminEntries />);

    await waitFor(() => {
      expect(screen.getByText('JIRA-007')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Edit entry 7'));
    fireEvent.change(screen.getByLabelText('Edit team'), { target: { value: 'Changed' } });

    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ error: 'Validation failed', details: [{ field: 'team', message: 'invalid' }] }, 400) as never
    );

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Validation failed');
    });
  });

  it('handles sort column click cycling through sort states', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ entries: [], total: 0, limit: 25, offset: 0 }) as never
    );

    render(<AdminEntries />);

    await waitFor(() => {
      expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
    });

    // Click 'Team' column header to sort ascending
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ entries: [], total: 0, limit: 25, offset: 0 }) as never
    );
    fireEvent.click(screen.getByText('Team'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const lastCall = fetchSpy.mock.calls[1][0] as string;
      expect(lastCall).toContain('sort=team');
    });
  });

  it('shows "No entries found" when entries array is empty', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ entries: [], total: 0, limit: 25, offset: 0 }) as never
    );

    render(<AdminEntries />);

    await waitFor(() => {
      expect(screen.getByText('No entries found.')).toBeInTheDocument();
    });
  });

  it('disables Previous button on first page', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({ entries: [createMockEntry()], total: 1, limit: 25, offset: 0 }) as never
    );

    render(<AdminEntries />);

    await waitFor(() => {
      const prevBtn = screen.getByLabelText('Previous page');
      expect(prevBtn).toBeDisabled();
    });
  });
});
