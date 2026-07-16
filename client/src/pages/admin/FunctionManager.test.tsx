import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import FunctionManager from './FunctionManager';
import apiClient from '../../api/client';

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockFunctions = [
  { id: 1, name: 'E-Com', createdAt: '2024-01-01T00:00:00Z' },
  { id: 2, name: 'MPro', createdAt: '2024-01-02T00:00:00Z' },
  { id: 3, name: 'Dolphin', createdAt: '2024-01-03T00:00:00Z' },
];

describe('FunctionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- List functions ---

  it('displays loading state initially', () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));
    render(<FunctionManager />);
    expect(screen.getByTestId('functions-loading')).toBeInTheDocument();
  });

  it('fetches and displays functions from API', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { functions: mockFunctions } });
    render(<FunctionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('functions-list')).toBeInTheDocument();
    });

    expect(screen.getByText('E-Com')).toBeInTheDocument();
    expect(screen.getByText('MPro')).toBeInTheDocument();
    expect(screen.getByText('Dolphin')).toBeInTheDocument();
  });

  it('displays empty state when no functions exist', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { functions: [] } });
    render(<FunctionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('functions-empty')).toBeInTheDocument();
    });
  });

  it('displays error when API call fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue({
      response: { data: { error: 'Server error' } },
    });
    render(<FunctionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('functions-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Server error')).toBeInTheDocument();
  });

  // --- Create function ---

  it('creates a function with valid name', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { functions: mockFunctions } });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 4, name: 'IVC', createdAt: '2024-01-04T00:00:00Z' } });

    render(<FunctionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('functions-list')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('New function name');
    fireEvent.change(input, { target: { value: 'IVC' } });
    fireEvent.click(screen.getByLabelText('Create function'));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/api/admin/functions', { name: 'IVC' });
    });
  });

  it('shows client-side validation error for empty name', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { functions: [] } });
    render(<FunctionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('functions-empty')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Create function'));

    expect(screen.getByRole('alert')).toHaveTextContent('Function name is required.');
  });

  it('shows client-side validation error for name exceeding 100 characters', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { functions: [] } });
    render(<FunctionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('functions-empty')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('New function name');
    fireEvent.change(input, { target: { value: 'A'.repeat(101) } });
    fireEvent.click(screen.getByLabelText('Create function'));

    expect(screen.getByRole('alert')).toHaveTextContent('Function name must not exceed 100 characters.');
  });

  it('shows client-side validation error for invalid characters', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { functions: [] } });
    render(<FunctionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('functions-empty')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('New function name');
    fireEvent.change(input, { target: { value: 'Invalid@Name!' } });
    fireEvent.click(screen.getByLabelText('Create function'));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Function name can only contain letters, numbers, hyphens, spaces, and underscores.'
    );
  });

  it('shows server-side duplicate error on 409 response', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { functions: mockFunctions } });
    vi.mocked(apiClient.post).mockRejectedValue({
      response: { data: { error: 'A Function with this name already exists' } },
    });

    render(<FunctionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('functions-list')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('New function name');
    fireEvent.change(input, { target: { value: 'E-Com' } });
    fireEvent.click(screen.getByLabelText('Create function'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('A Function with this name already exists');
    });
  });

  // --- Rename function (inline editing) ---

  it('enters inline edit mode and saves rename', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { functions: mockFunctions } });
    vi.mocked(apiClient.put).mockResolvedValue({ data: { id: 1, name: 'E-Commerce', createdAt: '2024-01-01T00:00:00Z' } });

    render(<FunctionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('functions-list')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Rename E-Com'));

    const editInput = screen.getByLabelText('Edit function name');
    expect(editInput).toHaveValue('E-Com');

    fireEvent.change(editInput, { target: { value: 'E-Commerce' } });
    fireEvent.click(screen.getByLabelText('Save rename'));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith('/api/admin/functions/1', { name: 'E-Commerce' });
    });
  });

  it('cancels inline edit mode', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { functions: mockFunctions } });
    render(<FunctionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('functions-list')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Rename E-Com'));
    expect(screen.getByLabelText('Edit function name')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Cancel rename'));
    expect(screen.queryByLabelText('Edit function name')).not.toBeInTheDocument();
  });

  it('shows validation error when renaming to invalid name', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { functions: mockFunctions } });
    render(<FunctionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('functions-list')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Rename E-Com'));

    const editInput = screen.getByLabelText('Edit function name');
    fireEvent.change(editInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByLabelText('Save rename'));

    expect(screen.getByRole('alert')).toHaveTextContent('Function name is required.');
  });

  it('shows server duplicate error on rename', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { functions: mockFunctions } });
    vi.mocked(apiClient.put).mockRejectedValue({
      response: { data: { error: 'A Function with this name already exists' } },
    });

    render(<FunctionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('functions-list')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Rename E-Com'));

    const editInput = screen.getByLabelText('Edit function name');
    fireEvent.change(editInput, { target: { value: 'MPro' } });
    fireEvent.click(screen.getByLabelText('Save rename'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('A Function with this name already exists');
    });
  });

  // --- Delete function ---

  it('shows delete confirmation and deletes on confirm', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { functions: mockFunctions } });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: { success: true, id: 3 } });

    render(<FunctionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('functions-list')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Delete Dolphin'));

    // Confirmation prompt should appear
    expect(screen.getByText('Delete?')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm delete Dolphin')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Confirm delete Dolphin'));

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/api/admin/functions/3');
    });
  });

  it('cancels delete confirmation', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { functions: mockFunctions } });
    render(<FunctionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('functions-list')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Delete Dolphin'));
    expect(screen.getByText('Delete?')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Cancel delete'));
    expect(screen.queryByText('Delete?')).not.toBeInTheDocument();
  });

  it('shows error when deleting function with teams (409)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { functions: mockFunctions } });
    vi.mocked(apiClient.delete).mockRejectedValue({
      response: { data: { error: 'Cannot delete: Function has associated Teams' } },
    });

    render(<FunctionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('functions-list')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Delete E-Com'));
    fireEvent.click(screen.getByLabelText('Confirm delete E-Com'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Cannot delete: Function has associated Teams');
    });
  });

  // --- Keyboard interactions ---

  it('creates function on Enter key in input', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { functions: [] } });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 1, name: 'NewFunc', createdAt: '2024-01-01T00:00:00Z' } });

    render(<FunctionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('functions-empty')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('New function name');
    fireEvent.change(input, { target: { value: 'NewFunc' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/api/admin/functions', { name: 'NewFunc' });
    });
  });

  it('saves rename on Enter key in edit input', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { functions: mockFunctions } });
    vi.mocked(apiClient.put).mockResolvedValue({ data: { id: 1, name: 'Updated', createdAt: '2024-01-01T00:00:00Z' } });

    render(<FunctionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('functions-list')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Rename E-Com'));

    const editInput = screen.getByLabelText('Edit function name');
    fireEvent.change(editInput, { target: { value: 'Updated' } });
    fireEvent.keyDown(editInput, { key: 'Enter' });

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith('/api/admin/functions/1', { name: 'Updated' });
    });
  });

  it('cancels rename on Escape key', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { functions: mockFunctions } });
    render(<FunctionManager />);

    await waitFor(() => {
      expect(screen.getByTestId('functions-list')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Rename E-Com'));
    const editInput = screen.getByLabelText('Edit function name');
    fireEvent.keyDown(editInput, { key: 'Escape' });

    expect(screen.queryByLabelText('Edit function name')).not.toBeInTheDocument();
  });
});
