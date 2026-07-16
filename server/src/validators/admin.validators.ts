import { z } from 'zod';

export const createEntrySchema = z.object({
  team: z.string().min(1, 'team is required'),
  track: z.string().min(1, 'track is required'),
  project: z.string().min(1, 'project is required'),
  portfolio: z.string().min(1, 'portfolio is required'),
  jiraId: z.string().min(1, 'jiraId is required'),
  sno: z.number().nullable().optional(),
  status: z.string().nullable().optional(),
  itemsList: z.string().nullable().optional(),
  walkthroughGivenOn: z.string().nullable().optional(),
  estimatedEffortWithAi: z.number().nullable().optional(),
  estimatedEffortWithoutAi: z.number().nullable().optional(),
  actualEffortWithAi: z.number().nullable().optional(),
  aiUsed: z.enum(['Y', 'N']).nullable().optional(),
  devStartDate: z.string().nullable().optional(),
  devEndDate: z.string().nullable().optional(),
  developmentStatus: z.string().nullable().optional(),
  uatDeliveryDate: z.string().nullable().optional(),
  uatDeliveryTarget: z.string().nullable().optional(),
  resources: z.string().nullable().optional(),
  goLivePlannedDate: z.string().nullable().optional(),
  goLiveDate: z.string().nullable().optional(),
  productionStatus: z.string().nullable().optional(),
  rollback: z.enum(['Y', 'N']).nullable().optional(),
  rollbackReason: z.string().nullable().optional(),
  storyDropReason: z.string().nullable().optional(),
});

export const updateEntrySchema = createEntrySchema.partial();

export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(25),
  offset: z.coerce.number().min(0).default(0),
  sort: z.string().optional(),
});

export type CreateEntryPayload = z.infer<typeof createEntrySchema>;
export type UpdateEntryPayload = z.infer<typeof updateEntrySchema>;
export type PaginationParams = z.infer<typeof paginationSchema>;
