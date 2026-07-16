import { useState, useCallback, useRef, useEffect, DragEvent, ChangeEvent } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import apiClient from '../api/client';
import { confirmUpload } from '../api/client';
import type { UploadResult, ValidationError, NewTeamConfirmationResponse, ConfirmUploadResponse } from '../types';
import { colors } from '../theme';
import { getStoredUser } from '../auth';

/** Maximum file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Allowed file extensions */
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];

/** Allowed MIME types for Excel files */
const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

type UploadState = 'idle' | 'dragging' | 'validating' | 'uploading' | 'success' | 'error' | 'confirming';

interface UploadPageState {
  state: UploadState;
  result: UploadResult | null;
  errors: ValidationError[];
  clientError: string | null;
  /** Data from 409 response when new teams are detected */
  confirmationData: NewTeamConfirmationResponse | null;
  /** Extended success result that includes teamsCreated */
  confirmResult: ConfirmUploadResponse | null;
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
    confirmationData: null,
    confirmResult: null,
  });

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const user = getStoredUser();
  const isEM = user?.role === 'Engineering_Manager';

  const resetState = useCallback(() => {
    setPageState({ state: 'idle', result: null, errors: [], clientError: null, confirmationData: null, confirmResult: null });
    setConfirmError(null);
  }, []);

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const response = await apiClient.get('/api/upload/template', {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'sprint-data-template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'response' in err &&
        typeof (err as { response?: { data?: unknown } }).response?.data === 'object'
      ) {
        // Try to read the error from the blob response
        try {
          const blob = (err as { response: { data: Blob } }).response.data;
          const text = await blob.text();
          const parsed = JSON.parse(text);
          setDownloadError(parsed.error || 'Failed to download template.');
        } catch {
          setDownloadError('Failed to download template. No function assignment found.');
        }
      } else {
        setDownloadError('Failed to download template. Please try again.');
      }
    } finally {
      setDownloading(false);
    }
  };

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
        confirmationData: null,
        confirmResult: null,
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
        confirmationData: null,
        confirmResult: null,
      });
    } catch (err: unknown) {
      if (isAxiosErrorWithValidation(err)) {
        const { status, data } = err.response;

        // Handle 409 — new teams detected, show confirmation modal
        if (status === 409) {
          const confirmData = data as NewTeamConfirmationResponse;
          setPageState({
            state: 'confirming',
            result: null,
            errors: [],
            clientError: null,
            confirmationData: confirmData,
            confirmResult: null,
          });
          return;
        }

        const errorData = data as { errors?: ValidationError[] };
        setPageState({
          state: 'error',
          result: null,
          errors: errorData.errors ?? [],
          clientError: null,
          confirmationData: null,
          confirmResult: null,
        });
      } else {
        const message = err instanceof Error ? err.message : 'Upload failed. Please try again.';
        setPageState({
          state: 'idle',
          result: null,
          errors: [],
          clientError: message,
          confirmationData: null,
          confirmResult: null,
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

  /** Handle user confirming new team creation */
  const handleConfirmTeams = async () => {
    if (!pageState.confirmationData) return;

    setConfirmLoading(true);
    setConfirmError(null);

    try {
      const result = await confirmUpload({
        pendingUploadId: pageState.confirmationData.pendingUploadId,
        confirmed: true,
      });

      if ('cancelled' in result) {
        // Unexpected — got a decline response on confirm
        resetState();
        return;
      }

      setPageState({
        state: 'success',
        result: null,
        errors: [],
        clientError: null,
        confirmationData: null,
        confirmResult: result as ConfirmUploadResponse,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to confirm upload. Please try again.';
      setConfirmError(message);
    } finally {
      setConfirmLoading(false);
    }
  };

  /** Handle user cancelling the upload */
  const handleCancelUpload = async () => {
    if (!pageState.confirmationData) return;

    setConfirmLoading(true);
    setConfirmError(null);

    try {
      await confirmUpload({
        pendingUploadId: pageState.confirmationData.pendingUploadId,
        confirmed: false,
      });
    } catch {
      // Even if decline fails, we reset to idle
    } finally {
      setConfirmLoading(false);
      resetState();
    }
  };

  // Focus management for the modal
  useEffect(() => {
    if (pageState.state === 'confirming' && modalRef.current) {
      modalRef.current.focus();
    }
  }, [pageState.state]);

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
      <p style={{ color: colors.textSecondary, fontSize: '14px', marginBottom: '24px' }}>
        Upload your team's sprint delivery Excel file to calculate KPIs
      </p>

      {/* Download Template Button — only for Engineering Managers */}
      {isEM && (
        <div style={{ marginBottom: '16px' }}>
          <button
            onClick={handleDownloadTemplate}
            disabled={downloading}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              color: colors.primary,
              background: colors.primaryLight,
              border: `1px solid ${colors.primary}`,
              borderRadius: '6px',
              cursor: downloading ? 'wait' : 'pointer',
              transition: 'background 0.2s',
              opacity: downloading ? 0.7 : 1,
            }}
          >
            {downloading ? 'Downloading...' : '📥 Download Template'}
          </button>
          {downloadError && (
            <p style={{ color: colors.red, fontSize: '13px', marginTop: '8px' }}>
              {downloadError}
            </p>
          )}
        </div>
      )}

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

      {/* Success banner after confirmation (teams created) */}
      {pageState.state === 'success' && pageState.confirmResult && (
        <div style={styles.successBanner} role="status" data-testid="success-banner">
          <strong>✓ {pageState.confirmResult.rowsIngested} rows ingested successfully</strong>
          <p style={styles.successDetail}>
            Upload ID: {pageState.confirmResult.uploadId} • {new Date(pageState.confirmResult.timestamp).toLocaleString()}
          </p>
          {pageState.confirmResult.teamsCreated.length > 0 && (
            <p style={{ ...styles.successDetail, marginTop: '4px' }} data-testid="teams-created-info">
              Teams created: {pageState.confirmResult.teamsCreated.join(', ')}
            </p>
          )}
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

      {/* New Team Confirmation Modal */}
      {pageState.state === 'confirming' && pageState.confirmationData && (
        <div
          style={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-teams-title"
          data-testid="confirmation-modal"
          ref={modalRef}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !confirmLoading) {
              void handleCancelUpload();
            }
          }}
        >
          <div style={styles.modalContent}>
            <h2 id="confirm-teams-title" style={styles.modalTitle}>
              New Teams Detected
            </h2>
            <p style={styles.modalDescription}>
              {pageState.confirmationData.message ||
                'The following team names were not found in the system. Would you like to create them and proceed with the upload?'}
            </p>
            <ul style={styles.teamList} data-testid="new-teams-list">
              {pageState.confirmationData.newTeams.map((team) => (
                <li key={team} style={styles.teamListItem}>
                  {team}
                </li>
              ))}
            </ul>

            {confirmError && (
              <div style={styles.confirmErrorBanner} role="alert" data-testid="confirm-error">
                ⚠️ {confirmError}
              </div>
            )}

            <div style={styles.modalActions}>
              <button
                onClick={handleCancelUpload}
                disabled={confirmLoading}
                style={{
                  ...styles.modalButton,
                  ...styles.modalButtonCancel,
                  opacity: confirmLoading ? 0.6 : 1,
                }}
                data-testid="cancel-upload-button"
              >
                Cancel Upload
              </button>
              <button
                onClick={handleConfirmTeams}
                disabled={confirmLoading}
                style={{
                  ...styles.modalButton,
                  ...styles.modalButtonConfirm,
                  opacity: confirmLoading ? 0.6 : 1,
                }}
                data-testid="confirm-teams-button"
              >
                {confirmLoading ? 'Creating...' : 'Confirm & Create Teams'}
              </button>
            </div>
          </div>
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
    padding: '0',
  },
  heading: {
    color: colors.text,
    fontSize: '24px',
    fontWeight: 700,
    marginBottom: '8px',
  },
  dropZone: {
    borderWidth: '2px',
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: '16px',
    padding: '56px 24px',
    textAlign: 'center' as const,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    backgroundColor: colors.background,
  },
  dropZoneDragging: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
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
    fontWeight: 500,
    margin: 0,
  },
  dropSubText: {
    fontSize: '14px',
    color: colors.textSecondary,
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
    border: `4px solid ${colors.primaryLight}`,
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
    padding: '14px 18px',
    backgroundColor: '#FFF8E6',
    border: `1px solid ${colors.amber}`,
    borderRadius: '10px',
    color: '#92610E',
    fontSize: '14px',
  },
  successBanner: {
    marginTop: '24px',
    padding: '24px',
    backgroundColor: '#E6F9ED',
    border: `1px solid ${colors.green}`,
    borderRadius: '12px',
    color: '#155724',
  },
  successDetail: {
    marginTop: '8px',
    fontSize: '13px',
    color: '#155724',
    opacity: 0.8,
  },
  errorSection: {
    marginTop: '24px',
  },
  errorHeading: {
    color: colors.red,
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '12px',
  },
  gridContainer: {
    width: '100%',
    minHeight: '200px',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  resetButton: {
    marginTop: '16px',
    padding: '10px 24px',
    backgroundColor: colors.primary,
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    transition: 'background 0.2s',
  },
  modalOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: colors.background,
    borderRadius: '12px',
    padding: '32px',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.15)',
    maxWidth: '480px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto',
  },
  modalTitle: {
    color: colors.text,
    fontSize: '20px',
    fontWeight: 700,
    marginBottom: '12px',
    marginTop: 0,
  },
  modalDescription: {
    color: colors.textSecondary,
    fontSize: '14px',
    lineHeight: '1.5',
    marginBottom: '16px',
  },
  teamList: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 20px 0',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    overflow: 'hidden',
  },
  teamListItem: {
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: colors.text,
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.secondary,
  },
  confirmErrorBanner: {
    padding: '12px 16px',
    backgroundColor: '#FFF8E6',
    border: `1px solid ${colors.amber}`,
    borderRadius: '8px',
    color: '#92610E',
    fontSize: '13px',
    marginBottom: '16px',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  modalButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600,
    borderRadius: '6px',
    cursor: 'pointer',
    border: 'none',
    transition: 'opacity 0.2s',
  },
  modalButtonCancel: {
    backgroundColor: colors.secondary,
    color: colors.text,
    border: `1px solid ${colors.border}`,
  },
  modalButtonConfirm: {
    backgroundColor: colors.primary,
    color: '#fff',
  },
};
