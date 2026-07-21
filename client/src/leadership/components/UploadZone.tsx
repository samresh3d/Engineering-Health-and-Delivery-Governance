/**
 * UploadZone — the entry point for supplying the Leadership Dashboard with data.
 *
 * Renders a file picker (`<input type="file">`) and a drag-and-drop zone
 * (Req 1.1). Both the drop target (Req 1.2) and the picker selection (Req 1.3)
 * feed the same handler, so the two input methods behave identically.
 *
 * Each candidate file is classified by the pure {@link classifyUpload} gate
 * using its name and MIME type:
 * - `accept`: the file is read to an `ArrayBuffer` and handed to
 *   `uploadWorkbook`, which drives parsing and, on success, refreshes every
 *   view (Req 1.7 is handled by the provider/views once parsing completes).
 * - `reject`: a message naming the accepted types (`.xlsx`, `.xls`) is shown
 *   (Req 1.4).
 * - `idle`: nothing happens — the selection was interrupted before a type
 *   could be determined (Req 1.5).
 *
 * While `status === 'parsing'` a loading indicator is shown (Req 1.6), and a
 * parse error message is surfaced when `status === 'error'`.
 */
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { classifyUpload } from './upload-gate';
import { useLeadership } from '../state/useLeadership';

/** Human-readable list of accepted file types, used in the reject message. */
const ACCEPTED_TYPES_LABEL = '.xlsx, .xls';

/** The `accept` attribute for the native file picker. */
const ACCEPT_ATTR = '.xlsx,.xls';

export default function UploadZone() {
  const { uploadWorkbookToServer, status, error } = useLeadership();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rejectMessage, setRejectMessage] = useState<string | null>(null);

  const isParsing = status === 'parsing';

  /**
   * Shared handler for both drop and picker selection. Classifies the file
   * via the pure gate, then reads + uploads on accept, shows a reject message
   * on reject, and does nothing on idle.
   */
  const handleFile = useCallback(
    async (file: File | null | undefined) => {
      // No usable file (interrupted selection): neither accept nor reject.
      if (!file) return;

      const classification = classifyUpload(file.name, file.type);

      if (classification === 'reject') {
        setRejectMessage(
          `Unsupported file type. Please upload an Excel workbook (${ACCEPTED_TYPES_LABEL}).`
        );
        return;
      }

      if (classification === 'idle') {
        // Type undetermined — take no action (Req 1.5).
        return;
      }

      // Accepted: clear any prior reject message, read the file, and persist to
      // the server (single source of truth). On success it re-loads locally, so
      // the parsing/ready/error UX still transitions as before; on server
      // failure the error surfaces via the provider's error channel.
      setRejectMessage(null);
      const buffer = await file.arrayBuffer();
      uploadWorkbookToServer(buffer);
    },
    [uploadWorkbookToServer]
  );

  const onInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      void handleFile(file);
      // Reset so selecting the same file again re-triggers change.
      event.target.value = '';
    },
    [handleFile]
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      void handleFile(file);
    },
    [handleFile]
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <div className="leadership-upload-zone">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload an Excel workbook by dragging a file here or clicking to browse"
        aria-busy={isParsing}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPicker();
          }
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        style={{
          border: `2px dashed ${isDragging ? '#2563eb' : '#94a3b8'}`,
          borderRadius: 8,
          padding: '2rem',
          textAlign: 'center',
          cursor: isParsing ? 'progress' : 'pointer',
          background: isDragging ? 'rgba(37, 99, 235, 0.06)' : 'transparent',
          transition: 'border-color 120ms ease, background 120ms ease',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          onChange={onInputChange}
          style={{ display: 'none' }}
          data-testid="upload-file-input"
        />
        <p style={{ margin: 0, fontWeight: 600 }}>
          Drag &amp; drop an Excel workbook here
        </p>
        <p style={{ margin: '0.25rem 0 0', color: '#64748b' }}>
          or click to browse ({ACCEPTED_TYPES_LABEL})
        </p>
      </div>

      {isParsing && (
        <div role="status" aria-live="polite" style={{ marginTop: '0.75rem' }}>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 16,
              height: 16,
              marginRight: 8,
              border: '2px solid #cbd5e1',
              borderTopColor: '#2563eb',
              borderRadius: '50%',
              animation: 'leadership-spin 0.8s linear infinite',
              verticalAlign: 'middle',
            }}
          />
          Parsing workbook…
        </div>
      )}

      {rejectMessage && (
        <p role="alert" style={{ marginTop: '0.75rem', color: '#b91c1c' }}>
          {rejectMessage}
        </p>
      )}

      {status === 'error' && error && (
        <p role="alert" style={{ marginTop: '0.75rem', color: '#b91c1c' }}>
          {error.message}
        </p>
      )}

      <style>{`
        @keyframes leadership-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
