import { useState, useEffect, useCallback } from 'react';
import { exportReport, type AnalyticsFilter, type ExportFormat } from '../api/client';
import { getStoredUser } from '../auth';
import { colors } from '../theme';

export interface ExportControlsProps {
  filter: AnalyticsFilter;
}

/**
 * ExportControls — renders Excel, CSV, and PDF export buttons.
 *
 * Visibility rules (UX-only; server enforces real permissions):
 * - Leadership, Super_Admin: can export (full scope)
 * - Engineering_Manager: can export (scoped to own team)
 * - Admin, Delivery_Manager: hidden (no export access)
 *
 * Error handling:
 * - 400 with "Export limit exceeded" → modal explaining 50K row limit
 * - Network timeout / error → toast with retry option
 */
export default function ExportControls({ filter }: ExportControlsProps) {
  const [loadingFormat, setLoadingFormat] = useState<ExportFormat | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; retryFormat: ExportFormat } | null>(null);

  const user = getStoredUser();

  // Roles that can export
  const exportRoles = ['Leadership', 'Super_Admin', 'Engineering_Manager'];
  const canExport = user && exportRoles.includes(user.role);

  // Auto-dismiss toast after 8 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (loadingFormat) return; // prevent double-click

      setLoadingFormat(format);
      setToast(null);

      try {
        await exportReport({ format, filter });
      } catch (error: unknown) {
        // Determine if it's a size limit error or network/timeout error
        if (isExportLimitError(error)) {
          setShowLimitModal(true);
        } else {
          setToast({
            message: 'Export timed out. Please try again.',
            retryFormat: format,
          });
        }
      } finally {
        setLoadingFormat(null);
      }
    },
    [filter, loadingFormat],
  );

  if (!canExport) {
    return null;
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
        role="toolbar"
        aria-label="Export controls"
      >
        <ExportButton
          format="xlsx"
          label="Excel (.xlsx)"
          loading={loadingFormat === 'xlsx'}
          disabled={loadingFormat !== null}
          onClick={() => handleExport('xlsx')}
        />
        <ExportButton
          format="csv"
          label="CSV (.csv)"
          loading={loadingFormat === 'csv'}
          disabled={loadingFormat !== null}
          onClick={() => handleExport('csv')}
        />
        <ExportButton
          format="pdf"
          label="PDF (.pdf)"
          loading={loadingFormat === 'pdf'}
          disabled={loadingFormat !== null}
          onClick={() => handleExport('pdf')}
        />
      </div>

      {/* Export limit modal */}
      {showLimitModal && (
        <ExportLimitModal onClose={() => setShowLimitModal(false)} />
      )}

      {/* Retry toast */}
      {toast && (
        <RetryToast
          message={toast.message}
          onRetry={() => {
            setToast(null);
            handleExport(toast.retryFormat);
          }}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

interface ExportButtonProps {
  format: ExportFormat;
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}

function ExportButton({ format, label, loading, disabled, onClick }: ExportButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Export as ${label}`}
      aria-busy={loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 14px',
        fontSize: '13px',
        fontWeight: 500,
        borderRadius: '6px',
        border: `1px solid ${colors.border}`,
        backgroundColor: disabled && !loading ? colors.secondary : colors.background,
        color: disabled && !loading ? colors.textSecondary : colors.text,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 0.15s, box-shadow 0.15s',
      }}
      data-format={format}
    >
      {loading ? (
        <LoadingSpinner />
      ) : (
        <FormatIcon format={format} />
      )}
      {loading ? 'Exporting…' : label}
    </button>
  );
}

function FormatIcon({ format }: { format: ExportFormat }) {
  const iconMap: Record<ExportFormat, string> = {
    xlsx: '📊',
    csv: '📄',
    pdf: '📑',
  };
  return <span aria-hidden="true">{iconMap[format]}</span>;
}

function LoadingSpinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: '14px',
        height: '14px',
        border: `2px solid ${colors.border}`,
        borderTopColor: colors.primary,
        borderRadius: '50%',
        animation: 'export-spin 0.6s linear infinite',
      }}
    />
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function ExportLimitModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-limit-title"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: colors.background,
          borderRadius: '12px',
          padding: '32px',
          maxWidth: '440px',
          width: '90%',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
        }}
      >
        <h2
          id="export-limit-title"
          style={{
            margin: '0 0 12px',
            fontSize: '18px',
            fontWeight: 600,
            color: colors.text,
          }}
        >
          Export Limit Exceeded
        </h2>
        <p
          style={{
            margin: '0 0 24px',
            fontSize: '14px',
            lineHeight: 1.6,
            color: colors.textSecondary,
          }}
        >
          Your current filters return more than 50,000 rows, which exceeds the
          maximum export size. Please apply additional filters to narrow down the
          data before exporting.
        </p>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 500,
            borderRadius: '6px',
            border: 'none',
            backgroundColor: colors.primary,
            color: colors.textLight,
            cursor: 'pointer',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function RetryToast({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 20px',
        backgroundColor: colors.text,
        color: colors.textLight,
        borderRadius: '8px',
        fontSize: '13px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
        zIndex: 9998,
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: 600,
          borderRadius: '4px',
          border: 'none',
          backgroundColor: colors.accent,
          color: colors.text,
          cursor: 'pointer',
        }}
      >
        Retry
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          padding: '4px 8px',
          fontSize: '16px',
          lineHeight: 1,
          border: 'none',
          backgroundColor: 'transparent',
          color: colors.textLight,
          cursor: 'pointer',
          opacity: 0.7,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Checks if an axios error is a 400 response with "Export limit exceeded" message.
 */
function isExportLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const axiosError = error as { response?: { status?: number; data?: unknown } };
  if (axiosError.response?.status !== 400) return false;

  // The response might be a Blob (since we requested responseType: 'blob'),
  // so we need to check the data as text if possible.
  const data = axiosError.response.data;
  if (data instanceof Blob) {
    // For blob responses, we can't synchronously read — fall back to checking
    // if it's a 400, which is our export limit signal
    return true;
  }
  if (typeof data === 'string') {
    return data.includes('Export limit exceeded');
  }
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    return (
      typeof obj.error === 'string' && obj.error.includes('Export limit exceeded')
    );
  }
  return false;
}
