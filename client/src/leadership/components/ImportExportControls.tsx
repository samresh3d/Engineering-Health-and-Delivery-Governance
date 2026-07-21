/**
 * ImportExportControls — replace/merge workbook import plus Excel and CSV export
 * for the Leadership Data Management feature (Requirements 4.1, 4.2, 4.5, 4.6,
 * 4.8).
 *
 * The control is a thin, presentational wrapper over the module state exposed by
 * {@link useLeadership}. It reads the current `model` and the parse `error`, and
 * drives the `importWorkbook(buffer, mode)` action.
 *
 * - **Import (Req 4.1, 4.2):** a native file picker (accepting `.xlsx`/`.xls`)
 *   plus a mode selector toggling between `replace` (Req 4.1) and `merge`
 *   (Req 4.2). On selection the file is read to an `ArrayBuffer` via
 *   `file.arrayBuffer()` and handed to `importWorkbook(buffer, mode)`.
 * - **Import errors (Req 4.8):** the provider surfaces parse failures via the
 *   context `error` (a `ParseError | null`) WITHOUT clobbering the existing
 *   model. When present, the message is shown in a red banner.
 * - **Export Excel (Req 4.5):** when a model is present, `downloadWorkbook(model)`
 *   serializes the model to a workbook and triggers a browser download.
 * - **Export CSV (Req 4.6):** projects the model rows via `gridProjector.toRows`,
 *   serializes them with `toCsv`, wraps the text in a `text/csv` `Blob`, and
 *   downloads it as `leadership-kpis.csv`.
 *
 * Export buttons are disabled while `model` is `null`. The layout uses the dark
 * executive theme tokens for visual consistency. This component never mutates
 * the dashboard state directly — all state changes flow through the provider.
 */
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react';
import { useLeadership } from '../state/useLeadership';
import { downloadWorkbook, toCsv } from '../services/csv-export';
import { gridProjector } from '../services/grid-projector';
import type { ImportMode } from '../services/import-service';
import { dash } from '../theme';

/** The `accept` attribute for the native import file picker. */
const ACCEPT_ATTR = '.xlsx,.xls';

/** Default filename used when triggering a CSV download. */
const CSV_FILENAME = 'leadership-kpis.csv';

/** MIME type for RFC-4180 CSV text. */
const CSV_MIME_TYPE = 'text/csv';

/**
 * Trigger a browser download of the given CSV text. Wraps the text in a
 * `text/csv` `Blob`, clicks a transient anchor, then revokes the object URL.
 * Kept local so the pure `toCsv` serializer stays DOM-free.
 */
function downloadCsv(csv: string, filename: string = CSV_FILENAME): void {
  const blob = new Blob([csv], { type: CSV_MIME_TYPE });
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

export default function ImportExportControls() {
  const { model, error, importWorkbook, uploadWorkbookToServer } =
    useLeadership();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>('replace');

  const canExport = model !== null;

  /** Read the selected file to an ArrayBuffer and drive the import action. */
  const onInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset so selecting the same file again re-triggers change.
      event.target.value = '';
      if (!file) return;
      const buffer = await file.arrayBuffer();
      if (mode === 'replace') {
        // Replace persists to the server (the single-source-of-truth file) and
        // reloads locally on success.
        uploadWorkbookToServer(buffer);
      } else {
        // Merge is a client-only operation on the in-memory model; it does NOT
        // replace the server source-of-truth file.
        importWorkbook(buffer, 'merge');
      }
    },
    [importWorkbook, uploadWorkbookToServer, mode]
  );

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleExportExcel = useCallback(() => {
    if (model === null) return;
    downloadWorkbook(model);
  }, [model]);

  const handleExportCsv = useCallback(() => {
    if (model === null) return;
    const rows = gridProjector.toRows(model);
    downloadCsv(toCsv(rows));
  }, [model]);

  return (
    <div className="leadership-import-export-controls" style={containerStyle}>
      <div role="group" aria-label="Import workbook" style={groupStyle}>
        <span style={labelStyle}>Import</span>

        <div role="radiogroup" aria-label="Import mode" style={modeGroupStyle}>
          <label style={radioLabelStyle}>
            <input
              type="radio"
              name="leadership-import-mode"
              value="replace"
              checked={mode === 'replace'}
              onChange={() => setMode('replace')}
              data-testid="import-mode-replace"
            />
            <span>Replace</span>
          </label>
          <label style={radioLabelStyle}>
            <input
              type="radio"
              name="leadership-import-mode"
              value="merge"
              checked={mode === 'merge'}
              onChange={() => setMode('merge')}
              data-testid="import-mode-merge"
            />
            <span>Merge</span>
          </label>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          onChange={onInputChange}
          style={{ display: 'none' }}
          data-testid="import-file-input"
        />
        <button
          type="button"
          onClick={openPicker}
          data-testid="import-file-button"
          style={buttonStyle(false)}
        >
          Choose workbook…
        </button>
      </div>

      <div role="group" aria-label="Export data" style={groupStyle}>
        <span style={labelStyle}>Export</span>
        <button
          type="button"
          onClick={handleExportExcel}
          disabled={!canExport}
          data-testid="export-excel"
          style={buttonStyle(!canExport)}
        >
          Export Excel
        </button>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={!canExport}
          data-testid="export-csv"
          style={buttonStyle(!canExport)}
        >
          Export CSV
        </button>
      </div>

      {error !== null && (
        <div
          role="alert"
          aria-live="assertive"
          data-testid="import-error"
          style={errorBannerStyle}
        >
          {error.message}
        </div>
      )}
    </div>
  );
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 16,
  alignItems: 'center',
  padding: '12px 14px',
  borderRadius: 10,
  border: `1px solid ${dash.border}`,
  background: dash.panelBg,
  color: dash.text,
};

const groupStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  color: dash.textMuted,
};

const modeGroupStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const radioLabelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12.5,
  color: dash.text,
  cursor: 'pointer',
};

/** Dark, theme-consistent styling for the toolbar buttons. */
function buttonStyle(disabled: boolean): CSSProperties {
  return {
    background: dash.panelBgAlt,
    color: disabled ? dash.textFaint : dash.text,
    border: `1px solid ${dash.border}`,
    borderRadius: 8,
    padding: '7px 12px',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    whiteSpace: 'nowrap',
  };
}

const errorBannerStyle: CSSProperties = {
  flexBasis: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: `1px solid ${dash.red}55`,
  background: `${dash.red}1A`,
  color: dash.red,
  fontSize: 13,
};
