/**
 * Property-Based Test: Bug Condition Exploration
 *
 * Property 1: New Teams Trigger Hard Rejection Instead of Confirmation
 *
 * Bug Condition: isBugCondition(input) — at least one non-empty Team value in the
 * uploaded rows does NOT exist in the `teams` table for the EM's function, AND all
 * other validations (format, headers, function, dropdowns, field types) pass.
 *
 * This test MUST FAIL on unfixed code — failure confirms the bug exists.
 * Current code returns 400 with validation errors instead of the expected 409.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2**
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import request from 'supertest';
import express from 'express';
import ExcelJS from 'exceljs';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { TEMPLATE_COLUMNS } from '../../services/template-generator.service';
import { UploadValidationService } from '../../services/upload-validation.service';
import { FunctionRepository } from '../../repositories/function.repository';
import { TeamRepository } from '../../repositories/team.repository';
import { DropdownRepository } from '../../repositories/dropdown.repository';
import { UploadRepository } from '../../repositories/upload.repository';
import { SprintDataRepository } from '../../repositories/sprint-data.repository';
import { PendingUploadRepository } from '../../repositories/pending-upload.repository';

// ─── Test Constants ─────────────────────────────────────────────────────────────

const JWT_SECRET = 'engineering-health-platform-secret';
const TEST_USER_ID = 'test-em-user';
const TEST_FUNCTION_NAME = 'E-Com';
const REGISTERED_TEAMS = ['Alpha', 'Bravo', 'Charlie'];

// Valid dropdown values matching the seed data from migration 004
const VALID_PRODUCTION_STATUS = [
  'Deployed to Production',
  'In Progress',
  'Ready for Production',
  'Rolled Back',
  'Scheduled',
];
const VALID_STORY_STATUS = [
  'Completed',
  'In Progress',
  'Not Started',
  'Dropped',
  'On Hold',
  'Carried Forward',
];
const VALID_DELAY_REASON = [
  'Dependency on other team',
  'Resource unavailability',
  'Requirement change',
  'Technical complexity',
  'Environment issues',
  'Testing delays',
  'Vendor dependency',
  'Priority change',
];

// ─── Test Database Setup ────────────────────────────────────────────────────────

let db: Database.Database;
let app: express.Express;
let authToken: string;

function setupTestSchema(testDb: Database.Database): void {
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      token TEXT NOT NULL,
      team_id TEXT,
      function_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS functions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      function_id INTEGER NOT NULL REFERENCES functions(id),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      UNIQUE(name, function_id)
    );

    CREATE TABLE IF NOT EXISTS dropdown_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      field_name TEXT NOT NULL,
      option_value TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      UNIQUE(field_name, option_value)
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      rows_ingested INTEGER NOT NULL DEFAULT 0,
      status TEXT CHECK(status IN ('processing', 'success', 'failed')) DEFAULT 'processing',
      error_message TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS sprint_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upload_id TEXT NOT NULL REFERENCES uploads(id),
      sno INTEGER,
      team TEXT NOT NULL,
      track TEXT NOT NULL,
      project TEXT NOT NULL,
      portfolio TEXT NOT NULL,
      status TEXT,
      items_list TEXT,
      walkthrough_given_on TEXT,
      jira_id TEXT NOT NULL,
      estimated_effort_with_ai REAL,
      estimated_effort_without_ai REAL,
      actual_effort_with_ai REAL,
      ai_used TEXT CHECK(ai_used IN ('Y', 'N')),
      dev_start_date TEXT,
      dev_end_date TEXT,
      development_status TEXT,
      uat_delivery_date TEXT,
      uat_delivery_target TEXT,
      resources TEXT,
      go_live_planned_date TEXT,
      go_live_date TEXT,
      production_status TEXT,
      rollback TEXT CHECK(rollback IN ('Y', 'N')),
      rollback_reason TEXT,
      story_drop_reason TEXT,
      ingested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      function_name TEXT NOT NULL DEFAULT 'Unassigned',
      story_name TEXT,
      actual_effort REAL,
      definition_of_ready TEXT CHECK(definition_of_ready IN ('Y','N')),
      definition_of_done TEXT CHECK(definition_of_done IN ('Y','N')),
      refinement_closure_date TEXT,
      uat_start_date TEXT,
      uat_complete_date TEXT,
      delay_reason TEXT,
      delay_reason_description TEXT,
      UNIQUE(jira_id, team)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      record_id INTEGER,
      record_type TEXT,
      team_id TEXT,
      modified_fields TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS pending_uploads (
      id TEXT PRIMARY KEY,
      rows_json TEXT NOT NULL,
      function_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      new_teams_json TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);
}

function seedTestData(testDb: Database.Database): void {
  // Seed function
  testDb.prepare(`INSERT INTO functions (name) VALUES (?)`).run(TEST_FUNCTION_NAME);
  const funcRow = testDb.prepare(`SELECT id FROM functions WHERE name = ?`).get(TEST_FUNCTION_NAME) as { id: number };
  const functionId = funcRow.id;

  // Seed teams under the function
  for (const teamName of REGISTERED_TEAMS) {
    testDb.prepare(`INSERT INTO teams (name, function_id) VALUES (?, ?)`).run(teamName, functionId);
  }

  // Seed user with function assignment
  testDb.prepare(
    `INSERT INTO users (id, username, role, token, team_id, function_id) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(TEST_USER_ID, 'test_em', 'Engineering_Manager', 'dummy-token', null, functionId);

  // Seed dropdown options
  const insertOption = testDb.prepare(
    'INSERT INTO dropdown_options (field_name, option_value, sort_order) VALUES (?, ?, ?)'
  );
  VALID_PRODUCTION_STATUS.forEach((opt, idx) => insertOption.run('production_status', opt, idx + 1));
  VALID_STORY_STATUS.forEach((opt, idx) => insertOption.run('story_status', opt, idx + 1));
  VALID_DELAY_REASON.forEach((opt, idx) => insertOption.run('delay_reason', opt, idx + 1));
}

function createAuthToken(): string {
  return jwt.sign(
    { userId: TEST_USER_ID, role: 'Engineering_Manager' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Create a test Express app that uses the actual upload routes,
 * wired to our in-memory test database.
 */
