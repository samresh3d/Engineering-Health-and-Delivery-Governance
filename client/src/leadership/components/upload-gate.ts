/**
 * Pure upload gate for the Leadership Dashboard.
 *
 * Classifies a candidate upload into a tri-state result based only on the
 * file name and (optional) MIME type. This is intentionally React-free and
 * total (it never throws) so the gating logic can be tested in isolation.
 *
 * Behavior (see design.md "Upload Gating"):
 * - 'accept' when the file is a `.xlsx`/`.xls` workbook (Req 1.4)
 * - 'reject' when the file type is known but is not an Excel workbook (Req 1.4)
 * - 'idle'   when the file type is undetermined, i.e. the selection was
 *            interrupted before a name or MIME type was known (Req 1.5)
 */

export type UploadClassification = 'accept' | 'reject' | 'idle';

/** MIME types recognized as Excel workbooks. */
const EXCEL_MIME_TYPES: ReadonlySet<string> = new Set([
  // .xlsx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // .xls
  'application/vnd.ms-excel',
]);

/** File-name extensions recognized as Excel workbooks. */
const EXCEL_EXTENSIONS: readonly string[] = ['.xlsx', '.xls'];

/**
 * Normalize a possibly-null/undefined string to a trimmed, non-empty string,
 * or `null` when there is nothing usable.
 */
function usable(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Classify an upload candidate.
 *
 * @param name     The file name (may be null/undefined/empty if unknown).
 * @param mimeType The file MIME type (may be null/undefined/empty if unknown).
 * @returns 'accept' | 'reject' | 'idle'
 */
export function classifyUpload(
  name: string | null | undefined,
  mimeType?: string | null
): UploadClassification {
  const usableName = usable(name);
  const usableMime = usable(mimeType);

  // Type undetermined: neither a usable name nor a MIME type is available.
  // The selection was interrupted before the type could be determined (Req 1.5).
  if (usableName === null && usableMime === null) {
    return 'idle';
  }

  // Accept when the name has an Excel extension (case-insensitive) ...
  if (usableName !== null) {
    const lower = usableName.toLowerCase();
    if (EXCEL_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      return 'accept';
    }
  }

  // ... or when the MIME type is a known Excel spreadsheet type.
  if (usableMime !== null && EXCEL_MIME_TYPES.has(usableMime.toLowerCase())) {
    return 'accept';
  }

  // We have a name or MIME type, but it is not an Excel workbook (Req 1.4).
  return 'reject';
}
