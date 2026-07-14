import { describe, it, expect } from 'vitest';
import { colors, ragColors, theme } from './index';

describe('Theme', () => {
  it('exports correct RAG color constants', () => {
    expect(ragColors.green).toBe('#28A745');
    expect(ragColors.amber).toBe('#FFC107');
    expect(ragColors.red).toBe('#DC3545');
  });

  it('exports correct brand colors', () => {
    expect(colors.primary).toBe('#800020');
    expect(colors.background).toBe('#FFFFFF');
    expect(colors.secondary).toBe('#F5F5F5');
    expect(colors.text).toBe('#333333');
  });

  it('theme object includes colors and ragColors', () => {
    expect(theme.colors).toBeDefined();
    expect(theme.ragColors).toBeDefined();
    expect(theme.colors.primary).toBe('#800020');
    expect(theme.ragColors.green).toBe('#28A745');
  });
});
