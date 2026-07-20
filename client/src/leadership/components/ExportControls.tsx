/**
 * ExportControls — Excel / PDF / PNG export, print, and section expand/collapse
 * for the Leadership Dashboard (Requirements 12.2–12.6).
 *
 * The control is a thin, presentational wrapper over the module's
 * {@link IExportService}. It reads the currently displayed report from
 * {@link useLeadership} (`filtered` + `model`) and offers:
 *
 * - **Excel export (Req 12.2):** projects the filtered dataset into an
 *   {@link ExportableReport} and calls `exportReportToExcel`, falling back to
 *   `exportModelToWorkbook(model)` when no filtered view is available. The
 *   resulting `ArrayBuffer` is downloaded as an `.xlsx`.
 * - **PDF export (Req 12.3):** captures the DOM element referenced by
 *   `printableRef` via `exportReportToPdf` and downloads the returned `Blob`.
 * - **PNG export (Req 12.4):** converts the supplied chart data URL via
 *   `exportChartToPng` and downloads the returned `Blob`.
 * - **Print (Req 12.5):** enables a print-friendly layout (a print stylesheet
 *   that isolates the printable container and force-expands collapsed sections)
 *   and calls `window.print()`.
 * - **Expand/collapse (Req 12.6):** exposes a reusable {@link CollapsibleSection}
 *   that shows or hides its detailed content.
 *
 * Export functions operate on in-memory data and the DOM; failures are caught
 * and surfaced as a NON-BLOCKING, dismissible notification (see design
 * "Export Errors"). The dashboard state is never mutated by this component.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLeadership } from '../state/useLeadership';
import {
  exportService as defaultExportService,
  type ExportableReport,
  type IExportService,
} from '../services/export-service';
import type { FilteredDataset, KpiDefinition } from '../model/types';

/** The id used for the injected print stylesheet (injected once). */
const PRINT_STYLE_ID = 'leadership-print-styles';

/** Attribute marking the DOM subtree that should survive the print isolation. */
const PRINTABLE_ATTR = 'data-leadership-printable';

