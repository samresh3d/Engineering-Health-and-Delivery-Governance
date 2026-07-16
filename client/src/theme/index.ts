/**
 * Engineering Health Platform brand theme.
 * Visual identity:
 * - Deep Maroon/Burgundy primary (#6B0F2B)
 * - Gold accent (#C5992E)
 * - Clean white backgrounds
 * - Warm greys for secondary content
 * - Modern sans-serif typography
 */

/** RAG status colors */
export const ragColors = {
  green: '#28A745',
  amber: '#F5A623',
  red: '#DC3545',
} as const;

/** Brand color palette */
export const colors = {
  /** Deep maroon — primary brand color */
  primary: '#6B0F2B',
  /** Darker maroon for hover states */
  primaryDark: '#4A0A1E',
  /** Lighter maroon for subtle backgrounds */
  primaryLight: '#F9EEF1',
  /** Gold accent — secondary brand color */
  accent: '#C5992E',
  /** Gold hover */
  accentDark: '#A67D1E',
  /** Pure white background */
  background: '#FFFFFF',
  /** Light grey for secondary areas and cards */
  secondary: '#F7F8FA',
  /** Border color */
  border: '#E8E8E8',
  /** Dark grey text */
  text: '#1A1A2E',
  /** Medium grey for secondary text */
  textSecondary: '#5A5A6E',
  /** Light text (on dark backgrounds) */
  textLight: '#FFFFFF',
  /** Subtle background for header/nav */
  navBackground: '#6B0F2B',
  /** Success/healthy */
  ...ragColors,
} as const;

/** Full theme object */
export const theme = {
  colors,
  ragColors,
  fonts: {
    body: "'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
    heading: "'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
  },
  borderRadius: {
    sm: '6px',
    md: '10px',
    lg: '16px',
  },
  shadows: {
    card: '0 2px 8px rgba(107, 15, 43, 0.06)',
    hover: '0 4px 16px rgba(107, 15, 43, 0.12)',
    nav: '0 2px 12px rgba(0, 0, 0, 0.08)',
  },
} as const;

export type Theme = typeof theme;
export type RagStatus = keyof typeof ragColors;
