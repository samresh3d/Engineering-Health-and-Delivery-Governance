import { Router, Request, Response, NextFunction } from 'express';
import ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';
import { upload } from '../middleware/multer';
import { AuthenticatedRequest } from '../middleware/rbac';
import { dataScopeMiddleware, FunctionScopedRequest } from '../middleware/data-scope';
import { UploadValidationService, RawRow } from '../services/upload-validation.service';
import { TemplateGeneratorService, TemplateGenerationError } from '../services/template-generator.service';
import type { DropdownConfig } from '../services/template-generator.service';
import { SprintDataRepository } from '../repositories/sprint-data.repository';
import { FunctionRepository } from '../repositories/function.repository';
import { TeamRepository } from '../repositories/team.repository';
import { DropdownRepository } from '../repositories/dropdown.repository';
import { UploadRepository } from '../repositories/upload.repository';
import { PendingUploadRepository } from '../repositories/pending-upload.repository';
import { AuditLoggerService } from '../services/audit-logger.service';
import { getDatabase } from '../database/connection.js';
import type { ValidationError, NewTeamConfirmationResponse, ConfirmUploadRequest, ConfirmUploadResponse, DeclineUploadResponse } from '../types/api';

const router = Router();

// ─── Cell Value Normalization ─────────────────────────────────────────────────

/** Date column headers that should receive date normalization */
const DATE_COLUMNS = new Set([
  'walkthrough given to development team',
  'dev start date',
  'dev complete date',
  'uat delivery date',
  'uat delivery target',
  'go live planned date',
  'go live date',
  'refinement closure date',
  'uat start date',
  'uat complete date',
]);

/** Y/N column headers that should receive boolean normalization */
const YES_NO_COLUMNS = new Set([
  'rollback (y/n)',
  'ai used (y/n)',
  'definition of ready (dor)',
  'definition of done (dod)',
]);

/**
 * Converts an Excel serial number to DD-MM-YYYY string.
 * Excel serial: days since 1899-12-30 (with the Lotus 123 leap year bug).
 */
function excelSerialToDateString(serial: number): string {
  const utcDays = Math.floor(serial) - 25569; // 25569 = days between 1899-12-30 and 1970-01-01
  const date = new Date(utcDays * 86400000);
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Normalizes a cell value from ExcelJS into a plain string/number/null.
 * Handles:
 * - JavaScript Date objects → DD-MM-YYYY string
 * - Excel serial numbers in date columns → DD-MM-YYYY string
 * - Object wrappers ({text:...}, {result:...}, {richText:...}) → extracted value
 * - Boolean values in Y/N columns → "Y"/"N"
 * - true/false, Yes/No, 1/0 in Y/N columns → "Y"/"N"
 */
function normalizeCellValue(value: unknown, headerLower: string): unknown {
  if (value === null || value === undefined) return null;

  const isDateColumn = DATE_COLUMNS.has(headerLower);
  const isYNColumn = YES_NO_COLUMNS.has(headerLower);

  // Handle Date objects (ExcelJS returns native Date for date-formatted cells)
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    const dd = String(value.getDate()).padStart(2, '0');
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const yyyy = value.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  // Handle objects (ExcelJS rich text, hyperlinks, formula results)
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;

    // Formula result: { result: ..., formula: ... }
    if ('result' in obj) {
      return normalizeCellValue(obj.result, headerLower);
    }

    // Hyperlink: { text: ..., hyperlink: ... }
    if ('text' in obj && typeof obj.text === 'string') {
      return normalizeCellValue(obj.text, headerLower);
    }

    // Rich text: { richText: [{text: ...}, ...] }
    if ('richText' in obj && Array.isArray(obj.richText)) {
      const joined = (obj.richText as Array<{ text?: string }>)
        .map((part) => part.text || '')
        .join('');
      return normalizeCellValue(joined, headerLower);
    }

    // Unknown object — try to extract a sensible value
    if ('value' in obj) {
      return normalizeCellValue(obj.value, headerLower);
    }

    // Last resort: return null rather than "[object Object]"
    return null;
  }

  // Handle booleans in Y/N columns
  if (isYNColumn) {
    if (typeof value === 'boolean') {
      return value ? 'Y' : 'N';
    }
    const strVal = String(value).trim().toLowerCase();
    if (strVal === 'true' || strVal === 'yes' || strVal === '1') return 'Y';
    if (strVal === 'false' || strVal === 'no' || strVal === '0') return 'N';
    // Return as-is for normal Y/N values
    return value;
  }

  // Handle numbers in date columns (Excel serial numbers)
  if (isDateColumn && typeof value === 'number' && value > 1 && value < 2958465) {
    return excelSerialToDateString(value);
  }

  return value;
}

