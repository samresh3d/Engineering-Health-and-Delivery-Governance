import type { DivisionMetrics, KpiTileData, PeriodType } from '../types/governance';
import RagBadge from './RagBadge';
import { colors, ragColors, theme } from '../theme';

export interface DrillDownPanelProps {
  teamId: string;
  selectedPeriod: PeriodType;
  divisions: DivisionMetrics[];
  expandedDivision: string | null;
  onDivisionToggle: (divisionName: string) => void;
}

/**
 * Accordion panel rendered below an expanded Team Card on the Leadership Dashboard.
 * Lists divisions with KPI summaries and RAG badges. Clicking a division expands
 * project-level detail. Supports keyboard navigation and ARIA attributes.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 11.4, 11.5
 */
export default function DrillDownPanel({
  teamId,
  selectedPeriod,
  divisions,
  expandedDivision,
  onDivisionToggle,
}: DrillDownPanelProps) {
  return (
    <div
      data-testid="drill-down-panel"
      data-team-id={teamId}
      data-period={selectedPeriod}
      style={{
        background: colors.secondary,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${colors.border}`,
        padding: theme.spacing.md,
        marginTop: theme.spacing.sm,
      }}
      role="region"
      aria-label={`Division breakdown for team ${teamId}`}
    >
      {divisions.length === 0 ? (
        <p style={{ color: colors.textSecondary, fontStyle: 'italic', margin: 0 }}>
          No divisions configured for this team.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {divisions.map((division) => {
            const isExpanded = expandedDivision === division.divisionName;
            return (
              <DivisionRow
                key={division.divisionName}
                division={division}
                isExpanded={isExpanded}
                onToggle={() => onDivisionToggle(division.divisionName)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface DivisionRowProps {
  division: DivisionMetrics;
  isExpanded: boolean;
  onToggle: () => void;
}

function DivisionRow({ division, isExpanded, onToggle }: DivisionRowProps) {
  const healthRagColor = division.healthScore
    ? ragColors[division.healthScore.ragStatus]
    : colors.border;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  }

  return (
    <div
      style={{
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      {/* Division header row — clickable to expand/collapse */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-controls={`division-detail-${division.divisionName}`}
        data-testid={`division-row-${division.divisionName}`}
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.md,
          padding: `${theme.spacing.md} ${theme.spacing.sm}`,
          cursor: 'pointer',
          borderLeft: `4px solid ${healthRagColor}`,
          background: isExpanded ? colors.background : 'transparent',
          borderRadius: isExpanded ? theme.borderRadius.sm : '0',
          transition: 'background 300ms ease, border-color 300ms ease',
          outline: 'none',
        }}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = `0 0 0 2px ${colors.primary}`;
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {/* Chevron */}
        <span
          style={{
            display: 'inline-flex',
            transition: 'transform 300ms ease',
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            fontSize: '14px',
            color: colors.textSecondary,
          }}
          aria-hidden="true"
        >
          ▶
        </span>

        {/* Division name */}
        <span
          style={{
            fontWeight: 600,
            fontSize: '14px',
            color: colors.text,
            minWidth: '140px',
          }}
        >
          {division.divisionName}
        </span>

        {/* Health Score */}
        {division.healthScore && (
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: ragColors[division.healthScore.ragStatus],
            }}
          >
            {division.healthScore.value}%
          </span>
        )}

        {/* KPI summary badges */}
        <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {division.kpis.slice(0, 4).map((kpi) => (
            <KpiSummaryBadge key={kpi.kpiName} kpi={kpi} />
          ))}
          {division.healthScore && (
            <RagBadge status={division.healthScore.ragStatus} />
          )}
        </div>
      </div>

      {/* Expandable detail panel with smooth CSS transition */}
      <div
        id={`division-detail-${division.divisionName}`}
        role="region"
        aria-labelledby={`division-row-${division.divisionName}`}
        style={{
          maxHeight: isExpanded ? '600px' : '0',
          overflow: 'hidden',
          transition: 'max-height 300ms ease-in-out, opacity 300ms ease-in-out',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <DivisionDetail division={division} />
      </div>
    </div>
  );
}

interface KpiSummaryBadgeProps {
  kpi: KpiTileData;
}

function KpiSummaryBadge({ kpi }: KpiSummaryBadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '8px',
        fontSize: '11px',
        fontWeight: 500,
        background: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.textSecondary,
      }}
      title={`${kpi.kpiName}: ${kpi.value ?? 'N/A'}`}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: ragColors[kpi.ragStatus],
        }}
      />
      {formatKpiName(kpi.kpiName)}
    </span>
  );
}

interface DivisionDetailProps {
  division: DivisionMetrics;
}

function DivisionDetail({ division }: DivisionDetailProps) {
  return (
    <div
      style={{
        padding: `${theme.spacing.sm} ${theme.spacing.md} ${theme.spacing.md} ${theme.spacing.lg}`,
        background: colors.background,
        borderRadius: theme.borderRadius.sm,
        margin: `0 ${theme.spacing.sm} ${theme.spacing.sm}`,
      }}
    >
      <h4
        style={{
          margin: `0 0 ${theme.spacing.sm}`,
          fontSize: '13px',
          fontWeight: 600,
          color: colors.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        KPI Breakdown — {division.divisionName}
      </h4>

      {division.kpis.length === 0 ? (
        <p style={{ color: colors.textSecondary, fontStyle: 'italic', margin: 0, fontSize: '13px' }}>
          No KPI data available for this division.
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: theme.spacing.sm,
          }}
        >
          {division.kpis.map((kpi) => (
            <KpiDetailCard key={kpi.kpiName} kpi={kpi} />
          ))}
        </div>
      )}
    </div>
  );
}

interface KpiDetailCardProps {
  kpi: KpiTileData;
}

function KpiDetailCard({ kpi }: KpiDetailCardProps) {
  return (
    <div
      style={{
        padding: theme.spacing.sm,
        border: `1px solid ${colors.border}`,
        borderRadius: theme.borderRadius.sm,
        background: colors.secondary,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '4px',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 500, color: colors.textSecondary, textTransform: 'uppercase' }}>
          {formatKpiName(kpi.kpiName)}
        </span>
        <RagBadge status={kpi.ragStatus} />
      </div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: colors.text }}>
        {kpi.value !== null ? `${kpi.value}%` : '—'}
      </div>
      {kpi.percentChange !== null && (
        <div
          style={{
            fontSize: '11px',
            fontWeight: 500,
            color: kpi.percentChange > 0 ? colors.green : kpi.percentChange < 0 ? colors.red : colors.textSecondary,
            marginTop: '2px',
          }}
        >
          {kpi.percentChange > 0 ? '↑' : kpi.percentChange < 0 ? '↓' : '→'} {Math.abs(kpi.percentChange)}% vs prev
        </div>
      )}
      {kpi.insufficientData && (
        <div style={{ fontSize: '10px', color: colors.textSecondary, fontStyle: 'italic', marginTop: '2px' }}>
          Limited data
        </div>
      )}
    </div>
  );
}

/** Convert snake_case KPI names to Title Case for display */
function formatKpiName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
