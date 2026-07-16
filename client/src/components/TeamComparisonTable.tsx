import { useEffect, useState, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { RoleAdapter } from './RoleAdapter';
import { getComparison, type TeamComparisonRow, type AnalyticsFilter } from '../api/client';
import { ragColors } from '../theme';
import { colors } from '../theme';
import type { RagStatus } from '../types';

// ─── RAG Badge Cell Renderer ─────────────────────────────────────────────────

const STATUS_LABELS: Record<RagStatus, string> = {
  green: 'Healthy',
  amber: 'Attention',
  red: 'Critical',
};

const STATUS_BG: Record<RagStatus, string> = {
  green: '#E6F9ED',
  amber: '#FFF8E6',
  red: '#FDEDEF',
};

interface KpiCellValue {
  value: number | null;
  ragStatus: RagStatus;
}

function RagKpiCellRenderer({ value }: ICellRendererParams<TeamComparisonRow, KpiCellValue>) {
  if (!value || value.value === null) {
    return (
      <span style={{ color: colors.textSecondary, fontSize: '12px' }}>—</span>
    );
  }

  const { value: kpiValue, ragStatus } = value;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <span style={{ fontWeight: 500, fontSize: '13px' }}>
        {typeof kpiValue === 'number' ? kpiValue.toFixed(1) : kpiValue}
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '10px',
          fontWeight: 600,
          backgroundColor: STATUS_BG[ragStatus],
          color: ragColors[ragStatus],
        }}
        role="status"
        aria-label={`Status: ${STATUS_LABELS[ragStatus]}`}
      >
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: ragColors[ragStatus],
          }}
        />
        {STATUS_LABELS[ragStatus]}
      </span>
    </span>
  );
}

// ─── KPI display names ───────────────────────────────────────────────────────

const KPI_DISPLAY_NAMES: Record<string, string> = {
  sprint_commitment: 'Sprint Commitment',
  release_success_rate: 'Release Success',
  deployment_frequency: 'Deploy Frequency',
  capacity_utilization: 'Capacity Util.',
  ai_efficiency: 'AI Efficiency',
  uat_predictability: 'UAT Predictability',
  dev_cycle_time: 'Dev Cycle Time',
  story_drop_rate: 'Story Drop Rate',
  rollback_rate: 'Rollback Rate',
};

// ─── Component Props ─────────────────────────────────────────────────────────

export interface TeamComparisonTableProps {
  /** Analytics filter state — component re-fetches when this changes */
  filter?: AnalyticsFilter;
  /** Callback when a team row is clicked for drill-down */
  onTeamClick?: (teamName: string) => void;
}

/**
 * Team Comparison Table — displays a cross-team KPI comparison using AG Grid.
 * Restricted to Leadership and Super_Admin roles via RoleAdapter.
 *
 * Features:
 * - One row per team with columns for each KPI (value + RAG badge)
 * - Clickable team name for drill-down to team detail
 * - Re-fetches data when filter prop changes
 * - Loading and empty state handling
 */
