import { useEffect, useState, useCallback } from 'react';
import { getStoredToken } from '../../auth';
import { colors, theme } from '../../theme';
import { API_BASE_URL } from '../../config';

/** Sprint data entry as returned by the API */
interface SprintDataEntry {
  id: number;
  team: string;
  track: string;
  project: string;
  portfolio: string;
  jiraId: string;
  developmentStatus: string | null;
  status: string | null;
  sno: number | null;
  itemsList: string | null;
  walkthroughGivenOn: string | number | null;
  estimatedEffortWithAi: number | null;
  estimatedEffortWithoutAi: number | null;
  actualEffortWithAi: number | null;
  aiUsed: 'Y' | 'N' | null;
  devStartDate: string | number | null;
  devEndDate: string | number | null;
  uatDeliveryDate: string | number | null;
  uatDeliveryTarget: string | number | null;
  resources: string | null;
  goLivePlannedDate: string | number | null;
  goLiveDate: string | number | null;
  productionStatus: string | null;
  rollback: 'Y' | 'N' | null;
  rollbackReason: string | null;
  storyDropReason: string | null;
}

interface EntriesResponse {
  entries: SprintDataEntry[];
  total: number;
  limit: number;
  offset: number;
}

interface ColumnDef {
  key: string;
  label: string;
  sortable: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: 'id', label: 'ID', sortable: true },
  { key: 'jiraId', label: 'Jira ID', sortable: true },
  { key: 'team', label: 'Team', sortable: true },
  { key: 'track', label: 'Division', sortable: true },
  { key: 'project', label: 'Project', sortable: true },
  { key: 'portfolio', label: 'Portfolio', sortable: true },
  { key: 'developmentStatus', label: 'Dev Status', sortable: true },
];

const PAGE_SIZE = 25;

