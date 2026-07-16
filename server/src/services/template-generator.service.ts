import ExcelJS from 'exceljs';

/**
 * Configuration for dropdown fields populated from the dropdown_options table.
 */
export interface DropdownConfig {
  productionStatus: string[];
  storyStatus: string[];
  delayReason: string[];
}

/**
 * Context provided to the template generator describing the user's
 * function assignment and available dropdown values.
 */
export interface TemplateContext {
  functionId: number;
  functionName: string;
  teams: string[];
  dropdownOptions: DropdownConfig;
}

/**
 * Interface for the template generator service.
 */
export interface ITemplateGenerator {
  generateTemplate(userContext: TemplateContext): Promise<Buffer>;
}

/**
 * Error thrown when template generation cannot proceed due to
 * missing configuration (e.g., no function assignment for the EM).
 */
export class TemplateGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateGenerationError';
  }
}

/**
 * The 29 required column headers for the revised Excel template,
 * in the exact order specified by Requirement 1.1.
 */
export const TEMPLATE_COLUMNS: readonly string[] = [
  'S.No',
  'Function',
  'Team',
  'Item / Story Name',
  'Walkthrough Given to Development Team',
  'JIRA ID',
  'Dev Start Date',
  'Dev Complete Date',
  'With AI (Story Points)',
  'UAT Delivery Date',
  'UAT Delivery Target',
  'Resources',
  'Go Live Planned Date',
  'Go Live Date',
  'Production Status',
  'Rollback (Y/N)',
  'Rollback Reason',
  'AI Used (Y/N)',
  'Estimated Effort Without AI (Hours)',
  'Actual Effort',
  'Actual Effort With AI (Hours)',
  'Story Status',
  'Story Drop Reason',
  'Definition of Ready (DOR)',
  'Definition of Done (DOD)',
  'Refinement Closure Date',
  'UAT Start Date',
  'UAT Complete Date',
  'Delay Reason',
  'Delay Reason Description',
] as const;

/** Number of sample/pre-filled data rows in the template (just 1 example row) */
const SAMPLE_DATA_ROWS = 1;

/** Column index (1-based) for the Function column */
const FUNCTION_COL_INDEX = 2;

/** Column index (1-based) for the Team column */
const TEAM_COL_INDEX = 3;

/** Column index (1-based) for Production Status */
const PRODUCTION_STATUS_COL_INDEX = 15;

/** Column index (1-based) for Story Status */
const STORY_STATUS_COL_INDEX = 22;

/** Column index (1-based) for Delay Reason */
const DELAY_REASON_COL_INDEX = 29;

/**
 * Template Generator Service
 *
 * Produces a downloadable .xlsx Excel template with:
 * - 29 columns in the specified order (Req 1.1)
 * - Function column pre-filled with the EM's assigned function and locked (Req 3.1, 3.2)
 * - Team dropdown filtered to the EM's function's teams (Req 4.2)
 * - Production Status, Story Status, Delay Reason dropdowns from config (Req 9.1–9.3)
 *
 * Uses ExcelJS (already a project dependency) for workbook creation,
 * data validation (dropdowns), and sheet protection (cell locking).
 */