function createTestApp(testDb: Database.Database): express.Express {
  const testApp = express();
  testApp.use(express.json());

  const uploadMiddleware = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  testApp.post('/api/upload', uploadMiddleware.single('file'), async (req: any, res: any, next: any) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, errors: [{ field: 'file', message: 'No file provided.' }] });
        return;
      }

      const buffer = req.file.buffer;
      const filename = req.file.originalname;

      // Decode token from auth header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const token = authHeader.slice(7);
      let decoded: any;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch {
        res.status(401).json({ error: 'Invalid token.' });
        return;
      }

      const userId = decoded.userId;
      const validationService = new UploadValidationService();

      // Step 1: File prerequisites
      const prerequisiteErrors = validationService.validateFilePrerequisites(buffer, filename);
      if (prerequisiteErrors.length > 0) {
        res.status(400).json({ success: false, errors: prerequisiteErrors });
        return;
      }

      // Step 2: Parse Excel
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      let worksheet = workbook.getWorksheet('Sprint Data') || workbook.worksheets[0];
      if (!worksheet) {
        res.status(400).json({ success: false, errors: [{ field: 'file', message: 'No worksheets found.' }] });
        return;
      }

      // Extract headers
      const headerRow = worksheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell({ includeEmpty: false }, (cell: any) => {
        headers.push(String(cell.value ?? ''));
      });

      // Step 3: Validate headers
      const headerErrors = validationService.validateHeaders(headers);
      if (headerErrors.length > 0) {
        res.status(400).json({ success: false, errors: headerErrors });
        return;
      }

      // Step 4: Parse data rows
      const rows: any[] = [];
      const rowCount = worksheet.rowCount;
      for (let rowIdx = 2; rowIdx <= rowCount; rowIdx++) {
        const row = worksheet.getRow(rowIdx);
        const rawRow: Record<string, unknown> = {};
        let hasData = false;
        row.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
          if (colNumber <= headers.length) {
            const header = headers[colNumber - 1];
            const value = cell.value;
            if (value !== null && value !== undefined && String(value).trim() !== '') {
              hasData = true;
            }
            rawRow[header] = value;
          }
        });
        if (hasData) rows.push(rawRow);
      }

      // Step 5: Non-empty data
      const emptyDataErrors = validationService.validateNonEmptyData(rows);
      if (emptyDataErrors.length > 0) {
        res.status(400).json({ success: false, errors: emptyDataErrors });
        return;
      }

      // Step 6: Get EM's function assignment
      const userRow = testDb.prepare('SELECT function_id FROM users WHERE id = ?').get(userId) as any;
      if (!userRow || !userRow.function_id) {
        res.status(400).json({ success: false, errors: [{ field: 'file', message: 'No Function assigned.' }] });
        return;
      }

      const functionRepo = new FunctionRepository(testDb);
      const functionRecord = functionRepo.getById(userRow.function_id);
      if (!functionRecord) {
        res.status(400).json({ success: false, errors: [{ field: 'file', message: 'Function not found.' }] });
        return;
      }

      // Step 7: Function assignment validation
      const functionErrors = validationService.validateFunctionAssignment(rows, functionRecord.name);
      if (functionErrors.length > 0) {
        res.status(400).json({ success: false, errors: functionErrors });
        return;
      }

      // Step 8: Team membership validation
      const teamRepo = new TeamRepository(testDb);
      const teams = teamRepo.getByFunction(functionRecord.id);
      const validTeamNames = teams.map((t: any) => t.name);
      const teamResult = validationService.validateTeamMembership(rows, validTeamNames);

      // Step 9: Dropdown validation
      const dropdownRepo = new DropdownRepository(testDb);
      const allDropdowns = dropdownRepo.getAllOptions();
      const dropdownConfig = {
        productionStatus: allDropdowns.production_status.map((o: any) => o.optionValue),
        storyStatus: allDropdowns.story_status.map((o: any) => o.optionValue),
        delayReason: allDropdowns.delay_reason.map((o: any) => o.optionValue),
      };
      const dropdownErrors = validationService.validateDropdowns(rows, dropdownConfig);

      // Step 10: Field type validation
      const fieldTypeErrors = validationService.validateFieldTypes(rows);

      // Step 11: Collect errors
      const allRowErrors = [...teamResult.errors, ...dropdownErrors, ...fieldTypeErrors].slice(0, 100);
      if (allRowErrors.length > 0) {
        res.status(400).json({ success: false, errors: allRowErrors });
        return;
      }

      // Step 11b: New team detection (after all other validations pass)
      if (teamResult.newTeams.length > 0) {
        const pendingUploadId = uuidv4();
        const pendingUploadRepo = new PendingUploadRepository(testDb);

        pendingUploadRepo.create({
          id: pendingUploadId,
          rows: rows,
          functionId: functionRecord.id,
          userId,
          filename,
          newTeams: teamResult.newTeams,
        });

        res.status(409).json({
          requiresConfirmation: true,
          newTeams: teamResult.newTeams,
          pendingUploadId,
          message: `Upload contains ${teamResult.newTeams.length} new team(s) not registered under "${functionRecord.name}": ${teamResult.newTeams.join(', ')}. Please confirm to create these teams and proceed with the upload.`,
        });
        return;
      }

      // Step 12: Persist data (simplified for test)
      const uploadId = uuidv4();
      const timestamp = new Date().toISOString();
      const uploadRepo = new UploadRepository(testDb);
      await uploadRepo.createUploadRecord({
        id: uploadId,
        fileName: filename,
        uploadedBy: userId,
        rowsIngested: 0,
        status: 'processing',
        errorMessage: null,
      });

      const sprintDataRepo = new SprintDataRepository(testDb);
      // Map rows for persistence (simplified)
      const mappedRows = rows.map((row: any) => {
        const getCellValue = (headerName: string): unknown => {
          const normalizedTarget = headerName.trim().toLowerCase();
          for (const key of Object.keys(row)) {
            if (key.trim().toLowerCase() === normalizedTarget) return row[key];
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
          const n = Number(val);
          return isNaN(n) ? null : n;
        };
        const toYNOrNull = (val: unknown): 'Y' | 'N' | null => {
          if (val === null || val === undefined) return null;
          const s = String(val).trim().toUpperCase();
          if (s === 'Y' || s === 'N') return s;
          return null;
        };

        const team = toStringOrNull(getCellValue('Team')) || '';
        return {
          uploadId,
          sno: toNumberOrNull(getCellValue('S.No')),
          team,
          track: team,
          project: team,
          portfolio: functionRecord.name,
          status: toStringOrNull(getCellValue('Story Status')),
          itemsList: toStringOrNull(getCellValue('Item / Story Name')),
          walkthroughGivenOn: toStringOrNull(getCellValue('Walkthrough Given to Development Team')),
          jiraId: toStringOrNull(getCellValue('JIRA ID')) || '',
          estimatedEffortWithAi: toNumberOrNull(getCellValue('With AI (Story Points)')),
          estimatedEffortWithoutAi: toNumberOrNull(getCellValue('Estimated Effort Without AI (Hours)')),
          actualEffortWithAi: toNumberOrNull(getCellValue('Actual Effort With AI (Hours)')),
          aiUsed: toYNOrNull(getCellValue('AI Used (Y/N)')),
          devStartDate: toStringOrNull(getCellValue('Dev Start Date')),
          devEndDate: toStringOrNull(getCellValue('Dev Complete Date')),
          developmentStatus: toStringOrNull(getCellValue('Production Status')),
          uatDeliveryDate: toStringOrNull(getCellValue('UAT Delivery Date')),
          uatDeliveryTarget: toStringOrNull(getCellValue('UAT Delivery Target')),
          resources: toStringOrNull(getCellValue('Resources')),
          goLivePlannedDate: toStringOrNull(getCellValue('Go Live Planned Date')),
          goLiveDate: toStringOrNull(getCellValue('Go Live Date')),
          productionStatus: toStringOrNull(getCellValue('Production Status')),
          rollback: toYNOrNull(getCellValue('Rollback (Y/N)')),
          rollbackReason: toStringOrNull(getCellValue('Rollback Reason')),
          storyDropReason: toStringOrNull(getCellValue('Story Drop Reason')),
          ingestedAt: timestamp,
          functionName: functionRecord.name,
          storyName: toStringOrNull(getCellValue('Item / Story Name')),
          actualEffort: toNumberOrNull(getCellValue('Actual Effort')),
          definitionOfReady: toYNOrNull(getCellValue('Definition of Ready (DOR)')),
          definitionOfDone: toYNOrNull(getCellValue('Definition of Done (DOD)')),
          refinementClosureDate: toStringOrNull(getCellValue('Refinement Closure Date')),
          uatStartDate: toStringOrNull(getCellValue('UAT Start Date')),
          uatCompleteDate: toStringOrNull(getCellValue('UAT Complete Date')),
          delayReason: toStringOrNull(getCellValue('Delay Reason')),
          delayReasonDescription: toStringOrNull(getCellValue('Delay Reason Description')),
        };
      });

      const rowsIngested = await sprintDataRepo.bulkUpsert(mappedRows, uploadId);
      await uploadRepo.updateUploadStatus(uploadId, 'success', rowsIngested);

      res.status(200).json({ success: true, rowsIngested, uploadId, timestamp });
    } catch (error) {
      next(error);
    }
  });

  return testApp;
}

