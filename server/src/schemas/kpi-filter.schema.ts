import { z } from 'zod';

/**
 * Zod schema for validating KPI filter query parameters.
 * All fields are optional — when omitted, no filtering is applied for that dimension.
 * Date fields must be in ISO 8601 format (YYYY-MM-DD).
 */
export const kpiFilterSchema = z.object({
  portfolio: z.string().optional(),
  team: z.string().optional(),
  project: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
});

/** Inferred TypeScript type from the kpiFilterSchema */
export type KpiFilter = z.infer<typeof kpiFilterSchema>;
