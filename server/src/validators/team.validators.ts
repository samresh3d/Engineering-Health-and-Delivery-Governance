import { z } from 'zod';

/**
 * Schema for creating a new Team under a Function.
 * Name must be 1-100 characters after trimming, not blank/whitespace-only.
 */
export const createTeamSchema = z.object({
  name: z
    .string({ required_error: 'name is required' })
    .min(1, 'name must not be empty')
    .max(100, 'name must not exceed 100 characters')
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, { message: 'name must not be empty or whitespace-only' }),
});

/**
 * Schema for renaming an existing Team.
 * Same constraints as create: 1-100 chars, not whitespace-only.
 */
export const renameTeamSchema = z.object({
  name: z
    .string({ required_error: 'name is required' })
    .min(1, 'name must not be empty')
    .max(100, 'name must not exceed 100 characters')
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, { message: 'name must not be empty or whitespace-only' }),
});

export type CreateTeamPayload = z.infer<typeof createTeamSchema>;
export type RenameTeamPayload = z.infer<typeof renameTeamSchema>;
