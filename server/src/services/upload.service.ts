import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import type { UploadResult, ValidationError } from '../types/api';
import type { SprintDataRow } from '../types/index';
import type { ISprintDataRepository, IConfigRepository } from '../repositories/interfaces';
import { excelRowSchema } from '../schemas/excel-row.schema';

/**
 * The 22 required column headers expected in uploaded Excel files.
 * These match the actual Excel file structure from the Engineering Health &
 * Delivery Governance workbook (Sheet2).
 *
 * Key differences from the original spec assumption:
 * - No separate "TEAM" or "Track" columns — "Project " serves as the team identifier
 * - "Status" is named "Story Status"
 * - "Items List" is "Items list" (lowercase 'l')
 * - "Walkthrough Given On" is "Walkthrough given on (To Dev team)"
 * - "Estimated Effort Without AI (SP)" is "Estimated Effort Without AI (Hrs)"
 * - "Dev Start Date" is "Dev Start " (trailing space, no "Date")
 * - Additional column "Estimated Effort With AI (SP)" exists
 */
export const REQUIRED_COLUMNS: readonly string[] = [
  'Sno',
  'Project',
  'Items list',
  'Walkthrough given on (To Dev team)',
  'JIRA ID',
  'Dev Start',
  'Dev End Date',
  'Estimated Effort With AI (SP)',
  'Development Status',
  'UAT Delivery Date',
  'UAT delivery target',
  'Resources',
  'GO Live planned Date',
  'GO Live Date',
  'Production Status',
  'Rollback (Y/N)',
  'Rollback Reason',
  'AI Used (Y/N)',
  'Estimated Effort Without AI (Hrs)',
  'Actual Effort With AI (Hrs)',
  'Story Status',
  'Story Drop Reason',
] as const;

/** Maximum file size in bytes (10 MB) */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Accepted file extensions */
const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls'];

/** Maximum number of validation errors reported per file */
const MAX_VALIDATION_ERRORS = 100;

/**
 * Mapping from actual Excel column headers to SprintDataRow field names.
 * The Excel uses "Project" as the team/project identifier (no separate TEAM/Track columns).
 * "Project" maps to both 'team' and 'project' fields; 'track' is derived from 'project'.
 */
const COLUMN_FIELD_MAP: Record<string, string> = {
  'Sno': 'sno',
  'Project': 'project',
  'Items list': 'itemsList',
  'Walkthrough given on (To Dev team)': 'walkthroughGivenOn',
  'JIRA ID': 'jiraId',
  'Dev Start': 'devStartDate',
  'Dev End Date': 'devEndDate',
  'Estimated Effort With AI (SP)': 'estimatedEffortWithAi',
  'Development Status': 'developmentStatus',
  'UAT Delivery Date': 'uatDeliveryDate',
  'UAT delivery target': 'uatDeliveryTarget',
  'Resources': 'resources',
  'GO Live planned Date': 'goLivePlannedDate',
  'GO Live Date': 'goLiveDate',
  'Production Status': 'productionStatus',
  'Rollback (Y/N)': 'rollback',
  'Rollback Reason': 'rollbackReason',
  'AI Used (Y/N)': 'aiUsed',
  'Estimated Effort Without AI (Hrs)': 'estimatedEffortWithoutAi',
  'Actual Effort With AI (Hrs)': 'actualEffortWithAi',
  'Story Status': 'status',
  'Story Drop Reason': 'storyDropReason',
};

/**
 * Upload service interface for processing Excel file uploads.
 */
export interface IUploadService {
  processFile(buffer: Buffer, filename: string, userId: string): Promise<UploadResult>;
  validateColumns(headers: string[]): ValidationError[];
  validateRows(rows: unknown[]): ValidationError[];
  validateRowsWithSchema(rows: Record<string, unknown>[]): ValidationError[];
}

/**
 * Result of parsing an Excel file before row-level validation.
 */
