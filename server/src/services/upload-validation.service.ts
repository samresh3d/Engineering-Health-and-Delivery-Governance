import { z } from 'zod';
import type { ValidationError } from '../types/api';
import type { DropdownConfig } from './template-generator.service';
import { TEMPLATE_COLUMNS } from './template-generator.service';
import {
  dateStringSchema,
  JIRA_ID_PATTERN,
} from '../validators/upload.validator';

/**
 * A raw row from the parsed Excel file, keyed by trimmed column header name.
 */
export type RawRow = Record<string, unknown>;

/**
 * Interface for the upload validation pipeline (from design.md).
 *
 * Validates: Requirements 3.3, 3.4, 3.5, 4.6, 4.7, 4.8, 9.5, 9.6, 9.7, 9.8,
 *            10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.8, 10.9
 */
/**
 * Result of team membership validation, separating hard errors from new teams.
 */
export interface TeamMembershipResult {
  errors: ValidationError[];
  newTeams: string[];
}

export interface IUploadValidator {
  validateFilePrerequisites(buffer: Buffer, filename: string): ValidationError[];
  validateHeaders(headers: string[]): ValidationError[];
  validateFunctionAssignment(rows: RawRow[], expectedFunction: string): ValidationError[];
  validateTeamMembership(rows: RawRow[], validTeams: string[]): TeamMembershipResult;
  validateDropdowns(rows: RawRow[], config: DropdownConfig): ValidationError[];
  validateFieldTypes(rows: RawRow[]): ValidationError[];
}

/** Maximum file size in bytes (10 MB) — Req 10.8 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Accepted file extensions — Req 10.8 */
const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls'];

/** Maximum number of validation errors collected per upload — design doc policy */
const MAX_ERRORS = 100;

/**
 * Column-header-to-field-type mapping for field-type validation.
 * Groups columns by their expected type for targeted validation.
 */
const DATE_COLUMNS: readonly string[] = [
  'Walkthrough Given to Development Team',
  'Dev Start Date',
  'Dev Complete Date',
  'UAT Delivery Date',
  'UAT Delivery Target',
  'Go Live Planned Date',
  'Go Live Date',
  'Refinement Closure Date',
  'UAT Start Date',
  'UAT Complete Date',
];

const NUMERIC_COLUMNS: readonly string[] = [
  'With AI (Story Points)',
  'Estimated Effort Without AI (Hours)',
  'Actual Effort',
  'Actual Effort With AI (Hours)',
];

const YES_NO_COLUMNS: readonly string[] = [
  'Rollback (Y/N)',
  'AI Used (Y/N)',
  'Definition of Ready (DOR)',
  'Definition of Done (DOD)',
];

/** Text fields with their max lengths */
const TEXT_FIELD_LIMITS: Record<string, number> = {
  'Item / Story Name': 500,
  'Team': 500,
  'JIRA ID': 500,
  'Resources': 500,
  'Rollback Reason': 500,
  'Story Drop Reason': 500,
  'Function': 100,
  'Delay Reason Description': 2000,
};

/**
 * Upload Validation Service
 *
 * Implements the full validation pipeline for the revised 29-column template.
 * Validations are ordered by severity:
 * 1. File prerequisites (format, size) — short-circuit
 * 2. Header validation (29 columns) — short-circuit
 * 3. Zero data rows check — short-circuit
 * 4. Function assignment (case-sensitive, entire-file rejection)
 * 5. Team membership (per-row)
 * 6. Dropdown validation (per-row)
 * 7. Field type validation (per-row)
 *
 * Collects up to 100 errors with row numbers and field names.
 */
export class UploadValidationService implements IUploadValidator {
  /**
   * Validates file size (≤ 10MB) and format (.xlsx/.xls) before parsing.
   *
   * Validates: Requirement 10.8
   */
  validateFilePrerequisites(buffer: Buffer, filename: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check file extension
    const ext = this.getFileExtension(filename);
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      errors.push({
        field: 'file',
        message: `Invalid file format "${ext}". Only .xlsx and .xls files are accepted.`,
      });
    }

    // Check file size
    if (buffer.length > MAX_FILE_SIZE) {
      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
      errors.push({
        field: 'file',
        message: `File size ${sizeMB} MB exceeds the maximum allowed size of 10 MB.`,
      });
    }

