import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EMFunctionAssignment from './EMFunctionAssignment';
import apiClient from '../../api/client';

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

const mockGet = vi.mocked(apiClient.get);
const mockPut = vi.mocked(apiClient.put);

const mockEMs = [
  { id: 'em-1', username: 'eng_manager_1', role: 'Engineering_Manager', teamId: 'team-a', functionId: 1, functionName: 'E-Com' },
  { id: 'em-2', username: 'eng_manager_2', role: 'Engineering_Manager', teamId: 'team-b', functionId: null, functionName: null },
];

const mockFunctions = [
  { id: 1, name: 'E-Com', createdAt: '2024-01-01' },
  { id: 2, name: 'MPro', createdAt: '2024-01-01' },
  { id: 3, name: 'Dolphin', createdAt: '2024-01-01' },
];

describe('EMFunctionAssignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupSuccessfulFetch() {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/api/admin/users')) {
        return Promise.resolve({ data: { data: mockEMs } }) as any;
      }
      if (url.includes('/api/admin/functions')) {
        return Promise.resolve({ data: { data: mockFunctions } }) as any;
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  }

  it('renders heading and description', async () => {
    setupSuccessfulFetch();
    render(<EMFunctionAssignment />);

    expect(screen.getByText('EM Function Assignment')).toBeInTheDocument();
    expect(screen.getByText(/Assign each Engineering Manager to a Function/)).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    mockGet.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<EMFunctionAssignment />);

    expect(screen.getByTestId('em-assignment-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading Engineering Managers...')).toBeInTheDocument();
  });

  it('displays EM users with their current function assignments', async () => {
    setupSuccessfulFetch();
    render(<EMFunctionAssignment />);

    await waitFor(() => {
      expect(screen.getByTestId('em-assignment-list')).toBeInTheDocument();
    });

    expect(screen.getByText('eng_manager_1')).toBeInTheDocument();
    expect(screen.getByText('eng_manager_2')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();

    // Verify the first EM's dropdown shows the correct assignment
    const dropdown1 = screen.getByLabelText('Assign function to eng_manager_1') as HTMLSelectElement;
    expect(dropdown1.value).toBe('1'); // E-Com has id=1
  });

  it('renders a function dropdown for each EM with all functions as options', async () => {
    setupSuccessfulFetch();
    render(<EMFunctionAssignment />);

    await waitFor(() => {
      expect(screen.getByTestId('em-assignment-list')).toBeInTheDocument();
    });

    const dropdowns = screen.getAllByRole('combobox');
    expect(dropdowns).toHaveLength(2);

    // First EM should have E-Com selected (functionId = 1)
    expect(dropdowns[0]).toHaveValue('1');

    // Second EM should have empty value (unassigned)
    expect(dropdowns[1]).toHaveValue('');
  });

  it('calls PUT /api/admin/users/:id/function when a function is selected', async () => {
    setupSuccessfulFetch();
    mockPut.mockResolvedValue({
      data: { success: true, userId: 'em-2', username: 'eng_manager_2', functionId: 2, functionName: 'MPro' },
    } as any);

    render(<EMFunctionAssignment />);

    await waitFor(() => {
      expect(screen.getByTestId('em-assignment-list')).toBeInTheDocument();
    });

    const dropdowns = screen.getAllByRole('combobox');
    fireEvent.change(dropdowns[1], { target: { value: '2' } });

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/api/admin/users/em-2/function', { functionId: 2 });
    });
  });

  it('shows success message after successful assignment', async () => {
    setupSuccessfulFetch();
    mockPut.mockResolvedValue({
      data: { success: true, userId: 'em-2', functionId: 2, functionName: 'MPro' },
    } as any);

    render(<EMFunctionAssignment />);

    await waitFor(() => {
      expect(screen.getByTestId('em-assignment-list')).toBeInTheDocument();
    });

    const dropdowns = screen.getAllByRole('combobox');
    fireEvent.change(dropdowns[1], { target: { value: '2' } });

    await waitFor(() => {
      expect(screen.getByText('eng_manager_2 assigned to MPro')).toBeInTheDocument();
    });
  });

  it('shows error message when assignment fails', async () => {
    setupSuccessfulFetch();
    mockPut.mockRejectedValue({
      response: { data: { error: 'Function is invalid' } },
    });

    render(<EMFunctionAssignment />);

    await waitFor(() => {
      expect(screen.getByTestId('em-assignment-list')).toBeInTheDocument();
    });

    const dropdowns = screen.getAllByRole('combobox');
    // Use a valid dropdown value — the mock will reject the PUT call
    fireEvent.change(dropdowns[1], { target: { value: '2' } });

    await waitFor(() => {
      expect(screen.getByText('Function is invalid')).toBeInTheDocument();
    });
  });

  it('shows error state when data fetch fails', async () => {
    mockGet.mockRejectedValue({
      response: { data: { error: 'Failed to load functions.' } },
    });

    render(<EMFunctionAssignment />);

    await waitFor(() => {
      expect(screen.getByTestId('em-assignment-error')).toBeInTheDocument();
    });
  });

  it('shows empty state when no EMs exist', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/api/admin/users')) {
        return Promise.resolve({ data: { data: [] } }) as any;
      }
      if (url.includes('/api/admin/functions')) {
        return Promise.resolve({ data: { data: mockFunctions } }) as any;
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(<EMFunctionAssignment />);

    await waitFor(() => {
      expect(screen.getByTestId('em-assignment-empty')).toBeInTheDocument();
    });
    expect(screen.getByText('No Engineering Managers found.')).toBeInTheDocument();
  });

  it('has accessible labels on dropdowns', async () => {
    setupSuccessfulFetch();
    render(<EMFunctionAssignment />);

    await waitFor(() => {
      expect(screen.getByTestId('em-assignment-list')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Assign function to eng_manager_1')).toBeInTheDocument();
    expect(screen.getByLabelText('Assign function to eng_manager_2')).toBeInTheDocument();
  });
});
