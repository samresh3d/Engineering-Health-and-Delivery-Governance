import type { KpiName, RagStatus } from '../types';
import RagBadge from './RagBadge';

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
  return `0%`;
}

/**
 * KPI tile component displaying the KPI name, current value,
 * RAG status badge, and percentage change indicator.
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
        border: '1px solid #E0E0E0',
        borderRadius: '8px',
        padding: '16px',
        backgroundColor: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div style={{ fontSize: '14px', color: '#666666', fontWeight: 500 }}>
        {KPI_LABELS[kpiName]}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {showNoData ? (
          <span style={{ fontSize: '18px', color: '#999999' }}>
            No data available
          </span>
        ) : (
          <>
            <span style={{ fontSize: '24px', fontWeight: 700, color: '#333333' }}>
              {formatValue(kpiName, value)}
            </span>
            <RagBadge status={ragStatus} />
          </>
        )}
      </div>

      <div
        style={{
          fontSize: '12px',
          color: percentChange !== null && percentChange > 0 ? '#28A745' : percentChange !== null && percentChange < 0 ? '#DC3545' : '#666666',
        }}
      >
        {formatPercentChange(percentChange)}
      </div>
    </div>
  );
}
