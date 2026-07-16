import type { KpiName, RagStatus } from '../types';
import RagBadge from './RagBadge';
import { colors, theme } from '../theme';

export interface KpiTileProps {
  kpiName: KpiName;
  value: number | null;
  ragStatus: RagStatus;
  percentChange: number | null;
  insufficientData: boolean;
}

/** Map KPI names to human-readable display labels */
const KPI_LABELS: Record<KpiName, string> = {
  sprint_commitment: 'Sprint Commitment',
  release_success_rate: 'Release Success Rate',
  deployment_frequency: 'Deployment Frequency',
  capacity_utilization: 'Capacity Utilization',
  ai_efficiency: 'AI Efficiency',
  uat_predictability: 'UAT Predictability',
  dev_cycle_time: 'Dev Cycle Time',
  story_drop_rate: 'Story Drop Rate',
  rollback_rate: 'Rollback Rate',
};

/** Map KPI names to their display units */
const KPI_UNITS: Record<KpiName, string> = {
  sprint_commitment: '%',
  release_success_rate: '%',
  deployment_frequency: '',
  capacity_utilization: '%',
  ai_efficiency: '%',
  uat_predictability: '%',
  dev_cycle_time: ' days',
  story_drop_rate: '%',
  rollback_rate: '%',
};

function formatValue(kpiName: KpiName, value: number): string {
  const unit = KPI_UNITS[kpiName];
  return `${value}${unit}`;
}

function formatPercentChange(percentChange: number | null): string {
  if (percentChange === null) return '—';
  if (percentChange > 0) return `↑ ${percentChange}%`;
  if (percentChange < 0) return `↓ ${Math.abs(percentChange)}%`;
  return '→ 0%';
}

/**
 * KPI tile — card displaying a single KPI with platform styling.
 */
export default function KpiTile({
  kpiName,
  value,
  ragStatus,
  percentChange,
  insufficientData,
}: KpiTileProps) {
  const showNoData = value === null || insufficientData;

  return (
    <div
      style={{
        background: colors.background,
        border: `1px solid ${colors.border}`,
        borderRadius: theme.borderRadius.md,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxShadow: theme.shadows.card,
        transition: 'box-shadow 0.2s, transform 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = theme.shadows.hover;
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = theme.shadows.card;
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* KPI Label */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '13px', fontWeight: 500, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {KPI_LABELS[kpiName]}
        </span>
        <RagBadge status={ragStatus} />
      </div>

      {/* Value */}
      <div>
        {showNoData ? (
          <span style={{ fontSize: '16px', color: '#B0B0B0', fontStyle: 'italic' }}>
            No data available
          </span>
        ) : (
          <span style={{ fontSize: '28px', fontWeight: 700, color: colors.text }}>
            {formatValue(kpiName, value)}
          </span>
        )}
      </div>

      {/* Percent change */}
      <div
        style={{
          fontSize: '12px',
          fontWeight: 500,
          color: percentChange !== null && percentChange > 0 ? colors.green
            : percentChange !== null && percentChange < 0 ? colors.red
            : colors.textSecondary,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span>{formatPercentChange(percentChange)}</span>
        {percentChange !== null && (
          <span style={{ color: colors.textSecondary, fontWeight: 400 }}>vs prev period</span>
        )}
      </div>
    </div>
  );
}
