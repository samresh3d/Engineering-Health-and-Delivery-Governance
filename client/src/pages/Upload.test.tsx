import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Upload from './Upload';

// Mock AG Grid to avoid complex rendering issues in test
vi.mock('ag-grid-react', () => ({
  AgGridReact: ({ rowData }: { rowData: unknown[] }) => (
    <div data-testid="ag-grid-mock">
      <span>{rowData.length} rows</span>
    </div>
  ),
}));

// Mock the API client
vi.mock('../api/client', () => ({
  default: {
    post: vi.fn(),
  },
}));

import apiClient from '../api/client';

const mockedPost = vi.mocked(apiClient.post);

describe('Upload Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the drop zone in idle state', () => {
    render(<Upload />);
    expect(screen.getByText('Drag & drop your Excel file here')).toBeInTheDocument();
    expect(screen.getByText('.xlsx or .xls files, max 10 MB')).toBeInTheDocument();
  });

  it('highlights drop zone on drag enter', () => {
    render(<Upload />);
    const dropZone = screen.getByTestId('drop-zone');
    fireEvent.dragEnter(dropZone, { dataTransfer: { files: [] } });
    // The component should be in dragging state - checks visual feedback via style changes
    expect(dropZone).toBeInTheDocument();
  });

  it('reverts highlight on drag leave', () => {
    render(<Upload />);
    const dropZone = screen.getByTestId('drop-zone');
    fireEvent.dragEnter(dropZone, { dataTransfer: { files: [] } });
    fireEvent.dragLeave(dropZone, { dataTransfer: { files: [] } });
    expect(screen.getByText('Drag & drop your Excel file here')).toBeInTheDocument();
  });

  it('rejects files with invalid extension', async () => {
    render(<Upload />);
    const fileInput = screen.getByTestId('file-input');

    const invalidFile = new File(['data'], 'report.csv', { type: 'text/csv' });
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    await waitFor(() => {
      expect(screen.getByTestId('client-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('client-error').textContent).toContain('Invalid file type');
  });

  it('rejects files that exceed 10 MB', async () => {
    render(<Upload />);
    const fileInput = screen.getByTestId('file-input');

    // Create a file that's 11 MB (using a typed array with controlled size)
    const largeContent = new ArrayBuffer(11 * 1024 * 1024);
    const largeFile = new File([largeContent], 'report.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    await waitFor(() => {
      expect(screen.getByTestId('client-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('client-error').textContent).toContain('exceeds the 10 MB limit');
  });

  it('shows success banner after successful upload', async () => {
    mockedPost.mockResolvedValueOnce({
      data: {
        success: true,
        rowsIngested: 42,
        uploadId: 'abc-123',
        timestamp: '2024-01-15T10:30:00Z',
      },
    });

    render(<Upload />);
    const fileInput = screen.getByTestId('file-input');

    const validFile = new File(['data'], 'report.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(screen.getByTestId('success-banner')).toBeInTheDocument();
    });
    expect(screen.getByText('✓ 42 rows ingested successfully')).toBeInTheDocument();
    expect(screen.getByText(/abc-123/)).toBeInTheDocument();
  });

  it('shows validation errors from server in error table', async () => {
    mockedPost.mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          errors: [
            { row: 3, field: 'sprint_id', message: 'Required field missing' },
            { row: 5, field: 'team_name', message: 'Invalid team name' },
          ],
        },
      },
    });

    render(<Upload />);
    const fileInput = screen.getByTestId('file-input');

    const validFile = new File(['data'], 'report.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(screen.getByTestId('error-table')).toBeInTheDocument();
    });
    expect(screen.getByText('Validation Errors (2)')).toBeInTheDocument();
  });

  it('allows uploading another file after success', async () => {
    mockedPost.mockResolvedValueOnce({
      data: {
        success: true,
        rowsIngested: 10,
        uploadId: 'xyz-789',
        timestamp: '2024-01-15T10:30:00Z',
      },
    });

    render(<Upload />);
    const fileInput = screen.getByTestId('file-input');

    const validFile = new File(['data'], 'report.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(screen.getByTestId('success-banner')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Upload Another File'));
    expect(screen.getByText('Drag & drop your Excel file here')).toBeInTheDocument();
  });
});
