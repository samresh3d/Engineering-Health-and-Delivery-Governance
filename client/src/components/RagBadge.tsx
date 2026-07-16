import type { RagStatus } from '../types';
import { ragColors } from '../theme';

interface RagBadgeProps {
  status: RagStatus;
}

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

/**
 * RAG status badge — pill-shaped indicator with dot and label.
 */
export default function RagBadge({ status }: RagBadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
        backgroundColor: STATUS_BG[status],
        color: ragColors[status],
      }}
      role="status"
      aria-label={`Status: ${STATUS_LABELS[status]}`}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: ragColors[status],
        }}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}
