/**
 * useLeadership — hook to consume the Leadership Dashboard state and actions.
 *
 * Returns the combined {@link LeadershipContextValue} (state + actions). It
 * throws when used outside a `LeadershipProvider`, so misuse fails loudly
 * during development rather than silently reading a `null` context.
 */
import { useContext } from 'react';
import {
  LeadershipContext,
  type LeadershipContextValue,
} from './LeadershipContext';

export function useLeadership(): LeadershipContextValue {
  const context = useContext(LeadershipContext);
  if (context === null) {
    throw new Error('useLeadership must be used within a LeadershipProvider');
  }
  return context;
}
