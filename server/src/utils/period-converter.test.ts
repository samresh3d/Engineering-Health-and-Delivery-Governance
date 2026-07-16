import { describe, it, expect } from 'vitest';
import { convertPeriodToDateRange } from './period-converter';

describe('period-converter', () => {
  describe('month period', () => {
    it('converts a standard month correctly', () => {
      const result = convertPeriodToDateRange('month', { month: 3, year: 2024 });
      expect(result).toEqual({
        success: true,
        dateRange: { startDate: '2024-03-01', endDate: '2024-03-31' },
      });
    });

    it('handles February in a leap year', () => {
      const result = convertPeriodToDateRange('month', { month: 2, year: 2024 });
      expect(result).toEqual({
        success: true,
        dateRange: { startDate: '2024-02-01', endDate: '2024-02-29' },
      });
    });

    it('handles February in a non-leap year', () => {
      const result = convertPeriodToDateRange('month', { month: 2, year: 2023 });
      expect(result).toEqual({
        success: true,
        dateRange: { startDate: '2023-02-01', endDate: '2023-02-28' },
      });
    });

    it('handles months with 30 days (April)', () => {
      const result = convertPeriodToDateRange('month', { month: 4, year: 2024 });
      expect(result).toEqual({
        success: true,
        dateRange: { startDate: '2024-04-01', endDate: '2024-04-30' },
      });
    });

    it('handles January (31 days)', () => {
      const result = convertPeriodToDateRange('month', { month: 1, year: 2024 });
      expect(result).toEqual({
        success: true,
        dateRange: { startDate: '2024-01-01', endDate: '2024-01-31' },
      });
    });

    it('handles December (31 days)', () => {
      const result = convertPeriodToDateRange('month', { month: 12, year: 2024 });
      expect(result).toEqual({
        success: true,
        dateRange: { startDate: '2024-12-01', endDate: '2024-12-31' },
      });
    });

    it('defaults year to current year when not specified', () => {
      const currentYear = new Date().getFullYear();
      const result = convertPeriodToDateRange('month', { month: 6 });
      expect(result.success).toBe(true);
      expect(result.dateRange?.startDate).toBe(`${currentYear}-06-01`);
      expect(result.dateRange?.endDate).toBe(`${currentYear}-06-30`);
    });

    it('returns error when month is missing', () => {
      const result = convertPeriodToDateRange('month', { year: 2024 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Month is required');
    });

    it('returns error for invalid month (0)', () => {
      const result = convertPeriodToDateRange('month', { month: 0, year: 2024 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('between 1 and 12');
    });

    it('returns error for invalid month (13)', () => {
      const result = convertPeriodToDateRange('month', { month: 13, year: 2024 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('between 1 and 12');
    });

    it('handles February in a century year that is not a leap year (1900)', () => {
      const result = convertPeriodToDateRange('month', { month: 2, year: 1900 });
      expect(result).toEqual({
        success: true,
        dateRange: { startDate: '1900-02-01', endDate: '1900-02-28' },
      });
    });

    it('handles February in a 400-year leap year (2000)', () => {
      const result = convertPeriodToDateRange('month', { month: 2, year: 2000 });
      expect(result).toEqual({
        success: true,
        dateRange: { startDate: '2000-02-01', endDate: '2000-02-29' },
      });
    });
  });

  describe('quarter period', () => {
    it('converts Q1 correctly', () => {
      const result = convertPeriodToDateRange('quarter', { quarter: 1, year: 2024 });
      expect(result).toEqual({
        success: true,
        dateRange: { startDate: '2024-01-01', endDate: '2024-03-31' },
      });
    });

    it('converts Q2 correctly', () => {
      const result = convertPeriodToDateRange('quarter', { quarter: 2, year: 2024 });
      expect(result).toEqual({
        success: true,
        dateRange: { startDate: '2024-04-01', endDate: '2024-06-30' },
      });
    });

    it('converts Q3 correctly', () => {
      const result = convertPeriodToDateRange('quarter', { quarter: 3, year: 2024 });
      expect(result).toEqual({
        success: true,
        dateRange: { startDate: '2024-07-01', endDate: '2024-09-30' },
      });
    });

    it('converts Q4 correctly', () => {
      const result = convertPeriodToDateRange('quarter', { quarter: 4, year: 2024 });
      expect(result).toEqual({
        success: true,
        dateRange: { startDate: '2024-10-01', endDate: '2024-12-31' },
      });
    });

    it('defaults year to current year when not specified', () => {
      const currentYear = new Date().getFullYear();
      const result = convertPeriodToDateRange('quarter', { quarter: 2 });
      expect(result.success).toBe(true);
      expect(result.dateRange?.startDate).toBe(`${currentYear}-04-01`);
      expect(result.dateRange?.endDate).toBe(`${currentYear}-06-30`);
    });

    it('returns error when quarter is missing', () => {
      const result = convertPeriodToDateRange('quarter', { year: 2024 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Quarter is required');
    });

    it('returns error for invalid quarter (0)', () => {
      const result = convertPeriodToDateRange('quarter', { quarter: 0, year: 2024 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('between 1 and 4');
    });

    it('returns error for invalid quarter (5)', () => {
      const result = convertPeriodToDateRange('quarter', { quarter: 5, year: 2024 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('between 1 and 4');
    });
  });

  describe('year period', () => {
    it('converts a full year correctly', () => {
      const result = convertPeriodToDateRange('year', { year: 2024 });
      expect(result).toEqual({
        success: true,
        dateRange: { startDate: '2024-01-01', endDate: '2024-12-31' },
      });
    });

    it('defaults year to current year when not specified', () => {
      const currentYear = new Date().getFullYear();
      const result = convertPeriodToDateRange('year', {});
      expect(result).toEqual({
        success: true,
        dateRange: { startDate: `${currentYear}-01-01`, endDate: `${currentYear}-12-31` },
      });
    });
  });

  describe('custom period', () => {
    it('accepts a valid custom date range', () => {
      const result = convertPeriodToDateRange('custom', {
        startDate: '2024-01-15',
        endDate: '2024-03-20',
      });
      expect(result).toEqual({
        success: true,
        dateRange: { startDate: '2024-01-15', endDate: '2024-03-20' },
      });
    });

    it('accepts same start and end date', () => {
      const result = convertPeriodToDateRange('custom', {
        startDate: '2024-06-15',
        endDate: '2024-06-15',
      });
      expect(result).toEqual({
        success: true,
        dateRange: { startDate: '2024-06-15', endDate: '2024-06-15' },
      });
    });

    it('rejects when endDate is before startDate', () => {
      const result = convertPeriodToDateRange('custom', {
        startDate: '2024-03-20',
        endDate: '2024-01-15',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('endDate must not be before startDate');
    });

    it('returns error when startDate is missing', () => {
      const result = convertPeriodToDateRange('custom', { endDate: '2024-03-20' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('startDate is required');
    });

    it('returns error when endDate is missing', () => {
      const result = convertPeriodToDateRange('custom', { startDate: '2024-01-15' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('endDate is required');
    });

    it('returns error for invalid startDate format', () => {
      const result = convertPeriodToDateRange('custom', {
        startDate: '2024/01/15',
        endDate: '2024-03-20',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('YYYY-MM-DD format');
    });

    it('returns error for invalid endDate format', () => {
      const result = convertPeriodToDateRange('custom', {
        startDate: '2024-01-15',
        endDate: '20-03-2024',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('YYYY-MM-DD format');
    });
  });
});
