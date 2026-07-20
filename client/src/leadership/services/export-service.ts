/**
 * ExportService — serializes the {@link DashboardModel} and rendered reports to
 * shareable artifacts: Excel workbooks (SheetJS), PDF documents (jsPDF +
 * html2canvas), and PNG chart images.
 *
 * The workbook export is designed for **round-trip fidelity** (Requirement 3.2,
 * Property 5): parsing a workbook, exporting the resulting model, and parsing
 * the exported workbook again yields an equivalent model. To achieve this the
 * export reproduces the model's `sourceColumns` header row verbatim and places
 * each logical field (Team, KPI, Value, Target, Year, Month, Pillar, Direction,
 * Amber Min, Amber Max, Business Unit) under the column the parser detects for
 * it. Absent metric values are written as empty cells (Requirement 3.3).
 */
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { DashboardModel, KpiDefinition, MetricValue } from '../model/types';

/** The canonical sheet name that holds the KPI data (matches the parser). */
const KPIS_SHEET_NAME = 'KPIs';

/**
 * The canonical KPIs-sheet column layout, used as the header when a model has
 * no preserved `sourceColumns` (e.g. a model assembled programmatically).
 */
const CANONICAL_COLUMNS: readonly string[] = [
  'Team',
  'KPI',
  'Value',
  'Target',
  'Year',
  'Month',
  'Pillar',
  'Direction',
  'Amber Min',
  'Amber Max',
  'Business Unit',
];

/**
 * Header aliases mirroring the ExcelParser's "KPIs Sheet Contract" so that the
 * exporter writes each field under whichever column heading the parser will
 * read it back from. Kept in sync with `excel-parser.ts`.
 */
const HEADER_ALIASES = {
  team: ['team'],
  kpi: ['kpi', 'metric'],
  value: ['value', 'actual'],
  target: ['target', 'goal'],
  year: ['year'],
  month: ['month', 'period'],
  pillar: ['pillar', 'engineering pillar'],
  direction: ['direction', 'better'],
  amberLower: ['amber min', 'amber lower', 'amber minimum'],
  amberUpper: ['amber max', 'amber upper', 'amber maximum'],
  businessUnit: ['business unit', 'bu'],
} as const;

/** A cell value we may place into the sheet; `null` becomes an empty cell. */
type CellValue = string | number | null;

/**
 * A tabular, view-agnostic representation of a rendered report, used by
 * {@link IExportService.exportReportToExcel}. Views project their currently
 * displayed data into this shape (Requirement 12.2).
 */
export interface ExportableReport {
  /** Optional sheet name; defaults to "Report". */
  sheetName?: string;
  /** Column headers, written as the first row. */
  columns: string[];
  /** Data rows; each inner array aligns with `columns`. `null` → empty cell. */
  rows: CellValue[][];
}

export interface IExportService {
  /** Export the model to an Excel workbook containing a KPIs sheet (Req 3.1, 3.3). */
  exportModelToWorkbook(model: DashboardModel): ArrayBuffer;
  /** Export the currently displayed report to an Excel workbook (Req 12.2). */
  exportReportToExcel(view: ExportableReport): ArrayBuffer;
  /** Export a printable DOM element to a PDF document (Req 12.3). */
  exportReportToPdf(printableElement: HTMLElement): Promise<Blob>;
  /** Export an ECharts data URL to a PNG image blob (Req 8.5, 12.4). */
  exportChartToPng(chartDataUrl: string): Blob;
}

/** Normalize a header/label: trim, collapse internal whitespace, lower-case. */
function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Return the first column index whose normalized header matches an alias. */
function findColumnIndex(
  normalizedHeaders: string[],
  aliases: readonly string[]
): number {
  for (let i = 0; i < normalizedHeaders.length; i += 1) {
    if (aliases.includes(normalizedHeaders[i])) {
      return i;
    }
  }
  return -1;
}

/**
 * ExportService implementation. Stateless — each call operates solely on its
 * arguments.
 */
