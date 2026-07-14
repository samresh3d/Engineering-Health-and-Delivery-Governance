import { ragColors } from '../theme';
import type { RagStatus } from '../types';

export interface RagBadgeProps {
  status: RagStatus;
}

/**
 * Small colored circle indicator representing RAG (Red/Amber/Green) status.
 */
export default function RagBadge({ status }: RagBadgeProps) {
  return (
    <span
      role="img"
      aria-label={`Status: ${status}`}
      style={{
        display: 'inline-block',
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        backgroundColor: ragColors[status],
      }}
    />
  );
}
