/**
 * Preservation Property Tests — Task 2
 *
 * These tests verify the existing (correct) behaviors that MUST be preserved
 * after the new-team-confirmation fix is implemented. They capture the baseline
 * behavior on UNFIXED code and must continue to pass after the fix.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * Property 2: Preservation — Registered Teams Process Immediately Without Confirmation
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { UploadValidationService, RawRow } from '../../services/upload-validation.service';
import { TEMPLATE_COLUMNS } from '../../services/template-generator.service';
import type { DropdownConfig } from '../../services/template-generator.service';

// ─── Test Configuration ─────────────────────────────────────────────────────

const service = new UploadValidationService();

/** Registered teams for test fixtures */
const REGISTERED_TEAMS = ['Retail', 'Claims', 'Digital Sales', 'Platform', 'DevOps'];

/** Valid dropdown options for test fixtures */
const DROPDOWN_CONFIG: DropdownConfig = {
  productionStatus: ['Live', 'In Progress', 'Blocked'],
  storyStatus: ['Done', 'In Development', 'UAT'],
  delayReason: ['Dependency', 'Resource Shortage', 'Scope Change'],
};

/** EM's assigned function name */
const EM_FUNCTION = 'E-Com';

// ─── Generators ─────────────────────────────────────────────────────────────

/**
 * Generator: picks a registered team name from the known set.
 */
const registeredTeamArb = fc.constantFrom(...REGISTERED_TEAMS);

/**
 * Generator: a valid JIRA ID matching ^[A-Z0-9]+-\d+$
 */
const jiraIdArb = fc.tuple(
  fc.stringOf(fc.constantFrom('A', 'B', 'C', 'E', 'X', 'Z', '1', '2'), { minLength: 2, maxLength: 5 }),
  fc.integer({ min: 1, max: 99999 })
).map(([prefix, num]) => `${prefix}-${num}`);

/**
 * Generator: a valid date string in DD-MM-YYYY format.
 */
const validDateArb = fc.tuple(
  fc.integer({ min: 1, max: 28 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 2020, max: 2025 })
).map(([d, m, y]) => `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`);

/**
 * Generator: a valid numeric value for story points / effort fields.
 */
const validNumericArb = fc.double({ min: 0, max: 99999.99, noNaN: true });

/**
 * Generator: a valid production status value.
 */
const productionStatusArb = fc.constantFrom(...DROPDOWN_CONFIG.productionStatus);

/**
 * Generator: a valid story status value.
 */
const storyStatusArb = fc.constantFrom(...DROPDOWN_CONFIG.storyStatus);

/**
 * Generator: a valid delay reason (including empty/null for optional field).
 */
const delayReasonArb = fc.oneof(
  fc.constantFrom(...DROPDOWN_CONFIG.delayReason),
  fc.constant(null)
);

/**
 * Generator: Y or N (valid boolean field values).
 */
const ynArb = fc.constantFrom('Y', 'N');

/**
 * Generator: a fully valid RawRow with a registered team name and correct function.
 * All fields pass validation (format, dropdowns, field types).
 */
const validRowWithRegisteredTeamArb = fc.record({
  team: registeredTeamArb,
  jiraId: jiraIdArb,
  sno: fc.integer({ min: 1, max: 99999 }),
  storyName: fc.string({ minLength: 1, maxLength: 100 }),
  date1: validDateArb,
  date2: validDateArb,
  storyPoints: validNumericArb,
  effort: validNumericArb,
  actualEffort: validNumericArb,
  actualEffortAi: validNumericArb,
  productionStatus: productionStatusArb,
  storyStatus: storyStatusArb,
  delayReason: delayReasonArb,
  rollback: ynArb,
  aiUsed: ynArb,
  dor: ynArb,
  dod: ynArb,
}).map((r) => {
  const row: RawRow = {
    'S.No': r.sno,
    'Function': EM_FUNCTION,
    'Team': r.team,
    'Item / Story Name': r.storyName,
    'Walkthrough Given to Development Team': r.date1,
    'JIRA ID': r.jiraId,
    'Dev Start Date': r.date1,
    'Dev Complete Date': r.date2,
    'With AI (Story Points)': r.storyPoints,
    'UAT Delivery Date': r.date1,
    'UAT Delivery Target': r.date2,
    'Resources': 'Dev1',
    'Go Live Planned Date': r.date1,
    'Go Live Date': r.date2,
    'Production Status': r.productionStatus,
    'Rollback (Y/N)': r.rollback,
    'Rollback Reason': null,
    'AI Used (Y/N)': r.aiUsed,
    'Estimated Effort Without AI (Hours)': r.effort,
    'Actual Effort': r.actualEffort,
    'Actual Effort With AI (Hours)': r.actualEffortAi,
    'Story Status': r.storyStatus,
    'Story Drop Reason': null,
    'Definition of Ready (DOR)': r.dor,
    'Definition of Done (DOD)': r.dod,
    'Refinement Closure Date': r.date1,
    'UAT Start Date': r.date1,
    'UAT Complete Date': r.date2,
    'Delay Reason': r.delayReason,
    'Delay Reason Description': r.delayReason ? 'Some reason' : null,
  };
  return row;
});

