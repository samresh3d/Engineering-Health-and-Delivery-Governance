import { describe, it, expect } from 'vitest';
import { UploadValidationService } from '../../services/upload-validation.service';
import type { RawRow } from '../../services/upload-validation.service';
import type { DropdownConfig } from '../../services/template-generator.service';
import { TEMPLATE_COLUMNS } from '../../services/template-generator.service';

describe('UploadValidationService', () => {
  const service = new UploadValidationService();

  // ─── validateFilePrerequisites ─────────────────────────────────────────────

  describe('validateFilePrerequisites', () => {
    it('accepts a valid .xlsx file under 10MB', () => {
      const buffer = Buffer.alloc(1024); // 1KB
      const errors = service.validateFilePrerequisites(buffer, 'report.xlsx');
      expect(errors).toHaveLength(0);
    });

    it('accepts a valid .xls file', () => {
      const buffer = Buffer.alloc(1024);
      const errors = service.validateFilePrerequisites(buffer, 'report.xls');
      expect(errors).toHaveLength(0);
    });

    it('rejects invalid file extension', () => {
      const buffer = Buffer.alloc(1024);
      const errors = service.validateFilePrerequisites(buffer, 'report.csv');
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('file');
      expect(errors[0].message).toContain('.csv');
    });

    it('rejects file with no extension', () => {
      const buffer = Buffer.alloc(1024);
      const errors = service.validateFilePrerequisites(buffer, 'report');
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('file');
    });

    it('rejects file exceeding 10MB', () => {
      const buffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
      const errors = service.validateFilePrerequisites(buffer, 'report.xlsx');
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('file');
      expect(errors[0].message).toContain('10 MB');
    });

    it('reports both format and size errors when applicable', () => {
      const buffer = Buffer.alloc(11 * 1024 * 1024);
      const errors = service.validateFilePrerequisites(buffer, 'report.pdf');
      expect(errors).toHaveLength(2);
    });

    it('accepts file exactly at 10MB', () => {
      const buffer = Buffer.alloc(10 * 1024 * 1024); // exactly 10MB
      const errors = service.validateFilePrerequisites(buffer, 'report.xlsx');
      expect(errors).toHaveLength(0);
    });
  });

  // ─── validateHeaders ───────────────────────────────────────────────────────

  describe('validateHeaders', () => {
    it('accepts all 29 required headers in order', () => {
      const headers = [...TEMPLATE_COLUMNS];
      const errors = service.validateHeaders(headers);
      expect(errors).toHaveLength(0);
    });

    it('accepts headers with different casing (case-insensitive)', () => {
      const headers = TEMPLATE_COLUMNS.map((h) => h.toUpperCase());
      const errors = service.validateHeaders(headers);
      expect(errors).toHaveLength(0);
    });

    it('accepts headers with leading/trailing whitespace (trimmed)', () => {
      const headers = TEMPLATE_COLUMNS.map((h) => `  ${h}  `);
      const errors = service.validateHeaders(headers);
      expect(errors).toHaveLength(0);
    });

    it('reports missing columns', () => {
      const headers = TEMPLATE_COLUMNS.slice(0, TEMPLATE_COLUMNS.length - 2); // missing last 2
      const errors = service.validateHeaders(headers);
      expect(errors).toHaveLength(2);
      expect(errors[0].field).toBe('Delay Reason');
      expect(errors[1].field).toBe('Delay Reason Description');
    });

    it('reports all missing when empty header array', () => {
      const errors = service.validateHeaders([]);
      expect(errors).toHaveLength(TEMPLATE_COLUMNS.length);
    });

    it('accepts headers in any order (not just the specified order)', () => {
      const headers = [...TEMPLATE_COLUMNS].reverse();
      const errors = service.validateHeaders(headers);
      expect(errors).toHaveLength(0);
    });
  });

  // ─── validateFunctionAssignment ────────────────────────────────────────────

  describe('validateFunctionAssignment', () => {
    const expectedFunction = 'E-Com';

    it('accepts rows where all Function values match exactly', () => {
      const rows: RawRow[] = [
        { Function: 'E-Com', Team: 'Retail' },
        { Function: 'E-Com', Team: 'Claims' },
      ];
      const errors = service.validateFunctionAssignment(rows, expectedFunction);
      expect(errors).toHaveLength(0);
    });

    it('rejects rows with mismatched Function (case-sensitive)', () => {
      const rows: RawRow[] = [
        { Function: 'E-Com', Team: 'Retail' },
        { Function: 'e-com', Team: 'Claims' }, // lowercase mismatch
      ];
      const errors = service.validateFunctionAssignment(rows, expectedFunction);
      expect(errors).toHaveLength(1);
      expect(errors[0].row).toBe(2);
      expect(errors[0].field).toBe('Function');
      expect(errors[0].message).toContain('e-com');
    });

    it('rejects rows with empty Function', () => {
      const rows: RawRow[] = [
        { Function: 'E-Com', Team: 'Retail' },
        { Function: '', Team: 'Claims' },
      ];
      const errors = service.validateFunctionAssignment(rows, expectedFunction);
      expect(errors).toHaveLength(1);
      expect(errors[0].row).toBe(2);
      expect(errors[0].message).toContain('empty or blank');
    });

    it('rejects rows with null/undefined Function', () => {
      const rows: RawRow[] = [
        { Function: null, Team: 'Retail' },
        { Function: undefined, Team: 'Claims' },
      ];
      const errors = service.validateFunctionAssignment(rows, expectedFunction);
      expect(errors).toHaveLength(2);
    });

    it('rejects rows with whitespace-only Function', () => {
      const rows: RawRow[] = [{ Function: '   ', Team: 'Retail' }];
      const errors = service.validateFunctionAssignment(rows, expectedFunction);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('empty or blank');
    });

    it('reports all mismatched rows (not just first)', () => {
      const rows: RawRow[] = [
        { Function: 'MPro', Team: 'A' },
        { Function: 'Dolphin', Team: 'B' },
        { Function: 'IVC', Team: 'C' },
      ];
      const errors = service.validateFunctionAssignment(rows, expectedFunction);
      expect(errors).toHaveLength(3);
      expect(errors[0].row).toBe(1);
      expect(errors[1].row).toBe(2);
      expect(errors[2].row).toBe(3);
    });

    it('collects up to 100 errors maximum', () => {
      const rows: RawRow[] = Array.from({ length: 150 }, () => ({
        Function: 'WrongFunction',
        Team: 'Team1',
      }));
      const errors = service.validateFunctionAssignment(rows, expectedFunction);
      expect(errors).toHaveLength(100);
    });
  });

  // ─── validateTeamMembership ────────────────────────────────────────────────

  describe('validateTeamMembership', () => {
    const validTeams = ['Retail', 'Claims', 'Digital Sales'];

    it('accepts rows with valid team names', () => {
      const rows: RawRow[] = [
        { Team: 'Retail', Function: 'E-Com' },
        { Team: 'Claims', Function: 'E-Com' },
      ];
      const result = service.validateTeamMembership(rows, validTeams);
      expect(result.errors).toHaveLength(0);
      expect(result.newTeams).toHaveLength(0);
    });

    it('collects unregistered team names into newTeams instead of errors', () => {
      const rows: RawRow[] = [
        { Team: 'Retail', Function: 'E-Com' },
        { Team: 'NonExistentTeam', Function: 'E-Com' },
      ];
      const result = service.validateTeamMembership(rows, validTeams);
      expect(result.errors).toHaveLength(0);
      expect(result.newTeams).toHaveLength(1);
      expect(result.newTeams).toContain('NonExistentTeam');
    });

    it('rejects rows with empty team', () => {
      const rows: RawRow[] = [{ Team: '', Function: 'E-Com' }];
      const result = service.validateTeamMembership(rows, validTeams);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('required');
      expect(result.newTeams).toHaveLength(0);
    });

    it('rejects rows with null team', () => {
      const rows: RawRow[] = [{ Team: null, Function: 'E-Com' }];
      const result = service.validateTeamMembership(rows, validTeams);
      expect(result.errors).toHaveLength(1);
      expect(result.newTeams).toHaveLength(0);
    });

    it('collects up to 100 errors maximum for empty teams', () => {
      const rows: RawRow[] = Array.from({ length: 150 }, () => ({
        Team: '',
        Function: 'E-Com',
      }));
      const result = service.validateTeamMembership(rows, validTeams);
      expect(result.errors).toHaveLength(100);
    });

    it('deduplicates new team names', () => {
      const rows: RawRow[] = [
        { Team: 'NewTeamA', Function: 'E-Com' },
        { Team: 'NewTeamA', Function: 'E-Com' },
        { Team: 'NewTeamB', Function: 'E-Com' },
        { Team: 'NewTeamB', Function: 'E-Com' },
        { Team: 'NewTeamB', Function: 'E-Com' },
      ];
      const result = service.validateTeamMembership(rows, validTeams);
      expect(result.errors).toHaveLength(0);
      expect(result.newTeams).toHaveLength(2);
      expect(result.newTeams).toContain('NewTeamA');
      expect(result.newTeams).toContain('NewTeamB');
    });

    it('separates errors and newTeams correctly for mixed rows', () => {
      const rows: RawRow[] = [
        { Team: 'Retail', Function: 'E-Com' },       // registered → no error, not new
        { Team: '', Function: 'E-Com' },              // empty → error
        { Team: 'NewTeam', Function: 'E-Com' },       // unregistered → new team
        { Team: null, Function: 'E-Com' },            // null → error
        { Team: 'AnotherNew', Function: 'E-Com' },    // unregistered → new team
      ];
      const result = service.validateTeamMembership(rows, validTeams);
      expect(result.errors).toHaveLength(2);
      expect(result.newTeams).toHaveLength(2);
      expect(result.newTeams).toContain('NewTeam');
      expect(result.newTeams).toContain('AnotherNew');
    });
  });

  // ─── validateDropdowns ─────────────────────────────────────────────────────

  describe('validateDropdowns', () => {
    const config: DropdownConfig = {
      productionStatus: ['Live', 'In Progress', 'Blocked'],
      storyStatus: ['Done', 'In Development', 'UAT'],
      delayReason: ['Dependency', 'Resource Shortage', 'Scope Change'],
    };

    it('accepts rows with valid dropdown values (exact case)', () => {
      const rows: RawRow[] = [
        { 'Production Status': 'Live', 'Story Status': 'Done', 'Delay Reason': 'Dependency' },
      ];
      const errors = service.validateDropdowns(rows, config);
      expect(errors).toHaveLength(0);
    });

    it('accepts dropdown values case-insensitively', () => {
      const rows: RawRow[] = [
        { 'Production Status': 'LIVE', 'Story Status': 'done', 'Delay Reason': 'DEPENDENCY' },
      ];
      const errors = service.validateDropdowns(rows, config);
      expect(errors).toHaveLength(0);
    });

    it('rejects invalid Production Status', () => {
      const rows: RawRow[] = [
        { 'Production Status': 'InvalidStatus', 'Story Status': 'Done', 'Delay Reason': '' },
      ];
      const errors = service.validateDropdowns(rows, config);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('Production Status');
    });

    it('rejects empty Production Status (mandatory)', () => {
      const rows: RawRow[] = [
        { 'Production Status': '', 'Story Status': 'Done', 'Delay Reason': '' },
      ];
      const errors = service.validateDropdowns(rows, config);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('Production Status');
      expect(errors[0].message).toContain('mandatory');
    });

    it('rejects empty Story Status (mandatory)', () => {
      const rows: RawRow[] = [
        { 'Production Status': 'Live', 'Story Status': '', 'Delay Reason': '' },
      ];
      const errors = service.validateDropdowns(rows, config);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('Story Status');
      expect(errors[0].message).toContain('mandatory');
    });

    it('accepts empty Delay Reason (optional)', () => {
      const rows: RawRow[] = [
        { 'Production Status': 'Live', 'Story Status': 'Done', 'Delay Reason': '' },
      ];
      const errors = service.validateDropdowns(rows, config);
      expect(errors).toHaveLength(0);
    });

    it('accepts null Delay Reason (optional)', () => {
      const rows: RawRow[] = [
        { 'Production Status': 'Live', 'Story Status': 'Done', 'Delay Reason': null },
      ];
      const errors = service.validateDropdowns(rows, config);
      expect(errors).toHaveLength(0);
    });

    it('rejects invalid Delay Reason when provided', () => {
      const rows: RawRow[] = [
        { 'Production Status': 'Live', 'Story Status': 'Done', 'Delay Reason': 'InvalidReason' },
      ];
      const errors = service.validateDropdowns(rows, config);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('Delay Reason');
    });

    it('collects up to 100 errors maximum', () => {
      const rows: RawRow[] = Array.from({ length: 50 }, () => ({
        'Production Status': 'Invalid',
        'Story Status': 'Invalid',
        'Delay Reason': 'Invalid',
      }));
      const errors = service.validateDropdowns(rows, config);
      expect(errors.length).toBeLessThanOrEqual(100);
    });
  });

  // ─── validateFieldTypes ────────────────────────────────────────────────────

  describe('validateFieldTypes', () => {
    it('accepts a valid row with all field types correct', () => {
      const rows: RawRow[] = [
        {
          'S.No': 1,
          'Function': 'E-Com',
          'Team': 'Retail',
          'Item / Story Name': 'Story 1',
          'Walkthrough Given to Development Team': '25-12-2024',
          'JIRA ID': 'ECOM-1234',
          'Dev Start Date': '01-01-2024',
          'Dev Complete Date': '15-01-2024',
          'With AI (Story Points)': 5,
          'UAT Delivery Date': '20-01-2024',
          'UAT Delivery Target': '18-01-2024',
          'Resources': 'John, Jane',
          'Go Live Planned Date': '01-02-2024',
          'Go Live Date': '02-02-2024',
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
          'UAT Start Date': '16-01-2024',
          'UAT Complete Date': '19-01-2024',
          'Delay Reason': 'Dependency',
          'Delay Reason Description': 'Waiting on API team',
        },
      ];
      const errors = service.validateFieldTypes(rows);
      expect(errors).toHaveLength(0);
    });

    it('rejects invalid JIRA ID pattern', () => {
      const rows: RawRow[] = [makeValidRow({ 'JIRA ID': 'invalid-id' })];
      const errors = service.validateFieldTypes(rows);
      const jiraError = errors.find((e) => e.field === 'JIRA ID');
      expect(jiraError).toBeDefined();
      expect(jiraError!.row).toBe(1);
    });

    it('rejects empty JIRA ID', () => {
      const rows: RawRow[] = [makeValidRow({ 'JIRA ID': '' })];
      const errors = service.validateFieldTypes(rows);
      const jiraError = errors.find((e) => e.field === 'JIRA ID');
      expect(jiraError).toBeDefined();
      expect(jiraError!.message).toContain('required');
    });

    it('rejects invalid date format', () => {
      const rows: RawRow[] = [makeValidRow({ 'Dev Start Date': '12/25/2024' })];
      const errors = service.validateFieldTypes(rows);
      const dateError = errors.find((e) => e.field === 'Dev Start Date');
      expect(dateError).toBeDefined();
    });

    it('accepts Excel serial number as date', () => {
      const rows: RawRow[] = [makeValidRow({ 'Dev Start Date': 45300 })];
      const errors = service.validateFieldTypes(rows);
      const dateError = errors.find((e) => e.field === 'Dev Start Date');
      expect(dateError).toBeUndefined();
    });

    it('rejects negative numeric value', () => {
      const rows: RawRow[] = [makeValidRow({ 'With AI (Story Points)': -5 })];
      const errors = service.validateFieldTypes(rows);
      const numError = errors.find((e) => e.field === 'With AI (Story Points)');
      expect(numError).toBeDefined();
      expect(numError!.message).toContain('non-negative');
    });

    it('rejects numeric value exceeding 99999.99', () => {
      const rows: RawRow[] = [makeValidRow({ 'Actual Effort': 100000 })];
      const errors = service.validateFieldTypes(rows);
      const numError = errors.find((e) => e.field === 'Actual Effort');
      expect(numError).toBeDefined();
      expect(numError!.message).toContain('99999.99');
    });

    it('rejects invalid Y/N value', () => {
      const rows: RawRow[] = [makeValidRow({ 'Rollback (Y/N)': 'Maybe' })];
      const errors = service.validateFieldTypes(rows);
      const ynError = errors.find((e) => e.field === 'Rollback (Y/N)');
      expect(ynError).toBeDefined();
    });

    it('accepts lowercase y/n values', () => {
      const rows: RawRow[] = [makeValidRow({ 'Rollback (Y/N)': 'y', 'AI Used (Y/N)': 'n' })];
      const errors = service.validateFieldTypes(rows);
      const ynErrors = errors.filter(
        (e) => e.field === 'Rollback (Y/N)' || e.field === 'AI Used (Y/N)'
      );
      expect(ynErrors).toHaveLength(0);
    });

    it('rejects text exceeding max length', () => {
      const longText = 'a'.repeat(501);
      const rows: RawRow[] = [makeValidRow({ 'Item / Story Name': longText })];
      const errors = service.validateFieldTypes(rows);
      const textError = errors.find((e) => e.field === 'Item / Story Name');
      expect(textError).toBeDefined();
      expect(textError!.message).toContain('500');
    });

    it('rejects Delay Reason Description exceeding 2000 chars', () => {
      const longText = 'a'.repeat(2001);
      const rows: RawRow[] = [makeValidRow({ 'Delay Reason Description': longText })];
      const errors = service.validateFieldTypes(rows);
      const textError = errors.find((e) => e.field === 'Delay Reason Description');
      expect(textError).toBeDefined();
      expect(textError!.message).toContain('2000');
    });

    it('rejects S.No exceeding 99999', () => {
      const rows: RawRow[] = [makeValidRow({ 'S.No': 100000 })];
      const errors = service.validateFieldTypes(rows);
      const snoError = errors.find((e) => e.field === 'S.No');
      expect(snoError).toBeDefined();
    });

    it('rejects non-integer S.No', () => {
      const rows: RawRow[] = [makeValidRow({ 'S.No': 1.5 })];
      const errors = service.validateFieldTypes(rows);
      const snoError = errors.find((e) => e.field === 'S.No');
      expect(snoError).toBeDefined();
    });

    it('accepts empty/null optional fields', () => {
      const rows: RawRow[] = [
        makeValidRow({
          'S.No': null,
          'Walkthrough Given to Development Team': null,
          'Dev Start Date': '',
          'Resources': null,
          'Rollback (Y/N)': '',
          'With AI (Story Points)': null,
        }),
      ];
      const errors = service.validateFieldTypes(rows);
      expect(errors).toHaveLength(0);
    });

    it('collects up to 100 errors maximum', () => {
      // Create rows with multiple errors each
      const rows: RawRow[] = Array.from({ length: 50 }, () =>
        makeValidRow({
          'JIRA ID': 'invalid',
          'Dev Start Date': 'bad-date',
          'With AI (Story Points)': -1,
        })
      );
      const errors = service.validateFieldTypes(rows);
      expect(errors.length).toBeLessThanOrEqual(100);
    });
  });

  // ─── validateNonEmptyData ──────────────────────────────────────────────────

  describe('validateNonEmptyData', () => {
    it('accepts non-empty row array', () => {
      const rows: RawRow[] = [{ 'S.No': 1 }];
      const errors = service.validateNonEmptyData(rows);
      expect(errors).toHaveLength(0);
    });

    it('rejects empty row array', () => {
      const errors = service.validateNonEmptyData([]);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('data');
    });
  });
});

/**
 * Helper: creates a valid row with overrides for testing specific field failures.
 */
function makeValidRow(overrides: Partial<RawRow> = {}): RawRow {
  const base: RawRow = {
    'S.No': 1,
    'Function': 'E-Com',
    'Team': 'Retail',
    'Item / Story Name': 'Test Story',
    'Walkthrough Given to Development Team': '01-01-2024',
    'JIRA ID': 'ECOM-1234',
    'Dev Start Date': '01-01-2024',
    'Dev Complete Date': '15-01-2024',
    'With AI (Story Points)': 5,
    'UAT Delivery Date': '20-01-2024',
    'UAT Delivery Target': '18-01-2024',
    'Resources': 'Dev1',
    'Go Live Planned Date': '01-02-2024',
    'Go Live Date': '02-02-2024',
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
    'UAT Start Date': '16-01-2024',
    'UAT Complete Date': '19-01-2024',
    'Delay Reason': null,
    'Delay Reason Description': null,
  };
  return { ...base, ...overrides };
}
