/**
 * leadership-workbook.service — a lightweight, file-based single-source-of-truth
 * for the Leadership dashboard's Excel workbook.
 *
 * The workbook `leadership.xlsx` is the ONLY data source for the Leadership
 * dashboard. It is persisted on disk at `<uploadDir>/leadership.xlsx`, where the
 * upload directory defaults to `server/data/uploads` but can be overridden via
 * the `LEADERSHIP_UPLOAD_DIR` env var (used by tests to target a temp dir).
 *
 * The directory and file paths are computed lazily inside each function so that
 * setting `LEADERSHIP_UPLOAD_DIR` before a call always takes effect, even when
 * this module was imported earlier.
 */
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

/**
 * True when the buffer carries a recognizable Excel container signature.
 * `.xlsx` files are ZIP archives (magic `PK\x03\x04`); legacy `.xls` files are
 * OLE compound documents (magic `\xD0\xCF\x11\xE0`). `XLSX.read` is otherwise
 * lenient enough to coerce arbitrary text (e.g. CSV-like input) into a sheet,
 * so this guard keeps the store to genuine workbook files.
 */
function hasWorkbookSignature(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  const isZip =
    buffer[0] === 0x50 && buffer[1] === 0x4b; // 'PK' (xlsx/xlsm/zip)
  const isOle =
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0; // legacy .xls (OLE compound file)
  return isZip || isOle;
}

/** Resolve the upload directory lazily so env overrides always apply. */
function uploadDir(): string {
  return (
    process.env.LEADERSHIP_UPLOAD_DIR ??
    path.resolve(__dirname, '../../data/uploads')
  );
}

/** Resolve the absolute path to the persisted workbook file. */
function workbookFile(): string {
  return path.join(uploadDir(), 'leadership.xlsx');
}

/**
 * Resolve the path to the committed seed workbook that ships with the deploy.
 * Overridable via `LEADERSHIP_SEED_FILE`; defaults to `server/seed/leadership.xlsx`
 * (resolved relative to this module so it works from both `src` and `dist`).
 */
function seedFile(): string {
  return (
    process.env.LEADERSHIP_SEED_FILE ??
    path.resolve(__dirname, '../../seed/leadership.xlsx')
  );
}

/**
 * Seed the upload directory with the committed default workbook when no
 * workbook is present yet. This guarantees the dashboard has data on a fresh
 * deploy or after an ephemeral-filesystem restart (e.g. Render without a
 * persistent disk). Never throws; a missing seed or copy failure is a no-op.
 *
 * @returns `true` when a seed copy was performed, `false` otherwise.
 */
export function seedDefaultWorkbook(): boolean {
  try {
    if (hasWorkbook()) return false; // a workbook already exists — leave it be
    const seed = seedFile();
    if (!fs.existsSync(seed)) return false; // no seed shipped
    const dir = uploadDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(seed, workbookFile());
    return true;
  } catch {
    return false;
  }
}

/**
 * Public getter for the workbook path. Recomputes from the environment on each
 * call so tests that set `LEADERSHIP_UPLOAD_DIR` observe the change.
 */
export function workbookPath(): string {
  return workbookFile();
}

/** True when a persisted workbook exists on disk. */
export function hasWorkbook(): boolean {
  return fs.existsSync(workbookFile());
}

/**
 * Read the persisted workbook as a Buffer, or `null` when none exists. Never
 * throws — a read failure is treated as "no workbook".
 */
export function readWorkbook(): Buffer | null {
  try {
    const file = workbookFile();
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

/**
 * Validate and persist a workbook buffer atomically.
 *
 * Validation: the buffer must parse as a readable Excel workbook with at least
 * one sheet. Persistence: the directory is created if missing, the bytes are
 * written to a temp file, then renamed over the destination for atomicity.
 */
export function saveWorkbook(
  buffer: Buffer
): { ok: true } | { ok: false; error: string } {
  // Validate the buffer is a readable Excel workbook with at least one sheet.
  // The signature check rejects non-workbook content that XLSX would otherwise
  // leniently coerce into a sheet.
  if (!hasWorkbookSignature(buffer)) {
    return { ok: false, error: 'The file is not a valid Excel workbook.' };
  }
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return { ok: false, error: 'The file is not a valid Excel workbook.' };
    }
  } catch {
    return { ok: false, error: 'The file is not a valid Excel workbook.' };
  }

  // Write atomically: temp file then rename over the destination.
  try {
    const dir = uploadDir();
    fs.mkdirSync(dir, { recursive: true });
    const dest = workbookFile();
    const tmp = dest + '.tmp';
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, dest);
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to save the workbook.';
    return { ok: false, error: message };
  }
}