export default function AdminEntries() {
  const [entries, setEntries] = useState<SprintDataEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState('id');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline editing state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Partial<SprintDataEntry>>({});

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<SprintDataEntry | null>(null);

  // Add entry modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addFormData, setAddFormData] = useState<Record<string, string>>({
    team: '',
    track: '',
    project: '',
    portfolio: '',
    jiraId: '',
  });
  const [addError, setAddError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getStoredToken();
      const response = await fetch(
        `${API_BASE_URL}/api/admin/entries?limit=${PAGE_SIZE}&offset=${offset}&sort=${sort}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch entries: ${response.statusText}`);
      }
      const data: EntriesResponse = await response.json();
      setEntries(data.entries);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entries');
    } finally {
      setLoading(false);
    }
  }, [offset, sort]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Sorting
  const handleSort = (columnKey: string) => {
    if (sort === columnKey) {
      setSort(`-${columnKey}`);
    } else if (sort === `-${columnKey}`) {
      setSort('id');
    } else {
      setSort(columnKey);
    }
    setOffset(0);
  };

  const getSortIndicator = (columnKey: string): string => {
    if (sort === columnKey) return ' ▲';
    if (sort === `-${columnKey}`) return ' ▼';
    return '';
  };

  // Pagination
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = Math.min(offset + PAGE_SIZE, total);

  const handlePrevious = () => {
    if (offset > 0) {
      setOffset(offset - PAGE_SIZE);
    }
  };

  const handleNext = () => {
    if (offset + PAGE_SIZE < total) {
      setOffset(offset + PAGE_SIZE);
    }
  };

  // Inline editing
  const handleEdit = (entry: SprintDataEntry) => {
    setEditingId(entry.id);
    setEditData({
      jiraId: entry.jiraId,
      team: entry.team,
      track: entry.track,
      project: entry.project,
      portfolio: entry.portfolio,
      developmentStatus: entry.developmentStatus,
    });
  };

  const handleEditChange = (field: string, value: string) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (id: number) => {
    setError(null);
    try {
      const token = getStoredToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/entries/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editData),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        const errMsg = errData?.error || `Update failed: ${response.statusText}`;
        throw new Error(errMsg);
      }

      const updated = await response.json();
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...updated } : e))
      );
      setEditingId(null);
      setEditData({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditData({});
  };

  // Delete
  const handleDeleteClick = (entry: SprintDataEntry) => {
    setDeleteTarget(entry);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setError(null);
    try {
      const token = getStoredToken();
      const response = await fetch(
        `${API_BASE_URL}/api/admin/entries/${deleteTarget.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        const errMsg = errData?.error || `Delete failed: ${response.statusText}`;
        throw new Error(errMsg);
      }

      setEntries((prev) => prev.filter((e) => e.id !== deleteTarget.id));
      setTotal((prev) => prev - 1);
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setDeleteTarget(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteTarget(null);
  };

  // Add entry
  const handleAddChange = (field: string, value: string) => {
    setAddFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setError(null);
    try {
      const token = getStoredToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/entries`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(addFormData),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        const errMsg = errData?.error || `Create failed: ${response.statusText}`;
        if (errData?.details) {
          throw new Error(
            errData.details.map((d: { field: string; message: string }) => `${d.field}: ${d.message}`).join(', ')
          );
        }
        throw new Error(errMsg);
      }

      const created = await response.json();
      setEntries((prev) => [...prev, created]);
      setTotal((prev) => prev + 1);
      setShowAddModal(false);
      setAddFormData({ team: '', track: '', project: '', portfolio: '', jiraId: '' });
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Create failed');
    }
  };

  const handleAddCancel = () => {
    setShowAddModal(false);
    setAddFormData({ team: '', track: '', project: '', portfolio: '', jiraId: '' });
    setAddError(null);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: colors.text, marginBottom: '4px' }}>
            Entries Management
          </h1>
          <p style={{ fontSize: '14px', color: colors.textSecondary }}>
            Manage sprint data entries — {total} total entries
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          aria-label="Add Entry"
          style={{
            background: colors.primary,
            color: colors.textLight,
            border: 'none',
            borderRadius: theme.borderRadius.sm,
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Add Entry
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div
          role="alert"
          style={{
            background: '#FFF5F5',
            border: '1px solid #FED7D7',
            borderRadius: theme.borderRadius.sm,
            padding: theme.spacing.md,
            marginBottom: theme.spacing.md,
            color: colors.red,
            fontSize: '14px',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div data-testid="loading-indicator" style={{ textAlign: 'center', padding: theme.spacing.xl, color: colors.textSecondary }}>
          Loading entries...
        </div>
      )}

      {/* Data table */}
      {!loading && (
        <>
          <div style={{ overflowX: 'auto', border: `1px solid ${colors.border}`, borderRadius: theme.borderRadius.md }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '13px',
              }}
            >
              <thead>
                <tr style={{ background: colors.secondary }}>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => col.sortable && handleSort(col.key)}
                      style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontWeight: 600,
                        color: colors.text,
                        borderBottom: `2px solid ${colors.border}`,
                        cursor: col.sortable ? 'pointer' : 'default',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col.label}{getSortIndicator(col.key)}
                    </th>
                  ))}
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'center',
                      fontWeight: 600,
                      color: colors.text,
                      borderBottom: `2px solid ${colors.border}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={COLUMNS.length + 1}
                      style={{ padding: theme.spacing.xl, textAlign: 'center', color: colors.textSecondary }}
                    >
                      No entries found.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr
                      key={entry.id}
                      style={{ borderBottom: `1px solid ${colors.border}` }}
                    >
                      {editingId === entry.id ? (
                        <>
                          {/* ID is not editable */}
                          <td style={{ padding: '8px 16px' }}>{entry.id}</td>
                          {/* Editable fields */}
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="text"
                              value={editData.jiraId || ''}
                              onChange={(e) => handleEditChange('jiraId', e.target.value)}
                              aria-label="Edit jiraId"
                              style={inputStyle}
                            />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="text"
                              value={editData.team || ''}
                              onChange={(e) => handleEditChange('team', e.target.value)}
                              aria-label="Edit team"
                              style={inputStyle}
                            />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="text"
                              value={editData.track || ''}
                              onChange={(e) => handleEditChange('track', e.target.value)}
                              aria-label="Edit division"
                              style={inputStyle}
                            />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="text"
                              value={editData.project || ''}
                              onChange={(e) => handleEditChange('project', e.target.value)}
                              aria-label="Edit project"
                              style={inputStyle}
                            />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="text"
                              value={editData.portfolio || ''}
                              onChange={(e) => handleEditChange('portfolio', e.target.value)}
                              aria-label="Edit portfolio"
                              style={inputStyle}
                            />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="text"
                              value={editData.developmentStatus || ''}
                              onChange={(e) => handleEditChange('developmentStatus', e.target.value)}
                              aria-label="Edit developmentStatus"
                              style={inputStyle}
                            />
                          </td>
                          {/* Save/Cancel actions */}
                          <td style={{ padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button
                              onClick={() => handleSave(entry.id)}
                              style={{
                                ...actionBtnStyle,
                                background: colors.green,
                                color: '#fff',
                                marginRight: '4px',
                              }}
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancel}
                              style={{
                                ...actionBtnStyle,
                                background: colors.secondary,
                                color: colors.text,
                                border: `1px solid ${colors.border}`,
                              }}
                            >
                              Cancel
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={cellStyle}>{entry.id}</td>
                          <td style={cellStyle}>{entry.jiraId}</td>
                          <td style={cellStyle}>{entry.team}</td>
                          <td style={cellStyle}>{entry.track}</td>
                          <td style={cellStyle}>{entry.project}</td>
                          <td style={cellStyle}>{entry.portfolio}</td>
                          <td style={cellStyle}>{entry.developmentStatus || '—'}</td>
                          {/* Edit/Delete actions */}
                          <td style={{ padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button
                              onClick={() => handleEdit(entry)}
                              aria-label={`Edit entry ${entry.id}`}
                              style={{
                                ...actionBtnStyle,
                                background: colors.primaryLight,
                                color: colors.primary,
                                marginRight: '4px',
                              }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteClick(entry)}
                              aria-label={`Delete entry ${entry.id}`}
                              style={{
                                ...actionBtnStyle,
                                background: '#FFF5F5',
                                color: colors.red,
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: theme.spacing.md,
              fontSize: '14px',
              color: colors.textSecondary,
            }}
          >
            <span>
              Showing {showingFrom}–{showingTo} of {total}
            </span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={handlePrevious}
                disabled={offset === 0}
                aria-label="Previous page"
                style={{
                  ...paginationBtnStyle,
                  opacity: offset === 0 ? 0.5 : 1,
                  cursor: offset === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Previous
              </button>
              <span>
                Page {currentPage} of {totalPages || 1}
              </span>
              <button
                onClick={handleNext}
                disabled={offset + PAGE_SIZE >= total}
                aria-label="Next page"
                style={{
                  ...paginationBtnStyle,
                  opacity: offset + PAGE_SIZE >= total ? 0.5 : 1,
                  cursor: offset + PAGE_SIZE >= total ? 'not-allowed' : 'pointer',
                }}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Delete confirmation"
          style={overlayStyle}
        >
          <div style={modalStyle}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: colors.text, marginBottom: theme.spacing.md }}>
              Confirm Deletion
            </h2>
            <p style={{ fontSize: '14px', color: colors.textSecondary, marginBottom: theme.spacing.lg }}>
              Are you sure you want to delete this entry? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={handleDeleteCancel}
                style={{
                  ...actionBtnStyle,
                  padding: '8px 16px',
                  background: colors.secondary,
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                style={{
                  ...actionBtnStyle,
                  padding: '8px 16px',
                  background: colors.red,
                  color: '#fff',
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Entry Modal */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add entry"
          style={overlayStyle}
        >
          <div style={{ ...modalStyle, maxWidth: '500px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: colors.text, marginBottom: theme.spacing.md }}>
              Add New Entry
            </h2>

            {addError && (
              <div
                role="alert"
                style={{
                  background: '#FFF5F5',
                  border: '1px solid #FED7D7',
                  borderRadius: theme.borderRadius.sm,
                  padding: theme.spacing.sm,
                  marginBottom: theme.spacing.md,
                  color: colors.red,
                  fontSize: '13px',
                }}
              >
                {addError}
              </div>
            )}

            <form onSubmit={handleAddSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { field: 'jiraId', label: 'Jira ID', required: true },
                  { field: 'team', label: 'Team', required: true },
                  { field: 'track', label: 'Division', required: true },
                  { field: 'project', label: 'Project', required: true },
                  { field: 'portfolio', label: 'Portfolio', required: true },
                ].map(({ field, label, required }) => (
                  <div key={field}>
                    <label
                      htmlFor={`add-${field}`}
                      style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: colors.text, marginBottom: '4px' }}
                    >
                      {label} {required && <span style={{ color: colors.red }}>*</span>}
                    </label>
                    <input
                      id={`add-${field}`}
                      type="text"
                      value={addFormData[field] || ''}
                      onChange={(e) => handleAddChange(field, e.target.value)}
                      required={required}
                      style={{ ...inputStyle, width: '100%' }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: theme.spacing.lg }}>
                <button
                  type="button"
                  onClick={handleAddCancel}
                  style={{
                    ...actionBtnStyle,
                    padding: '8px 16px',
                    background: colors.secondary,
                    color: colors.text,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    ...actionBtnStyle,
                    padding: '8px 16px',
                    background: colors.primary,
                    color: '#fff',
                  }}
                >
                  Create Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Styles
const cellStyle: React.CSSProperties = {
  padding: '10px 16px',
  color: colors.text,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '180px',
};

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: `1px solid ${colors.border}`,
  borderRadius: '4px',
  fontSize: '13px',
  width: '100%',
  boxSizing: 'border-box',
};

const actionBtnStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: '4px',
  padding: '5px 10px',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
};

const paginationBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  border: `1px solid ${colors.border}`,
  borderRadius: '4px',
  background: colors.background,
  color: colors.text,
  fontSize: '13px',
  fontWeight: 500,
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: colors.background,
  borderRadius: theme.borderRadius.md,
  padding: theme.spacing.xl,
  boxShadow: theme.shadows.hover,
  maxWidth: '400px',
  width: '90%',
};
