import { z } from 'zod';

/**
 * Validates date values from Excel. Accepts:
 * - Strings in DD-MM-YYYY or ISO 8601 (YYYY-MM-DD) format
 * - Strings in DD-MMM-YY or DD-MMM-YYYY format (e.g., "30-Apr-26", "30-Apr-2026")
 * - Numbers representing Excel serial date values (e.g., 46142)
 * - null/empty values
 */
export const dateStringSchema = z.union([
  z.number(), // Excel serial date number
  z.string().refine(
    (val) =>
      /^\d{2}-\d{2}-\d{4}$/.test(val) || // DD-MM-YYYY
      /^\d{4}-\d{2}-\d{2}/.test(val) || // ISO 8601
      /^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(val), // DD-MMM-YY or DD-MMM-YYYY
    { message: 'Date must be in DD-MM-YYYY, ISO 8601, DD-MMM-YY, or an Excel serial number' }
  ),
]);

/**
 * Zod schema for validating a single row of Excel upload data.
 * Updated to match the actual Excel file structure:
 * - Sno can be null (only first row in grouped data has it)
 * - JIRA ID pattern allows alphanumeric project keys (e.g., SPS1-12456)
 * - Date fields accept Excel serial numbers or various string formats
 * - "Estimated Effort With AI (SP)" is story points (new field)
 * - Many fields are nullable since real data has sparse population
 */
export const excelRowSchema = z.object({
  sno: z.number().int().positive().max(99999).nullable().default(null),
  team: z.string().min(1).max(500),
  track: z.string().min(1).max(500),
  project: z.string().min(1).max(500),
  status: z.string().max(500).nullable().default(null),
  itemsList: z.string().max(2000).nullable().default(null),
  walkthroughGivenOn: dateStringSchema.nullable().default(null),
  jiraId: z.string().min(1).regex(/^[A-Z0-9]+-\d+$/, 'Must match JIRA project key pattern (e.g., SPS1-12456)'),
  estimatedEffortWithAi: z.number().min(0).max(999).nullable().default(null),
  estimatedEffortWithoutAi: z.number().min(0).max(9999).nullable().default(null),
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