    return errors;
  }

  /**
   * Validates that all 29 required column headers are present.
   * Uses case-insensitive trimmed comparison.
   *
   * Validates: Requirement 10.1
   */
  validateHeaders(headers: string[]): ValidationError[] {
    const normalizedHeaders = headers.map((h) => h.trim().toLowerCase());
    const errors: ValidationError[] = [];

    for (const expectedCol of TEMPLATE_COLUMNS) {
      const normalizedExpected = expectedCol.trim().toLowerCase();
      if (!normalizedHeaders.includes(normalizedExpected)) {
        errors.push({
          field: expectedCol,
          message: `Required column "${expectedCol}" is missing from the uploaded file.`,
        });

        if (errors.length >= MAX_ERRORS) break;
      }
    }

    return errors;
  }

  /**
   * Validates that every row's Function value matches the EM's assigned function.
   * Case-sensitive comparison. Rejects entire file on any mismatch.
   *
   * Validates: Requirements 3.3, 3.4, 3.5
   *
   * @param rows - Parsed rows keyed by column header
   * @param expectedFunction - The EM's assigned function name
   * @returns All function mismatch errors (entire file should be rejected)
   */
  validateFunctionAssignment(rows: RawRow[], expectedFunction: string): ValidationError[] {
    const errors: ValidationError[] = [];

    for (let i = 0; i < rows.length; i++) {
      if (errors.length >= MAX_ERRORS) break;

      const row = rows[i];
      const functionValue = this.getCellValue(row, 'Function');

      if (functionValue === null || functionValue === undefined || String(functionValue).trim() === '') {
        // Req 3.5: Empty/blank function → reject entire file
        errors.push({
          row: i + 1,
          field: 'Function',
          message: `Function is empty or blank. Expected "${expectedFunction}".`,
        });
      } else {
        const actualFunction = String(functionValue).trim();
        // Req 3.3: Case-sensitive comparison
        if (actualFunction !== expectedFunction) {
          errors.push({
            row: i + 1,
            field: 'Function',
            message: `Function mismatch. Expected "${expectedFunction}", found "${actualFunction}".`,
          });
        }
      }
    }

    return errors;
  }

  /**
   * Validates that every row's Team exists in the Team_Registry under EM's function.
   * Separates hard errors (empty/blank teams) from new teams (non-empty, unregistered).
   *
   * Validates: Requirements 2.1, 2.2, 4.6, 4.7, 4.8
   *
   * @param rows - Parsed rows keyed by column header
   * @param validTeams - List of team names registered under the EM's function
   * @returns Object with validation errors for empty/blank teams and deduplicated list of new team names
   */
  validateTeamMembership(rows: RawRow[], validTeams: string[]): TeamMembershipResult {
    const errors: ValidationError[] = [];
    const newTeamSet = new Set<string>();
    // Use case-sensitive comparison for team names (registry stores exact names)
    const validTeamSet = new Set(validTeams);

    for (let i = 0; i < rows.length; i++) {
      if (errors.length >= MAX_ERRORS) break;

      const row = rows[i];
      const teamValue = this.getCellValue(row, 'Team');

      if (teamValue === null || teamValue === undefined || String(teamValue).trim() === '') {
        // Req 4.8: Empty/blank team → reject row (hard error)
        errors.push({
          row: i + 1,
          field: 'Team',
          message: 'Team is required and cannot be empty.',
        });
      } else {
        const actualTeam = String(teamValue).trim();
        // Req 4.6, 4.7: Team must exist under EM's function
        if (!validTeamSet.has(actualTeam)) {
          // Collect as new team instead of hard error (deduplicated)
          newTeamSet.add(actualTeam);
        }
      }
    }

    return { errors, newTeams: Array.from(newTeamSet) };
  }

  /**
   * Validates dropdown fields: Production Status, Story Status (mandatory),
   * and Delay Reason (optional). Case-insensitive match against configured options.
   *
   * Validates: Requirements 9.5, 9.6, 9.7, 9.8
   *
   * @param rows - Parsed rows keyed by column header
   * @param config - Dropdown configuration with allowed values
   * @returns Validation errors for invalid dropdown values
   */
  validateDropdowns(rows: RawRow[], config: DropdownConfig): ValidationError[] {
    const errors: ValidationError[] = [];

    // Build case-insensitive lookup sets
    const productionStatusOptions = new Set(
      config.productionStatus.map((v) => v.toLowerCase())
    );
    const storyStatusOptions = new Set(
      config.storyStatus.map((v) => v.toLowerCase())
    );
    const delayReasonOptions = new Set(
      config.delayReason.map((v) => v.toLowerCase())
    );

    for (let i = 0; i < rows.length; i++) {
      if (errors.length >= MAX_ERRORS) break;

      const row = rows[i];

      // Production Status — mandatory (Req 9.7)
      const productionStatus = this.getCellValue(row, 'Production Status');
      if (productionStatus === null || productionStatus === undefined || String(productionStatus).trim() === '') {
        errors.push({
          row: i + 1,
          field: 'Production Status',
          message: 'Production Status is mandatory and cannot be empty.',
        });
      } else {
        const psValue = String(productionStatus).trim().toLowerCase();
        if (!productionStatusOptions.has(psValue)) {
          errors.push({
            row: i + 1,
            field: 'Production Status',
            message: `Invalid Production Status value "${String(productionStatus).trim()}". Must be one of the configured options.`,
          });
        }
      }

      if (errors.length >= MAX_ERRORS) break;

      // Story Status — mandatory (Req 9.7)
      const storyStatus = this.getCellValue(row, 'Story Status');
      if (storyStatus === null || storyStatus === undefined || String(storyStatus).trim() === '') {
        errors.push({
          row: i + 1,
          field: 'Story Status',
          message: 'Story Status is mandatory and cannot be empty.',
        });
      } else {
        const ssValue = String(storyStatus).trim().toLowerCase();
        if (!storyStatusOptions.has(ssValue)) {
          errors.push({
            row: i + 1,
            field: 'Story Status',
            message: `Invalid Story Status value "${String(storyStatus).trim()}". Must be one of the configured options.`,
          });
        }
      }

      if (errors.length >= MAX_ERRORS) break;

      // Delay Reason — optional (Req 9.8: accept empty)
      const delayReason = this.getCellValue(row, 'Delay Reason');
      if (delayReason !== null && delayReason !== undefined && String(delayReason).trim() !== '') {
        const drValue = String(delayReason).trim().toLowerCase();
        if (!delayReasonOptions.has(drValue)) {
          errors.push({
            row: i + 1,
            field: 'Delay Reason',
            message: `Invalid Delay Reason value "${String(delayReason).trim()}". Must be one of the configured options.`,
          });
        }
      }
    }

    return errors;
  }

  /**
   * Validates field types: dates, numerics, Y/N, text lengths, and JIRA ID pattern.
   *
   * Validates: Requirements 10.2, 10.3, 10.4, 10.5, 1.6, 1.7, 1.8
   *
   * @param rows - Parsed rows keyed by column header
   * @returns Validation errors for type mismatches
   */
  validateFieldTypes(rows: RawRow[]): ValidationError[] {
    const errors: ValidationError[] = [];

    for (let i = 0; i < rows.length; i++) {
      if (errors.length >= MAX_ERRORS) break;

      const row = rows[i];

      // S.No — positive integer, max 99999, optional
      this.validateSno(row, i + 1, errors);
      if (errors.length >= MAX_ERRORS) break;

      // JIRA ID — required, matches pattern (Req 10.2)
      this.validateJiraId(row, i + 1, errors);
      if (errors.length >= MAX_ERRORS) break;

      // Date columns (Req 10.3)
      for (const col of DATE_COLUMNS) {
        if (errors.length >= MAX_ERRORS) break;
        this.validateDateField(row, col, i + 1, errors);
      }
      if (errors.length >= MAX_ERRORS) break;

      // Numeric columns (Req 10.4)
      for (const col of NUMERIC_COLUMNS) {
        if (errors.length >= MAX_ERRORS) break;
        this.validateNumericField(row, col, i + 1, errors);
      }
      if (errors.length >= MAX_ERRORS) break;

      // Y/N columns (Req 10.5)
      for (const col of YES_NO_COLUMNS) {
        if (errors.length >= MAX_ERRORS) break;
        this.validateYesNoField(row, col, i + 1, errors);
      }
      if (errors.length >= MAX_ERRORS) break;

      // Text length validation (Req 1.6, 1.7, 1.8)
      for (const [col, maxLength] of Object.entries(TEXT_FIELD_LIMITS)) {
        if (errors.length >= MAX_ERRORS) break;
        this.validateTextLength(row, col, maxLength, i + 1, errors);
      }
    }

    return errors;
  }

  /**
   * Validates that the file has at least one data row after headers.
   *
   * Validates: Requirement 10.9
   */
  validateNonEmptyData(rows: RawRow[]): ValidationError[] {
    if (!rows || rows.length === 0) {
      return [
        {
          field: 'data',
          message: 'The uploaded file contains no data rows to process.',
        },
      ];
    }
    return [];
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Gets a cell value from a raw row, using case-insensitive trimmed header lookup.
   */
  private getCellValue(row: RawRow, headerName: string): unknown {
    const normalizedTarget = headerName.trim().toLowerCase();

    for (const key of Object.keys(row)) {
      if (key.trim().toLowerCase() === normalizedTarget) {
        return row[key];
      }
    }

    return null;
  }

  /**
   * Validates S.No field (positive integer, max 99999, optional).
   */
  private validateSno(row: RawRow, rowNum: number, errors: ValidationError[]): void {
    const value = this.getCellValue(row, 'S.No');
    if (value === null || value === undefined || String(value).trim() === '') {
      return; // S.No is optional (nullable)
    }

    const numValue = Number(value);
    if (!Number.isInteger(numValue) || numValue <= 0 || numValue > 99999) {
      errors.push({
        row: rowNum,
        field: 'S.No',
        message: 'S.No must be a positive integer with a maximum value of 99999.',
      });
    }
  }

  /**
   * Validates JIRA ID field against pattern ^[A-Z0-9]+-\d+$ (Req 10.2).
   * JIRA ID is required — empty values are rejected.
   */
  private validateJiraId(row: RawRow, rowNum: number, errors: ValidationError[]): void {
    const value = this.getCellValue(row, 'JIRA ID');
    if (value === null || value === undefined || String(value).trim() === '') {
      errors.push({
        row: rowNum,
        field: 'JIRA ID',
        message: 'JIRA ID is required.',
      });
      return;
    }

    const strValue = String(value).trim();
    if (!JIRA_ID_PATTERN.test(strValue)) {
      errors.push({
        row: rowNum,
        field: 'JIRA ID',
        message: `JIRA ID "${strValue}" does not match the required pattern (e.g., ECOM-1234).`,
      });
    }
  }

  /**
   * Validates a date field. Accepts DD-MM-YYYY, ISO 8601, DD-MMM-YY,
   * DD-MMM-YYYY, or Excel serial numbers. Empty values are accepted.
   */
  private validateDateField(
    row: RawRow,
    columnName: string,
    rowNum: number,
    errors: ValidationError[]
  ): void {
    const value = this.getCellValue(row, columnName);
    if (value === null || value === undefined || String(value).trim() === '') {
      return; // Date fields are nullable
    }

    // Try parsing as number (Excel serial)
    if (typeof value === 'number') {
      const result = dateStringSchema.safeParse(value);
      if (!result.success) {
        errors.push({
          row: rowNum,
          field: columnName,
          message: `Invalid date value in "${columnName}". Must be a valid date format (DD-MM-YYYY, ISO 8601, DD-MMM-YY, DD-MMM-YYYY) or Excel serial number.`,
        });
      }
      return;
    }

    // String date formats
    const strValue = String(value).trim();
    const result = dateStringSchema.safeParse(strValue);
    if (!result.success) {
      errors.push({
        row: rowNum,
        field: columnName,
        message: `Invalid date value "${strValue}" in "${columnName}". Must be a valid date format (DD-MM-YYYY, ISO 8601, DD-MMM-YY, DD-MMM-YYYY) or Excel serial number.`,
      });
    }
  }

  /**
   * Validates a numeric field. Must be non-negative, max 99999.99 (Req 10.4).
   * Empty values are accepted.
   */
  private validateNumericField(
    row: RawRow,
    columnName: string,
    rowNum: number,
    errors: ValidationError[]
  ): void {
    const value = this.getCellValue(row, columnName);
    if (value === null || value === undefined || String(value).trim() === '') {
      return; // Numeric fields are nullable
    }

    const numValue = Number(value);
    if (isNaN(numValue)) {
      errors.push({
        row: rowNum,
        field: columnName,
        message: `"${columnName}" must be a numeric value.`,
      });
      return;
    }

    if (numValue < 0) {
      errors.push({
        row: rowNum,
        field: columnName,
        message: `"${columnName}" must be non-negative.`,
      });
      return;
    }

    if (numValue > 99999.99) {
      errors.push({
        row: rowNum,
        field: columnName,
        message: `"${columnName}" exceeds the maximum value of 99999.99.`,
      });
    }
  }

  /**
   * Validates a Y/N field. Accepts only "Y" or "N" (case-insensitive) (Req 10.5).
   * Empty values are accepted.
   */
  private validateYesNoField(
    row: RawRow,
    columnName: string,
    rowNum: number,
    errors: ValidationError[]
  ): void {
    const value = this.getCellValue(row, columnName);
    if (value === null || value === undefined || String(value).trim() === '') {
      return; // Y/N fields are nullable
    }

    const strValue = String(value).trim().toUpperCase();
    if (strValue !== 'Y' && strValue !== 'N') {
      errors.push({
        row: rowNum,
        field: columnName,
        message: `"${columnName}" must be "Y" or "N" (case-insensitive).`,
      });
    }
  }

  /**
   * Validates text field length against its configured maximum.
   * Empty values are accepted.
   */
  private validateTextLength(
    row: RawRow,
    columnName: string,
    maxLength: number,
    rowNum: number,
    errors: ValidationError[]
  ): void {
    const value = this.getCellValue(row, columnName);
    if (value === null || value === undefined || String(value).trim() === '') {
      return; // Text fields are nullable for length validation
    }

    const strValue = String(value);
    if (strValue.length > maxLength) {
      errors.push({
        row: rowNum,
        field: columnName,
        message: `"${columnName}" exceeds maximum length of ${maxLength} characters (found ${strValue.length}).`,
      });
    }
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