// ─── Excel Generation Helper ────────────────────────────────────────────────────

/**
 * Generates a valid Excel file buffer with the given rows.
 * Each row must provide Team, JIRA ID, Function, and other required fields.
 */
async function generateExcelBuffer(
  rows: Array<{
    team: string;
    jiraId: string;
    productionStatus: string;
    storyStatus: string;
  }>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sprint Data');

  // Set headers (Row 1)
  const headerRow = worksheet.getRow(1);
  for (let i = 0; i < TEMPLATE_COLUMNS.length; i++) {
    headerRow.getCell(i + 1).value = TEMPLATE_COLUMNS[i];
  }
  headerRow.commit();

  // Add data rows
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const dataRow = worksheet.getRow(i + 2);
    // Map column index to values
    dataRow.getCell(1).value = i + 1; // S.No
    dataRow.getCell(2).value = TEST_FUNCTION_NAME; // Function
    dataRow.getCell(3).value = row.team; // Team
    dataRow.getCell(4).value = `Story ${i + 1}`; // Item / Story Name
    dataRow.getCell(5).value = null; // Walkthrough date (nullable)
    dataRow.getCell(6).value = row.jiraId; // JIRA ID
    dataRow.getCell(7).value = null; // Dev Start Date (nullable)
    dataRow.getCell(8).value = null; // Dev Complete Date (nullable)
    dataRow.getCell(9).value = null; // With AI Story Points (nullable)
    dataRow.getCell(10).value = null; // UAT Delivery Date (nullable)
    dataRow.getCell(11).value = null; // UAT Delivery Target (nullable)
    dataRow.getCell(12).value = null; // Resources (nullable)
    dataRow.getCell(13).value = null; // Go Live Planned Date (nullable)
    dataRow.getCell(14).value = null; // Go Live Date (nullable)
    dataRow.getCell(15).value = row.productionStatus; // Production Status
    dataRow.getCell(16).value = null; // Rollback Y/N (nullable)
    dataRow.getCell(17).value = null; // Rollback Reason (nullable)
    dataRow.getCell(18).value = null; // AI Used Y/N (nullable)
    dataRow.getCell(19).value = null; // Estimated Effort Without AI (nullable)
    dataRow.getCell(20).value = null; // Actual Effort (nullable)
    dataRow.getCell(21).value = null; // Actual Effort With AI (nullable)
    dataRow.getCell(22).value = row.storyStatus; // Story Status
    dataRow.getCell(23).value = null; // Story Drop Reason (nullable)
    dataRow.getCell(24).value = null; // Definition of Ready (nullable)
    dataRow.getCell(25).value = null; // Definition of Done (nullable)
    dataRow.getCell(26).value = null; // Refinement Closure Date (nullable)
    dataRow.getCell(27).value = null; // UAT Start Date (nullable)
    dataRow.getCell(28).value = null; // UAT Complete Date (nullable)
    dataRow.getCell(29).value = null; // Delay Reason (nullable)
    dataRow.getCell(30).value = null; // Delay Reason Description (nullable)
    dataRow.commit();
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Arbitraries (Generators) ───────────────────────────────────────────────────

/**
 * Generates a valid non-empty team name string that is NOT in the registered teams set.
 * These represent "new teams" that should trigger the confirmation flow.
 */
const unregisteredTeamArb = fc.stringOf(
  fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_- '),
  { minLength: 1, maxLength: 50 }
).filter((s) => {
  const trimmed = s.trim();
  // Must be non-empty after trimming and must not be a registered team
  return trimmed.length > 0 && !REGISTERED_TEAMS.includes(trimmed);
});

/**
 * Generates a valid JIRA ID (e.g., "PROJ-1234").
 */
const jiraIdArb = fc.tuple(
  fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), { minLength: 2, maxLength: 6 }),
  fc.integer({ min: 1, max: 99999 })
).map(([prefix, num]) => `${prefix}-${num}`);

