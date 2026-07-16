import { useEffect, useState, useCallback } from 'react';
import { getSubmissionsHistory, getSubmissionEntries } from '../api/client';
import apiClient from '../api/client';
import type { SubmissionRecord, SubmissionEntry } from '../api/client';
import { getStoredUser } from '../auth';
import { colors } from '../theme';

type ViewMode = 'uploads' | 'entries' | 'byFunction';

/** A single upload record within a function group */
interface FunctionUpload {
  id: string;
  fileName: string;
  uploaderName: string;
  rowsIngested: number;
  status: string;
  uploadedAt: string;
}

/** Uploads grouped by function name */
interface FunctionGroup {
  functionName: string;
  uploads: FunctionUpload[];
}

interface BulkDeleteNotification {
  type: 'success' | 'error';
  message: string;
}

/**
 * Historical Submissions page.
 * Displays past upload records and sprint entries ordered by ingestion date descending.
 * For Engineering Managers, data is automatically scoped to their assigned team.
 * For Leadership/Super_Admin, all records are shown.
 *
 * Requirements: 2.4 (descending order), 1.7 (team scoping for EM)
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.10, 3.11 (bulk delete UI)
 */
export default function History() {
  const [viewMode, setViewMode] = useState<ViewMode>('uploads');
  const [uploads, setUploads] = useState<SubmissionRecord[]>([]);
  const [entries, setEntries] = useState<SubmissionEntry[]>([]);
  const [functionGroups, setFunctionGroups] = useState<FunctionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  // Bulk delete state
  const [selectedUploadIds, setSelectedUploadIds] = useState<Set<string>>(new Set());
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notification, setNotification] = useState<BulkDeleteNotification | null>(null);

  const user = getStoredUser();
  const isEM = user?.role === 'Engineering_Manager';
  const canBulkDelete = user?.role === 'Engineering_Manager' || user?.role === 'Super_Admin';

  useEffect(() => {
    setOffset(0);
  }, [viewMode]);

  // Clear selection when switching views or pages
  useEffect(() => {
    setSelectedUploadIds(new Set());
  }, [viewMode, offset]);

  // Auto-dismiss notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const fetchData = useCallback(async () => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    try {
      if (viewMode === 'uploads') {
        const response = await getSubmissionsHistory({ limit, offset });
        if (!cancelled) {
          setUploads(response.data);
          setTotal(response.total);
        }
      } else if (viewMode === 'entries') {
        const response = await getSubmissionEntries({ limit, offset });
        if (!cancelled) {
          setEntries(response.data);
          setTotal(response.total);
        }
      } else if (viewMode === 'byFunction') {
        const response = await apiClient.get<{ success: boolean; data: FunctionGroup[] }>('/api/uploads/by-function');
        if (!cancelled) {
          setFunctionGroups(response.data.data);
          setTotal(0); // No pagination for grouped view
        }
      }
    } catch (err) {
      if (!cancelled) {
        setError('Failed to load submission history. Please try again.');
      }
    } finally {
      if (!cancelled) {
        setLoading(false);
      }
    }

    return () => { cancelled = true; };
  }, [viewMode, offset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Checkbox handling
  const handleSelectUpload = (uploadId: string) => {
    setSelectedUploadIds((prev) => {
      const next = new Set(prev);
      if (next.has(uploadId)) {
        next.delete(uploadId);
      } else {
        next.add(uploadId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedUploadIds.size === uploads.length) {
      setSelectedUploadIds(new Set());
    } else {
      setSelectedUploadIds(new Set(uploads.map((u) => u.id)));
    }
  };

  // Bulk delete actions
  const handleDeleteSelectedClick = () => {
    setIsConfirmDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    setIsConfirmDialogOpen(false);

    try {
      const response = await apiClient.delete('/api/uploads/bulk', {
        data: { uploadIds: Array.from(selectedUploadIds) },
      });

      const { deletedCount } = response.data;
      setSelectedUploadIds(new Set());
      setNotification({
        type: 'success',
        message: `Successfully deleted ${deletedCount} upload${deletedCount !== 1 ? 's' : ''}.`,
      });

      // Refresh the uploads list
      await fetchData();
    } catch (err: unknown) {
      const errorMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Bulk delete failed. Please try again.'
          : 'Bulk delete failed. Please try again.';
      // Retain selection state on failure (requirement 3.11)
      setNotification({
        type: 'error',
        message: errorMessage,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setIsConfirmDialogOpen(false);
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div>
      {/* Notification banner */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 1000,
            padding: '12px 20px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            background: notification.type === 'success' ? '#E6F9ED' : '#FFF5F5',
            color: notification.type === 'success' ? '#155724' : colors.red,
            border: `1px solid ${notification.type === 'success' ? '#C3E6CB' : '#FED7D7'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>{notification.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            style={{
              marginLeft: '12px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              color: 'inherit',
              padding: '0 4px',
            }}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      {/* Confirmation dialog overlay */}
      {isConfirmDialogOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-title"
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '32px',
              maxWidth: '420px',
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
          >
            <h2
              id="confirm-delete-title"
              style={{ fontSize: '18px', fontWeight: 700, color: colors.text, marginBottom: '12px' }}
            >
              Confirm Bulk Delete
            </h2>
            <p style={{ fontSize: '14px', color: colors.textSecondary, marginBottom: '24px', lineHeight: 1.5 }}>
              Are you sure you want to delete {selectedUploadIds.size} upload{selectedUploadIds.size !== 1 ? 's' : ''}?
              This will also remove all associated sprint data entries. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleCancelDelete}
                style={{
                  padding: '8px 20px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  background: '#fff',
                  color: colors.text,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                style={{
                  padding: '8px 20px',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  background: colors.red,
                  color: '#fff',
                  fontWeight: 500,
                }}
              >
                Delete {selectedUploadIds.size} Upload{selectedUploadIds.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: colors.text, marginBottom: '4px' }}>
          Submission History
        </h1>
        <p style={{ fontSize: '14px', color: colors.textSecondary }}>
          {isEM
            ? `Historical uploads and sprint entries for your team`
            : 'Historical uploads and sprint entries across all teams'}
        </p>
      </div>

      {/* View mode toggle + bulk delete button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '4px', background: colors.secondary, borderRadius: '8px', padding: '4px', width: 'fit-content' }}>
          <button
            onClick={() => setViewMode('uploads')}
            style={{
              padding: '8px 20px',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              background: viewMode === 'uploads' ? colors.primary : 'transparent',
              color: viewMode === 'uploads' ? '#fff' : colors.textSecondary,
              transition: 'all 0.2s',
            }}
          >
            Uploads
          </button>
          <button
            onClick={() => setViewMode('entries')}
            style={{
              padding: '8px 20px',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              background: viewMode === 'entries' ? colors.primary : 'transparent',
              color: viewMode === 'entries' ? '#fff' : colors.textSecondary,
              transition: 'all 0.2s',
            }}
          >
            Sprint Entries
          </button>
          <button
            onClick={() => setViewMode('byFunction')}
            style={{
              padding: '8px 20px',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              background: viewMode === 'byFunction' ? colors.primary : 'transparent',
              color: viewMode === 'byFunction' ? '#fff' : colors.textSecondary,
              transition: 'all 0.2s',
            }}
          >
            By Function
          </button>
        </div>

        {/* Delete Selected button - visible only when uploads tab active and selection is non-empty */}
        {viewMode === 'uploads' && canBulkDelete && selectedUploadIds.size > 0 && (
          <button
            onClick={handleDeleteSelectedClick}
            disabled={isDeleting}
            style={{
              padding: '8px 20px',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              background: isDeleting ? '#ccc' : colors.red,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: isDeleting ? 0.7 : 1,
              transition: 'all 0.2s',
            }}
          >
            {isDeleting ? 'Deleting...' : `Delete Selected (${selectedUploadIds.size})`}
          </button>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ padding: '48px', textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: `4px solid ${colors.primaryLight}`, borderTop: `4px solid ${colors.primary}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: colors.textSecondary, fontSize: '14px' }}>Loading history...</p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div style={{ background: '#FFF5F5', border: '1px solid #FED7D7', borderRadius: '12px', padding: '24px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: colors.red, marginBottom: '12px' }}>⚠️ {error}</p>
          <button
            onClick={() => setOffset(0)}
            style={{ padding: '8px 20px', background: colors.primary, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Uploads view */}
      {!loading && !error && viewMode === 'uploads' && (
        <div>
          {uploads.length === 0 ? (
            <div style={{ background: colors.secondary, borderRadius: '12px', padding: '48px', textAlign: 'center' }}>
              <p style={{ fontSize: '16px', color: colors.textSecondary }}>No upload records found.</p>
            </div>
          ) : (
            <div style={{ borderRadius: '12px', border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: colors.secondary }}>
                    {canBulkDelete && (
                      <th style={{ ...thStyle, width: '40px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={uploads.length > 0 && selectedUploadIds.size === uploads.length}
                          onChange={handleSelectAll}
                          aria-label="Select all uploads"
                          style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                      </th>
                    )}
                    <th style={thStyle}>File Name</th>
                    <th style={thStyle}>Uploaded By</th>
                    <th style={thStyle}>Rows</th>
                    <th style={thStyle}>Status</th>
                    {!isEM && <th style={thStyle}>Team</th>}
                    <th style={thStyle}>Upload Date ↓</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((upload) => (
                    <tr key={upload.id} style={{ borderTop: `1px solid ${colors.border}`, background: selectedUploadIds.has(upload.id) ? colors.primaryLight : 'transparent' }}>
                      {canBulkDelete && (
                        <td style={{ ...tdStyle, textAlign: 'center', width: '40px' }}>
                          <input
                            type="checkbox"
                            checked={selectedUploadIds.has(upload.id)}
                            onChange={() => handleSelectUpload(upload.id)}
                            aria-label={`Select upload ${upload.fileName}`}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                        </td>
                      )}
                      <td style={tdStyle}>{upload.fileName}</td>
                      <td style={tdStyle}>{upload.uploadedBy}</td>
                      <td style={tdStyle}>{upload.rowsIngested}</td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 500,
                          background: upload.status === 'success' ? '#E6F9ED' : upload.status === 'failed' ? '#FFF5F5' : '#FFF8E6',
                          color: upload.status === 'success' ? '#155724' : upload.status === 'failed' ? colors.red : '#92610E',
                        }}>
                          {upload.status}
                        </span>
                      </td>
                      {!isEM && <td style={tdStyle}>{upload.team || '—'}</td>}
                      <td style={tdStyle}>{formatDate(upload.uploadedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Entries view */}
      {!loading && !error && viewMode === 'entries' && (
        <div>
          {entries.length === 0 ? (
            <div style={{ background: colors.secondary, borderRadius: '12px', padding: '48px', textAlign: 'center' }}>
              <p style={{ fontSize: '16px', color: colors.textSecondary }}>No sprint entries found.</p>
            </div>
          ) : (
            <div style={{ borderRadius: '12px', border: `1px solid ${colors.border}`, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '900px' }}>
                <thead>
                  <tr style={{ background: colors.secondary }}>
                    <th style={thStyle}>JIRA ID</th>
                    <th style={thStyle}>Team</th>
                    <th style={thStyle}>Project</th>
                    <th style={thStyle}>Division</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Ingested ↓</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td style={tdStyle}>{entry.jiraId}</td>
                      <td style={tdStyle}>{entry.team}</td>
                      <td style={tdStyle}>{entry.project}</td>
                      <td style={tdStyle}>{entry.track}</td>
                      <td style={tdStyle}>{entry.developmentStatus || '—'}</td>
                      <td style={tdStyle}>{formatDate(entry.ingestedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* By Function view */}
      {!loading && !error && viewMode === 'byFunction' && (
        <div>
          {functionGroups.length === 0 ? (
            <div style={{ background: colors.secondary, borderRadius: '12px', padding: '48px', textAlign: 'center' }}>
              <p style={{ fontSize: '16px', color: colors.textSecondary }}>No upload records found grouped by function.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {functionGroups.map((group) => (
                <div key={group.functionName} style={{ borderRadius: '12px', border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
                  <div style={{ background: colors.secondary, padding: '12px 16px', borderBottom: `1px solid ${colors.border}` }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: colors.text, margin: 0 }}>
                      {group.functionName}
                    </h3>
                    <span style={{ fontSize: '12px', color: colors.textSecondary }}>
                      {group.uploads.length} upload{group.uploads.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: '#FAFAFA' }}>
                        <th style={thStyle}>File Name</th>
                        <th style={thStyle}>Uploaded By (EM)</th>
                        <th style={thStyle}>Rows Ingested</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Upload Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.uploads.map((upload) => (
                        <tr key={upload.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                          <td style={tdStyle}>{upload.fileName}</td>
                          <td style={tdStyle}>{upload.uploaderName || '—'}</td>
                          <td style={tdStyle}>{upload.rowsIngested}</td>
                          <td style={tdStyle}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontWeight: 500,
                              background: upload.status === 'success' ? '#E6F9ED' : upload.status === 'failed' ? '#FFF5F5' : '#FFF8E6',
                              color: upload.status === 'success' ? '#155724' : upload.status === 'failed' ? colors.red : '#92610E',
                            }}>
                              {upload.status}
                            </span>
                          </td>
                          <td style={tdStyle}>{formatDate(upload.uploadedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && viewMode !== 'byFunction' && total > limit && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '20px', padding: '12px 0' }}>
          <p style={{ fontSize: '13px', color: colors.textSecondary }}>
            Showing {offset + 1}–{Math.min(offset + limit, total)} of {total} records
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              style={{
                padding: '6px 14px',
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                fontSize: '13px',
                cursor: offset === 0 ? 'not-allowed' : 'pointer',
                opacity: offset === 0 ? 0.5 : 1,
                background: '#fff',
              }}
            >
              Previous
            </button>
            <span style={{ padding: '6px 12px', fontSize: '13px', color: colors.textSecondary }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
              style={{
                padding: '6px 14px',
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                fontSize: '13px',
                cursor: offset + limit >= total ? 'not-allowed' : 'pointer',
                opacity: offset + limit >= total ? 0.5 : 1,
                background: '#fff',
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Format an ISO date string for display */
function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: '12px',
  color: '#5A5A6E',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  color: '#1A1A2E',
};
