import { describe, it, expect } from 'vitest';
import { colors, ragColors, theme } from './index';

describe('Theme', () => {
  it('exports correct RAG color constants', () => {
    expect(ragColors.green).toBe('#28A745');
    expect(ragColors.amber).toBe('#F5A623');
    expect(ragColors.red).toBe('#DC3545');
  });

  it('exports correct brand colors', () => {
    expect(colors.primary).toBe('#6B0F2B');
    expect(colors.primaryDark).toBe('#4A0A1E');
    expect(colors.accent).toBe('#C5992E');
    expect(colors.background).toBe('#FFFFFF');
    expect(colors.secondary).toBe('#F7F8FA');
    expect(colors.text).toBe('#1A1A2E');
  });

  it('theme object includes colors, ragColors, and design tokens', () => {
    expect(theme.colors).toBeDefined();
    expect(theme.ragColors).toBeDefined();
    expect(theme.borderRadius).toBeDefined();
    expect(theme.shadows).toBeDefined();
    expect(theme.colors.primary).toBe('#6B0F2B');
    expect(theme.ragColors.green).toBe('#28A745');
  });
});
