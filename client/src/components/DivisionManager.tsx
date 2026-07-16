import { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { colors } from '../theme';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Division {
  id: number;
  name: string;
  teamId: string;
  projectCount: number;
  createdAt: string;
}

export interface DivisionManagerProps {
  teamId: string;
  divisions: Division[];
  onRefresh: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * DivisionManager — CRUD panel for Engineering Managers to create, rename,
 * delete divisions and assign projects within their team.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.7
 */
export default function DivisionManager({ teamId, divisions, onRefresh }: DivisionManagerProps) {
  // ─── Create Division State ───────────────────────────────────────────────
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // ─── Rename State ────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  // ─── Delete State ────────────────────────────────────────────────────────
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  // ─── Assign Project State ────────────────────────────────────────────────
  const [assignDivision, setAssignDivision] = useState('');
  const [assignProject, setAssignProject] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [availableProjects, setAvailableProjects] = useState<string[]>([]);

  // Fetch available projects for the team
  useEffect(() => {
    apiClient
      .get<string[]>('/api/filters/projects', { params: { team: teamId } })
      .then((res) => setAvailableProjects(res.data))
      .catch(() => setAvailableProjects([]));
  }, [teamId]);

  // ─── Validation Helpers ──────────────────────────────────────────────────

  const validateName = useCallback(
    (name: string, excludeId?: number): string | null => {
      const trimmed = name.trim();
      if (!trimmed) return 'Division name is required';
      if (trimmed.length > 100) return 'Division name must not exceed 100 characters';
      const duplicate = divisions.find(
        (d) =>
          d.name.toLowerCase() === trimmed.toLowerCase() &&
          (excludeId === undefined || d.id !== excludeId)
      );
      if (duplicate) return 'A division with this name already exists in the team';
      return null;
    },
    [divisions]
  );

  // ─── Create Division ─────────────────────────────────────────────────────

  const handleCreate = async () => {
    const error = validateName(newName);
    if (error) {
      setCreateError(error);
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      await apiClient.post('/api/divisions', { team: teamId, name: newName.trim() });
      setNewName('');
      onRefresh();
    } catch (err: any) {
      const message =
        err?.response?.data?.message || 'Failed to create division';
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  };

  // ─── Rename Division ─────────────────────────────────────────────────────

  const startRename = (division: Division) => {
    setEditingId(division.id);
    setEditName(division.name);
    setRenameError(null);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditName('');
    setRenameError(null);
  };

  const handleRename = async (oldName: string) => {
    const error = validateName(editName, editingId ?? undefined);
    if (error) {
      setRenameError(error);
      return;
    }
    setRenameError(null);
    setRenaming(true);
    try {
      await apiClient.put(`/api/divisions/${encodeURIComponent(oldName)}`, {
        team: teamId,
        newName: editName.trim(),
      });
      setEditingId(null);
      setEditName('');
      onRefresh();
    } catch (err: any) {
      const message =
        err?.response?.data?.message || 'Failed to rename division';
      setRenameError(message);
    } finally {
      setRenaming(false);
    }
  };

  // ─── Delete Division ─────────────────────────────────────────────────────

  const handleDelete = async (division: Division) => {
    if (division.projectCount > 0) {
      setDeleteError(
        `Cannot delete "${division.name}" — reassign all ${division.projectCount} project(s) first.`
      );
      return;
    }
    setDeleteError(null);
    setDeleting(division.id);
    try {
      await apiClient.delete(
        `/api/divisions/${encodeURIComponent(division.name)}`,
        { params: { team: teamId } }
      );
      onRefresh();
    } catch (err: any) {
      const message =
        err?.response?.data?.message || 'Failed to delete division';
      setDeleteError(message);
    } finally {
      setDeleting(null);
    }
  };

  // ─── Assign Project ──────────────────────────────────────────────────────

  const handleAssign = async () => {
    if (!assignDivision || !assignProject) {
      setAssignError('Select both a division and a project');
      return;
    }
    setAssignError(null);
    setAssigning(true);
    try {
      await apiClient.post(
        `/api/divisions/${encodeURIComponent(assignDivision)}/assign`,
        { team: teamId, project: assignProject }
      );
      setAssignProject('');
      onRefresh();
    } catch (err: any) {
      const message =
        err?.response?.data?.message || 'Failed to assign project';
      setAssignError(message);
    } finally {
      setAssigning(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={containerStyle} aria-label="Division Manager">
      <h2 style={headingStyle}>Manage Divisions</h2>

      {/* ─── Create Division Form ─────────────────────────────────────────── */}
      <section style={sectionStyle} aria-label="Create Division">
        <h3 style={subHeadingStyle}>Create Division</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                if (createError) setCreateError(null);
              }}
              placeholder="Division name"
              maxLength={100}
              aria-label="New division name"
              aria-invalid={!!createError}
              aria-describedby={createError ? 'create-error' : undefined}
              style={inputStyle}
            />
            {createError && (
              <p id="create-error" role="alert" style={errorStyle}>
                {createError}
              </p>
            )}
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            style={primaryButtonStyle}
            aria-label="Create division"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </section>

      {/* ─── Division List ────────────────────────────────────────────────── */}
      <section style={sectionStyle} aria-label="Existing Divisions">
        <h3 style={subHeadingStyle}>Divisions ({divisions.length})</h3>
        {deleteError && (
          <p role="alert" style={errorStyle}>
            {deleteError}
          </p>
        )}
        {divisions.length === 0 ? (
          <p style={{ color: colors.textSecondary, fontStyle: 'italic' }}>
            No divisions yet. Create one above to get started.
          </p>
        ) : (
          <ul style={listStyle}>
            {divisions.map((division) => (
              <li key={division.id} style={listItemStyle}>
                {editingId === division.id ? (
                  /* ─── Inline Edit Mode ─── */
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => {
                          setEditName(e.target.value);
                          if (renameError) setRenameError(null);
                        }}
                        maxLength={100}
                        aria-label={`Rename division "${division.name}"`}
                        aria-invalid={!!renameError}
                        aria-describedby={renameError ? 'rename-error' : undefined}
                        style={{ ...inputStyle, flex: 1 }}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(division.name);
                          if (e.key === 'Escape') cancelRename();
                        }}
                      />
                      <button
                        onClick={() => handleRename(division.name)}
                        disabled={renaming}
                        style={smallPrimaryButtonStyle}
                        aria-label="Save rename"
                      >
                        {renaming ? '...' : 'Save'}
                      </button>
                      <button
                        onClick={cancelRename}
                        disabled={renaming}
                        style={smallSecondaryButtonStyle}
                        aria-label="Cancel rename"
                      >
                        Cancel
                      </button>
                    </div>
                    {renameError && (
                      <p id="rename-error" role="alert" style={errorStyle}>
                        {renameError}
                      </p>
                    )}
                  </div>
                ) : (
                  /* ─── Display Mode ─── */
                  <>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 500, color: colors.text }}>
                        {division.name}
                      </span>
                      <span style={{ marginLeft: '12px', fontSize: '12px', color: colors.textSecondary }}>
                        {division.projectCount} project{division.projectCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => startRename(division)}
                        style={smallSecondaryButtonStyle}
                        aria-label={`Rename division "${division.name}"`}
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => handleDelete(division)}
                        disabled={division.projectCount > 0 || deleting === division.id}
                        style={{
                          ...smallDangerButtonStyle,
                          opacity: division.projectCount > 0 ? 0.5 : 1,
                          cursor: division.projectCount > 0 ? 'not-allowed' : 'pointer',
                        }}
                        aria-label={`Delete division "${division.name}"`}
                        title={
                          division.projectCount > 0
                            ? `Cannot delete — ${division.projectCount} project(s) assigned`
                            : 'Delete division'
                        }
                      >
                        {deleting === division.id ? '...' : 'Delete'}
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── Assign Project Section ───────────────────────────────────────── */}
      <section style={sectionStyle} aria-label="Assign Project to Division">
        <h3 style={subHeadingStyle}>Assign Project</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <select
            value={assignDivision}
            onChange={(e) => {
              setAssignDivision(e.target.value);
              if (assignError) setAssignError(null);
            }}
            aria-label="Select division"
            style={selectStyle}
          >
            <option value="">Select Division</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={assignProject}
            onChange={(e) => {
              setAssignProject(e.target.value);
              if (assignError) setAssignError(null);
            }}
            aria-label="Select project"
            style={selectStyle}
          >
            <option value="">Select Project</option>
            {availableProjects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            onClick={handleAssign}
            disabled={assigning || !assignDivision || !assignProject}
            style={primaryButtonStyle}
            aria-label="Assign project to division"
          >
            {assigning ? 'Assigning...' : 'Assign'}
          </button>
        </div>
        {assignError && (
          <p role="alert" style={errorStyle}>
            {assignError}
          </p>
        )}
      </section>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  padding: '24px',
  backgroundColor: colors.background,
  borderRadius: '10px',
  border: `1px solid ${colors.border}`,
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 20px 0',
  fontSize: '20px',
  fontWeight: 600,
  color: colors.text,
};

const subHeadingStyle: React.CSSProperties = {
  margin: '0 0 12px 0',
  fontSize: '14px',
  fontWeight: 600,
  color: colors.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: '24px',
  paddingBottom: '20px',
  borderBottom: `1px solid ${colors.border}`,
};

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: `1px solid ${colors.border}`,
  fontSize: '14px',
  width: '100%',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: `1px solid ${colors.border}`,
  fontSize: '14px',
  minWidth: '180px',
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '6px',
  border: 'none',
  backgroundColor: colors.primary,
  color: colors.textLight,
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const smallPrimaryButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: '4px',
  border: 'none',
  backgroundColor: colors.primary,
  color: colors.textLight,
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
};

const smallSecondaryButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: '4px',
  border: `1px solid ${colors.border}`,
  backgroundColor: colors.background,
  color: colors.text,
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
};

const smallDangerButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: '4px',
  border: 'none',
  backgroundColor: '#DC3545',
  color: '#fff',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
};

const errorStyle: React.CSSProperties = {
  margin: '6px 0 0 0',
  fontSize: '12px',
  color: '#DC3545',
  fontWeight: 500,
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
};

const listItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '10px 12px',
  borderRadius: '6px',
  backgroundColor: colors.secondary,
  marginBottom: '8px',
  gap: '12px',
};