export interface ParseResult {
  rows: Record<string, unknown>[];
  uploadId: string;
  errors: ValidationError[];
}

/**
 * Interface for upload record persistence (uploads table).
 */
export interface IUploadRepository {
  createUploadRecord(record: {
    id: string;
    fileName: string;
    uploadedBy: string;
    rowsIngested: number;
    status: 'processing' | 'success' | 'failed';
    errorMessage: string | null;
  }): Promise<void>;

  updateUploadStatus(
    id: string,
    status: 'processing' | 'success' | 'failed',
    rowsIngested?: number,
    errorMessage?: string | null
  ): Promise<void>;
}

/**
 * Service responsible for validating, parsing, and persisting uploaded Excel files.
 * Implements the full upload pipeline: file validation → parsing → row validation →
 * portfolio mapping → persistence.
 */
export class UploadService implements IUploadService {
  private sprintDataRepository: ISprintDataRepository | null;
  private configRepository: IConfigRepository | null;
  private uploadRepository: IUploadRepository | null;

  constructor(
    sprintDataRepository?: ISprintDataRepository,
    configRepository?: IConfigRepository,
    uploadRepository?: IUploadRepository
  ) {
    this.sprintDataRepository = sprintDataRepository ?? null;
    this.configRepository = configRepository ?? null;
    this.uploadRepository = uploadRepository ?? null;
  }