/**
 * Generator: an array of 1-10 valid rows with only registered teams.
 */
const validRowsArb = fc.array(validRowWithRegisteredTeamArb, { minLength: 1, maxLength: 10 });

/**
 * Generator: a row with empty/blank team value (various blank representations).
 */
const emptyTeamArb = fc.constantFrom('', '   ', null, undefined);

/**
 * Generator: an invalid file extension.
 */
const invalidExtensionArb = fc.constantFrom('.csv', '.pdf', '.txt', '.doc', '.json', '.xml');

/**
 * Generator: a function name that does NOT match the EM's function.
 */
const mismatchedFunctionArb = fc.constantFrom('MPro', 'Dolphin', 'IVC', 'Digital', 'Analytics');

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Property 2: Preservation — Registered Teams Process Immediately', () => {
  /**
   * Property 2.1: For all uploads with only registered non-empty teams and valid data,
   * the validation pipeline produces ZERO team errors, ZERO dropdown errors, ZERO field-type errors.
   * This means the upload would proceed to ingestion (200 response).
   *
   * **Validates: Requirements 3.1, 3.4**
   */
  describe('2.1 — All registered teams with valid data pass validation completely', () => {
    it('should produce zero team membership errors for uploads with only registered teams', () => {
      fc.assert(
        fc.property(validRowsArb, (rows) => {
          const result = service.validateTeamMembership(rows, REGISTERED_TEAMS);
          expect(result.errors).toHaveLength(0);
          expect(result.newTeams).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });

    it('should produce zero dropdown errors for uploads with valid dropdown values', () => {
      fc.assert(
        fc.property(validRowsArb, (rows) => {
          const dropdownErrors = service.validateDropdowns(rows, DROPDOWN_CONFIG);
          expect(dropdownErrors).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });

    it('should produce zero field-type errors for uploads with valid field types', () => {
      fc.assert(
        fc.property(validRowsArb, (rows) => {
          const fieldTypeErrors = service.validateFieldTypes(rows);
          expect(fieldTypeErrors).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });

    it('should produce zero function assignment errors for rows matching EM function', () => {
      fc.assert(
        fc.property(validRowsArb, (rows) => {
          const functionErrors = service.validateFunctionAssignment(rows, EM_FUNCTION);
          expect(functionErrors).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });

    it('should pass full validation pipeline (no errors at all) for valid registered-team uploads', () => {
      fc.assert(
        fc.property(validRowsArb, (rows) => {
          // Simulate the full pipeline (steps 5-10 from the route handler)
          const functionErrors = service.validateFunctionAssignment(rows, EM_FUNCTION);
          if (functionErrors.length > 0) return; // skip invalid (shouldn't happen)

          const teamResult = service.validateTeamMembership(rows, REGISTERED_TEAMS);
          const dropdownErrors = service.validateDropdowns(rows, DROPDOWN_CONFIG);
          const fieldTypeErrors = service.validateFieldTypes(rows);

          const allErrors = [...teamResult.errors, ...dropdownErrors, ...fieldTypeErrors];
          expect(allErrors).toHaveLength(0);
          expect(teamResult.newTeams).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2.2: For all uploads with empty/blank Team values,
   * the validation produces errors with the message "Team is required and cannot be empty."
   *
   * **Validates: Requirements 3.2**
   */
  describe('2.2 — Empty/blank Team values produce validation errors', () => {
    it('should reject rows with empty/blank team values with "Team is required" error', () => {
      fc.assert(
        fc.property(
          fc.array(emptyTeamArb, { minLength: 1, maxLength: 5 }),
          fc.array(validRowWithRegisteredTeamArb, { minLength: 0, maxLength: 3 }),
          (emptyTeams, validRows) => {
            // Build rows with empty team values
            const emptyTeamRows: RawRow[] = emptyTeams.map((teamVal) => ({
              'S.No': 1,
              'Function': EM_FUNCTION,
              'Team': teamVal,
              'Item / Story Name': 'Test',
              'JIRA ID': 'TEST-1',
              'Production Status': 'Live',
              'Story Status': 'Done',
            }));

            const allRows = [...emptyTeamRows, ...validRows];
            const result = service.validateTeamMembership(allRows, REGISTERED_TEAMS);

            // Each empty-team row should produce an error
            expect(result.errors.length).toBeGreaterThanOrEqual(emptyTeams.length);

            // All errors from empty teams should have the correct message
            const emptyTeamErrors = result.errors.filter((e) =>
              e.message.includes('Team is required and cannot be empty')
            );
            expect(emptyTeamErrors.length).toBe(emptyTeams.length);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return 400-style errors (field="Team") for blank team values', () => {
      fc.assert(
        fc.property(emptyTeamArb, (emptyTeam) => {
          const rows: RawRow[] = [{ 'Team': emptyTeam, 'Function': EM_FUNCTION }];
          const result = service.validateTeamMembership(rows, REGISTERED_TEAMS);

          expect(result.errors.length).toBe(1);
          expect(result.errors[0].field).toBe('Team');
          expect(result.errors[0].row).toBe(1);
          expect(result.errors[0].message).toContain('Team is required and cannot be empty');
        }),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 2.3: For all uploads with invalid file format,
   * the file prerequisites validation produces format errors.
   *
   * **Validates: Requirements 3.3**
   */
  describe('2.3 — Invalid file formats produce validation errors', () => {
    it('should reject files with invalid extensions', () => {
      fc.assert(
        fc.property(
          invalidExtensionArb,
          fc.integer({ min: 1, max: 5 * 1024 * 1024 }),
          (ext, size) => {
            const buffer = Buffer.alloc(size > 1024 ? 1024 : size); // keep small for speed
            const filename = `report${ext}`;
            const errors = service.validateFilePrerequisites(buffer, filename);

            expect(errors.length).toBeGreaterThanOrEqual(1);
            expect(errors[0].field).toBe('file');
            expect(errors[0].message).toContain('Invalid file format');
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should reject files exceeding 10MB size limit', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10 * 1024 * 1024 + 1, max: 15 * 1024 * 1024 }),
          (size) => {
            // We can't allocate huge buffers in tests, so just verify the size check logic
            const buffer = { length: size } as Buffer;
            const filename = 'report.xlsx';
            const errors = service.validateFilePrerequisites(buffer, filename);

            expect(errors.length).toBeGreaterThanOrEqual(1);
            const sizeError = errors.find((e) => e.message.includes('10 MB'));
            expect(sizeError).toBeDefined();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should accept valid .xlsx and .xls files under size limit', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('.xlsx', '.xls'),
          fc.integer({ min: 1, max: 1024 }),
          (ext, size) => {
            const buffer = Buffer.alloc(size);
            const filename = `data${ext}`;
            const errors = service.validateFilePrerequisites(buffer, filename);

            expect(errors).toHaveLength(0);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 2.4: For all uploads with function mismatch,
   * the function assignment validation produces mismatch errors.
   *
   * **Validates: Requirements 3.3**
   */
  describe('2.4 — Function mismatch produces validation errors', () => {
    it('should reject all rows when function does not match EM assignment', () => {
      fc.assert(
        fc.property(
          mismatchedFunctionArb,
          fc.integer({ min: 1, max: 10 }),
          (wrongFunction, rowCount) => {
            const rows: RawRow[] = Array.from({ length: rowCount }, (_, i) => ({
              'S.No': i + 1,
              'Function': wrongFunction,
              'Team': 'Retail',
              'JIRA ID': 'TEST-1',
            }));

            const errors = service.validateFunctionAssignment(rows, EM_FUNCTION);

            // Every row should produce a function mismatch error
            expect(errors.length).toBe(rowCount);
            for (const error of errors) {
              expect(error.field).toBe('Function');
              expect(error.message).toContain('Function mismatch');
              expect(error.message).toContain(wrongFunction);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should reject rows with empty function values', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', '  ', null, undefined),
          (emptyFunction) => {
            const rows: RawRow[] = [{ 'Function': emptyFunction, 'Team': 'Retail' }];
            const errors = service.validateFunctionAssignment(rows, EM_FUNCTION);

            expect(errors.length).toBe(1);
            expect(errors[0].field).toBe('Function');
            expect(errors[0].message).toContain('empty or blank');
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 2.5: For all uploads with invalid dropdown values,
   * the dropdown validation produces per-row errors.
   *
   * **Validates: Requirements 3.3**
   */
  describe('2.5 — Invalid dropdown/field-type values produce validation errors', () => {
    it('should reject rows with invalid Production Status values', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter(
            (s) => !DROPDOWN_CONFIG.productionStatus
              .map((v) => v.toLowerCase())
              .includes(s.trim().toLowerCase())
          ),
          (invalidStatus) => {
            const rows: RawRow[] = [{
              'Production Status': invalidStatus,
              'Story Status': 'Done',
              'Delay Reason': null,
            }];

            const errors = service.validateDropdowns(rows, DROPDOWN_CONFIG);
            expect(errors.length).toBeGreaterThanOrEqual(1);

            const psError = errors.find((e) => e.field === 'Production Status');
            expect(psError).toBeDefined();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should reject rows with invalid Story Status values', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter(
            (s) => !DROPDOWN_CONFIG.storyStatus
              .map((v) => v.toLowerCase())
              .includes(s.trim().toLowerCase())
          ),
          (invalidStatus) => {
            const rows: RawRow[] = [{
              'Production Status': 'Live',
              'Story Status': invalidStatus,
              'Delay Reason': null,
            }];

            const errors = service.validateDropdowns(rows, DROPDOWN_CONFIG);
            expect(errors.length).toBeGreaterThanOrEqual(1);

            const ssError = errors.find((e) => e.field === 'Story Status');
            expect(ssError).toBeDefined();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should reject rows with invalid JIRA ID patterns', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter(
            (s) => !/^[A-Z0-9]+-\d+$/.test(s.trim())
          ),
          (invalidJira) => {
            const rows: RawRow[] = [{
              'S.No': 1,
              'Function': EM_FUNCTION,
              'Team': 'Retail',
              'Item / Story Name': 'Test',
              'Walkthrough Given to Development Team': '01-01-2024',
              'JIRA ID': invalidJira,
              'Dev Start Date': '01-01-2024',
              'Dev Complete Date': '15-01-2024',
              'With AI (Story Points)': 5,
              'UAT Delivery Date': null,
              'UAT Delivery Target': null,
              'Resources': 'Dev1',
              'Go Live Planned Date': null,
              'Go Live Date': null,
              'Production Status': 'Live',
              'Rollback (Y/N)': 'N',
              'Rollback Reason': null,
              'AI Used (Y/N)': 'Y',
              'Estimated Effort Without AI (Hours)': 40,
              'Actual Effort': 35,
              'Actual Effort With AI (Hours)': 25,
              'Story Status': 'Done',
              'Story Drop Reason': null,
              'Definition of Ready (DOR)': 'Y',
              'Definition of Done (DOD)': 'Y',
              'Refinement Closure Date': '20-12-2023',
              'UAT Start Date': null,
              'UAT Complete Date': null,
              'Delay Reason': null,
              'Delay Reason Description': null,
            }];

            const errors = service.validateFieldTypes(rows);
            const jiraError = errors.find((e) => e.field === 'JIRA ID');
            expect(jiraError).toBeDefined();
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
