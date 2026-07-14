import { useState, useCallback, useRef, DragEvent, ChangeEvent } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import apiClient from '../api/client';
import type { UploadResult, ValidationError } from '../types';
import { colors } from '../theme';

/** Maximum file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Allowed file extensions */
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];

/** Allowed MIME types for Excel files */
const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

type UploadState = 'idle' | 'dragging' | 'validating' | 'uploading' | 'success' | 'error';

interface UploadPageState {
  state: UploadState;
  result: UploadResult | null;
  errors: ValidationError[];
  clientError: string | null;
}

const errorColumnDefs: ColDef<ValidationError>[] = [
  { headerName: 'Row', field: 'row', width: 100 },
  { headerName: 'Field', field: 'field', width: 200 },
  { headerName: 'Message', field: 'message', flex: 1 },
];

/**
 * Upload page with HTML5 drag-and-drop zone for Excel file uploads.
 * Supports .xlsx and .xls files up to 10 MB.
 */
export default function Upload() {
  const [pageState, setPageState] = useState<UploadPageState>({
    state: 'idle',
    result: null,
    errors: [],
    clientError: null,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setPageState({ state: 'idle', result: null, errors: [], clientError: null });
  }, []);

  /**
   * Validates a file before upload.
   * Returns an error message string or null if valid.
   */
  const validateFile = (file: File): string | null => {
    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return `Invalid file type "${extension}". Only .xlsx and .xls files are allowed.`;
    }

    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      // Some browsers may not set MIME type; only reject if type is set but wrong
      return `Invalid file type "${file.type}". Only Excel files (.xlsx, .xls) are allowed.`;
    }

    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      return `File size (${sizeMB} MB) exceeds the 10 MB limit.`;
    }

    return null;
  };

  const uploadFile = async (file: File) => {
    setPageState((prev) => ({ ...prev, state: 'validating', clientError: null }));

    const validationError = validateFile(file);
    if (validationError) {
      setPageState({
        state: 'idle',
        result: null,
        errors: [],
        clientError: validationError,
      });
      return;
    }

    setPageState((prev) => ({ ...prev, state: 'uploading' }));

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiClient.post<UploadResult>('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setPageState({
        state: 'success',
        result: response.data,
        errors: [],
        clientError: null,
      });
    } catch (err: unknown) {
      if (isAxiosErrorWithValidation(err)) {
        const data = err.response.data as { errors?: ValidationError[] };
        setPageState({
          state: 'error',
          result: null,
          errors: data.errors ?? [],
          clientError: null,
        });
      } else {
        const message = err instanceof Error ? err.message : 'Upload failed. Please try again.';
        setPageState({
          state: 'idle',
          result: null,
          errors: [],
          clientError: message,
        });
      }
    }
  };

  /** Type guard for Axios errors with validation response */
  function isAxiosErrorWithValidation(
    err: unknown
  ): err is { response: { status: number; data: unknown } } {
    return (
      typeof err === 'object' &&
      err !== null &&
      'response' in err &&
      typeof (err as { response?: unknown }).response === 'object' &&
      (err as { response: { status?: unknown } }).response !== null &&
      typeof (err as { response: { status?: unknown } }).response.status === 'number'
    );
  }

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setPageState((prev) => ({ ...prev, state: 'dragging' }));
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setPageState((prev) => {
      if (prev.state === 'dragging') {
        return { ...prev, state: 'idle' };
      }
      return prev;
    });
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        void uploadFile(files[0]);
      } else {
        setPageState((prev) => ({ ...prev, state: 'idle' }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        void uploadFile(files[0]);
      }
      // Reset input so same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const isDragging = pageState.state === 'dragging';
  const isUploading = pageState.state === 'uploading' || pageState.state === 'validating';

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Upload Sprint Data</h1>

      {/* Drop Zone */}
      <div
        data-testid="drop-zone"
        style={{
          ...styles.dropZone,
          ...(isDragging ? styles.dropZoneDragging : {}),
          ...(isUploading ? styles.dropZoneDisabled : {}),
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        aria-label="Upload area. Drag and drop an Excel file or click to browse."
        onClick={!isUploading ? handleBrowseClick : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!isUploading) handleBrowseClick();
          }
        }}
      >
        {isUploading ? (
          <div style={styles.uploadingContent}>
            <div style={styles.spinner} data-testid="upload-spinner" />
            <p style={styles.uploadingText}>
              {pageState.state === 'validating' ? 'Validating file...' : 'Uploading...'}
            </p>
          </div>
        ) : (
          <div style={styles.dropContent}>
            <div style={styles.dropIcon}>📁</div>
            <p style={styles.dropText}>
              Drag &amp; drop your Excel file here
            </p>
            <p style={styles.dropSubText}>
              or <span style={styles.browseLink}>click to browse</span>
            </p>
            <p style={styles.dropHint}>.xlsx or .xls files, max 10 MB</p>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
        data-testid="file-input"
      />

      {/* Client-side validation error */}
      {pageState.clientError && (
        <div style={styles.clientError} role="alert" data-testid="client-error">
          ⚠️ {pageState.clientError}
        </div>
      )}

      {/* Success banner */}
      {pageState.state === 'success' && pageState.result && (
        <div style={styles.successBanner} role="status" data-testid="success-banner">
          <strong>✓ {pageState.result.rowsIngested} rows ingested successfully</strong>
          <p style={styles.successDetail}>
            Upload ID: {pageState.result.uploadId} • {new Date(pageState.result.timestamp).toLocaleString()}
          </p>
          <button style={styles.resetButton} onClick={resetState}>
            Upload Another File
          </button>
        </div>
      )}

      {/* Error table */}
      {pageState.state === 'error' && pageState.errors.length > 0 && (
        <div data-testid="error-table" style={styles.errorSection}>
          <h2 style={styles.errorHeading}>
            Validation Errors ({pageState.errors.length})
          </h2>
          <div className="ag-theme-alpine" style={styles.gridContainer}>
            <AgGridReact<ValidationError>
              rowData={pageState.errors}
              columnDefs={errorColumnDefs}
              domLayout="autoHeight"
              defaultColDef={{ sortable: true, resizable: true }}
            />
          </div>
          <button style={styles.resetButton} onClick={resetState}>
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

/** Inline styles for the upload page */
const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '32px 16px',
  },
  heading: {
    color: colors.primary,
    marginBottom: '24px',
  },
  dropZone: {
    borderWidth: '2px',
    borderStyle: 'dashed',
    borderColor: '#ccc',
    borderRadius: '12px',
    padding: '48px 24px',
    textAlign: 'center' as const,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    backgroundColor: '#fafafa',
  },
  dropZoneDragging: {
    borderColor: colors.primary,
    backgroundColor: '#f9f0f3',
    transform: 'scale(1.01)',
  },
  dropZoneDisabled: {
    cursor: 'default',
    opacity: 0.7,
  },
  dropContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
  },
  dropIcon: {
    fontSize: '48px',
    marginBottom: '8px',
  },
  dropText: {
    fontSize: '18px',
    color: colors.text,
    margin: 0,
  },
  dropSubText: {
    fontSize: '14px',
    color: '#666',
    margin: 0,
  },
  browseLink: {
    color: colors.primary,
    textDecoration: 'underline',
    fontWeight: 600,
  },
  dropHint: {
    fontSize: '12px',
    color: '#999',
    marginTop: '8px',
  },
  uploadingContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '16px',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #eee',
    borderTop: `4px solid ${colors.primary}`,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  uploadingText: {
    fontSize: '16px',
    color: colors.text,
  },
  clientError: {
    marginTop: '16px',
    padding: '12px 16px',
    backgroundColor: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: '8px',
    color: '#856404',
  },
  successBanner: {
    marginTop: '24px',
    padding: '20px 24px',
    backgroundColor: '#d4edda',
    border: `1px solid ${colors.green}`,
    borderRadius: '8px',
    color: '#155724',
  },
  successDetail: {
    marginTop: '8px',
    fontSize: '13px',
    color: '#155724',
  },
  errorSection: {
    marginTop: '24px',
  },
  errorHeading: {
    color: colors.red,
    marginBottom: '12px',
  },
  gridContainer: {
    width: '100%',
    minHeight: '200px',
  },
  resetButton: {
    marginTop: '16px',
    padding: '10px 20px',
    backgroundColor: colors.primary,
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
  },
};
