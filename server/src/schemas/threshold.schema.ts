import { z } from 'zod';

/**
 * Zod schema for validating RAG threshold update requests.
 * Used when an Admin updates the threshold configuration for a specific KPI.
 * - kpiName: one of the 9 supported KPIs
 * - greenThreshold / amberThreshold: required numeric boundaries
 * - redThreshold: optional (some KPIs derive red from the other two)
 * - comparisonType: determines classification logic direction
 */
export const thresholdUpdateSchema = z.object({
  kpiName: z.enum([
    'sprint_commitment',
    'release_success_rate',
    'deployment_frequency',
    'capacity_utilization',
    'ai_efficiency',
    'uat_predictability',
    'dev_cycle_time',
    'story_drop_rate',
    'rollback_rate',
  ]),
  greenThreshold: z.number(),
  amberThreshold: z.number(),
  redThreshold: z.number().optional(),
  comparisonType: z.enum(['above', 'below', 'trend']),
});

/** Inferred TypeScript type from the thresholdUpdateSchema */
export type ThresholdUpdate = z.infer<typeof thresholdUpdateSchema>;
