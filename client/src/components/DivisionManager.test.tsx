import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DivisionManager from './DivisionManager';
import type { Division } from './DivisionManager';
import apiClient from '../api/client';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);
const mockPut = vi.mocked(apiClient.put);
const mockDelete = vi.mocked(apiClient.delete);

const baseDivisions: Division[] = [
  { id: 1, name: 'Platform', teamId: 'team-a', projectCount: 3, createdAt: '2024-01-01' },
  { id: 2, name: 'Mobile', teamId: 'team-a', projectCount: 0, createdAt: '2024-02-01' },
];

describe('DivisionManager', () => {
  const onRefresh = vi.fn();
  const teamId = 'team-a';

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: ['Project A', 'Project B', 'Project C'] } as any);
  });

  // ─── Create Division ─────────────────────────────────────────────────────

  describe('Create Division', () => {
    it('renders the create form with input and button', () => {
      render(<DivisionManager teamId={teamId} divisions={[]} onRefresh={onRefresh} />);
      expect(screen.getByLabelText('New division name')).toBeInTheDocument();
      expect(screen.getByLabelText('Create division')).toBeInTheDocument();
    });

    it('disables create button when name is empty or whitespace', () => {
      render(<DivisionManager teamId={teamId} divisions={[]} onRefresh={onRefresh} />);
      const btn = screen.getByLabelText('Create division');
      expect(btn).toBeDisabled();

      const input = screen.getByLabelText('New division name');
      fireEvent.change(input, { target: { value: '   ' } });
      expect(btn).toBeDisabled();
    });

    it('shows error when name exceeds 100 characters', async () => {
      render(<DivisionManager teamId={teamId} divisions={[]} onRefresh={onRefresh} />);
      const longName = 'A'.repeat(101);
      const input = screen.getByLabelText('New division name');
      fireEvent.change(input, { target: { value: longName } });
      fireEvent.click(screen.getByLabelText('Create division'));

      expect(screen.getByText('Division name must not exceed 100 characters')).toBeInTheDocument();
    });

    it('shows duplicate error when name already exists (case-insensitive)', async () => {
      render(<DivisionManager teamId={teamId} divisions={baseDivisions} onRefresh={onRefresh} />);
      const input = screen.getByLabelText('New division name');
      fireEvent.change(input, { target: { value: 'platform' } });
      fireEvent.click(screen.getByLabelText('Create division'));

      expect(screen.getByText('A division with this name already exists in the team')).toBeInTheDocument();
    });

    it('calls POST /api/divisions on valid submit and triggers onRefresh', async () => {
      mockPost.mockResolvedValue({ data: { id: 3, name: 'Backend', team: 'team-a', projectCount: 0 } } as any);

      render(<DivisionManager teamId={teamId} divisions={baseDivisions} onRefresh={onRefresh} />);
      const input = screen.getByLabelText('New division name');
      fireEvent.change(input, { target: { value: 'Backend' } });
      fireEvent.click(screen.getByLabelText('Create division'));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/api/divisions', { team: 'team-a', name: 'Backend' });
      });
      await waitFor(() => {
        expect(onRefresh).toHaveBeenCalled();
      });
    });

    it('displays API error message on creation failure', async () => {
      mockPost.mockRejectedValue({
        response: { data: { message: 'Division name conflict on server' } },
      });

      render(<DivisionManager teamId={teamId} divisions={[]} onRefresh={onRefresh} />);
      const input = screen.getByLabelText('New division name');
      fireEvent.change(input, { target: { value: 'NewDiv' } });
      fireEvent.click(screen.getByLabelText('Create division'));

      await waitFor(() => {
        expect(screen.getByText('Division name conflict on server')).toBeInTheDocument();
      });
    });
  });

  // ─── Division List Display ───────────────────────────────────────────────

  describe('Division List', () => {
    it('displays all divisions with name and project count', () => {
      render(<DivisionManager teamId={teamId} divisions={baseDivisions} onRefresh={onRefresh} />);
      const section = screen.getByLabelText('Existing Divisions');
      expect(within(section).getByText('Platform')).toBeInTheDocument();
      expect(within(section).getByText('3 projects')).toBeInTheDocument();
      expect(within(section).getByText('Mobile')).toBeInTheDocument();
      expect(within(section).getByText('0 projects')).toBeInTheDocument();
    });

    it('shows empty state when no divisions exist', () => {
      render(<DivisionManager teamId={teamId} divisions={[]} onRefresh={onRefresh} />);
      expect(screen.getByText(/No divisions yet/)).toBeInTheDocument();
    });
  });

  // ─── Rename Division ─────────────────────────────────────────────────────

  describe('Rename Division', () => {
    it('enters inline edit mode when Rename is clicked', () => {
      render(<DivisionManager teamId={teamId} divisions={baseDivisions} onRefresh={onRefresh} />);
      fireEvent.click(screen.getByLabelText('Rename division "Platform"'));
      expect(screen.getByLabelText('Rename division "Platform"')).toBeInTheDocument();
      expect(screen.getByLabelText('Save rename')).toBeInTheDocument();
      expect(screen.getByLabelText('Cancel rename')).toBeInTheDocument();
    });

    it('shows validation error for duplicate name on rename', () => {
      render(<DivisionManager teamId={teamId} divisions={baseDivisions} onRefresh={onRefresh} />);
      fireEvent.click(screen.getByLabelText('Rename division "Mobile"'));

      const renameInput = screen.getByLabelText('Rename division "Mobile"');
      fireEvent.change(renameInput, { target: { value: 'Platform' } });
      fireEvent.click(screen.getByLabelText('Save rename'));

      expect(screen.getByText('A division with this name already exists in the team')).toBeInTheDocument();
    });

    it('calls PUT /api/divisions/:name on valid rename', async () => {
      mockPut.mockResolvedValue({ data: { id: 2, name: 'Apps', team: 'team-a', projectCount: 0 } } as any);

      render(<DivisionManager teamId={teamId} divisions={baseDivisions} onRefresh={onRefresh} />);
      fireEvent.click(screen.getByLabelText('Rename division "Mobile"'));

      const renameInput = screen.getByLabelText('Rename division "Mobile"');
      fireEvent.change(renameInput, { target: { value: 'Apps' } });
      fireEvent.click(screen.getByLabelText('Save rename'));

      await waitFor(() => {
        expect(mockPut).toHaveBeenCalledWith('/api/divisions/Mobile', {
          team: 'team-a',
          newName: 'Apps',
        });
      });
      await waitFor(() => {
        expect(onRefresh).toHaveBeenCalled();
      });
    });

    it('cancels rename and reverts to display mode', () => {
      render(<DivisionManager teamId={teamId} divisions={baseDivisions} onRefresh={onRefresh} />);
      fireEvent.click(screen.getByLabelText('Rename division "Platform"'));
      fireEvent.click(screen.getByLabelText('Cancel rename'));

      const section = screen.getByLabelText('Existing Divisions');
      expect(within(section).getByText('Platform')).toBeInTheDocument();
      expect(screen.queryByLabelText('Save rename')).not.toBeInTheDocument();
    });
  });

  // ─── Delete Division ─────────────────────────────────────────────────────

  describe('Delete Division', () => {
    it('disables delete button when projectCount > 0', () => {
      render(<DivisionManager teamId={teamId} divisions={baseDivisions} onRefresh={onRefresh} />);
      const deleteBtn = screen.getByLabelText('Delete division "Platform"');
      expect(deleteBtn).toBeDisabled();
    });

    it('enables delete button when projectCount is 0', () => {
      render(<DivisionManager teamId={teamId} divisions={baseDivisions} onRefresh={onRefresh} />);
      const deleteBtn = screen.getByLabelText('Delete division "Mobile"');
      expect(deleteBtn).not.toBeDisabled();
    });

    it('shows tooltip warning on disabled delete button', () => {
      render(<DivisionManager teamId={teamId} divisions={baseDivisions} onRefresh={onRefresh} />);
      const deleteBtn = screen.getByLabelText('Delete division "Platform"');
      expect(deleteBtn).toHaveAttribute('title', 'Cannot delete — 3 project(s) assigned');
    });

    it('calls DELETE /api/divisions/:name when delete is confirmed', async () => {
      mockDelete.mockResolvedValue({ data: {} } as any);

      render(<DivisionManager teamId={teamId} divisions={baseDivisions} onRefresh={onRefresh} />);
      fireEvent.click(screen.getByLabelText('Delete division "Mobile"'));

      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledWith('/api/divisions/Mobile', {
          params: { team: 'team-a' },
        });
      });
      await waitFor(() => {
        expect(onRefresh).toHaveBeenCalled();
      });
    });

    it('shows error when trying to delete division with projects via client validation', () => {
      render(<DivisionManager teamId={teamId} divisions={baseDivisions} onRefresh={onRefresh} />);
      // The button is disabled so manual click won't fire, but let's ensure the warning is visible
      const deleteBtn = screen.getByLabelText('Delete division "Platform"');
      expect(deleteBtn.title).toContain('Cannot delete');
    });
  });

  // ─── Assign Project ──────────────────────────────────────────────────────

  describe('Assign Project', () => {
    it('renders division and project dropdowns', async () => {
      render(<DivisionManager teamId={teamId} divisions={baseDivisions} onRefresh={onRefresh} />);

      expect(screen.getByLabelText('Select division')).toBeInTheDocument();
      expect(screen.getByLabelText('Select project')).toBeInTheDocument();
      expect(screen.getByLabelText('Assign project to division')).toBeInTheDocument();
    });

    it('fetches available projects on mount', async () => {
      render(<DivisionManager teamId={teamId} divisions={baseDivisions} onRefresh={onRefresh} />);

      await waitFor(() => {
        expect(mockGet).toHaveBeenCalledWith('/api/filters/projects', { params: { team: 'team-a' } });
      });
    });

    it('disables assign button when no division or project selected', () => {
      render(<DivisionManager teamId={teamId} divisions={baseDivisions} onRefresh={onRefresh} />);
      const btn = screen.getByLabelText('Assign project to division');
      expect(btn).toBeDisabled();
    });

    it('calls POST /api/divisions/:name/assign on valid assignment', async () => {
      mockPost.mockResolvedValue({ data: { division: 'Platform', project: 'Project A', team: 'team-a' } } as any);

      render(<DivisionManager teamId={teamId} divisions={baseDivisions} onRefresh={onRefresh} />);

      await waitFor(() => {
        expect(screen.getByText('Project A')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Select division'), { target: { value: 'Platform' } });
      fireEvent.change(screen.getByLabelText('Select project'), { target: { value: 'Project A' } });
      fireEvent.click(screen.getByLabelText('Assign project to division'));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/api/divisions/Platform/assign', {
          team: 'team-a',
          project: 'Project A',
        });
      });
      await waitFor(() => {
        expect(onRefresh).toHaveBeenCalled();
      });
    });

    it('displays API error on assignment failure', async () => {
      mockPost.mockRejectedValue({
        response: { data: { message: 'Project not in team' } },
      });

      render(<DivisionManager teamId={teamId} divisions={baseDivisions} onRefresh={onRefresh} />);

      await waitFor(() => {
        expect(screen.getByText('Project A')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Select division'), { target: { value: 'Platform' } });
      fireEvent.change(screen.getByLabelText('Select project'), { target: { value: 'Project A' } });
      fireEvent.click(screen.getByLabelText('Assign project to division'));

      await waitFor(() => {
        expect(screen.getByText('Project not in team')).toBeInTheDocument();
      });
    });
  });
});
