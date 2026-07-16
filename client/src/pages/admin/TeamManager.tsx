import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { isSuperAdmin } from '../../auth';
import { colors, theme } from '../../theme';

interface FunctionRecord {
  id: number;
  name: string;
  createdAt: string;
}

interface TeamRecord {
  id: number;
  name: string;
  functionId: number;
  createdAt: string;
}

/** Validates team name: 1-100 chars after trimming, not empty/whitespace-only */
function validateTeamName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Team name is required.';
  if (trimmed.length > 100) return 'Team name must not exceed 100 characters.';
  return null;
}

export default function TeamManager() {
  // Access check
  if (!isSuperAdmin()) {
    return (
      <div role="alert" style={{ color: colors.red, padding: '24px' }}>
        Access denied. Super_Admin role required.
      </div>
    );
  }

  return <TeamManagerContent />;
}

function TeamManagerContent() {
  // Function selector state
  const [functions, setFunctions] = useState<FunctionRecord[]>([]);
  const [selectedFunctionId, setSelectedFunctionId] = useState<number | null>(null);
  const [functionsLoading, setFunctionsLoading] = useState(true);
  const [functionsError, setFunctionsError] = useState<string | null>(null);

  // Teams state
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);

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

  // --- Fetch functions for the selector ---
  const fetchFunctions = useCallback(async () => {
    setFunctionsLoading(true);
    setFunctionsError(null);
    try {
      const response = await apiClient.get('/api/admin/functions');
      setFunctions(response.data.data || response.data.functions || []);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to load functions.';
      setFunctionsError(message);
    } finally {
      setFunctionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFunctions();
  }, [fetchFunctions]);

  // --- Fetch teams for selected function ---
  const fetchTeams = useCallback(async (functionId: number) => {
    setTeamsLoading(true);
    setTeamsError(null);
    try {
      const response = await apiClient.get(
        `/api/admin/functions/${functionId}/teams`
      );
      setTeams(response.data.data || response.data.teams || []);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to load teams.';
      setTeamsError(message);
    } finally {
      setTeamsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedFunctionId !== null) {
      fetchTeams(selectedFunctionId);
    } else {
      setTeams([]);
    }
  }, [selectedFunctionId, fetchTeams]);

  // --- Function selection handler ---
  const handleFunctionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedFunctionId(value ? Number(value) : null);
    setCreateError(null);
    setEditingId(null);
    setDeletingId(null);
    setDeleteError(null);
  };

  // --- Create team ---
  const handleCreate = async () => {
    if (selectedFunctionId === null) {
      setCreateError('Please select a parent Function first.');
      return;
    }
    const validationError = validateTeamName(newName);
    if (validationError) {
      setCreateError(validationError);
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await apiClient.post(`/api/admin/functions/${selectedFunctionId}/teams`, {
        name: newName.trim(),
      });
      setNewName('');
      await fetchTeams(selectedFunctionId);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to create team.';
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  };

  // --- Rename team ---
  const startEditing = (team: TeamRecord) => {
    setEditingId(team.id);
    setEditName(team.name);
    setEditError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditError(null);
  };

  const handleRename = async (id: number) => {
    const validationError = validateTeamName(editName);
    if (validationError) {
      setEditError(validationError);
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      await apiClient.put(`/api/admin/teams/${id}`, { name: editName.trim() });
      setEditingId(null);
      setEditName('');
      if (selectedFunctionId !== null) {
        await fetchTeams(selectedFunctionId);
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to rename team.';
      setEditError(message);
    } finally {
      setSaving(false);
    }
  };

  // --- Delete team ---
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
      await apiClient.delete(`/api/admin/teams/${id}`);
      setDeletingId(null);
      if (selectedFunctionId !== null) {
        await fetchTeams(selectedFunctionId);
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to delete team.';
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
        Team Management
      </h1>
      <p style={{ color: colors.textSecondary, fontSize: '14px', marginBottom: '24px' }}>
        Manage Teams within a Function. Select a Function to view and manage its Teams.
      </p>

      {/* Function selector dropdown */}
      <div style={{ marginBottom: '24px' }}>
        <label
          htmlFor="function-selector"
          style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 600,
            color: colors.textSecondary,
            marginBottom: '6px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Function
        </label>
        {functionsLoading ? (
          <div data-testid="functions-loading" style={{ color: colors.textSecondary, fontSize: '14px' }}>
            Loading functions...
          </div>
        ) : functionsError ? (
          <div role="alert" style={{ color: colors.red, fontSize: '14px' }}>
            {functionsError}
          </div>
        ) : (
          <select
            id="function-selector"
            aria-label="Select function"
            value={selectedFunctionId ?? ''}
            onChange={handleFunctionChange}
            style={{
              padding: '10px 14px',
              border: `1px solid ${colors.border}`,
              borderRadius: theme.borderRadius.sm,
              fontSize: '14px',
              minWidth: '260px',
              fontFamily: theme.fonts.body,
              background: colors.background,
              color: colors.text,
              cursor: 'pointer',
            }}
          >
            <option value="">-- Select a Function --</option>
            {functions.map((fn) => (
              <option key={fn.id} value={fn.id}>
                {fn.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Prompt to select function */}
      {selectedFunctionId === null && !functionsLoading && !functionsError && (
        <div data-testid="teams-select-prompt" style={{ color: colors.textSecondary, padding: '24px 0' }}>
          Select a Function above to view and manage its Teams.
        </div>
      )}

      {/* Create new team (only when function selected) */}
      {selectedFunctionId !== null && (
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
              placeholder="New team name..."
              aria-label="New team name"
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
              <span role="alert" style={{ color: colors.red, fontSize: '12px' }}>
                {createError}
              </span>
            )}
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            aria-label="Create team"
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
            {creating ? 'Creating...' : 'Add Team'}
          </button>
        </div>
      )}

      {/* Teams loading state */}
      {selectedFunctionId !== null && teamsLoading && (
        <div data-testid="teams-loading" style={{ color: colors.textSecondary, padding: '24px 0' }}>
          Loading teams...
        </div>
      )}

      {/* Teams error state */}
      {selectedFunctionId !== null && teamsError && !teamsLoading && (
        <div
          data-testid="teams-error"
          role="alert"
          style={{
            color: colors.red,
            padding: '12px',
            background: '#fef2f2',
            borderRadius: theme.borderRadius.sm,
            marginBottom: '16px',
          }}
        >
          {teamsError}
        </div>
      )}

      {/* Teams empty state */}
      {selectedFunctionId !== null && !teamsLoading && !teamsError && teams.length === 0 && (
        <div data-testid="teams-empty" style={{ color: colors.textSecondary, padding: '24px 0' }}>
          No teams configured for this Function. Add a team above to get started.
        </div>
      )}

      {/* Teams list */}
      {selectedFunctionId !== null && !teamsLoading && !teamsError && teams.length > 0 && (
        <div
          data-testid="teams-list"
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
          {teams.map((team) => (
            <div
              key={team.id}
              data-testid={`team-row-${team.id}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 160px 180px',
                padding: '14px 20px',
                borderBottom: `1px solid ${colors.border}`,
                alignItems: 'center',
                background: deletingId === team.id ? '#fef2f2' : colors.background,
              }}
            >
              {/* Name cell (inline edit or display) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {editingId === team.id ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => {
                        setEditName(e.target.value);
                        setEditError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(team.id);
                        if (e.key === 'Escape') cancelEditing();
                      }}
                      aria-label="Edit team name"
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
                      onClick={() => handleRename(team.id)}
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
                    {team.name}
                  </span>
                )}
                {editingId === team.id && editError && (
                  <span role="alert" style={{ color: colors.red, fontSize: '12px' }}>
                    {editError}
                  </span>
                )}
              </div>

              {/* Created date */}
              <span style={{ color: colors.textSecondary, fontSize: '13px' }}>
                {new Date(team.createdAt).toLocaleDateString()}
              </span>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                {deletingId === team.id ? (
                  <>
                    <span style={{ fontSize: '12px', color: colors.red, alignSelf: 'center' }}>
                      Delete?
                    </span>
                    <button
                      onClick={() => handleDelete(team.id)}
                      aria-label={`Confirm delete ${team.name}`}
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
                    {editingId !== team.id && (
                      <>
                        <button
                          onClick={() => startEditing(team)}
                          aria-label={`Rename ${team.name}`}
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
                          onClick={() => confirmDelete(team.id)}
                          aria-label={`Delete ${team.name}`}
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