/**
 * GET /api/upload/template
 * Downloads the 29-column Excel template pre-configured with:
 * - EM's assigned function name in the Function column (locked)
 * - Teams dropdown filtered to EM's function
 * - Production Status, Story Status, Delay Reason dropdowns from config
 *
 * Requires: Engineering_Manager or Super_Admin role (enforced by RBAC middleware).
 *
 * Success: 200 + .xlsx file download
 * Error: 400 if EM has no function assignment
 */
router.get(
  '/template',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user.userId;

      const db = getDatabase();

      // Get EM's function assignment
      const userRow = db.prepare(
        'SELECT function_id FROM users WHERE id = ?'
      ).get(userId) as { function_id: number | null } | undefined;

      if (!userRow || !userRow.function_id) {
        res.status(400).json({
          error: 'No Function assigned to your account. Contact your administrator.',
        });
        return;
      }

      const functionRepo = new FunctionRepository(db);
      const teamRepo = new TeamRepository(db);
      const dropdownRepo = new DropdownRepository(db);

      const functionRecord = functionRepo.getById(userRow.function_id);
      if (!functionRecord) {
        res.status(400).json({
          error: 'Assigned Function not found. Contact your administrator.',
        });
        return;
      }

      // Get teams for the EM's function
      const teams = teamRepo.getByFunction(functionRecord.id);
      const teamNames = teams.map((t) => t.name);

      // Get dropdown configuration
      const allDropdowns = dropdownRepo.getAllOptions();
      const dropdownOptions: DropdownConfig = {
        productionStatus: allDropdowns.production_status.map((o) => o.optionValue),
        storyStatus: allDropdowns.story_status.map((o) => o.optionValue),
        delayReason: allDropdowns.delay_reason.map((o) => o.optionValue),
      };

      // Generate template
      const templateGenerator = new TemplateGeneratorService();
      const buffer = await templateGenerator.generateTemplate({
        functionId: functionRecord.id,
        functionName: functionRecord.name,
        teams: teamNames,
        dropdownOptions,
      });

      // Send file download response
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="sprint-data-template.xlsx"`
      );
      res.status(200).send(buffer);
    } catch (error) {
      if (error instanceof TemplateGenerationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  }
);

/**
 * POST /api/upload
 * Accepts a multipart file upload (field name: 'file'), runs the full revised
 * validation pipeline, and persists valid data.
 *
 * Validation pipeline (in order):
 * 1. File prerequisites (format, size) — short-circuit on errors
 * 2. Parse Excel file using ExcelJS
 * 3. Validate 29 column headers — short-circuit on errors
 * 4. Validate non-empty data rows — short-circuit on errors
 * 5. Validate Function assignment (EM's assigned function) — reject entire file on errors
 * 6. Validate Team membership (teams under EM's function)
 * 7. Validate dropdown values (configured options)
 * 8. Validate field types (dates, numerics, Y/N, text lengths, JIRA ID)
 * 9. Collect all row-level errors (up to 100) and return 400 if any exist
 * 10. On validation pass, persist via updated sprint data repository
 * 11. Return 200 with upload result
 *
 * Requires: Admin, Engineering_Manager, or Super_Admin role (enforced by RBAC middleware).
 *
 * Success: 200 { success: true, rowsIngested, uploadId, timestamp }
 * Validation error: 400 { success: false, errors: [...] }
 */
router.post(
  '/',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          errors: [{ field: 'file', message: 'No file provided. Please upload an Excel file.' }],
        });
        return;
      }

      const buffer = req.file.buffer;
      const filename = req.file.originalname;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user.userId;
      const userTeamId = authReq.user.teamId;

      const db = getDatabase();
      const validationService = new UploadValidationService();

      // ─── Step 1: File prerequisites (format, size) ────────────────────────────
      const prerequisiteErrors = validationService.validateFilePrerequisites(buffer, filename);
      if (prerequisiteErrors.length > 0) {
        res.status(400).json({ success: false, errors: prerequisiteErrors });
        return;
      }

      // ─── Step 2: Parse Excel file using ExcelJS ───────────────────────────────
      const workbook = new ExcelJS.Workbook();
      // @ts-expect-error ExcelJS type mismatch with Node 22 Buffer types
      await workbook.xlsx.load(buffer);

      // Use the first worksheet (or 'Sprint Data' if it exists)
      let worksheet = workbook.getWorksheet('Sprint Data');
      if (!worksheet) {
        worksheet = workbook.worksheets[0];
      }

      if (!worksheet) {
        res.status(400).json({
          success: false,
          errors: [{ field: 'file', message: 'Excel file contains no worksheets.' }],
        });
        return;
      }

      // Extract headers from Row 1
      const headerRow = worksheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        headers.push(String(cell.value ?? ''));
      });

      // ─── Step 3: Validate column headers ──────────────────────────────────────
      const headerErrors = validationService.validateHeaders(headers);
      if (headerErrors.length > 0) {
        res.status(400).json({ success: false, errors: headerErrors });
        return;
      }

      // ─── Step 4: Parse data rows into RawRow objects ──────────────────────────
      const rows: RawRow[] = [];
      const rowCount = worksheet.rowCount;

      for (let rowIdx = 2; rowIdx <= rowCount; rowIdx++) {
        const row = worksheet.getRow(rowIdx);
        const rawRow: RawRow = {};
        let hasData = false;

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          if (colNumber <= headers.length) {
            const header = headers[colNumber - 1];
            const headerLower = header.trim().toLowerCase();
            const normalized = normalizeCellValue(cell.value, headerLower);
            if (normalized !== null && normalized !== undefined && String(normalized).trim() !== '') {
              hasData = true;
            }
            rawRow[header] = normalized;
          }
        });

        // Only include rows that have at least some data
        if (hasData) {
          rows.push(rawRow);
        }
      }

      // ─── Step 5: Validate non-empty data ──────────────────────────────────────
      const emptyDataErrors = validationService.validateNonEmptyData(rows);
      if (emptyDataErrors.length > 0) {
        res.status(400).json({ success: false, errors: emptyDataErrors });
        return;
      }

      // ─── Step 6: Get EM's function assignment ─────────────────────────────────
      const userRow = db.prepare(
        'SELECT function_id FROM users WHERE id = ?'
      ).get(userId) as { function_id: number | null } | undefined;

      if (!userRow || !userRow.function_id) {
        res.status(400).json({
          success: false,
          errors: [{ field: 'file', message: 'No Function assigned to your account. Contact your administrator.' }],
        });
        return;
      }

      const functionRepo = new FunctionRepository(db);
      const functionRecord = functionRepo.getById(userRow.function_id);

      if (!functionRecord) {
        res.status(400).json({
          success: false,
          errors: [{ field: 'file', message: 'Assigned Function not found in registry.' }],
        });
        return;
      }

      // ─── Step 7: Validate Function assignment ─────────────────────────────────
      // Function mismatch causes immediate full-file rejection
      const functionErrors = validationService.validateFunctionAssignment(rows, functionRecord.name);
      if (functionErrors.length > 0) {
        res.status(400).json({ success: false, errors: functionErrors });
        return;
      }

      // ─── Step 8: Validate Team membership ─────────────────────────────────────
      const teamRepo = new TeamRepository(db);
      const teams = teamRepo.getByFunction(functionRecord.id);
      const validTeamNames = teams.map((t) => t.name);

      const teamErrors = validationService.validateTeamMembership(rows, validTeamNames);

      // ─── Step 9: Validate dropdown values ─────────────────────────────────────
      const dropdownRepo = new DropdownRepository(db);
      const allDropdowns = dropdownRepo.getAllOptions();
      const dropdownConfig: DropdownConfig = {
        productionStatus: allDropdowns.production_status.map((o) => o.optionValue),
        storyStatus: allDropdowns.story_status.map((o) => o.optionValue),
        delayReason: allDropdowns.delay_reason.map((o) => o.optionValue),
      };

      const dropdownErrors = validationService.validateDropdowns(rows, dropdownConfig);

      // ─── Step 10: Validate field types ────────────────────────────────────────
      const fieldTypeErrors = validationService.validateFieldTypes(rows);

      // ─── Step 11: Collect all row-level errors (up to 100) ────────────────────
      const allRowErrors: ValidationError[] = [
        ...teamErrors.errors,
        ...dropdownErrors,
        ...fieldTypeErrors,
      ].slice(0, 100);

      if (allRowErrors.length > 0) {
        res.status(400).json({ success: false, errors: allRowErrors });
        return;
      }

      // ─── Step 11b: New team detection (after all other validations pass) ──────
      if (teamErrors.newTeams.length > 0) {
        const pendingUploadId = uuidv4();
        const pendingUploadRepo = new PendingUploadRepository(db);

        pendingUploadRepo.create({
          id: pendingUploadId,
          rows: rows,
          functionId: functionRecord.id,
          userId,
          filename,
          newTeams: teamErrors.newTeams,
        });

        const confirmationResponse: NewTeamConfirmationResponse = {
          requiresConfirmation: true,
          newTeams: teamErrors.newTeams,
          pendingUploadId,
          message: `Upload contains ${teamErrors.newTeams.length} new team(s) not registered under "${functionRecord.name}": ${teamErrors.newTeams.join(', ')}. Please confirm to create these teams and proceed with the upload.`,
        };

        res.status(409).json(confirmationResponse);
        return;
      }

      // ─── Step 12: All validations passed — persist data ───────────────────────
      const uploadId = uuidv4();
      const timestamp = new Date().toISOString();

      const uploadRepo = new UploadRepository(db);
      const sprintDataRepo = new SprintDataRepository(db);

      // Create upload record
      await uploadRepo.createUploadRecord({
        id: uploadId,
        fileName: filename,
        uploadedBy: userId,
        rowsIngested: 0,
        status: 'processing',
        errorMessage: null,
      });

      try {
        // Map raw rows to SprintDataRow format for persistence
        const sprintDataRows = mapRowsForPersistence(rows, headers, uploadId, timestamp, functionRecord.name);

        // Persist via repository
        const rowsIngested = await sprintDataRepo.bulkUpsert(sprintDataRows, uploadId);

        // Update upload record status
        await uploadRepo.updateUploadStatus(uploadId, 'success', rowsIngested);

        // Audit logging (non-blocking)
        try {
          const auditLogger = new AuditLoggerService(undefined, db);
          const insertedRows = db.prepare(
            'SELECT id, team FROM sprint_data WHERE upload_id = @uploadId'
          ).all({ uploadId }) as Array<{ id: number; team: string }>;

          for (const row of insertedRows) {
            await auditLogger.log({
              userId,
              action: 'create',
              recordId: row.id,
              recordType: 'sprint_data',
              teamId: row.team || userTeamId || 'unknown',
              modifiedFields: null,
            });
          }
        } catch (auditError) {
          console.error('Failed to write audit logs for bulk upload:', auditError);
        }

        res.status(200).json({
          success: true,
          rowsIngested,
          uploadId,
          timestamp,
        });
      } catch (persistError) {
        // Update upload record status to failed
        const errorMsg = persistError instanceof Error ? persistError.message : 'Unknown error';
        await uploadRepo.updateUploadStatus(uploadId, 'failed', 0, errorMsg);
        throw persistError;
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Maps parsed raw rows (keyed by column header) to SprintDataRow objects
 * suitable for persistence via the sprint data repository.
 *
 * The function handles the mapping from the 29 column headers to the
 * database column names expected by the repository.
 */
function mapRowsForPersistence(
  rows: RawRow[],
  headers: string[],
  uploadId: string,
  timestamp: string,
  functionName: string
): any[] {
  return rows.map((row) => {
    const getCellValue = (headerName: string): unknown => {
      const normalizedTarget = headerName.trim().toLowerCase();
      for (const key of Object.keys(row)) {
        if (key.trim().toLowerCase() === normalizedTarget) {
          return row[key];
        }
      }
      return null;
    };

    const toStringOrNull = (val: unknown): string | null => {
      if (val === null || val === undefined) return null;
      const s = String(val).trim();
      return s === '' ? null : s;
    };

    const toNumberOrNull = (val: unknown): number | null => {
      if (val === null || val === undefined) return null;
      const s = String(val).trim();
      if (s === '') return null;
      const n = Number(val);
      return isNaN(n) ? null : n;
    };

    const toYNOrNull = (val: unknown): 'Y' | 'N' | null => {
      if (val === null || val === undefined) return null;
      const s = String(val).trim().toUpperCase();
      if (s === 'Y' || s === 'N') return s;
      return null;
    };

    const toDateOrNull = (val: unknown): string | number | null => {
      if (val === null || val === undefined) return null;
      if (typeof val === 'number') return val;
      const s = String(val).trim();
      return s === '' ? null : s;
    };

    // Map the 29-column row to persistence format
    const team = toStringOrNull(getCellValue('Team')) || '';
    const jiraId = toStringOrNull(getCellValue('JIRA ID')) || '';

    return {
      uploadId,
      sno: toNumberOrNull(getCellValue('S.No')),
      team,
      track: team, // Track derived from team for backward compatibility
      project: team, // Project derived from team for backward compatibility
      portfolio: functionName, // Portfolio maps to function name
      status: toStringOrNull(getCellValue('Story Status')),
      itemsList: toStringOrNull(getCellValue('Item / Story Name')),
      walkthroughGivenOn: toDateOrNull(getCellValue('Walkthrough Given to Development Team')),
      jiraId,
      estimatedEffortWithAi: toNumberOrNull(getCellValue('With AI (Story Points)')),
      estimatedEffortWithoutAi: toNumberOrNull(getCellValue('Estimated Effort Without AI (Hours)')),
      actualEffortWithAi: toNumberOrNull(getCellValue('Actual Effort With AI (Hours)')),
      aiUsed: toYNOrNull(getCellValue('AI Used (Y/N)')),
      devStartDate: toDateOrNull(getCellValue('Dev Start Date')),
      devEndDate: toDateOrNull(getCellValue('Dev Complete Date')),
      developmentStatus: toStringOrNull(getCellValue('Production Status')),
      uatDeliveryDate: toDateOrNull(getCellValue('UAT Delivery Date')),
      uatDeliveryTarget: toDateOrNull(getCellValue('UAT Delivery Target')),
      resources: toStringOrNull(getCellValue('Resources')),
      goLivePlannedDate: toDateOrNull(getCellValue('Go Live Planned Date')),
      goLiveDate: toDateOrNull(getCellValue('Go Live Date')),
      productionStatus: toStringOrNull(getCellValue('Production Status')),
      rollback: toYNOrNull(getCellValue('Rollback (Y/N)')),
      rollbackReason: toStringOrNull(getCellValue('Rollback Reason')),
      storyDropReason: toStringOrNull(getCellValue('Story Drop Reason')),
      ingestedAt: timestamp,
      // New fields from the revised 29-column template
      functionName,
      storyName: toStringOrNull(getCellValue('Item / Story Name')),
      actualEffort: toNumberOrNull(getCellValue('Actual Effort')),
      definitionOfReady: toYNOrNull(getCellValue('Definition of Ready (DOR)')),
      definitionOfDone: toYNOrNull(getCellValue('Definition of Done (DOD)')),
      refinementClosureDate: toDateOrNull(getCellValue('Refinement Closure Date')),
      uatStartDate: toDateOrNull(getCellValue('UAT Start Date')),
      uatCompleteDate: toDateOrNull(getCellValue('UAT Complete Date')),
      delayReason: toStringOrNull(getCellValue('Delay Reason')),
      delayReasonDescription: toStringOrNull(getCellValue('Delay Reason Description')),
    };
  });
}

/**
 * POST /api/upload/confirm
 * Confirms or declines a pending upload that was held due to new team detection.
 *
 * Request body: { pendingUploadId: string, confirmed: boolean }
 *
 * If confirmed:
 *   - Creates new teams under the EM's function
 *   - Ingests the stored rows
 *   - Deletes the pending upload record
 *   - Returns 200 { success: true, rowsIngested, uploadId, timestamp, teamsCreated }
 *
 * If declined:
 *   - Deletes the pending upload record without any side effects
 *   - Returns 200 { success: true, cancelled: true }
 *
 * If pendingUploadId not found or expired:
 *   - Returns 410 Gone with error message
 *
 * Requires: Admin, Engineering_Manager, or Super_Admin role (enforced by RBAC middleware).
 */
router.post(
  '/confirm',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { pendingUploadId, confirmed } = req.body as ConfirmUploadRequest;

      if (!pendingUploadId || typeof confirmed !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'Request body must include pendingUploadId (string) and confirmed (boolean).',
        });
        return;
      }

      const db = getDatabase();
      const pendingUploadRepo = new PendingUploadRepository(db);

      // Retrieve the pending upload
      const pendingUpload = pendingUploadRepo.getById(pendingUploadId);

      if (!pendingUpload) {
        res.status(410).json({
          success: false,
          error: 'Pending upload not found or has expired. Please re-upload the file.',
        });
        return;
      }

      // ─── Decline flow ─────────────────────────────────────────────────────────
      if (!confirmed) {
        pendingUploadRepo.delete(pendingUploadId);

        const declineResponse: DeclineUploadResponse = {
          success: true,
          cancelled: true,
        };

        res.status(200).json(declineResponse);
        return;
      }

      // ─── Confirm flow ─────────────────────────────────────────────────────────
      const teamRepo = new TeamRepository(db);
      const functionRepo = new FunctionRepository(db);
      const uploadRepo = new UploadRepository(db);
      const sprintDataRepo = new SprintDataRepository(db);

      const functionRecord = functionRepo.getById(pendingUpload.functionId);
      if (!functionRecord) {
        res.status(400).json({
          success: false,
          error: 'Associated function no longer exists. Please re-upload the file.',
        });
        return;
      }

      // Create new teams under the EM's function
      const teamsCreated: string[] = [];
      for (const teamName of pendingUpload.newTeams) {
        // Check if team was created in the meantime (idempotency)
        const existing = teamRepo.getByNameAndFunction(teamName, pendingUpload.functionId);
        if (!existing) {
          teamRepo.create(teamName, pendingUpload.functionId);
        }
        teamsCreated.push(teamName);
      }

      // Ingest the stored rows
      const uploadId = uuidv4();
      const timestamp = new Date().toISOString();

      await uploadRepo.createUploadRecord({
        id: uploadId,
        fileName: pendingUpload.filename,
        uploadedBy: pendingUpload.userId,
        rowsIngested: 0,
        status: 'processing',
        errorMessage: null,
      });

      try {
        // Map raw rows to persistence format (reuse same mapping logic as main upload)
        const rows = pendingUpload.rows as RawRow[];
        const headers = Object.keys(rows[0] || {});
        const sprintDataRows = mapRowsForPersistence(rows, headers, uploadId, timestamp, functionRecord.name);

        const rowsIngested = await sprintDataRepo.bulkUpsert(sprintDataRows, uploadId);

        await uploadRepo.updateUploadStatus(uploadId, 'success', rowsIngested);

        // Delete pending upload record after successful ingestion
        pendingUploadRepo.delete(pendingUploadId);

        // Audit logging (non-blocking)
        try {
          const auditLogger = new AuditLoggerService(undefined, db);
          const authReq = req as AuthenticatedRequest;
          const userId = pendingUpload.userId;
          const userTeamId = authReq.user?.teamId;

          const insertedRows = db.prepare(
            'SELECT id, team FROM sprint_data WHERE upload_id = @uploadId'
          ).all({ uploadId }) as Array<{ id: number; team: string }>;

          for (const row of insertedRows) {
            await auditLogger.log({
              userId,
              action: 'create',
              recordId: row.id,
              recordType: 'sprint_data',
              teamId: row.team || userTeamId || 'unknown',
              modifiedFields: null,
            });
          }
        } catch (auditError) {
          console.error('Failed to write audit logs for confirmed upload:', auditError);
        }

        const confirmResponse: ConfirmUploadResponse = {
          success: true,
          rowsIngested,
          uploadId,
          timestamp,
          teamsCreated,
        };

        res.status(200).json(confirmResponse);
      } catch (persistError) {
        const errorMsg = persistError instanceof Error ? persistError.message : 'Unknown error';
        await uploadRepo.updateUploadStatus(uploadId, 'failed', 0, errorMsg);
        throw persistError;
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/upload/by-function
 *
 * Returns uploads grouped by function_name, with uploader name resolved from the users table.
 * Uses dataScopeMiddleware for role-based scoping:
 * - Engineering_Manager: sees only uploads for their assigned function.
 * - Leadership / Super_Admin / Delivery_Manager: sees uploads across all functions.
 *
 * Response: { success: true, data: FunctionGroup[] }
 * where FunctionGroup = { functionName, uploads: [...] }
 *
 * Requirements: 4.2, 4.3, 4.4, 4.5, 4.6
 */
router.get(
  '/by-function',
  dataScopeMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { functionName } = (req as FunctionScopedRequest).functionScope;
      const db = getDatabase();

      let rows: Array<{
        id: string;
        file_name: string;
        uploader_name: string;
        rows_ingested: number;
        status: string;
        uploaded_at: string;
        function_name: string;
      }>;

      if (functionName) {
        // EM scope: only uploads for their assigned function
        rows = db
          .prepare(
            `SELECT u.id, u.file_name, u.rows_ingested, u.status, u.uploaded_at,
                    usr.name AS uploader_name,
                    sd.function_name
             FROM uploads u
             JOIN users usr ON u.uploaded_by = usr.id
             JOIN sprint_data sd ON sd.upload_id = u.id
             WHERE sd.function_name = ?
             GROUP BY u.id, sd.function_name
             ORDER BY sd.function_name, u.uploaded_at DESC`
          )
          .all(functionName) as typeof rows;
      } else {
        // Leadership/Super_Admin/DM: all functions
        rows = db
          .prepare(
            `SELECT u.id, u.file_name, u.rows_ingested, u.status, u.uploaded_at,
                    usr.name AS uploader_name,
                    sd.function_name
             FROM uploads u
             JOIN users usr ON u.uploaded_by = usr.id
             JOIN sprint_data sd ON sd.upload_id = u.id
             GROUP BY u.id, sd.function_name
             ORDER BY sd.function_name, u.uploaded_at DESC`
          )
          .all() as typeof rows;
      }

      // Group rows by function_name into FunctionGroup[]
      const groupMap = new Map<string, Array<{
        id: string;
        fileName: string;
        uploaderName: string;
        rowsIngested: number;
        status: string;
        uploadedAt: string;
      }>>();

      for (const row of rows) {
        const fnName = row.function_name;
        if (!groupMap.has(fnName)) {
          groupMap.set(fnName, []);
        }
        groupMap.get(fnName)!.push({
          id: row.id,
          fileName: row.file_name,
          uploaderName: row.uploader_name || '',
          rowsIngested: row.rows_ingested,
          status: row.status,
          uploadedAt: row.uploaded_at,
        });
      }

      const data = Array.from(groupMap.entries()).map(([fnName, uploads]) => ({
        functionName: fnName,
        uploads,
      }));

      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ─── UUID Validation ──────────────────────────────────────────────────────────

/**
 * Validates that a string is a valid UUID v4 format.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

// ─── Bulk Delete ─────────────────────────────────────────────────────────────

/**
 * DELETE /api/uploads/bulk
 * Bulk deletes uploads and their associated sprint_data within a transaction.
 *
 * Authorization:
 * - Engineering_Manager: Can only delete uploads belonging to their function.
 *   Rejects the entire request if any upload is out-of-scope.
 * - Super_Admin: Can delete any uploads without restriction.
 * - Other roles: 403 Forbidden.
 *
 * Request body: { uploadIds: string[] }
 *
 * Success: 200 { success: true, deletedCount, message }
 * Errors:
 * - 400: Empty array or invalid UUID format
 * - 403: Forbidden (wrong role or EM trying to delete other function's uploads)
 * - 404: One or more uploads not found
 * - 500: Transaction failure
 *
 * Requirements: 3.5, 3.6, 3.7, 3.8, 3.9
 */
router.delete(
  '/bulk',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { role, functionId } = authReq.user;

      // ─── Role check ─────────────────────────────────────────────────────────
      if (role !== 'Engineering_Manager' && role !== 'Super_Admin') {
        console.error(`[Bulk Delete] User ${authReq.user.userId} with role="${role}" denied: insufficient permissions.`);
        res.status(403).json({ error: 'Forbidden. Insufficient permissions for this resource.' });
        return;
      }

      // ─── Validate request body ──────────────────────────────────────────────
      const { uploadIds } = req.body as { uploadIds?: unknown };

      if (!uploadIds || !Array.isArray(uploadIds) || uploadIds.length === 0) {
        console.error(`[Bulk Delete] User ${authReq.user.userId} sent invalid request body: uploadIds is empty or not an array.`);
        res.status(400).json({ error: 'At least one upload ID is required.' });
        return;
      }

      // Validate all IDs are valid UUIDs
      for (const id of uploadIds) {
        if (typeof id !== 'string' || !isValidUUID(id)) {
          console.error(`[Bulk Delete] User ${authReq.user.userId} sent invalid UUID: "${id}".`);
          res.status(400).json({ error: 'Invalid upload ID format.' });
          return;
        }
      }

      const db = getDatabase();

      // ─── Verify all uploads exist ───────────────────────────────────────────
      const placeholders = uploadIds.map(() => '?').join(', ');
      const existingUploads = db.prepare(
        `SELECT id FROM uploads WHERE id IN (${placeholders})`
      ).all(...uploadIds) as Array<{ id: string }>;

      if (existingUploads.length !== uploadIds.length) {
        console.error(`[Bulk Delete] User ${authReq.user.userId} requested ${uploadIds.length} uploads but only ${existingUploads.length} found.`);
        res.status(404).json({ error: 'One or more uploads not found.' });
        return;
      }

      // ─── Authorization check for Engineering_Manager ────────────────────────
      if (role === 'Engineering_Manager') {
        if (!functionId) {
          console.error(`[Bulk Delete] EM user ${authReq.user.userId} has no functionId assigned.`);
          res.status(400).json({ error: 'No function assigned to your account.' });
          return;
        }

        // Resolve the EM's function name
        const functionRow = db.prepare(
          'SELECT name FROM functions WHERE id = ?'
        ).get(functionId) as { name: string } | undefined;

        if (!functionRow) {
          console.error(`[Bulk Delete] EM user ${authReq.user.userId} functionId=${functionId} not found in functions table.`);
          res.status(400).json({ error: 'No function assigned to your account.' });
          return;
        }

        const emFunctionName = functionRow.name;

        // Determine which uploads the EM uploaded themselves (always allowed to delete)
        const ownedUploads = db.prepare(
          `SELECT id FROM uploads WHERE id IN (${placeholders}) AND uploaded_by = ?`
        ).all(...uploadIds, authReq.user.userId) as Array<{ id: string }>;

        const ownedUploadIds = new Set(ownedUploads.map(r => r.id));

        // For uploads NOT owned by the EM, check function scope via sprint_data
        const notOwnedUploadIds = uploadIds.filter(id => !ownedUploadIds.has(id));

        if (notOwnedUploadIds.length > 0) {
          const notOwnedPlaceholders = notOwnedUploadIds.map(() => '?').join(', ');

          // Check that all sprint_data for non-owned uploads belong to the EM's function (case-insensitive)
          const outOfScopeUploads = db.prepare(
            `SELECT DISTINCT upload_id FROM sprint_data 
             WHERE upload_id IN (${notOwnedPlaceholders}) 
             AND function_name != ? COLLATE NOCASE`
          ).all(...notOwnedUploadIds, emFunctionName) as Array<{ upload_id: string }>;

          if (outOfScopeUploads.length > 0) {
            console.error(`[Bulk Delete] EM user ${authReq.user.userId} (function="${emFunctionName}") denied: uploads [${outOfScopeUploads.map(r => r.upload_id).join(', ')}] have sprint_data outside their function.`);
            res.status(403).json({ error: 'Forbidden. Upload does not belong to your function.' });
            return;
          }

          // Check for orphan uploads (no sprint_data) that the EM doesn't own — deny access
          const uploadsWithData = db.prepare(
            `SELECT DISTINCT upload_id FROM sprint_data WHERE upload_id IN (${notOwnedPlaceholders})`
          ).all(...notOwnedUploadIds) as Array<{ upload_id: string }>;

          const uploadsWithDataSet = new Set(uploadsWithData.map(r => r.upload_id));
          const orphanUploadIds = notOwnedUploadIds.filter(id => !uploadsWithDataSet.has(id));

          if (orphanUploadIds.length > 0) {
            // Orphan uploads not owned by this EM — cannot verify function scope, deny
            console.error(`[Bulk Delete] EM user ${authReq.user.userId} denied: orphan uploads [${orphanUploadIds.join(', ')}] not owned by EM and have no sprint_data to verify function.`);
            res.status(403).json({ error: 'Forbidden. Upload does not belong to your function.' });
            return;
          }
        }
      }

      // ─── Execute bulk delete within a transaction ───────────────────────────
      try {
        const deleteTransaction = db.transaction(() => {
          // 1. Delete sprint_data rows associated with the uploads
          db.prepare(
            `DELETE FROM sprint_data WHERE upload_id IN (${placeholders})`
          ).run(...uploadIds);

          // 2. Delete upload records
          const result = db.prepare(
            `DELETE FROM uploads WHERE id IN (${placeholders})`
          ).run(...uploadIds);

          return result.changes;
        });

        const deletedCount = deleteTransaction();

        res.status(200).json({
          success: true,
          deletedCount,
          message: `Successfully deleted ${deletedCount} upload(s) and associated data.`,
        });
      } catch (txError) {
        console.error('Bulk delete transaction failed:', txError);
        res.status(500).json({ error: 'Bulk delete failed. No records were modified.' });
      }
    } catch (error) {
      next(error);
    }
  }
);

export default router;
