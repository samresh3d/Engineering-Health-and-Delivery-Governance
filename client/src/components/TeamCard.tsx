import { LineChart, Line } from 'recharts';
import type { RagStatus } from '../types';
import { colors, ragColors, theme } from '../theme';
import RagBadge from './RagBadge';

export interface TeamCardProps {
  teamName: string;
  healthScore: { value: number; ragStatus: RagStatus } | null;
  activeDivisions: number;
  activeProjects: number;
  sparkline: number[];
  isExpanded: boolean;
  onToggle: () => void;
}

/** RAG-based left border colors matching design spec */
const RAG_BORDER_COLORS: Record<RagStatus, string> = {
  green: '#28A745',
  amber: '#FFC107',
  red: '#DC3545',
};

/**
 * TeamCard — displays a team summary with health score, sparkline,
 * and expand/collapse affordance for drill-down navigation.
 */
export default function TeamCard({
  teamName,
  healthScore,
  activeDivisions,
  activeProjects,
  sparkline,
  isExpanded,
  onToggle,
}: TeamCardProps) {
  const borderColor = healthScore
    ? RAG_BORDER_COLORS[healthScore.ragStatus]
    : colors.border;

  const sparklineData = sparkline.map((value, index) => ({ index, value }));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      aria-label={`${teamName} team card${healthScore ? `, health score ${healthScore.value}` : ''}`}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
      style={{
        background: colors.background,
        border: `1px solid ${colors.border}`,
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: theme.borderRadius.md,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        boxShadow: theme.shadows.card,
        cursor: 'pointer',
        transition: 'box-shadow 0.2s, transform 0.2s',
        userSelect: 'none',
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
      {/* Team name and health score */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <span
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: colors.text,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {teamName}
          </span>
          {healthScore ? (
            <RagBadge status={healthScore.ragStatus} />
          ) : (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: '12px',
                backgroundColor: '#F0F0F0',
                color: colors.textSecondary,
              }}
            >
              N/A
            </span>
          )}
        </div>

        {/* Health score value */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
          <span style={{ fontSize: '24px', fontWeight: 700, color: colors.text }}>
            {healthScore ? healthScore.value : '—'}
          </span>
          <span style={{ fontSize: '12px', color: colors.textSecondary }}>Health Score</span>
        </div>

        {/* Division and project counts */}
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: colors.textSecondary }}>
          <span>
            <strong style={{ color: colors.text }}>{activeDivisions}</strong> Division{activeDivisions !== 1 ? 's' : ''}
          </span>
          <span>
            <strong style={{ color: colors.text }}>{activeProjects}</strong> Project{activeProjects !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Mini sparkline */}
      {sparklineData.length > 0 && (
        <div style={{ flexShrink: 0, width: '80px', height: '30px' }} aria-hidden="true">
          <LineChart width={80} height={30} data={sparklineData}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={healthScore ? ragColors[healthScore.ragStatus] : colors.textSecondary}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </div>
      )}

      {/* Chevron expand affordance */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '24px',
          height: '24px',
          transition: 'transform 0.2s ease',
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
        }}
        aria-hidden="true"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4 6L8 10L12 6"
            stroke={colors.textSecondary}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
