import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  TemplateGeneratorService,
  TemplateGenerationError,
  TEMPLATE_COLUMNS,
  type TemplateContext,
} from '../../services/template-generator.service.js';

/**
 * Helper: creates a standard TemplateContext for testing.
 */
function createTestContext(overrides?: Partial<TemplateContext>): TemplateContext {
  return {
    functionId: 1,
    functionName: 'E-Com',
    teams: ['Retail', 'Claims', 'Customer Journey'],
    dropdownOptions: {
      productionStatus: ['Deployed to Production', 'In Progress', 'Ready for Production'],
      storyStatus: ['Completed', 'In Progress', 'Not Started'],
      delayReason: ['Dependency on other team', 'Resource unavailability'],
    },
    ...overrides,
  };
}

/**
 * Helper: generates template and returns the parsed worksheet.
 */
async function generateAndParse(context: TemplateContext): Promise<ExcelJS.Worksheet> {
  const service = new TemplateGeneratorService();
  const buffer = await service.generateTemplate(context);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.getWorksheet('Sprint Data');
  if (!worksheet) {
    throw new Error('Worksheet "Sprint Data" not found in generated workbook');
  }
  return worksheet;
}

describe('TemplateGeneratorService', () => {
  describe('Column Structure (Requirement 1.1)', () => {
    it('should generate all column headers in the specified order', async () => {
      const context = createTestContext();
      const worksheet = await generateAndParse(context);

      const headerRow = worksheet.getRow(1);
      const headers: string[] = [];

      for (let col = 1; col <= TEMPLATE_COLUMNS.length; col++) {
        const cell = headerRow.getCell(col);
        headers.push(cell.value as string);
      }

      expect(headers).toEqual([...TEMPLATE_COLUMNS]);
      expect(headers.length).toBe(TEMPLATE_COLUMNS.length);
    });

    it('should have bold header formatting', async () => {
      const context = createTestContext();
      const worksheet = await generateAndParse(context);

      const headerRow = worksheet.getRow(1);
      const firstCell = headerRow.getCell(1);
      expect(firstCell.font?.bold).toBe(true);
    });
  });

  describe('Function Pre-fill (Requirement 3.1)', () => {
    it('should pre-fill Function column with EM assigned function name in rows 2-501', async () => {
      const context = createTestContext({ functionName: 'MPro' });
      const worksheet = await generateAndParse(context);

      // Check first data row
      expect(worksheet.getCell(2, 2).value).toBe('MPro');

      // Check last data row
      expect(worksheet.getCell(501, 2).value).toBe('MPro');

      // Check a middle row
      expect(worksheet.getCell(250, 2).value).toBe('MPro');
    });

    it('should not pre-fill beyond row 501', async () => {
      const context = createTestContext({ functionName: 'E-Com' });
      const worksheet = await generateAndParse(context);

      // Row 502 should not have a value (beyond 500 data rows)
      const cell502 = worksheet.getCell(502, 2);
      expect(cell502.value).toBeNull();
    });
  });

  describe('Cell Protection (Requirement 3.2)', () => {
    it('should lock Function column cells in data rows', async () => {
      const context = createTestContext();
      // Generate but don't round-trip — verify directly on the service's internal workbook
      const service = new TemplateGeneratorService();
      const buffer = await service.generateTemplate(context);

      // Parse back and verify — ExcelJS preserves protection via sheetProtection + style
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const worksheet = workbook.getWorksheet('Sprint Data')!;

      // Function column (col 2) data rows should be locked
      const cell = worksheet.getCell(2, 2);
      // ExcelJS stores lock status in the style's protection property
      expect(cell.protection?.locked).not.toBe(false);
    });

    it('should unlock non-Function data cells', async () => {
      const context = createTestContext();
      const worksheet = await generateAndParse(context);

      // Team column (col 3) should be unlocked in data rows
      const teamCell = worksheet.getCell(2, 3);
      expect(teamCell.protection?.locked).toBe(false);

      // JIRA ID column (col 6) should be unlocked
      const jiraCell = worksheet.getCell(2, 6);
      expect(jiraCell.protection?.locked).toBe(false);
    });

    it('should lock header row cells', async () => {
      const context = createTestContext();
      const worksheet = await generateAndParse(context);

      // Header cells should not be explicitly unlocked (i.e., locked by default under protection)
      const headerCell = worksheet.getCell(1, 1);
      expect(headerCell.protection?.locked).not.toBe(false);
    });

    it('should enable sheet protection', async () => {
      const context = createTestContext();
      const worksheet = await generateAndParse(context);

      // ExcelJS stores sheet protection state
      expect(worksheet.sheetProtection).toBeDefined();
    });
  });

  describe('Team Dropdown (Requirement 4.2)', () => {
    it('should apply Team dropdown with function-specific teams', async () => {
      const context = createTestContext({ teams: ['Retail', 'Claims'] });
      const worksheet = await generateAndParse(context);

      const cell = worksheet.getCell(2, 3); // Team column, first data row
      expect(cell.dataValidation).toBeDefined();
      expect(cell.dataValidation?.type).toBe('list');
      expect(cell.dataValidation?.formulae?.[0]).toContain('Retail');
      expect(cell.dataValidation?.formulae?.[0]).toContain('Claims');
    });

    it('should not apply Team dropdown when teams array is empty', async () => {
      const context = createTestContext({ teams: [] });
      const worksheet = await generateAndParse(context);

      const cell = worksheet.getCell(2, 3);
      expect(cell.dataValidation).toBeUndefined();
    });
  });

  describe('Dropdown Validations (Requirements 9.1, 9.2, 9.3)', () => {
    it('should apply Production Status dropdown in column 15', async () => {
      const context = createTestContext();
      const worksheet = await generateAndParse(context);

      const cell = worksheet.getCell(2, 15);
      expect(cell.dataValidation).toBeDefined();
      expect(cell.dataValidation?.type).toBe('list');
      expect(cell.dataValidation?.formulae?.[0]).toContain('Deployed to Production');
    });

    it('should apply Story Status dropdown in column 22', async () => {
      const context = createTestContext();
      const worksheet = await generateAndParse(context);

      const cell = worksheet.getCell(2, 22);
      expect(cell.dataValidation).toBeDefined();
      expect(cell.dataValidation?.type).toBe('list');
      expect(cell.dataValidation?.formulae?.[0]).toContain('Completed');
    });

    it('should apply Delay Reason dropdown in column 29', async () => {
      const context = createTestContext();
      const worksheet = await generateAndParse(context);

      const cell = worksheet.getCell(2, 29);
      expect(cell.dataValidation).toBeDefined();
      expect(cell.dataValidation?.type).toBe('list');
      expect(cell.dataValidation?.formulae?.[0]).toContain('Dependency on other team');
    });

    it('should not apply dropdown when options array is empty', async () => {
      const context = createTestContext({
        dropdownOptions: {
          productionStatus: [],
          storyStatus: ['Completed'],
          delayReason: [],
        },
      });
      const worksheet = await generateAndParse(context);

      // Production Status col 15 — no dropdown
      const psCell = worksheet.getCell(2, 15);
      expect(psCell.dataValidation).toBeUndefined();

      // Story Status col 22 — should have dropdown
      const ssCell = worksheet.getCell(2, 22);
      expect(ssCell.dataValidation).toBeDefined();

      // Delay Reason col 29 — no dropdown
      const drCell = worksheet.getCell(2, 29);
      expect(drCell.dataValidation).toBeUndefined();
    });
  });

  describe('Edge Case: EM with no function assignment (Requirement 3.6)', () => {
    it('should throw TemplateGenerationError when functionId is 0', async () => {
      const service = new TemplateGeneratorService();
      const context = createTestContext({ functionId: 0, functionName: '' });

      await expect(service.generateTemplate(context)).rejects.toThrow(TemplateGenerationError);
      await expect(service.generateTemplate(context)).rejects.toThrow(
        'No Function assigned to your account. Contact your administrator.'
      );
    });

    it('should throw TemplateGenerationError when functionName is empty', async () => {
      const service = new TemplateGeneratorService();
      const context = createTestContext({ functionName: '' });

      await expect(service.generateTemplate(context)).rejects.toThrow(TemplateGenerationError);
    });
  });

  describe('Edge Case: Empty teams (Requirement 2.6)', () => {
    it('should generate template with empty team dropdown and note when no teams configured', async () => {
      const context = createTestContext({ teams: [] });
      const worksheet = await generateAndParse(context);

      // Template should still be generated
      const headerRow = worksheet.getRow(1);
      expect(headerRow.getCell(1).value).toBe('S.No');

      // Team header cell should have a note/comment
      const teamHeaderCell = worksheet.getCell(1, 3);
      expect(teamHeaderCell.note).toContain('No teams configured');
    });
  });

  describe('Output format', () => {
    it('should return a valid Buffer', async () => {
      const service = new TemplateGeneratorService();
      const context = createTestContext();
      const result = await service.generateTemplate(context);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should create a worksheet named "Sprint Data"', async () => {
      const service = new TemplateGeneratorService();
      const context = createTestContext();
      const buffer = await service.generateTemplate(context);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.getWorksheet('Sprint Data');
      expect(worksheet).toBeDefined();
    });
  });
});