/**
 * Print-friendly layout (Req 12.5). When printing we hide everything except the
 * printable container, expand collapsed sections so their detail is captured,
 * and hide interactive chrome tagged `leadership-no-print`.
 */
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  [${PRINTABLE_ATTR}], [${PRINTABLE_ATTR}] * { visibility: visible !important; }
  [${PRINTABLE_ATTR}] {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .leadership-no-print { display: none !important; }
  /* Force-expand collapsible detail so the printed report is complete. */
  .leadership-collapsible__content { display: block !important; }
}
`;

/** A non-blocking notification surfaced when an export/print action fails. */
interface Notification {
  id: number;
  message: string;
}

export interface ExportControlsProps {
  /**
   * Ref to the DOM element that represents the current report. Used as the
   * capture target for PDF export (Req 12.3) and marked as the print-friendly
   * container for print (Req 12.5).
   */
  printableRef?: React.RefObject<HTMLElement | null>;
  /**
   * Getter returning the current chart's PNG data URL (e.g. from an ECharts
   * `getDataURL()` call). When it returns a falsy value, PNG export is disabled.
   */
  getChartDataUrl?: () => string | null | undefined;
  /** Base filename (without extension) for generated files. */
  fileNameBase?: string;
  /** Injectable export service (primarily for testing); defaults to the module singleton. */
  service?: IExportService;
  /** Optional extra class names for layout/styling. */
  className?: string;
}

/**
 * Trigger a browser download for the given binary payload. Wraps an
 * `ArrayBuffer` in a `Blob`, creates a temporary object URL, clicks a hidden
 * anchor, then revokes the URL to release memory.
 */
export function triggerDownload(
  data: Blob | ArrayBuffer,
  filename: string,
  mimeType = 'application/octet-stream'
): void {
  const blob =
    data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Build a tabular {@link ExportableReport} from the currently displayed
 * (filtered) dataset. Each metric becomes a row with its team, KPI, period,
 * value, and the KPI's target; absent numeric values become empty cells.
 */
export function buildReportFromFiltered(
  filtered: FilteredDataset
): ExportableReport {
  const targetByKpi = new Map<string, number | null>();
  filtered.kpiDefinitions.forEach((def: KpiDefinition) => {
    targetByKpi.set(def.name, def.target);
  });

  const columns = ['Team', 'KPI', 'Year', 'Month', 'Value', 'Target'];
  const rows = filtered.metrics.map((metric) => [
    metric.team,
    metric.kpi,
    metric.period.year,
    metric.period.month === '' ? null : metric.period.month,
    metric.value,
    targetByKpi.has(metric.kpi) ? targetByKpi.get(metric.kpi) ?? null : null,
  ]);

  return { sheetName: 'Report', columns, rows };
}

/** Ensure the print stylesheet is present in the document `<head>` exactly once. */
function ensurePrintStyles(): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(PRINT_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = PRINT_STYLE_ID;
  style.textContent = PRINT_CSS;
  document.head.appendChild(style);
}

/** Normalize an unknown thrown value into a human-readable message. */
function toMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return fallback;
}

/**
 * A reusable expand/collapse section (Req 12.6). Renders a header button that
 * toggles the visibility of its detailed content. The content stays mounted but
 * is hidden (via the `hidden` attribute) when collapsed, so the print stylesheet
 * can force-expand it for a complete printed report.
 */
export interface CollapsibleSectionProps {
  /** The section heading / toggle label. */
  title: string;
  /** Whether the section starts expanded. Defaults to expanded. */
  defaultOpen?: boolean;
  /** The detailed content shown when expanded. */
  children: React.ReactNode;
  /** Optional extra class names. */
  className?: string;
}

export function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
  className,
}: CollapsibleSectionProps): React.ReactElement {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const contentId = React.useId();

  return (
    <section
      className={
        className
          ? `leadership-collapsible ${className}`
          : 'leadership-collapsible'
      }
      data-collapsed={!open}
    >
      <button
        type="button"
        className="leadership-collapsible__toggle"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="leadership-collapsible__title">{title}</span>
      </button>
      <div
        id={contentId}
        className="leadership-collapsible__content"
        role="region"
        aria-label={title}
        hidden={!open}
      >
        {children}
      </div>
    </section>
  );
}

export default function ExportControls({
  printableRef,
  getChartDataUrl,
  fileNameBase = 'leadership-report',
  service = defaultExportService,
  className,
}: ExportControlsProps): React.ReactElement {
  const { filtered, model } = useLeadership();
  const [busy, setBusy] = useState<
    'excel' | 'pdf' | 'png' | 'print' | null
  >(null);
  const [notification, setNotification] = useState<Notification | null>(null);
  const notificationSeq = useRef(0);

  // Auto-dismiss the non-blocking notification after a short delay.
  useEffect(() => {
    if (notification === null) {
      return;
    }
    const timer = setTimeout(() => setNotification(null), 6000);
    return () => clearTimeout(timer);
  }, [notification]);

  const notify = useCallback((message: string): void => {
    notificationSeq.current += 1;
    setNotification({ id: notificationSeq.current, message });
  }, []);

  // A report is exportable when we have either a filtered view or a raw model.
  const canExportData = filtered !== null || model !== null;
  const chartDataUrl = getChartDataUrl?.();
  const canExportChart = Boolean(chartDataUrl);
  const canExportDom = Boolean(printableRef?.current);

  const handleExportExcel = useCallback((): void => {
    if (busy) {
      return;
    }
    setBusy('excel');
    try {
      const buffer =
        filtered !== null
          ? service.exportReportToExcel(buildReportFromFiltered(filtered))
          : model !== null
            ? service.exportModelToWorkbook(model)
            : null;
      if (buffer === null) {
        throw new Error('No report data available to export.');
      }
      triggerDownload(
        buffer,
        `${fileNameBase}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    } catch (error) {
      notify(toMessage(error, 'Excel export failed.'));
    } finally {
      setBusy(null);
    }
  }, [busy, filtered, model, service, fileNameBase, notify]);

  const handleExportPdf = useCallback(async (): Promise<void> => {
    if (busy) {
      return;
    }
    const element = printableRef?.current ?? null;
    if (element === null) {
      notify('Nothing to export to PDF yet.');
      return;
    }
    setBusy('pdf');
    try {
      const blob = await service.exportReportToPdf(element);
      triggerDownload(blob, `${fileNameBase}.pdf`, 'application/pdf');
    } catch (error) {
      notify(toMessage(error, 'PDF export failed.'));
    } finally {
      setBusy(null);
    }
  }, [busy, printableRef, service, fileNameBase, notify]);

  const handleExportPng = useCallback((): void => {
    if (busy) {
      return;
    }
    const dataUrl = getChartDataUrl?.();
    if (!dataUrl) {
      notify('No chart available to export.');
      return;
    }
    setBusy('png');
    try {
      const blob = service.exportChartToPng(dataUrl);
      triggerDownload(blob, `${fileNameBase}.png`, 'image/png');
    } catch (error) {
      notify(toMessage(error, 'PNG export failed.'));
    } finally {
      setBusy(null);
    }
  }, [busy, getChartDataUrl, service, fileNameBase, notify]);

  const handlePrint = useCallback((): void => {
    if (busy) {
      return;
    }
    setBusy('print');
    const element = printableRef?.current ?? null;
    try {
      ensurePrintStyles();
      // Mark the current report as the print-friendly container so the print
      // stylesheet isolates it (Req 12.5).
      if (element) {
        element.setAttribute(PRINTABLE_ATTR, 'true');
      }
      if (typeof window !== 'undefined' && typeof window.print === 'function') {
        window.print();
      }
    } catch (error) {
      notify(toMessage(error, 'Print failed.'));
    } finally {
      if (element) {
        element.removeAttribute(PRINTABLE_ATTR);
      }
      setBusy(null);
    }
  }, [busy, printableRef, notify]);

  return (
    <div
      className={
        className
          ? `leadership-export-controls leadership-no-print ${className}`
          : 'leadership-export-controls leadership-no-print'
      }
    >
      <div role="toolbar" aria-label="Export and print controls" style={toolbarStyle}>
        <button
          type="button"
          onClick={handleExportExcel}
          disabled={!canExportData || busy !== null}
          aria-busy={busy === 'excel'}
          data-testid="export-excel"
        >
          {busy === 'excel' ? 'Exporting…' : 'Export Excel'}
        </button>
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={!canExportDom || busy !== null}
          aria-busy={busy === 'pdf'}
          data-testid="export-pdf"
        >
          {busy === 'pdf' ? 'Exporting…' : 'Export PDF'}
        </button>
        <button
          type="button"
          onClick={handleExportPng}
          disabled={!canExportChart || busy !== null}
          aria-busy={busy === 'png'}
          data-testid="export-png"
        >
          {busy === 'png' ? 'Exporting…' : 'Export PNG'}
        </button>
        <button
          type="button"
          onClick={handlePrint}
          disabled={busy !== null}
          aria-busy={busy === 'print'}
          data-testid="print-report"
        >
          Print
        </button>
      </div>

      {notification !== null && (
        <div
          role="status"
          aria-live="polite"
          data-testid="export-notification"
          style={notificationStyle}
        >
          <span>{notification.message}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setNotification(null)}
            style={dismissButtonStyle}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexWrap: 'wrap',
};

const notificationStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  marginTop: 8,
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #F5C2C7',
  background: '#F8D7DA',
  color: '#842029',
  fontSize: 13,
};

const dismissButtonStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  fontSize: 16,
  lineHeight: 1,
  cursor: 'pointer',
};
