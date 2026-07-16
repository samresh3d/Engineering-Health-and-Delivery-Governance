import { z } from 'zod';

/**
 * Validates date values from Excel uploads. Accepts:
 * - DD-MM-YYYY (e.g., "25-12-2024")
 * - ISO 8601 (e.g., "2024-12-25" or "2024-12-25T00:00:00Z")
 * - DD-MMM-YY (e.g., "25-Dec-24")
 * - DD-MMM-YYYY (e.g., "25-Dec-2024")
 * - Excel serial numbers (e.g., 45651)
 *
 * Validates: Requirements 1.3, 10.3
 */
export const dateStringSchema = z.union([
  z.number().refine(
    (val) => Number.isFinite(val) && val > 0 && val <= 2958465, // Excel serial range: 1 (Jan 1, 1900) to 2958465 (Dec 31, 9999)
    { message: 'Excel serial date must be a positive finite number within valid date range' }
  ),
  z.string().refine(
    (val) => {
      const trimmed = val.trim();
      return (
        /^\d{2}-\d{2}-\d{4}$/.test(trimmed) ||           // DD-MM-YYYY
        /^\d{4}-\d{2}-\d{2}/.test(trimmed) ||            // ISO 8601 (with optional time)
        /^\d{1,2}-[A-Za-z]{3}-\d{2}$/.test(trimmed) ||   // DD-MMM-YY
        /^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(trimmed)      // DD-MMM-YYYY
      );
    },
    { message: 'Date must be in DD-MM-YYYY, ISO 8601, DD-MMM-YY, DD-MMM-YYYY format, or an Excel serial number' }
  ),
]);

/**
 * JIRA ID regex pattern.
 * Matches alphanumeric project key followed by hyphen and numeric identifier.
 * Examples: ECOM-1234, SPS1-12456, ABC-1
 *
 * Validates: Requirement 10.2
 */
export const JIRA_ID_PATTERN = /^[A-Z0-9]+-\d+$/;

/**
 * Case-insensitive Y/N field schema.
 * Accepts "Y", "N", "y", "n" and normalizes to uppercase.
 *
 * Validates: Requirements 1.5, 10.5
 */
export const yesNoSchema = z
  .string()
  .refine(
    (val) => /^[YyNn]$/.test(val.trim()),
    { message: 'Value must be "Y" or "N" (case-insensitive)' }
  )
  .transform((val) => val.trim().toUpperCase() as 'Y' | 'N');

/**
 * Revised Excel row schema for the 29-column Function-Team-Story template.
 *
 * Field validations:
 * - Numeric fields: non-negative, max 99999.99 (Req 10.4)
 * - Y/N fields: case-insensitive "Y" or "N" (Req 10.5)
 * - Text field max lengths: 500 general, 2000 for Delay Reason Description, 100 for Function (Req 1.6, 1.7, 1.8)
 * - JIRA ID: /^[A-Z0-9]+-\d+$/ (Req 10.2)
 * - Dates: multiple formats or Excel serial (Req 10.3)
 *
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 10.1, 10.2, 10.3, 10.4, 10.5
 */
export const revisedExcelRowSchema = z.object({
  // S.No — positive integer, max 99999, nullable (grouped rows may omit)
  sno: z.number().int().positive().max(99999).nullable(),

  // Function — required, max 100 chars (Req 1.8)
  function: z.string().min(1).max(100),

  // Team — required, max 500 chars (Req 1.7)
  team: z.string().min(1).max(500),

  // Item / Story Name — required, max 500 chars (Req 1.7)
  storyName: z.string().min(1).max(500),

  // Walkthrough Given to Development Team — date, nullable
  walkthroughGivenOn: dateStringSchema.nullable(),

  // JIRA ID — required, matches project key pattern (Req 10.2)
  jiraId: z.string().min(1).regex(JIRA_ID_PATTERN, 'Must match JIRA ID pattern (e.g., ECOM-1234)'),

  // Dev Start Date — date, nullable
  devStartDate: dateStringSchema.nullable(),

  // Dev Complete Date — date, nullable
  devCompleteDate: dateStringSchema.nullable(),

  // With AI (Story Points) — non-negative numeric, max 99999.99, nullable (Req 10.4)
  withAiStoryPoints: z.number().min(0).max(99999.99).nullable(),

  // UAT Delivery Date — date, nullable
  uatDeliveryDate: dateStringSchema.nullable(),

  // UAT Delivery Target — date, nullable
  uatDeliveryTarget: dateStringSchema.nullable(),

  // Resources — text, max 500, nullable (Req 1.7)
  resources: z.string().max(500).nullable(),

  // Go Live Planned Date — date, nullable
  goLivePlannedDate: dateStringSchema.nullable(),

  // Go Live Date — date, nullable
  goLiveDate: dateStringSchema.nullable(),

  // Production Status — text, max 100, nullable
  productionStatus: z.string().max(100).nullable(),

  // Rollback (Y/N) — case-insensitive Y/N, nullable (Req 10.5)
  rollback: yesNoSchema.nullable(),

  // Rollback Reason — text, max 500, nullable (Req 1.7)
  rollbackReason: z.string().max(500).nullable(),

  // AI Used (Y/N) — case-insensitive Y/N, nullable (Req 10.5)
  aiUsed: yesNoSchema.nullable(),

  // Estimated Effort Without AI (Hours) — non-negative, max 99999.99, nullable (Req 10.4)
  estimatedEffortWithoutAi: z.number().min(0).max(99999.99).nullable(),

  // Actual Effort — non-negative, max 99999.99, nullable (Req 10.4)
  actualEffort: z.number().min(0).max(99999.99).nullable(),

  // Actual Effort With AI (Hours) — non-negative, max 99999.99, nullable (Req 10.4)
  actualEffortWithAi: z.number().min(0).max(99999.99).nullable(),

  // Story Status — text, max 100, nullable
  storyStatus: z.string().max(100).nullable(),

  // Story Drop Reason — text, max 500, nullable (Req 1.7)
  storyDropReason: z.string().max(500).nullable(),

  // Definition of Ready (DOR) — case-insensitive Y/N, nullable (Req 10.5)
  definitionOfReady: yesNoSchema.nullable(),

  // Definition of Done (DOD) — case-insensitive Y/N, nullable (Req 10.5)
  definitionOfDone: yesNoSchema.nullable(),

  // Refinement Closure Date — date, nullable
  refinementClosureDate: dateStringSchema.nullable(),

  // UAT Start Date — date, nullable
  uatStartDate: dateStringSchema.nullable(),

  // UAT Complete Date — date, nullable
  uatCompleteDate: dateStringSchema.nullable(),

  // Delay Reason — text, max 100, nullable
  delayReason: z.string().max(100).nullable(),

  // Delay Reason Description — text, max 2000, nullable (Req 1.6)
  delayReasonDescription: z.string().max(2000).nullable(),
});

/** Inferred TypeScript type from the revisedExcelRowSchema */
export type RevisedExcelRow = z.infer<typeof revisedExcelRowSchema>;

/** Inferred input type (before transforms are applied) */
export type RevisedExcelRowInput = z.input<typeof revisedExcelRowSchema>;