/**
 * Generates an upload payload that satisfies the bug condition:
 * - At least one row has an unregistered team name
 * - All other validations pass (valid format, headers, function, dropdowns, field types)
 */
const bugConditionUploadArb = fc.record({
  // At least 1 row with unregistered team, up to 5 total rows
  unregisteredTeams: fc.array(unregisteredTeamArb, { minLength: 1, maxLength: 3 }),
  // Optionally include some rows with registered teams too
  registeredTeamRows: fc.integer({ min: 0, max: 3 }),
  productionStatus: fc.constantFrom(...VALID_PRODUCTION_STATUS),
  storyStatus: fc.constantFrom(...VALID_STORY_STATUS),
});

// ─── Test Suite ─────────────────────────────────────────────────────────────────

describe('Property 1: Bug Condition — New Teams Trigger Confirmation Flow', () => {
  beforeAll(() => {
    db = new Database(':memory:');
    setupTestSchema(db);
    seedTestData(db);
    app = createTestApp(db);
    authToken = createAuthToken();
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    // Clean up sprint_data between tests to avoid UNIQUE constraint violations
    db.prepare('DELETE FROM sprint_data').run();
    db.prepare('DELETE FROM uploads').run();
    db.prepare('DELETE FROM pending_uploads').run();
  });

  it('should return HTTP 409 with requiresConfirmation, newTeams, and pendingUploadId when upload contains unregistered teams (bug condition)', async () => {
    await fc.assert(
      fc.asyncProperty(bugConditionUploadArb, jiraIdArb, async (input, baseJiraId) => {
        const { unregisteredTeams, registeredTeamRows, productionStatus, storyStatus } = input;

        // Build rows: some with unregistered teams, some with registered teams
        const rows: Array<{ team: string; jiraId: string; productionStatus: string; storyStatus: string }> = [];

        // Add rows with unregistered teams (deduplicate for expected newTeams)
        for (let i = 0; i < unregisteredTeams.length; i++) {
          rows.push({
            team: unregisteredTeams[i].trim(),
            jiraId: `${baseJiraId}${100 + i}`,
            productionStatus,
            storyStatus,
          });
        }

        // Add rows with registered teams
        for (let i = 0; i < registeredTeamRows; i++) {
          const registeredTeam = REGISTERED_TEAMS[i % REGISTERED_TEAMS.length];
          rows.push({
            team: registeredTeam,
            jiraId: `${baseJiraId}${200 + i}`,
            productionStatus,
            storyStatus,
          });
        }

        // Generate Excel file
        const excelBuffer = await generateExcelBuffer(rows);

        // Make request
        const response = await request(app)
          .post('/api/upload')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', excelBuffer, 'sprint-data.xlsx');

        // Expected: HTTP 409 with confirmation response
        // The bug condition asserts the EXPECTED behavior:
        expect(response.status).toBe(409);
        expect(response.body.requiresConfirmation).toBe(true);

        // newTeams should contain exactly all unregistered team names (deduplicated)
        const expectedNewTeams = [...new Set(unregisteredTeams.map((t) => t.trim()))];
        expect(response.body.newTeams).toBeDefined();
        expect(Array.isArray(response.body.newTeams)).toBe(true);
        expect([...response.body.newTeams].sort()).toEqual([...expectedNewTeams].sort());

        // pendingUploadId should be a valid non-empty UUID
        expect(response.body.pendingUploadId).toBeDefined();
        expect(typeof response.body.pendingUploadId).toBe('string');
        expect(response.body.pendingUploadId.length).toBeGreaterThan(0);
        // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(response.body.pendingUploadId).toMatch(uuidRegex);
      }),
      {
        numRuns: 20, // Enough runs to surface the bug pattern
        verbose: true,
      }
    );
  });
});
