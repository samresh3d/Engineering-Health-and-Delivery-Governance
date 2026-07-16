import { useState, useEffect, useCallback } from 'react';
import { getStoredUser } from '../auth';
import { RoleAdapter } from './RoleAdapter';
import apiClient from '../api/client';
import type { AnalyticsFilter } from '../pages/Analytics';
import { colors } from '../theme';

export interface AnalyticsFilterBarProps {
  filter: AnalyticsFilter;
  onFilterChange: (filter: AnalyticsFilter) => void;
}

/** Roles with access to cross-team and cross-function filters */
const CROSS_TEAM_ROLES = ['Leadership', 'Super_Admin'];

/** Available development status options */
const DEVELOPMENT_STATUSES = ['Complete', 'In Progress', 'Not Started'];

/** Available period options for the segmented control */
const PERIODS: Array<{ label: string; value: AnalyticsFilter['period'] }> = [
  { label: 'Month', value: 'month' },
  { label: 'Quarter', value: 'quarter' },
  { label: 'Year', value: 'year' },
  { label: 'Custom', value: 'custom' },
];

/**
 * AnalyticsFilterBar — multi-dimensional filter bar for the Analytics Dashboard.
 *
 * Renders filter controls with role-based visibility:
 * - Function dropdown: Leadership/Super_Admin only (Req 11.5, 11.6)
 * - Team dropdown: Leadership/Super_Admin only (cascades with selected Function)
 * - Engineering Manager dropdown: Leadership/Super_Admin only
 * - Period segmented control: All roles
 * - Custom Date Range: Leadership/Super_Admin only (shown when period === 'custom')
 * - Development Status dropdown: All roles
 * - Clear/Reset button: All roles
 *
 * Shows an empty state message when the selected Function has no data (Req 11.7).
 * Validates date range (endDate must not be before startDate) and emits
 * filter state changes via the onFilterChange callback.
 */
