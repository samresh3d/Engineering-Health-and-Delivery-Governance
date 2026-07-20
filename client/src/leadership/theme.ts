/**
 * Dark, executive-grade design tokens for the Leadership Dashboard Overview.
 *
 * Centralizes the palette used across the redesigned dashboard so panels,
 * charts, and cards stay visually consistent.
 */

export const dash = {
  // Surfaces
  appBg: '#0B1220',
  sidebarBg: '#0E1626',
  panelBg: '#121A2A',
  panelBgAlt: '#0F1826',
  border: '#1E293B',
  borderSoft: '#172033',

  // Text
  text: '#E5E7EB',
  textStrong: '#F8FAFC',
  textMuted: '#94A3B8',
  textFaint: '#64748B',

  // Brand / accents (per pillar tile)
  delivery: '#3B82F6',
  quality: '#8B5CF6',
  stability: '#14B8A6',
  cost: '#F59E0B',
  ai: '#22C55E',
  primary: '#6366F1',

  // RAG
  green: '#22C55E',
  amber: '#F59E0B',
  red: '#EF4444',
  unknown: '#64748B',

  // Trend deltas
  up: '#22C55E',
  down: '#EF4444',
  flat: '#94A3B8',
} as const;

export type DashPalette = typeof dash;

/** Map a health status to its dashboard RAG color. */
export function ragColorDark(status: 'Green' | 'Amber' | 'Red' | 'Unknown'): string {
  switch (status) {
    case 'Green':
      return dash.green;
    case 'Amber':
      return dash.amber;
    case 'Red':
      return dash.red;
    default:
      return dash.unknown;
  }
}
