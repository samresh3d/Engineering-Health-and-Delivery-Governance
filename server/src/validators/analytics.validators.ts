import { z } from 'zod';

export const analyticsFilterSchema = z.object({
  team: z.string().optional(),
  engineeringManager: z.string().optional(),
  functionName: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  developmentStatus: z.string().optional(),
  period: z.enum(['month', 'quarter', 'year', 'custom']).optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  { message: 'End date must not be before start date' }
);

export const exportRequestSchema = z.object({
  format: z.enum(['xlsx', 'csv', 'pdf']),
  filter: analyticsFilterSchema,
});

export const auditLogFilterSchema = z.object({
  userId: z.string().optional(),
  action: z.enum(['create', 'update', 'delete']).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  teamId: z.string().optional(),
});

export type AnalyticsFilterInput = z.infer<typeof analyticsFilterSchema>;
export type ExportRequestInput = z.infer<typeof exportRequestSchema>;
export type AuditLogFilterInput = z.infer<typeof auditLogFilterSchema>;
