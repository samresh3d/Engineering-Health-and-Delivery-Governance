/**
 * Axis Max Life brand theme and color constants.
 */

/** RAG status colors */
export const ragColors = {
  green: '#28A745',
  amber: '#FFC107',
  red: '#DC3545',
} as const;

/** Brand color palette */
export const colors = {
  primary: '#800020',
  background: '#FFFFFF',
  secondary: '#F5F5F5',
  text: '#333333',
  ...ragColors,
} as const;

/** Full theme object for use across the application */
export const theme = {
  colors,
  ragColors,
  fonts: {
    body: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    heading: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },
} as const;

export type Theme = typeof theme;
export type RagStatus = keyof typeof ragColors;
