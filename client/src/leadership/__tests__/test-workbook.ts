/**
 * Shared test fixture: a small, fixed, valid KPI workbook used by the
 * view-layer unit tests (task 15.8).
 *
 * The workbook uses the normalized ("long") KPIs-sheet layout the existing
 * {@link excelParser} recognizes: a `KPIs` sheet whose header row exposes
 * Team, KPI, Value, Target, Year, Month, Pillar, and Direction columns. The
 * rows are chosen to exercise the view-layer requirements:
 *  - Multiple distinct grid rows (distinct Month/Team identity tuples).
 *  - One row with an ABSENT `Value` cell so the grid renders an em dash
 *    for the Actual Value (Req 1.6).
 *  - A `Number`-typed KPI ("Velocity") so numeric validation rejects `abc`
 *    (Req 2.6) and accepts numbers.
 */
import * as XLSX from 'xlsx';
import { rowId } from '../services/grid-projector';

/** Header row for the normalized KPIs sheet. */
const HEADER = [
  'Team',
  'KPI',
  'Value',
  'Target',
  'Year',
  'Month',
  'Pillar',
  'Direction',
] as const;

/**
 * Data rows. Row identity in the grid is (Month, Team, Pillar, KPI), so each
 * of these produces a distinct grid row. The Beta/Jan row intentionally leaves
 * `Value` empty ('' → null) to test absent-value rendering.
 */
const DATA_ROWS: (string | number)[][] = [
  ['Alpha', 'Velocity', 100, 40, 2025, 'Jan', 'Delivery', 'HigherIsBetter'],
  ['Beta', 'Velocity', '', 40, 2025, 'Jan', 'Delivery', 'HigherIsBetter'],
  ['Alpha', 'Velocity', 80, 40, 2025, 'Feb', 'Delivery', 'HigherIsBetter'],
];

/** Build the fixed workbook as an ArrayBuffer suitable for `uploadWorkbook`. */
export function buildTestWorkbookBuffer(): ArrayBuffer {
  const worksheet = XLSX.utils.aoa_to_sheet([[...HEADER], ...DATA_ROWS]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'KPIs');
  // `type: 'array'` returns an ArrayBuffer.
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

/** A shared, memoized workbook buffer instance for the tests. */
export const TEST_WORKBOOK_BUFFER: ArrayBuffer = buildTestWorkbookBuffer();

/** Stable row ids for the fixture rows (identity tuple = Month, Team, Pillar, KPI). */
export const ROW_ID_ALPHA_JAN = rowId('Jan', 'Alpha', 'Delivery', 'Velocity');
export const ROW_ID_BETA_JAN = rowId('Jan', 'Beta', 'Delivery', 'Velocity');
export const ROW_ID_ALPHA_FEB = rowId('Feb', 'Alpha', 'Delivery', 'Velocity');

/** Expected grid column header labels (Req 1.2). */
export const EXPECTED_COLUMN_HEADERS = [
  'Month',
  'Team',
  'Pillar',
  'KPI',
  'Target',
  'Actual Value',
  'Source',
  'Last Updated',
  'Updated By',
] as const;