export function TeamComparisonTable({ filter, onTeamClick }: TeamComparisonTableProps) {
  const [data, setData] = useState<TeamComparisonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch comparison data when filters change
  useEffect(() => {
    let cancelled = false;

    async function fetchComparison() {
      setLoading(true);
      setError(null);

      try {
        const response = await getComparison(filter);
        if (!cancelled) {
          setData(response.data ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load team comparison data.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchComparison();
    return () => { cancelled = true; };
  }, [filter?.team, filter?.engineeringManager, filter?.startDate, filter?.endDate, filter?.developmentStatus, filter?.period]);

  // Build column definitions dynamically based on available KPI keys
  const columnDefs = useMemo<ColDef<TeamComparisonRow>[]>(() => {
    // Team name column (clickable)
    const teamCol: ColDef<TeamComparisonRow> = {
      field: 'team',
      headerName: 'Team',
      pinned: 'left',
      width: 180,
      cellRenderer: (params: ICellRendererParams<TeamComparisonRow>) => {
        const teamName = params.value as string;
        return (
          <span
            style={{
              color: colors.primary,
              fontWeight: 600,
              cursor: onTeamClick ? 'pointer' : 'default',
              textDecoration: onTeamClick ? 'underline' : 'none',
            }}
            onClick={() => onTeamClick?.(teamName)}
            role={onTeamClick ? 'link' : undefined}
            tabIndex={onTeamClick ? 0 : undefined}
            onKeyDown={(e) => {
              if (onTeamClick && (e.key === 'Enter' || e.key === ' ')) {
                onTeamClick(teamName);
              }
            }}
          >
            {teamName}
          </span>
        );
      },
    };

    // Determine KPI columns from first row of data or use all known KPIs
    const kpiKeys = data.length > 0
      ? Object.keys(data[0].kpis)
      : Object.keys(KPI_DISPLAY_NAMES);

    const kpiCols: ColDef<TeamComparisonRow>[] = kpiKeys.map((kpiKey) => ({
      headerName: KPI_DISPLAY_NAMES[kpiKey] || kpiKey,
      valueGetter: (params) => {
        return params.data?.kpis?.[kpiKey] ?? null;
      },
      cellRenderer: RagKpiCellRenderer,
      width: 170,
      sortable: true,
      comparator: (valueA: KpiCellValue | null, valueB: KpiCellValue | null) => {
        const a = valueA?.value ?? -Infinity;
        const b = valueB?.value ?? -Infinity;
        return a - b;
      },
    }));

    return [teamCol, ...kpiCols];
  }, [data, onTeamClick]);

  const defaultColDef = useMemo<ColDef<TeamComparisonRow>>(
    () => ({
      sortable: true,
      resizable: true,
    }),
    []
  );

  const getRowId = useCallback((params: { data: TeamComparisonRow }) => params.data.team, []);

  // Wrap in RoleAdapter — only Leadership and Super_Admin can see this
  return (
    <RoleAdapter allowedRoles={['Leadership', 'Super_Admin']}>
      <section aria-label="Team Comparison" style={{ marginTop: '32px' }}>
        <h2
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: colors.text,
            marginBottom: '16px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Team Comparison
        </h2>

        {loading && (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <div
              style={{
                width: 32,
                height: 32,
                border: `3px solid ${colors.primaryLight}`,
                borderTop: `3px solid ${colors.primary}`,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 12px',
              }}
            />
            <p style={{ color: colors.textSecondary, fontSize: '13px' }}>
              Loading team comparison...
            </p>
          </div>
        )}

        {error && !loading && (
          <div
            style={{
              background: '#FFF5F5',
              border: '1px solid #FED7D7',
              borderRadius: '12px',
              padding: '24px',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: '14px', color: colors.red, fontWeight: 500 }}>
              ⚠️ {error}
            </p>
          </div>
        )}

        {!loading && !error && data.length === 0 && (
          <div
            style={{
              background: colors.background,
              border: `1px solid ${colors.border}`,
              borderRadius: '12px',
              padding: '48px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📊</div>
            <p style={{ fontSize: '16px', fontWeight: 500, color: colors.text, marginBottom: '6px' }}>
              No comparison data available
            </p>
            <p style={{ fontSize: '13px', color: colors.textSecondary }}>
              Adjust your filters or ensure teams have submitted sprint data.
            </p>
          </div>
        )}

        {!loading && !error && data.length > 0 && (
          <div className="ag-theme-alpine" style={{ width: '100%', minHeight: 300 }}>
            <AgGridReact<TeamComparisonRow>
              columnDefs={columnDefs}
              rowData={data}
              defaultColDef={defaultColDef}
              domLayout="autoHeight"
              getRowId={getRowId}
              suppressCellFocus={false}
            />
          </div>
        )}
      </section>
    </RoleAdapter>
  );
}

export default TeamComparisonTable;
