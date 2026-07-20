/**
 * Shared RAG (Red/Amber/Green) color mapping for the Leadership Dashboard.
 *
 * Provides four distinct colors — one for each {@link HealthStatus} value —
 * so that Green, Amber, Red, and Unknown are rendered consistently across
 * every chart wrapper and view in the module (Requirements 5.8, 6.2, 13.6).
 *
 * The palette mirrors the existing brand RAG colors for visual consistency
 * while remaining self-contained within the isolated module. `Unknown` uses a
 * neutral gray so absent-data states are visually distinct from Red.
 */
import type { HealthStatus } from '../../model/types';

/** Distinct color per Health_Status, keyed by the canonical status labels. */
export const ragColors: Record<HealthStatus, string> = {
  Green: '#28A745',
  Amber: '#F5A623',
  Red: '#DC3545',
  Unknown: '#9AA0A6',
};

/**
 * Resolve the color for a Health_Status, falling back to the `Unknown` color
 * for any unrecognized status. Chart wrappers use this to color series/points.
 */
export function ragColor(status: HealthStatus | null | undefined): string {
  if (status && status in ragColors) {
    return ragColors[status];
  }
  return ragColors.Unknown;
}
