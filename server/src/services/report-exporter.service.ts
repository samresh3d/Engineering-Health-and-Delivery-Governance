import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { SprintDataRow, KpiFilter } from '../types/index';
import type {
  AnalyticsFilter,
  DataScope,
  ExportRequest,
  ExportResult,
} from '../types/rbac-analytics.types';
import type { ISprintDataRepository } from '../repositories/interfaces';
import { convertPeriodToDateRange, type PeriodType } from '../utils/period-converter';

/** Maximum number of rows allowed in a single export */
const MAX_EXPORT_ROWS = 50_000;

/**
 * Interface for the Report Exporter Service.
 */
export interface IReportExporterService {
  /** Generate an export file based on format and filtered data */
  generateExport(request: ExportRequest): Promise<ExportResult>;

  /** Validate that the export won't exceed size limits */
  validateExportSize(
    filter: AnalyticsFilter,
    userScope: DataScope
  ): Promise<{ valid: boolean; rowCount: number }>;
}

/** Column definition for export data */
interface ExportColumn {
  header: string;
  key: keyof SprintDataRow;
}

/** Ordered columns for export files */
const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'S.No', key: 'sno' },
  { header: 'Team', key: 'team' },
  { header: 'Track', key: 'track' },
  { header: 'Project', key: 'project' },
  { header: 'Portfolio', key: 'portfolio' },
  { header: 'Status', key: 'status' },
  { header: 'Items List', key: 'itemsList' },
  { header: 'JIRA ID', key: 'jiraId' },
  { header: 'Estimated Effort (with AI)', key: 'estimatedEffortWithAi' },
  { header: 'Estimated Effort (without AI)', key: 'estimatedEffortWithoutAi' },
  { header: 'Actual Effort (with AI)', key: 'actualEffortWithAi' },
  { header: 'AI Used', key: 'aiUsed' },
  { header: 'Dev Start Date', key: 'devStartDate' },
  { header: 'Dev End Date', key: 'devEndDate' },
  { header: 'Development Status', key: 'developmentStatus' },
  { header: 'UAT Delivery Date', key: 'uatDeliveryDate' },
  { header: 'UAT Delivery Target', key: 'uatDeliveryTarget' },
  { header: 'Resources', key: 'resources' },
  { header: 'Go-Live Planned Date', key: 'goLivePlannedDate' },
  { header: 'Go-Live Date', key: 'goLiveDate' },
  { header: 'Production Status', key: 'productionStatus' },
  { header: 'Rollback', key: 'rollback' },
  { header: 'Rollback Reason', key: 'rollbackReason' },
  { header: 'Story Drop Reason', key: 'storyDropReason' },
];

/**
 * Report Exporter Service implementation.
 *
 * Generates export files in Excel (.xlsx), CSV (.csv), and PDF (.pdf) formats
 * from filtered sprint data with role-scoped access control.
 */
export class ReportExporterService implements IReportExporterService {
  constructor(private readonly sprintDataRepo: ISprintDataRepository) {}

