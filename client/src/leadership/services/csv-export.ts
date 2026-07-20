/**
 * CSV Export — pure serialization of the current Data_Grid rows to RFC-4180 CSV
 * text (Requirement 4.6, Correctness Property 10).
 *
 * `toCsv(rows)` emits a header row followed by exactly one data line per
 * `GridRow`, with the columns in this fixed order:
 *
 *   Month, Team, Pillar, KPI, Target, Actual Value, Source, Last Updated,
 *   Updated By
 *
 * RFC-4180 compliance:
 *  - Fields are separated by commas and records by CRLF (`\r\n`). RFC-4180
 *    specifies CRLF as the line terminator; we use it throughout (this is an
 *    intentional, documented choice).
 *  - A field is wrapped in double quotes when it contains a comma, a double
 *    quote, a carriage return, or a line feed. Inside a quoted field, each
 *    embedded double quote is escaped by doubling it (`"` -> `""`).
 *  - Because escaping is reversible, parsing the emitted CSV recovers exactly
 *    the field values that were written (round-trip, Property 10).
 *
 * Field mapping from `GridRow` (see `model/editing-types.ts`):
 *  - Month        -> `month`
 *  - Team         -> `team`
 *  - Pillar       -> `pillar`        (null -> empty)
 *  - KPI          -> `kpi`
 *  - Target       -> `target`        (null -> empty, numbers via String())
 *  - Actual Value -> `actualValue`   (null -> empty, numbers via String())
 *  - Source       -> `source`        (null -> empty)
 *  - Last Updated -> `lastUpdated`   (null -> empty)
 *  - Updated By   -> `updatedBy`     (null -> empty)
 *
 * The function is pure: it does not touch the DOM, storage, or any I/O.
 */

import type { GridRow } from '../model/editing-types';
import type { DashboardModel } from '../model/types';
import { exportService } from './export-service';

/** Header row, in the fixed column order mandated by Requirement 4.6. */
export const CSV_HEADERS = [
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

/** RFC-4180 record separator. */
const CRLF = '\r\n';

/**
 * Render a single cell value to its raw (unescaped) string form.
 * `null`/`undefined` become the empty string; numbers use `String()`.
 */
function toField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

/**
 * Escape a field per RFC-4180. Fields containing a comma, a double quote, a CR,
 * or an LF are wrapped in double quotes with embedded quotes doubled.
 */
function escapeField(field: string): string {
  const needsQuoting =
    field.includes(',') ||
    field.includes('"') ||
    field.includes('\r') ||
    field.includes('\n');
  if (!needsQuoting) return field;
  return `"${field.replace(/"/g, '""')}"`;
}

/** Join one record's already-raw fields into an RFC-4180 CSV line. */
function toLine(fields: string[]): string {
  return fields.map(escapeField).join(',');
}

/**
 * Serialize the given `GridRow`s to RFC-4180 CSV text.
 *
 * Emits a header row, then exactly one data line per row. The returned string
 * has no trailing newline.
 */
export function toCsv(rows: GridRow[]): string {
  const lines: string[] = [toLine([...CSV_HEADERS])];

  for (const row of rows) {
    lines.push(
      toLine([
        toField(row.month),
        toField(row.team),
        toField(row.pillar),
        toField(row.kpi),
        toField(row.target),
        toField(row.actualValue),
        toField(row.source),
        toField(row.lastUpdated),
        toField(row.updatedBy),
      ]),
    );
  }

  return lines.join(CRLF);
}

/**
 * Excel Export — a thin delegation to the existing {@link exportService} so the
 * Data Management feature reuses the module's canonical workbook serializer
 * rather than reimplementing the layout (Requirements 4.5, 4.7, 11.4).
 *
 * Delegating to `exportService.exportModelToWorkbook(model)` preserves the
 * existing matrix layout, the normalized header aliases, and the fraction
 * normalization applied by the parser/export pipeline. Because the same service
 * powers import (`excelParser`) and export, this guarantees round-trip fidelity
 * (Correctness Property 9): exporting a `DashboardModel` and re-importing the
 * workbook in replace mode yields an equivalent model.
 *
 * The core function is a pure delegation returning the raw `ArrayBuffer`, which
 * keeps it fully testable without any DOM/browser dependency. A separate
 * `downloadWorkbook` helper triggers a browser download and is intentionally
 * kept out of the pure path.
 */

/** Default filename used when triggering a workbook download. */
export const DEFAULT_WORKBOOK_FILENAME = 'leadership-kpis.xlsx';

/** MIME type for `.xlsx` (Office Open XML) workbooks. */
const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Serialize the given {@link DashboardModel} to an Excel workbook, delegating to
 * the existing {@link exportService} to preserve the matrix layout and
 * round-trip fidelity. Returns the workbook bytes as an `ArrayBuffer`.
 *
 * This is a pure delegation: it does not touch the DOM, storage, or any I/O.
 */
export function toWorkbook(model: DashboardModel): ArrayBuffer {
  return exportService.exportModelToWorkbook(model);
}

/**
 * Trigger a browser download of the model exported as an Excel workbook.
 *
 * This wraps the pure {@link toWorkbook} output in a `Blob` and clicks a
 * transient anchor. It is browser-only (relies on `document`/`URL`) and is kept
 * separate from the pure export path so the serialization remains testable.
 */
export function downloadWorkbook(
  model: DashboardModel,
  filename: string = DEFAULT_WORKBOOK_FILENAME,
): void {
  const buffer = toWorkbook(model);
  const blob = new Blob([buffer], { type: XLSX_MIME_TYPE });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(url);
  }
}
