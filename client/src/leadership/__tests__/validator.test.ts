/**
 * Unit tests for Validator edge cases (Task 3.3).
 *
 * Concrete example/edge-case coverage for per-KPI_Type validation: whitespace
 * handling, non-numeric rejection, boundary numbers, currency parsing, and
 * text acceptance.
 *
 * Requirements: 2.5, 2.6
 */

import { describe, it, expect } from 'vitest';

import { validate } from '../services/validator';

describe('Validator edge cases', () => {
  describe('whitespace handling (Req 2.5)', () => {
    it('trims leading/trailing whitespace before parsing a Number', () => {
      expect(validate('  42  ', 'Number')).toEqual({ ok: true, value: 42 });
    });

    it('trims whitespace around a Currency value', () => {
      expect(validate('\t1000\t', 'Currency')).toEqual({ ok: true, value: 1000 });
    });

    it('trims whitespace around a Percentage value', () => {
      expect(validate('  85  ', 'Percentage')).toEqual({ ok: true, value: 85 });
    });

    it('treats empty input as an absent value (null) for numeric types', () => {
      expect(validate('', 'Number')).toEqual({ ok: true, value: null });
      expect(validate('', 'Currency')).toEqual({ ok: true, value: null });
      expect(validate('', 'Percentage')).toEqual({ ok: true, value: null });
    });

    it('treats whitespace-only input as an absent value (null) for numeric types', () => {
      expect(validate('   ', 'Number')).toEqual({ ok: true, value: null });
      expect(validate('\t', 'Percentage')).toEqual({ ok: true, value: null });
    });
  });

  describe('non-numeric rejection (Req 2.6)', () => {
    it('rejects "abc" for Number', () => {
      const result = validate('abc', 'Number');
      expect(result.ok).toBe(false);
    });

    it('rejects "abc" for Currency', () => {
      const result = validate('abc', 'Currency');
      expect(result.ok).toBe(false);
    });

    it('rejects "abc" for Percentage', () => {
      const result = validate('abc', 'Percentage');
      expect(result.ok).toBe(false);
    });

    it('rejects other non-numeric tokens for numeric types', () => {
      for (const token of ['n/a', 'pending', 'TBD', '--']) {
        expect(validate(token, 'Number').ok).toBe(false);
        expect(validate(token, 'Currency').ok).toBe(false);
        expect(validate(token, 'Percentage').ok).toBe(false);
      }
    });

    it('includes a descriptive reason when rejecting', () => {
      const result = validate('abc', 'Number');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Number');
      }
    });
  });

  describe('boundary numbers (Req 2.5)', () => {
    it('accepts zero', () => {
      expect(validate('0', 'Number')).toEqual({ ok: true, value: 0 });
    });

    it('accepts negative numbers', () => {
      expect(validate('-5', 'Number')).toEqual({ ok: true, value: -5 });
      expect(validate('-500', 'Currency')).toEqual({ ok: true, value: -500 });
    });

    it('accepts large numbers', () => {
      expect(validate('1000000', 'Number')).toEqual({ ok: true, value: 1000000 });
    });

    it('accepts decimals', () => {
      expect(validate('3.14', 'Number')).toEqual({ ok: true, value: 3.14 });
    });
  });

  describe('currency parsing (Req 2.5)', () => {
    it('parses a symbol-and-comma formatted currency value as a number', () => {
      expect(validate('₹ 1,297,676.08', 'Currency')).toEqual({
        ok: true,
        value: 1297676.08,
      });
    });

    it('parses a comma-grouped currency value as a number', () => {
      expect(validate('1,269,233', 'Currency')).toEqual({ ok: true, value: 1269233 });
    });

    it('parses a plain currency number', () => {
      expect(validate('250', 'Currency')).toEqual({ ok: true, value: 250 });
    });
  });

  describe('text inputs (Req 2.5)', () => {
    it('accepts arbitrary text as-is', () => {
      expect(validate('On track', 'Text')).toEqual({ ok: true, value: 'On track' });
    });

    it('accepts an empty string as-is (not treated as null)', () => {
      expect(validate('', 'Text')).toEqual({ ok: true, value: '' });
    });

    it('accepts whitespace text as-is without trimming', () => {
      expect(validate('  spaced  ', 'Text')).toEqual({ ok: true, value: '  spaced  ' });
    });

    it('accepts numeric-looking text as a string', () => {
      expect(validate('42', 'Text')).toEqual({ ok: true, value: '42' });
    });
  });
});
