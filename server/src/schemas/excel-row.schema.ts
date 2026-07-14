import { z } from 'zod';

/**
 * Validates date strings in DD-MM-YYYY or ISO 8601 (YYYY-MM-DD) format.
 * Exported for reuse in other modules that need date validation.
 */
export const dateStringSchema = z.string().refine(
  (val) => /^\d{2}-\d{2}-\d{4}$/.test(val) || /^\d{4}-\d{2}-\d{2}/.test(val),
  { message: 'Date must be in DD-MM-YYYY or ISO 8601 format' }
);

/**
 * Zod schema for validating a single row of Excel upload data.
 * Covers all 22 required columns with appropriate type constraints:
 * - Positive integer for Sno (max 99999)
 * - Non-empty strings for team, track, project, jiraId
 * - JIRA ID pattern: uppercase project key + hyphen + digits (e.g., PROJ-123)
 * - Numeric ranges for effort fields
 * - Y/N enums for boolean-like fields
 * - Date format validation for all date fields
 * - Nullable defaults for optional fields
 */
export const excelRowSchema = z.object({
  sno: z.number().int().positive().max(99999),
  team: z.string().min(1).max(500),
  track: z.string().min(1).max(500),
  project: z.string().min(1).max(500),
  status: z.string().max(500).nullable().default(null),
  itemsList: z.string().max(500).nullable().default(null),
  walkthroughGivenOn: dateStringSchema.nullable().default(null),
  jiraId: z.string().min(1).regex(/^[A-Z]+-\d+$/, 'Must match JIRA project key pattern'),
  estimatedEffortWithoutAi: z.number().min(0).max(999).nullable().default(null),
  actualEffortWithAi: z.number().min(0).max(9999).nullable().default(null),
  aiUsed: z.enum(['Y', 'N']).nullable().default(null),
  devStartDate: dateStringSchema.nullable().default(null),
  devEndDate: dateStringSchema.nullable().default(null),
  developmentStatus: z.string().max(500).nullable().default(null),
  uatDeliveryDate: dateStringSchema.nullable().default(null),
  uatDeliveryTarget: dateStringSchema.nullable().default(null),
  resources: z.string().max(500).nullable().default(null),
  goLivePlannedDate: dateStringSchema.nullable().default(null),
  goLiveDate: dateStringSchema.nullable().default(null),
  productionStatus: z.string().max(500).nullable().default(null),
  rollback: z.enum(['Y', 'N']).nullable().default(null),
  rollbackReason: z.string().max(500).nullable().default(null),
  storyDropReason: z.string().max(500).nullable().default(null),
});

/** Inferred TypeScript type from the excelRowSchema */
export type ExcelRow = z.infer<typeof excelRowSchema>;

/** Inferred input type (before defaults are applied) */
export type ExcelRowInput = z.input<typeof excelRowSchema>;
