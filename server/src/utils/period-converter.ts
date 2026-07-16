/**
 * Period-to-Date-Range Converter Utility.
 *
 * Converts time period selections (month, quarter, year, custom) to
 * concrete date ranges with proper handling of leap years and month boundaries.
 */

/** A concrete date range in YYYY-MM-DD format */
export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

/** Result of a period conversion attempt */
export interface PeriodConverterResult {
  success: boolean;
  dateRange?: DateRange;
  error?: string;
}

/** Options for configuring the period conversion */
export interface PeriodOptions {
  month?: number;      // 1-12
  quarter?: number;    // 1-4
  year?: number;       // e.g. 2024
  startDate?: string;  // YYYY-MM-DD for custom ranges
  endDate?: string;    // YYYY-MM-DD for custom ranges
}

/** Valid period types */
export type PeriodType = 'month' | 'quarter' | 'year' | 'custom';

/**
 * Returns the number of days in a given month, accounting for leap years.
 */
function getDaysInMonth(year: number, month: number): number {
  // month is 1-based; Date constructor uses 0-based months.
  // Setting day to 0 of the next month gives us the last day of the target month.
  return new Date(year, month, 0).getDate();
}

/**
 * Checks if the given year is a leap year.
 */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Pads a number to two digits with leading zero.
 */
function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Formats a date as YYYY-MM-DD.
 */
function formatDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Converts a period selection to a concrete date range.
 *
 * @param period - The type of period: 'month', 'quarter', 'year', or 'custom'
 * @param options - Configuration options for the conversion
 * @returns A PeriodConverterResult with the date range or an error message
 *
 * @example
 * // Month filter
 * convertPeriodToDateRange('month', { month: 3, year: 2024 })
 * // → { success: true, dateRange: { startDate: '2024-03-01', endDate: '2024-03-31' } }
 *
 * @example
 * // Quarter filter
 * convertPeriodToDateRange('quarter', { quarter: 1, year: 2024 })
 * // → { success: true, dateRange: { startDate: '2024-01-01', endDate: '2024-03-31' } }
 *
 * @example
 * // Year filter
 * convertPeriodToDateRange('year', { year: 2024 })
 * // → { success: true, dateRange: { startDate: '2024-01-01', endDate: '2024-12-31' } }
 *
 * @example
 * // Custom date range
 * convertPeriodToDateRange('custom', { startDate: '2024-01-15', endDate: '2024-03-20' })
 * // → { success: true, dateRange: { startDate: '2024-01-15', endDate: '2024-03-20' } }
 */
export function convertPeriodToDateRange(
  period: PeriodType,
  options: PeriodOptions = {}
): PeriodConverterResult {
  switch (period) {
    case 'month':
      return convertMonth(options);
    case 'quarter':
      return convertQuarter(options);
    case 'year':
      return convertYear(options);
    case 'custom':
      return convertCustom(options);
    default:
      return { success: false, error: `Invalid period type: ${period}` };
  }
}

/**
 * Converts a month period to a date range.
 * Defaults year to the current year if not specified.
 */
function convertMonth(options: PeriodOptions): PeriodConverterResult {
  const year = options.year ?? new Date().getFullYear();
  const month = options.month;

  if (month === undefined || month === null) {
    return { success: false, error: 'Month is required for period type "month"' };
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { success: false, error: 'Month must be an integer between 1 and 12' };
  }

  if (!Number.isInteger(year)) {
    return { success: false, error: 'Year must be an integer' };
  }

  const daysInMonth = getDaysInMonth(year, month);
  const startDate = formatDate(year, month, 1);
  const endDate = formatDate(year, month, daysInMonth);

  return { success: true, dateRange: { startDate, endDate } };
}

/**
 * Converts a quarter period to a date range.
 * Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec.
 * Defaults year to the current year if not specified.
 */
function convertQuarter(options: PeriodOptions): PeriodConverterResult {
  const year = options.year ?? new Date().getFullYear();
  const quarter = options.quarter;

  if (quarter === undefined || quarter === null) {
    return { success: false, error: 'Quarter is required for period type "quarter"' };
  }

  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
    return { success: false, error: 'Quarter must be an integer between 1 and 4' };
  }

  if (!Number.isInteger(year)) {
    return { success: false, error: 'Year must be an integer' };
  }

  // Quarter start months: Q1=1, Q2=4, Q3=7, Q4=10
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const daysInEndMonth = getDaysInMonth(year, endMonth);

  const startDate = formatDate(year, startMonth, 1);
  const endDate = formatDate(year, endMonth, daysInEndMonth);

  return { success: true, dateRange: { startDate, endDate } };
}

/**
 * Converts a year period to a date range (full calendar year).
 * Defaults year to the current year if not specified.
 */
function convertYear(options: PeriodOptions): PeriodConverterResult {
  const year = options.year ?? new Date().getFullYear();

  if (!Number.isInteger(year)) {
    return { success: false, error: 'Year must be an integer' };
  }

  const startDate = formatDate(year, 1, 1);
  const endDate = formatDate(year, 12, 31);

  return { success: true, dateRange: { startDate, endDate } };
}

/**
 * Converts a custom date range, validating that endDate >= startDate.
 */
function convertCustom(options: PeriodOptions): PeriodConverterResult {
  const { startDate, endDate } = options;

  if (!startDate) {
    return { success: false, error: 'startDate is required for period type "custom"' };
  }

  if (!endDate) {
    return { success: false, error: 'endDate is required for period type "custom"' };
  }

  // Validate date format (YYYY-MM-DD)
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(startDate)) {
    return { success: false, error: 'startDate must be in YYYY-MM-DD format' };
  }

  if (!datePattern.test(endDate)) {
    return { success: false, error: 'endDate must be in YYYY-MM-DD format' };
  }

  // Validate that dates are actually valid calendar dates
  const startParsed = new Date(startDate + 'T00:00:00Z');
  const endParsed = new Date(endDate + 'T00:00:00Z');

  if (isNaN(startParsed.getTime())) {
    return { success: false, error: 'startDate is not a valid date' };
  }

  if (isNaN(endParsed.getTime())) {
    return { success: false, error: 'endDate is not a valid date' };
  }

  // Validate endDate >= startDate
  if (endDate < startDate) {
    return { success: false, error: 'endDate must not be before startDate' };
  }

  return { success: true, dateRange: { startDate, endDate } };
}