  /**
   * Validates file format by checking the extension.
   * @returns ValidationError[] - empty if valid
   */
  validateFileFormat(filename: string): ValidationError[] {
    const ext = this.getFileExtension(filename);
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return [
        {
          field: 'file',
          message: `Invalid file format "${ext}". Only .xlsx and .xls files are accepted.`,
        },
      ];
    }
    return [];
  }

  /**
   * Validates file size against the 10 MB limit.
   * @returns ValidationError[] - empty if valid
   */
  validateFileSize(buffer: Buffer): ValidationError[] {
    if (buffer.length > MAX_FILE_SIZE) {
      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
      return [
        {
          field: 'file',
          message: `File size ${sizeMB} MB exceeds the maximum allowed size of 10 MB.`,
        },
      ];
    }
    return [];
  }

  /**
   * Validates that all required column headers are present.
   * Reports which columns are missing. Uses trimmed comparison to handle
   * trailing spaces in actual Excel headers.
   */
  validateColumns(headers: string[]): ValidationError[] {
    const normalizedHeaders = headers.map((h) => h.trim());
    const missingColumns = REQUIRED_COLUMNS.filter(
      (col) => !normalizedHeaders.includes(col.trim())
    );

    if (missingColumns.length > 0) {
      return missingColumns.map((col) => ({
        field: col,
        message: `Required column "${col}" is missing from the uploaded file.`,
      }));
    }
    return [];
  }

  /**
   * Validates that parsed rows are not empty.
   * This is a structural check — row-level Zod validation is handled separately.
   */
  validateRows(rows: unknown[]): ValidationError[] {
    if (!rows || rows.length === 0) {
      return [
        {
          field: 'data',
          message: 'File contains headers but no data rows.',
        },
      ];
    }
    return [];
  }

  /**
   * Validates each mapped row against the Zod excelRowSchema.
   * Collects up to MAX_VALIDATION_ERRORS (100) errors with row number and field name.
   * Row numbers are 1-based, relative to data rows (not header).
   */
  validateRowsWithSchema(rows: Record<string, unknown>[]): ValidationError[] {
    const errors: ValidationError[] = [];

    for (let i = 0; i < rows.length; i++) {
      if (errors.length >= MAX_VALIDATION_ERRORS) {
        break;
      }

      const result = excelRowSchema.safeParse(rows[i]);
      if (!result.success) {
        for (const issue of result.error.issues) {
          if (errors.length >= MAX_VALIDATION_ERRORS) {
            break;
          }
          errors.push({
            row: i + 1, // 1-based row number relative to data rows
            field: issue.path.join('.') || 'unknown',
            message: issue.message,
          });
        }
      }
    }

    return errors;
  }

  /**
   * Full pipeline: validate format, size, parse Excel, validate columns and rows,
   * run Zod row validation, map Track→Portfolio, persist to database.
   */
  async processFile(
    buffer: Buffer,
    filename: string,
    userId: string
  ): Promise<UploadResult> {
    // Step 1: Validate file format
    const formatErrors = this.validateFileFormat(filename);
    if (formatErrors.length > 0) {
      throw new UploadValidationError(formatErrors);
    }

    // Step 2: Validate file size
    const sizeErrors = this.validateFileSize(buffer);
    if (sizeErrors.length > 0) {
      throw new UploadValidationError(sizeErrors);
    }

    // Step 3: Parse Excel buffer
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });

    // Use Sheet2 if it exists (the actual data sheet), otherwise first sheet
    const targetSheetName = workbook.SheetNames.includes('Sheet2')
      ? 'Sheet2'
      : workbook.SheetNames[0];

    if (!targetSheetName) {
      throw new UploadValidationError([
        { field: 'file', message: 'Excel file contains no sheets.' },
      ]);
    }

    const worksheet = workbook.Sheets[targetSheetName];
    const rawData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, {
      defval: null,
    });

    // Step 4: Extract headers from the sheet
    const headers = this.extractHeaders(worksheet);

    // Step 5: Validate columns
    const columnErrors = this.validateColumns(headers);
    if (columnErrors.length > 0) {
      throw new UploadValidationError(columnErrors);
    }

    // Step 6: Validate non-empty rows
    const rowErrors = this.validateRows(rawData);
    if (rowErrors.length > 0) {
      throw new UploadValidationError(rowErrors);
    }

    // Step 7: Map Excel column names to field names
    const mappedRows = rawData.map((row) => this.mapRowToFields(row));

    // Step 8: Validate each row against Zod schema
    const schemaErrors = this.validateRowsWithSchema(mappedRows);
    if (schemaErrors.length > 0) {
      throw new UploadValidationError(schemaErrors);
    }

    // Step 9: Generate upload ID and timestamp
    const uploadId = uuidv4();
    const timestamp = new Date().toISOString();

    // Step 10: Create upload record in the uploads table (if repository available)
    if (this.uploadRepository) {
      await this.uploadRepository.createUploadRecord({
        id: uploadId,
        fileName: filename,
        uploadedBy: userId,
        rowsIngested: 0,
        status: 'processing',
        errorMessage: null,
      });
    }

    // Step 11: Map Track → Portfolio and persist data
    try {
      const rowsIngested = await this.persistRows(mappedRows, uploadId, timestamp);

      // Step 12: Update upload record status to success
      if (this.uploadRepository) {
        await this.uploadRepository.updateUploadStatus(uploadId, 'success', rowsIngested);
      }

      return {
        success: true,
        rowsIngested,
        uploadId,
        timestamp,
      };
    } catch (error) {
      // Update upload record status to failed on error
      if (this.uploadRepository) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        await this.uploadRepository.updateUploadStatus(uploadId, 'failed', 0, errorMsg);
      }
      throw error;
    }
  }

  /**
   * Maps Track field to Portfolio using config repository's track_portfolio_mapping,
   * then persists rows via the sprint data repository's bulkUpsert.
   */
  private async persistRows(
    mappedRows: Record<string, unknown>[],
    uploadId: string,
    timestamp: string
  ): Promise<number> {
    // Get track-to-portfolio mapping
    let trackPortfolioMap: Record<string, string> = {};
    if (this.configRepository) {
      trackPortfolioMap = await this.configRepository.getTrackPortfolioMapping();
    }

    // Build SprintDataRow objects with portfolio derived from track
    const sprintDataRows: SprintDataRow[] = mappedRows.map((row) => {
      const track = (row.track as string) || '';
      const portfolio = trackPortfolioMap[track] || track; // Fall back to track name if no mapping

      return {
        uploadId,
        sno: (row.sno as number) ?? null,
        team: (row.team as string) || '',
        track,
        project: (row.project as string) || '',
        portfolio,
        status: (row.status as string) ?? null,
        itemsList: (row.itemsList as string) ?? null,
        walkthroughGivenOn: (row.walkthroughGivenOn as string | number) ?? null,
        jiraId: row.jiraId as string,
        estimatedEffortWithAi: (row.estimatedEffortWithAi as number) ?? null,
        estimatedEffortWithoutAi: (row.estimatedEffortWithoutAi as number) ?? null,
        actualEffortWithAi: (row.actualEffortWithAi as number) ?? null,
        aiUsed: (row.aiUsed as 'Y' | 'N') ?? null,
        devStartDate: (row.devStartDate as string | number) ?? null,
        devEndDate: (row.devEndDate as string | number) ?? null,
        developmentStatus: (row.developmentStatus as string) ?? null,
        uatDeliveryDate: (row.uatDeliveryDate as string | number) ?? null,
        uatDeliveryTarget: (row.uatDeliveryTarget as string | number) ?? null,
        resources: (row.resources as string) ?? null,
        goLivePlannedDate: (row.goLivePlannedDate as string | number) ?? null,
        goLiveDate: (row.goLiveDate as string | number) ?? null,
        productionStatus: (row.productionStatus as string) ?? null,
        rollback: (row.rollback as 'Y' | 'N') ?? null,
        rollbackReason: (row.rollbackReason as string) ?? null,
        storyDropReason: (row.storyDropReason as string) ?? null,
        ingestedAt: timestamp,
      };
    });

    // Persist via repository (handles transaction internally)
    if (this.sprintDataRepository) {
      return await this.sprintDataRepository.bulkUpsert(sprintDataRows, uploadId);
    }

    // If no repository provided, return the count of rows that would be persisted
    return sprintDataRows.length;
  }

  /**
   * Extracts header names from the first row of a worksheet.
   */
  private extractHeaders(worksheet: XLSX.WorkSheet): string[] {
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    const headers: string[] = [];

    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
      const cell = worksheet[cellAddress];
      if (cell && cell.v !== undefined && cell.v !== null) {
        headers.push(String(cell.v));
      }
    }

    return headers;
  }

  /**
   * Maps a raw Excel row (keyed by column header) to an object keyed by field names.
   * Handles trailing spaces in Excel column headers by trimming keys during lookup.
   * Derives 'team' and 'track' from 'project' since the actual Excel doesn't have
   * separate TEAM/Track columns.
   */
  private mapRowToFields(row: Record<string, unknown>): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};

    // Create a trimmed-key lookup of the row data
    const trimmedRow: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      trimmedRow[key.trim()] = value;
    }

    for (const [header, fieldName] of Object.entries(COLUMN_FIELD_MAP)) {
      const value = trimmedRow[header.trim()];
      mapped[fieldName] = value === undefined ? null : value;
    }

    // Derive 'team' and 'track' from 'project' (since Excel has no separate columns)
    if (!mapped['team']) {
      mapped['team'] = mapped['project'] ?? null;
    }
    if (!mapped['track']) {
      mapped['track'] = mapped['project'] ?? null;
    }

    return mapped;
  }

  /**
   * Extracts the file extension (lowercase) from a filename.
   */
  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filename.slice(lastDot).toLowerCase();
  }
}

/**
 * Custom error class for upload validation failures.
 * Contains an array of validation errors describing what went wrong.
 */
export class UploadValidationError extends Error {
  public readonly errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    const message = errors.map((e) => e.message).join('; ');
    super(message);
    this.name = 'UploadValidationError';
    this.errors = errors;
  }
}
