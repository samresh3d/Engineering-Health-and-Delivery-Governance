import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { colors, theme } from '../../theme';

interface FunctionRecord {
  id: number;
  name: string;
  createdAt: string;
}

/** Validates function name: 1-100 chars, alphanumeric/hyphens/spaces/underscores only */
function validateFunctionName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Function name is required.';
  if (trimmed.length > 100) return 'Function name must not exceed 100 characters.';
  if (!/^[a-zA-Z0-9\-_ ]+$/.test(trimmed)) {
    return 'Function name can only contain letters, numbers, hyphens, spaces, and underscores.';
  }
  return null;
}

export default function FunctionManager() {
  const [functions, setFunctions] = useState<FunctionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create state
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchFunctions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<{ functions: FunctionRecord[] }>('/api/admin/functions');
      setFunctions(response.data.functions);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to load functions.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFunctions();
  }, [fetchFunctions]);

  // --- Create ---
  const handleCreate = async () => {
    const validationError = validateFunctionName(newName);
    if (validationError) {
      setCreateError(validationError);
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await apiClient.post('/api/admin/functions', { name: newName.trim() });
      setNewName('');
      await fetchFunctions();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to create function.';
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  };

  // --- Rename ---
  const startEditing = (fn: FunctionRecord) => {
    setEditingId(fn.id);
    setEditName(fn.name);
    setEditError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditError(null);
  };

  const handleRename = async (id: number) => {
    const validationError = validateFunctionName(editName);
    if (validationError) {
      setEditError(validationError);
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      await apiClient.put(`/api/admin/functions/${id}`, { name: editName.trim() });
      setEditingId(null);
      setEditName('');
      await fetchFunctions();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to rename function.';
      setEditError(message);
    } finally {
      setSaving(false);
    }
  };

  // --- Delete ---
  const confirmDelete = (id: number) => {
    setDeletingId(id);
    setDeleteError(null);
  };

  const cancelDelete = () => {
    setDeletingId(null);
    setDeleteError(null);
  };

  const handleDelete = async (id: number) => {
    setDeleteError(null);
    try {
      await apiClient.delete(`/api/admin/functions/${id}`);
      setDeletingId(null);
      await fetchFunctions();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to delete function.';
      setDeleteError(message);
    }
  };

  return (
    <div>
      <h1
        style={{
          color: colors.text,
          fontSize: '24px',
          marginBottom: '8px',
          fontWeight: 600,
          fontFamily: theme.fonts.heading,
        }}
      >
        Function Management
      </h1>
      <p style={{ color: colors.textSecondary, fontSize: '14px', marginBottom: '24px' }}>
        Manage organizational Functions. Each Function groups one or more Teams.
      </p>

      {/* Create new function */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'flex-start',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <input
            type="text"
            placeholder="New function name..."
            aria-label="New function name"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setCreateError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
            style={{
              padding: '10px 14px',
              border: `1px solid ${createError ? colors.red : colors.border}`,
              borderRadius: theme.borderRadius.sm,
              fontSize: '14px',
              minWidth: '260px',
              outline: 'none',
              fontFamily: theme.fonts.body,
            }}
          />
          {createError && (
            <span
              role="alert"
              style={{ color: colors.red, fontSize: '12px' }}
            >
              {createError}
            </span>
          )}
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          aria-label="Create function"
          style={{
            padding: '10px 20px',
            background: colors.primary,
            color: colors.textLight,
            border: 'none',
            borderRadius: theme.borderRadius.sm,
            fontSize: '14px',
            fontWeight: 500,
            cursor: creating ? 'not-allowed' : 'pointer',
            opacity: creating ? 0.7 : 1,
            fontFamily: theme.fonts.body,
          }}
        >
          {creating ? 'Creating...' : 'Add Function'}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div data-testid="functions-loading" style={{ color: colors.textSecondary, padding: '24px 0' }}>
          Loading functions...
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div
          data-testid="functions-error"
          role="alert"
          style={{
            color: colors.red,
            padding: '12px',
            background: '#fef2f2',
            borderRadius: theme.borderRadius.sm,
            marginBottom: '16px',
          }}
        >
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && functions.length === 0 && (
        <div data-testid="functions-empty" style={{ color: colors.textSecondary, padding: '24px 0' }}>
          No functions configured. Add a function above to get started.
        </div>
      )}

      {/* Functions list */}
      {!loading && !error && functions.length > 0 && (
        <div
          data-testid="functions-list"
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: theme.borderRadius.md,
            overflow: 'hidden',
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 160px 180px',
              padding: '12px 20px',
              background: colors.secondary,
              borderBottom: `1px solid ${colors.border}`,
              fontWeight: 600,
              fontSize: '13px',
              color: colors.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            <span>Name</span>
            <span>Created</span>
            <span style={{ textAlign: 'right' }}>Actions</span>
          </div>

          {/* Table rows */}
          {functions.map((fn) => (
            <div
              key={fn.id}
              data-testid={`function-row-${fn.id}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 160px 180px',
                padding: '14px 20px',
                borderBottom: `1px solid ${colors.border}`,
                alignItems: 'center',
                background: deletingId === fn.id ? '#fef2f2' : colors.background,
              }}
            >
              {/* Name cell (inline edit or display) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {editingId === fn.id ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => {
                        setEditName(e.target.value);
                        setEditError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(fn.id);
                        if (e.key === 'Escape') cancelEditing();
                      }}
                      aria-label="Edit function name"
                      autoFocus
                      style={{
                        padding: '6px 10px',
                        border: `1px solid ${editError ? colors.red : colors.border}`,
                        borderRadius: theme.borderRadius.sm,
                        fontSize: '14px',
                        minWidth: '180px',
                        outline: 'none',
                        fontFamily: theme.fonts.body,
                      }}
                    />
                    <button
                      onClick={() => handleRename(fn.id)}
                      disabled={saving}
                      aria-label="Save rename"
                      style={{
                        padding: '6px 12px',
                        background: colors.primary,
                        color: colors.textLight,
                        border: 'none',
                        borderRadius: theme.borderRadius.sm,
                        fontSize: '12px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        opacity: saving ? 0.7 : 1,
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEditing}
                      aria-label="Cancel rename"
                      style={{
                        padding: '6px 12px',
                        background: 'transparent',
                        color: colors.textSecondary,
                        border: `1px solid ${colors.border}`,
                        borderRadius: theme.borderRadius.sm,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <span style={{ color: colors.text, fontSize: '14px', fontWeight: 500 }}>
                    {fn.name}
                  </span>
                )}
                {editingId === fn.id && editError && (
                  <span role="alert" style={{ color: colors.red, fontSize: '12px' }}>
                    {editError}
                  </span>
                )}
              </div>

              {/* Created date */}
              <span style={{ color: colors.textSecondary, fontSize: '13px' }}>
                {new Date(fn.createdAt).toLocaleDateString()}
              </span>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                {deletingId === fn.id ? (
                  <>
                    <span style={{ fontSize: '12px', color: colors.red, alignSelf: 'center' }}>
                      Delete?
                    </span>
                    <button
                      onClick={() => handleDelete(fn.id)}
                      aria-label={`Confirm delete ${fn.name}`}
                      style={{
                        padding: '6px 12px',
                        background: colors.red,
                        color: colors.textLight,
                        border: 'none',
                        borderRadius: theme.borderRadius.sm,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      Yes
                    </button>
                    <button
                      onClick={cancelDelete}
                      aria-label="Cancel delete"
                      style={{
                        padding: '6px 12px',
                        background: 'transparent',
                        color: colors.textSecondary,
                        border: `1px solid ${colors.border}`,
                        borderRadius: theme.borderRadius.sm,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      No
                    </button>
                  </>
                ) : (
                  <>
                    {editingId !== fn.id && (
                      <>
                        <button
                          onClick={() => startEditing(fn)}
                          aria-label={`Rename ${fn.name}`}
                          style={{
                            padding: '6px 12px',
                            background: 'transparent',
                            color: colors.primary,
                            border: `1px solid ${colors.primary}`,
                            borderRadius: theme.borderRadius.sm,
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => confirmDelete(fn.id)}
                          aria-label={`Delete ${fn.name}`}
                          style={{
                            padding: '6px 12px',
                            background: 'transparent',
                            color: colors.red,
                            border: `1px solid ${colors.red}`,
                            borderRadius: theme.borderRadius.sm,
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          {/* Delete error display */}
          {deleteError && (
            <div
              role="alert"
              style={{
                padding: '12px 20px',
                color: colors.red,
                background: '#fef2f2',
                fontSize: '13px',
              }}
            >
              {deleteError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