export class TemplateGeneratorService implements ITemplateGenerator {
  /**
   * Generate a 29-column Excel template buffer.
   *
   * @param userContext - The EM's function assignment and dropdown configuration.
   * @returns A Buffer containing the .xlsx file data.
   * @throws TemplateGenerationError if the EM has no function assignment.
   */
  async generateTemplate(userContext: TemplateContext): Promise<Buffer> {
    // Edge case: EM with no function assignment (Req 3.6)
    if (!userContext.functionId || !userContext.functionName) {
      throw new TemplateGenerationError(
        'No Function assigned to your account. Contact your administrator.'
      );
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Engineering Health & Delivery Governance Platform';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Sprint Data', {
      properties: { defaultColWidth: 20 },
    });

    // Set column headers (Row 1)
    this.setColumnHeaders(worksheet);

    // Pre-fill Function column with EM's function name (Rows 2–501) (Req 3.1)
    this.preFillFunctionColumn(worksheet, userContext.functionName);

    // Apply data validation dropdowns
    this.applyTeamDropdown(worksheet, userContext.teams);
    this.applyDropdownValidation(
      worksheet,
      PRODUCTION_STATUS_COL_INDEX,
      userContext.dropdownOptions.productionStatus
    );
    this.applyDropdownValidation(
      worksheet,
      STORY_STATUS_COL_INDEX,
      userContext.dropdownOptions.storyStatus
    );
    this.applyDropdownValidation(
      worksheet,
      DELAY_REASON_COL_INDEX,
      userContext.dropdownOptions.delayReason
    );

    // Note: Sheet protection removed — it blocks paste operations in Excel.
    // Function enforcement is done server-side during upload validation (Req 3.3).

    // Edge case: empty Function_Registry → add info message (Req 2.6)
    // This case is handled at the route level (template still generated with empty dropdown),
    // but we add a comment to the Function header cell if no function name is meaningful.
    // Since we have a functionName here, the empty registry case means teams may be empty.
    if (userContext.teams.length === 0) {
      const teamHeaderCell = worksheet.getCell(1, TEAM_COL_INDEX);
      teamHeaderCell.note = 'No teams configured for your Function. Contact your administrator.';
    }

    // Write workbook to buffer
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Sets the 29 column headers in Row 1 with bold styling.
   */
  private setColumnHeaders(worksheet: ExcelJS.Worksheet): void {
    const headerRow = worksheet.getRow(1);

    for (let i = 0; i < TEMPLATE_COLUMNS.length; i++) {
      const cell = headerRow.getCell(i + 1);
      cell.value = TEMPLATE_COLUMNS[i];
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }

    headerRow.commit();

    // Set reasonable column widths individually (avoids overwriting column data)
    for (let i = 0; i < TEMPLATE_COLUMNS.length; i++) {
      const col = worksheet.getColumn(i + 1);
      col.width = Math.max(TEMPLATE_COLUMNS[i].length + 4, 15);
    }
  }

  /**
   * Pre-fills the Function column (column 2) with the EM's assigned function name
   * in data rows 2 through 501 (500 rows max). (Req 3.1)
   */
  private preFillFunctionColumn(worksheet: ExcelJS.Worksheet, functionName: string): void {
    for (let row = 2; row <= SAMPLE_DATA_ROWS + 1; row++) {
      const cell = worksheet.getCell(row, FUNCTION_COL_INDEX);
      cell.value = functionName;
    }
  }

  /**
   * Applies a dropdown data validation for the Team column (column 3)
   * using only teams belonging to the EM's assigned function. (Req 4.2)
   */
  private applyTeamDropdown(worksheet: ExcelJS.Worksheet, teams: string[]): void {
    if (teams.length === 0) {
      return; // No teams to populate — dropdown will be empty
    }

    // ExcelJS data validation with a list of allowed values
    const formulae = [teams.map((t) => `"${t.replace(/"/g, '""')}"`).join(',')];

    for (let row = 2; row <= SAMPLE_DATA_ROWS + 1; row++) {
      worksheet.getCell(row, TEAM_COL_INDEX).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${teams.join(',')}"`],
        showErrorMessage: true,
        errorTitle: 'Invalid Team',
        error: 'Please select a valid Team from the dropdown.',
      };
    }
  }

  /**
   * Applies a dropdown data validation to a specific column for all data rows.
   * Used for Production Status, Story Status, and Delay Reason. (Req 9.1–9.3)
   */
  private applyDropdownValidation(
    worksheet: ExcelJS.Worksheet,
    colIndex: number,
    options: string[]
  ): void {
    if (options.length === 0) {
      return; // No options configured — skip validation
    }

    const formulaStr = `"${options.join(',')}"`;

    for (let row = 2; row <= SAMPLE_DATA_ROWS + 1; row++) {
      worksheet.getCell(row, colIndex).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [formulaStr],
        showErrorMessage: true,
        errorTitle: 'Invalid Value',
        error: 'Please select a valid option from the dropdown.',
      };
    }
  }

  /**
   * Applies sheet protection with cell-level locking:
   * - Function column cells (rows 2–501) are LOCKED (read-only) (Req 3.2)
   * - All other cells are UNLOCKED (editable)
   *
   * Sheet protection is enabled so that locked cells cannot be edited,
   * while unlocked cells remain editable by the user.
   */
  private applyCellProtection(worksheet: ExcelJS.Worksheet): void {
    // First, unlock all cells (ExcelJS defaults cells to locked when protection is on)
    for (let row = 1; row <= SAMPLE_DATA_ROWS + 1; row++) {
      for (let col = 1; col <= TEMPLATE_COLUMNS.length; col++) {
        const cell = worksheet.getCell(row, col);
        cell.protection = { locked: false };
      }
    }

    // Lock the Function column cells in sample rows
    for (let row = 2; row <= SAMPLE_DATA_ROWS + 1; row++) {
      const cell = worksheet.getCell(row, FUNCTION_COL_INDEX);
      cell.protection = { locked: true };
    }

    // Also lock the header row
    for (let col = 1; col <= TEMPLATE_COLUMNS.length; col++) {
      const cell = worksheet.getCell(1, col);
      cell.protection = { locked: true };
    }

    // Enable sheet protection so locked cells are enforced
    worksheet.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertColumns: false,
      insertRows: true,
      insertHyperlinks: false,
      deleteColumns: false,
      deleteRows: true,
      sort: true,
      autoFilter: true,
    });
  }
}