  /**
   * Generate an export file based on the requested format and filtered data.
   * Applies user scope and analytics filters to determine which data to export.
   */
  async generateExport(request: ExportRequest): Promise<ExportResult> {
    const { format, filter, userScope, requestedAt } = request;

    const data = await this.fetchFilteredData(filter, userScope);
    const timestamp = requestedAt.replace(/[:.]/g, '-');
    const filename = `sprint-data-export-${timestamp}.${format}`;

    switch (format) {
      case 'xlsx':
        return this.generateExcel(data, filename);
      case 'csv':
        return this.generateCsv(data, filename);
      case 'pdf':
        return this.generatePdf(data, filename, filter, requestedAt);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Validate that the export won't exceed the 50,000 row size limit.
   */
  async validateExportSize(
    filter: AnalyticsFilter,
    userScope: DataScope
  ): Promise<{ valid: boolean; rowCount: number }> {
    const data = await this.fetchFilteredData(filter, userScope);
    const rowCount = data.length;
    return {
      valid: rowCount <= MAX_EXPORT_ROWS,
      rowCount,
    };
  }

  /**
   * Fetch sprint data rows applying analytics filter and user scope.
   */
  private async fetchFilteredData(
    filter: AnalyticsFilter,
    userScope: DataScope
  ): Promise<SprintDataRow[]> {
    const kpiFilter = this.buildKpiFilter(filter, userScope);
    return this.sprintDataRepo.findByFilter(kpiFilter);
  }

  /**
   * Build a KpiFilter from AnalyticsFilter and DataScope.
   */
  private buildKpiFilter(filter: AnalyticsFilter, userScope: DataScope): KpiFilter {
    const kpiFilter: KpiFilter = {};

    // Apply data scope: single team overrides filter team
    if (userScope.type === 'single_team' && userScope.teamId) {
      kpiFilter.team = userScope.teamId;
    } else if (filter.team) {
      kpiFilter.team = filter.team;
    }

    // Resolve date range from period or explicit dates
    if (filter.startDate && filter.endDate) {
      kpiFilter.startDate = filter.startDate;
      kpiFilter.endDate = filter.endDate;
    } else if (filter.period && filter.period !== 'custom') {
      const now = new Date();
      const result = convertPeriodToDateRange(filter.period as PeriodType, {
        month: now.getMonth() + 1,
        quarter: Math.ceil((now.getMonth() + 1) / 3),
        year: now.getFullYear(),
      });
      if (result.success && result.dateRange) {
        kpiFilter.startDate = result.dateRange.startDate;
        kpiFilter.endDate = result.dateRange.endDate;
      }
    }

    return kpiFilter;
  }

  /**
   * Generate an Excel (.xlsx) export using exceljs.
   * Creates a workbook with auto-width columns and bold headers.
   */
  private async generateExcel(
    data: SprintDataRow[],
    filename: string
  ): Promise<ExportResult> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sprint Data');

    // Set up columns with headers
    worksheet.columns = EXPORT_COLUMNS.map((col) => ({
      header: col.header,
      key: col.key,
      width: 15, // default width, will be auto-adjusted
    }));

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: 'center' };

    // Add data rows
    for (const row of data) {
      const rowData: Record<string, unknown> = {};
      for (const col of EXPORT_COLUMNS) {
        rowData[col.key] = row[col.key] ?? '';
      }
      worksheet.addRow(rowData);
    }

    // Auto-width columns based on content
    worksheet.columns.forEach((column) => {
      if (!column || !column.eachCell) return;
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const cellValue = cell.value ? String(cell.value) : '';
        maxLength = Math.max(maxLength, cellValue.length);
      });
      column.width = Math.min(Math.max(maxLength + 2, 10), 50);
    });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    return {
      buffer,
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  /**
   * Generate a CSV export with UTF-8 BOM and comma separation.
   */
  private async generateCsv(
    data: SprintDataRow[],
    filename: string
  ): Promise<ExportResult> {
    const BOM = '\uFEFF';
    const headers = EXPORT_COLUMNS.map((col) => col.header);
    const lines: string[] = [headers.join(',')];

    for (const row of data) {
      const values = EXPORT_COLUMNS.map((col) => {
        const value = row[col.key];
        if (value === null || value === undefined) return '';
        const strValue = String(value);
        // Escape values containing commas, quotes, or newlines
        if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
          return `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
      });
      lines.push(values.join(','));
    }

    const csvContent = BOM + lines.join('\n');
    const buffer = Buffer.from(csvContent, 'utf-8');

    return {
      buffer,
      filename,
      mimeType: 'text/csv',
    };
  }

  /**
   * Generate a PDF export with title, timestamp, filter summary, and data table.
   */
  private async generatePdf(
    data: SprintDataRow[],
    filename: string,
    filter: AnalyticsFilter,
    requestedAt: string
  ): Promise<ExportResult> {
    return new Promise<ExportResult>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'landscape',
          margin: 30,
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({ buffer, filename, mimeType: 'application/pdf' });
        });
        doc.on('error', (err: Error) => reject(err));

        // Title
        doc.fontSize(18).font('Helvetica-Bold').text('Sprint Data Report', {
          align: 'center',
        });
        doc.moveDown(0.5);

        // Timestamp
        doc.fontSize(10).font('Helvetica').text(`Generated: ${requestedAt}`, {
          align: 'center',
        });
        doc.moveDown(0.5);

        // Filter summary
        const filterSummary = this.buildFilterSummary(filter);
        if (filterSummary) {
          doc.fontSize(9).font('Helvetica-Oblique').text(`Filters: ${filterSummary}`, {
            align: 'center',
          });
          doc.moveDown(0.5);
        }

        // Separator line
        doc.moveTo(30, doc.y).lineTo(doc.page.width - 30, doc.y).stroke();
        doc.moveDown(0.5);

        // Table - use a subset of key columns that fit on PDF
        const pdfColumns = [
          { header: 'Team', key: 'team' as keyof SprintDataRow, width: 80 },
          { header: 'Project', key: 'project' as keyof SprintDataRow, width: 80 },
          { header: 'JIRA ID', key: 'jiraId' as keyof SprintDataRow, width: 70 },
          { header: 'Dev Status', key: 'developmentStatus' as keyof SprintDataRow, width: 80 },
          { header: 'Dev Start', key: 'devStartDate' as keyof SprintDataRow, width: 70 },
          { header: 'Dev End', key: 'devEndDate' as keyof SprintDataRow, width: 70 },
          { header: 'Prod Status', key: 'productionStatus' as keyof SprintDataRow, width: 80 },
          { header: 'AI Used', key: 'aiUsed' as keyof SprintDataRow, width: 45 },
          { header: 'Rollback', key: 'rollback' as keyof SprintDataRow, width: 50 },
        ];

        const tableTop = doc.y;
        const rowHeight = 18;
        const startX = 30;

        // Draw header row
        doc.fontSize(8).font('Helvetica-Bold');
        let xPos = startX;
        for (const col of pdfColumns) {
          doc.text(col.header, xPos, tableTop, {
            width: col.width,
            height: rowHeight,
            ellipsis: true,
          });
          xPos += col.width;
        }

        // Draw header underline
        const headerBottom = tableTop + rowHeight;
        doc.moveTo(startX, headerBottom).lineTo(startX + pdfColumns.reduce((s, c) => s + c.width, 0), headerBottom).stroke();

        // Draw data rows
        doc.font('Helvetica').fontSize(7);
        let currentY = headerBottom + 4;
        const pageBottom = doc.page.height - 50;

        for (const row of data) {
          if (currentY + rowHeight > pageBottom) {
            doc.addPage();
            currentY = 30;

            // Re-draw header on new page
            doc.fontSize(8).font('Helvetica-Bold');
            xPos = startX;
            for (const col of pdfColumns) {
              doc.text(col.header, xPos, currentY, {
                width: col.width,
                height: rowHeight,
                ellipsis: true,
              });
              xPos += col.width;
            }
            const newHeaderBottom = currentY + rowHeight;
            doc.moveTo(startX, newHeaderBottom).lineTo(startX + pdfColumns.reduce((s, c) => s + c.width, 0), newHeaderBottom).stroke();
            currentY = newHeaderBottom + 4;
            doc.font('Helvetica').fontSize(7);
          }

          xPos = startX;
          for (const col of pdfColumns) {
            const value = row[col.key];
            const displayValue = value !== null && value !== undefined ? String(value) : '';
            doc.text(displayValue, xPos, currentY, {
              width: col.width,
              height: rowHeight,
              ellipsis: true,
            });
            xPos += col.width;
          }
          currentY += rowHeight;
        }

        // Footer with row count
        doc.moveDown(1);
        doc.fontSize(8).font('Helvetica-Oblique').text(
          `Total rows: ${data.length}`,
          startX,
          currentY + 10
        );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Build a human-readable filter summary for PDF reports.
   */
  private buildFilterSummary(filter: AnalyticsFilter): string {
    const parts: string[] = [];

    if (filter.team) {
      parts.push(`Team: ${filter.team}`);
    }
    if (filter.engineeringManager) {
      parts.push(`EM: ${filter.engineeringManager}`);
    }
    if (filter.developmentStatus) {
      parts.push(`Status: ${filter.developmentStatus}`);
    }
    if (filter.period && filter.period !== 'custom') {
      parts.push(`Period: ${filter.period}`);
    }
    if (filter.startDate) {
      parts.push(`From: ${filter.startDate}`);
    }
    if (filter.endDate) {
      parts.push(`To: ${filter.endDate}`);
    }

    return parts.join(' | ');
  }
}