export class ExportService implements IExportService {
  exportModelToWorkbook(model: DashboardModel): ArrayBuffer {
    // Preserve the original header row verbatim for round-trip fidelity; fall
    // back to the canonical layout when the model carries no source columns.
    const header: string[] =
      model.sourceColumns && model.sourceColumns.length > 0
        ? [...model.sourceColumns]
        : [...CANONICAL_COLUMNS];

    const normalizedHeaders = header.map((cell) => normalizeHeader(cell));
    const col = {
      team: findColumnIndex(normalizedHeaders, HEADER_ALIASES.team),
      kpi: findColumnIndex(normalizedHeaders, HEADER_ALIASES.kpi),
      value: findColumnIndex(normalizedHeaders, HEADER_ALIASES.value),
      target: findColumnIndex(normalizedHeaders, HEADER_ALIASES.target),
      year: findColumnIndex(normalizedHeaders, HEADER_ALIASES.year),
      month: findColumnIndex(normalizedHeaders, HEADER_ALIASES.month),
      pillar: findColumnIndex(normalizedHeaders, HEADER_ALIASES.pillar),
      direction: findColumnIndex(normalizedHeaders, HEADER_ALIASES.direction),
      amberLower: findColumnIndex(normalizedHeaders, HEADER_ALIASES.amberLower),
      amberUpper: findColumnIndex(normalizedHeaders, HEADER_ALIASES.amberUpper),
      businessUnit: findColumnIndex(
        normalizedHeaders,
        HEADER_ALIASES.businessUnit
      ),
    };

    // KPI-definition lookup for per-KPI fields (target, pillar, direction, amber).
    const kpiDefByName = new Map<string, KpiDefinition>();
    for (const def of model.kpiDefinitions) {
      kpiDefByName.set(def.name, def);
    }

    // The exported sheet width must cover the header and every detected field
    // so programmatic (non-source) models still round-trip.
    const width = Math.max(
      header.length,
      ...Object.values(col).map((index) => index + 1)
    );

    const aoa: CellValue[][] = [padRow(header, width)];

    for (const metric of model.metrics) {
      aoa.push(buildMetricRow(metric, kpiDefByName.get(metric.kpi), col, width));
    }

    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, KPIS_SHEET_NAME);

    return XLSX.write(workbook, {
      type: 'array',
      bookType: 'xlsx',
    }) as ArrayBuffer;
  }

  exportReportToExcel(view: ExportableReport): ArrayBuffer {
    const aoa: CellValue[][] = [view.columns, ...view.rows];
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      view.sheetName ?? 'Report'
    );

    return XLSX.write(workbook, {
      type: 'array',
      bookType: 'xlsx',
    }) as ArrayBuffer;
  }

  async exportReportToPdf(printableElement: HTMLElement): Promise<Blob> {
    const canvas = await html2canvas(printableElement);
    const imageData = canvas.toDataURL('image/png');

    // Choose orientation from the captured aspect ratio, then fit the image to
    // the page width while preserving proportions.
    const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
    const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const renderWidth = pageWidth;
    const renderHeight = (canvas.height / canvas.width) * pageWidth;
    const clampedHeight = Math.min(renderHeight, pageHeight);

    pdf.addImage(imageData, 'PNG', 0, 0, renderWidth, clampedHeight);

    return pdf.output('blob');
  }

  exportChartToPng(chartDataUrl: string): Blob {
    const bytes = dataUrlToBytes(chartDataUrl);
    return new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' });
  }
}

/** Build one sheet row for a metric, placing fields under detected columns. */
function buildMetricRow(
  metric: MetricValue,
  kpiDef: KpiDefinition | undefined,
  col: Record<string, number>,
  width: number
): CellValue[] {
  const row: CellValue[] = new Array<CellValue>(width).fill(null);

  const set = (index: number, value: CellValue): void => {
    if (index >= 0 && index < width) {
      row[index] = value;
    }
  };

  set(col.team, metric.team);
  set(col.kpi, metric.kpi);
  // Absent value → empty cell (Req 3.3).
  set(col.value, metric.value);
  set(col.year, metric.period.year);
  set(col.month, metric.period.month === '' ? null : metric.period.month);

  if (kpiDef) {
    set(col.target, kpiDef.target);
    set(col.pillar, kpiDef.pillar);
    set(col.direction, kpiDef.direction);
    set(col.amberLower, kpiDef.amberBand ? kpiDef.amberBand.lower : null);
    set(col.amberUpper, kpiDef.amberBand ? kpiDef.amberBand.upper : null);
  }

  if (metric.businessUnit !== undefined) {
    set(col.businessUnit, metric.businessUnit);
  }

  return row;
}

/** Pad (or copy) a row to the given width with trailing empty cells. */
function padRow(row: CellValue[], width: number): CellValue[] {
  const padded: CellValue[] = new Array<CellValue>(width).fill(null);
  for (let i = 0; i < row.length && i < width; i += 1) {
    padded[i] = row[i];
  }
  return padded;
}

/**
 * Decode a base64 (or URL-encoded) data URL into raw bytes. Works in both the
 * browser and jsdom test environments without relying on Node Buffers.
 */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIndex = dataUrl.indexOf(',');
  const meta = commaIndex >= 0 ? dataUrl.slice(0, commaIndex) : '';
  const payload = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;

  if (meta.includes(';base64')) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // Non-base64 (URL-encoded) payload.
  const decoded = decodeURIComponent(payload);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i += 1) {
    bytes[i] = decoded.charCodeAt(i);
  }
  return bytes;
}

/** Default service instance for convenient import. */
export const exportService: IExportService = new ExportService();
