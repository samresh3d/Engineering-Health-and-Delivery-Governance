import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { colors, theme } from '../../theme';

interface EMUser {
  id: string;
  username: string;
  role: string;
  teamId: string | null;
  functionId: number | null;
  functionName: string | null;
}

interface FunctionRecord {
  id: number;
  name: string;
  createdAt: string;
}

/**
 * EMFunctionAssignment — Admin page for assigning Engineering Managers to Functions.
 * Super_Admin only (enforced by route protection on /admin/*).
 *
 * Validates: Requirements 8.1, 8.2, 8.4, 8.5, 8.8
 */
export default function EMFunctionAssignment() {
  const [emUsers, setEmUsers] = useState<EMUser[]>([]);
  const [functions, setFunctions] = useState<FunctionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track in-flight assignment per user
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, functionsRes] = await Promise.all([
        apiClient.get<{ data: EMUser[] }>('/api/admin/users', {
          params: { role: 'Engineering_Manager' },
        }),
        apiClient.get('/api/admin/functions'),
      ]);
      setEmUsers(usersRes.data.data);
      setFunctions(functionsRes.data.data || functionsRes.data.functions || []);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to load data.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAssign = async (userId: string, functionId: number | null) => {
    if (functionId === null) return;

    setAssigningUserId(userId);
    setAssignError(null);
    setAssignSuccess(null);

    try {
      await apiClient.put(`/api/admin/users/${userId}/function`, { functionId });

      // Update local state to reflect the change immediately
      setEmUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                functionId,
                functionName: functions.find((f) => f.id === functionId)?.name ?? null,
              }
            : u
        )
      );

      const userName = emUsers.find((u) => u.id === userId)?.username ?? userId;
      const funcName = functions.find((f) => f.id === functionId)?.name ?? 'Unknown';
      setAssignSuccess(`${userName} assigned to ${funcName}`);

      // Clear success message after 3 seconds
      setTimeout(() => setAssignSuccess(null), 3000);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to assign function.';
      setAssignError(message);
    } finally {
      setAssigningUserId(null);
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
        EM Function Assignment
      </h1>
      <p style={{ color: colors.textSecondary, fontSize: '14px', marginBottom: '24px' }}>
        Assign each Engineering Manager to a Function. Changes take effect immediately.
      </p>

      {/* Success message */}
      {assignSuccess && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: '12px 16px',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: theme.borderRadius.sm,
            color: '#166534',
            fontSize: '14px',
            marginBottom: '16px',
          }}
        >
          {assignSuccess}
        </div>
      )}

      {/* Assign error message */}
      {assignError && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: theme.borderRadius.sm,
            color: colors.red,
            fontSize: '14px',
            marginBottom: '16px',
          }}
        >
          {assignError}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div data-testid="em-assignment-loading" style={{ color: colors.textSecondary, padding: '24px 0' }}>
          Loading Engineering Managers...
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div
          data-testid="em-assignment-error"
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
      {!loading && !error && emUsers.length === 0 && (
        <div data-testid="em-assignment-empty" style={{ color: colors.textSecondary, padding: '24px 0' }}>
          No Engineering Managers found.
        </div>
      )}

      {/* EM Users table */}
      {!loading && !error && emUsers.length > 0 && (
        <div
          data-testid="em-assignment-list"
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
              gridTemplateColumns: '1fr 1fr 200px',
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
            <span>Engineering Manager</span>
            <span>Current Function</span>
            <span>Assign Function</span>
          </div>

          {/* Table rows */}
          {emUsers.map((user) => (
            <div
              key={user.id}
              data-testid={`em-row-${user.id}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 200px',
                padding: '14px 20px',
                borderBottom: `1px solid ${colors.border}`,
                alignItems: 'center',
                background: colors.background,
              }}
            >
              {/* Username */}
              <span style={{ color: colors.text, fontSize: '14px', fontWeight: 500 }}>
                {user.username}
              </span>

              {/* Current function assignment */}
              <span
                style={{
                  color: user.functionName ? colors.text : colors.textSecondary,
                  fontSize: '14px',
                  fontStyle: user.functionName ? 'normal' : 'italic',
                }}
              >
                {user.functionName ?? 'Unassigned'}
              </span>

              {/* Function dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select
                  aria-label={`Assign function to ${user.username}`}
                  value={user.functionId ?? ''}
                  disabled={assigningUserId === user.id}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value) {
                      handleAssign(user.id, Number(value));
                    }
                  }}
                  style={{
                    padding: '8px 12px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: theme.borderRadius.sm,
                    fontSize: '13px',
                    fontFamily: theme.fonts.body,
                    background: colors.background,
                    cursor: assigningUserId === user.id ? 'not-allowed' : 'pointer',
                    opacity: assigningUserId === user.id ? 0.6 : 1,
                    minWidth: '140px',
                  }}
                >
                  <option value="">— Select —</option>
                  {functions.map((fn) => (
                    <option key={fn.id} value={fn.id}>
                      {fn.name}
                    </option>
                  ))}
                </select>
                {assigningUserId === user.id && (
                  <span style={{ color: colors.textSecondary, fontSize: '12px' }}>
                    Saving...
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