export default function AnalyticsFilterBar({ filter, onFilterChange }: AnalyticsFilterBarProps) {
  const user = getStoredUser();
  const [functions, setFunctions] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [managers, setManagers] = useState<string[]>([]);
  const [dateError, setDateError] = useState<string | null>(null);
  const [functionEmptyState, setFunctionEmptyState] = useState<string | null>(null);

  // Fetch available functions on mount (Leadership/Super_Admin only)
  useEffect(() => {
    const userRole = user?.role;
    if (!userRole || !CROSS_TEAM_ROLES.includes(userRole)) return;

    apiClient
      .get<{ success: boolean; data: string[] }>('/api/filters/functions')
      .then((res) => {
        const functionList = res.data.data ?? [];
        setFunctions(Array.isArray(functionList) ? functionList : []);
      })
      .catch(() => setFunctions([]));
  }, [user?.role]);

  // Fetch available teams — cascades based on selected function (Req 11.2, 11.8)
  useEffect(() => {
    const params: Record<string, string> = {};
    if (filter.functionName) {
      params.functionName = filter.functionName;
    }

    apiClient
      .get<{ success: boolean; data: Array<{ team?: string; teamName?: string }> }>('/api/filters/teams', { params })
      .then((res) => {
        const teamData = res.data.data ?? [];
        const teamList = Array.isArray(teamData)
          ? teamData.map((t) => t.teamName ?? t.team ?? '').filter(Boolean)
          : [];
        setTeams(teamList);

        // Show empty state message when selected Function has no teams/data (Req 11.7)
        if (filter.functionName && teamList.length === 0) {
          setFunctionEmptyState(`No data available for the selected Function "${filter.functionName}".`);
        } else {
          setFunctionEmptyState(null);
        }
      })
      .catch(() => {
        setTeams([]);
        if (filter.functionName) {
          setFunctionEmptyState(`No data available for the selected Function "${filter.functionName}".`);
        }
      });
  }, [filter.functionName]);

  // Fetch engineering managers (users with Engineering_Manager role)
  useEffect(() => {
    apiClient
      .get<{ success: boolean; data: Array<{ username: string }> }>('/api/users/me')
      .then(() => {
        return apiClient.get<{ users?: Array<{ username: string; role: string }> }>('/api/admin/users');
      })
      .then((res) => {
        const users = res.data.users ?? [];
        const emUsers = users
          .filter((u: { role: string }) => u.role === 'Engineering_Manager')
          .map((u: { username: string }) => u.username);
        setManagers(emUsers);
      })
      .catch(() => setManagers([]));
  }, []);

  // Validate date range
  const validateDateRange = useCallback((start?: string, end?: string): boolean => {
    if (start && end && end < start) {
      setDateError('End date must not be before start date');
      return false;
    }
    setDateError(null);
    return true;
  }, []);

  const handleFilterChange = useCallback(
    (updates: Partial<AnalyticsFilter>) => {
      const newFilter = { ...filter, ...updates };

      // Validate date range before emitting
      if ('startDate' in updates || 'endDate' in updates) {
        const isValid = validateDateRange(newFilter.startDate, newFilter.endDate);
        if (!isValid) return;
      }

      onFilterChange(newFilter);
    },
    [filter, onFilterChange, validateDateRange],
  );

  const handleFunctionChange = useCallback(
    (functionName: string) => {
      // When Function changes, clear team selection since teams cascade (Req 11.2)
      handleFilterChange({
        functionName: functionName || undefined,
        team: undefined,
      });
    },
    [handleFilterChange],
  );

  const handlePeriodChange = useCallback(
    (period: AnalyticsFilter['period']) => {
      const updates: Partial<AnalyticsFilter> = { period };
      // Clear custom date range when switching away from 'custom'
      if (period !== 'custom') {
        updates.startDate = undefined;
        updates.endDate = undefined;
        setDateError(null);
      }
      handleFilterChange(updates);
    },
    [handleFilterChange],
  );

  const handleReset = useCallback(() => {
    setDateError(null);
    setFunctionEmptyState(null);
    onFilterChange({});
  }, [onFilterChange]);

  const isCustomPeriod = filter.period === 'custom';

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          alignItems: 'flex-end',
          padding: '12px 16px',
          backgroundColor: colors.secondary,
          borderRadius: '8px',
          marginBottom: functionEmptyState ? '0' : '24px',
        }}
        aria-label="Analytics filters"
        role="toolbar"
      >
        {/* Function dropdown — Leadership/Super_Admin only (Req 11.5, 11.6) */}
        <RoleAdapter allowedRoles={CROSS_TEAM_ROLES}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Function</span>
            <select
              value={filter.functionName ?? ''}
              onChange={(e) => handleFunctionChange(e.target.value)}
              aria-label="Select function"
              style={selectStyle}
            >
              <option value="">All Functions</option>
              {functions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        </RoleAdapter>

        {/* Team dropdown — Leadership/Super_Admin only */}
        <RoleAdapter allowedRoles={CROSS_TEAM_ROLES}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Team</span>
            <select
              value={filter.team ?? ''}
              onChange={(e) => handleFilterChange({ team: e.target.value || undefined })}
              aria-label="Select team"
              style={selectStyle}
            >
              <option value="">All Teams</option>
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </RoleAdapter>

        {/* Engineering Manager dropdown — Leadership/Super_Admin only */}
        <RoleAdapter allowedRoles={CROSS_TEAM_ROLES}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Engineering Manager</span>
            <select
              value={filter.engineeringManager ?? ''}
              onChange={(e) =>
                handleFilterChange({ engineeringManager: e.target.value || undefined })
              }
              aria-label="Select engineering manager"
              style={selectStyle}
            >
              <option value="">All Managers</option>
              {managers.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </RoleAdapter>

        {/* Period segmented control — All roles */}
        <div style={labelStyle}>
          <span style={labelTextStyle}>Period</span>
          <div style={segmentedContainerStyle} role="group" aria-label="Select time period">
            {PERIODS.map((p) => {
              // Custom period only available for Leadership/Super_Admin
              if (p.value === 'custom' && user && !CROSS_TEAM_ROLES.includes(user.role)) {
                return null;
              }
              const isActive = filter.period === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => handlePeriodChange(p.value)}
                  aria-pressed={isActive}
                  style={{
                    ...segmentButtonStyle,
                    ...(isActive ? segmentButtonActiveStyle : {}),
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Date Range — Leadership/Super_Admin only, shown when period is 'custom' */}
        <RoleAdapter allowedRoles={CROSS_TEAM_ROLES}>
          {isCustomPeriod && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Start Date</span>
                <input
                  type="date"
                  value={filter.startDate ?? ''}
                  onChange={(e) =>
                    handleFilterChange({ startDate: e.target.value || undefined })
                  }
                  aria-label="Start date"
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>End Date</span>
                <input
                  type="date"
                  value={filter.endDate ?? ''}
                  onChange={(e) =>
                    handleFilterChange({ endDate: e.target.value || undefined })
                  }
                  aria-label="End date"
                  style={{
                    ...inputStyle,
                    ...(dateError ? { borderColor: colors.red } : {}),
                  }}
                />
                {dateError && (
                  <span
                    role="alert"
                    style={{
                      fontSize: '11px',
                      color: colors.red,
                      marginTop: '2px',
                    }}
                  >
                    {dateError}
                  </span>
                )}
              </label>
            </div>
          )}
        </RoleAdapter>

        {/* Development Status dropdown — All roles */}
        <label style={labelStyle}>
          <span style={labelTextStyle}>Status</span>
          <select
            value={filter.developmentStatus ?? ''}
            onChange={(e) =>
              handleFilterChange({ developmentStatus: e.target.value || undefined })
            }
            aria-label="Select development status"
            style={selectStyle}
          >
            <option value="">All Statuses</option>
            {DEVELOPMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        {/* Clear/Reset button */}
        <button
          type="button"
          onClick={handleReset}
          aria-label="Clear all filters"
          style={resetButtonStyle}
        >
          Clear Filters
        </button>
      </div>

      {/* Empty state message when selected Function has no data (Req 11.7) */}
      {functionEmptyState && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: '12px 16px',
            backgroundColor: '#FFF8E1',
            border: '1px solid #FFE082',
            borderRadius: '0 0 8px 8px',
            marginBottom: '24px',
            fontSize: '14px',
            color: '#6D4C00',
          }}
        >
          ℹ️ {functionEmptyState}
        </div>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const labelTextStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: colors.text,
};

const selectStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: '4px',
  border: '1px solid #ccc',
  fontSize: '14px',
  minWidth: '160px',
};

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: '4px',
  border: '1px solid #ccc',
  fontSize: '14px',
};

const segmentedContainerStyle: React.CSSProperties = {
  display: 'flex',
  borderRadius: '6px',
  overflow: 'hidden',
  border: '1px solid #ccc',
};

const segmentButtonStyle: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: '13px',
  fontWeight: 500,
  border: 'none',
  borderRight: '1px solid #ccc',
  backgroundColor: '#fff',
  cursor: 'pointer',
  transition: 'background-color 0.15s, color 0.15s',
};

const segmentButtonActiveStyle: React.CSSProperties = {
  backgroundColor: colors.primary,
  color: '#fff',
};

const resetButtonStyle: React.CSSProperties = {
  padding: '6px 16px',
  borderRadius: '4px',
  border: `1px solid ${colors.border}`,
  backgroundColor: '#fff',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
  color: colors.textSecondary,
  transition: 'border-color 0.15s',
};
