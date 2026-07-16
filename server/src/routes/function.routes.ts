import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { FunctionRepository } from '../repositories/function.repository.js';

const router = Router();

/**
 * Zod schema for validating Function name input.
 * - 1-100 characters
 * - Only alphanumeric characters, hyphens, spaces, and underscores
 */
const functionNameSchema = z.object({
  name: z
    .string({ required_error: 'name is required' })
    .min(1, 'Function name must be between 1 and 100 characters')
    .max(100, 'Function name must be between 1 and 100 characters')
    .regex(
      /^[a-zA-Z0-9\- _]+$/,
      'Function name must contain only alphanumeric characters, hyphens, spaces, and underscores'
    )
    .refine((val) => val.trim().length > 0, {
      message: 'Function name must not be empty or whitespace-only',
    }),
});

/**
 * Maps Zod validation errors to a details array.
 */
function mapZodErrors(error: z.ZodError): Array<{ field: string; message: string }> {
  return error.errors.map((issue) => ({
    field: issue.path.join('.') || 'name',
    message: issue.message,
  }));
}

let _functionRepo: FunctionRepository | null = null;
function getFunctionRepo(): FunctionRepository {
  if (!_functionRepo) {
    _functionRepo = new FunctionRepository();
  }
  return _functionRepo;
}

/**
 * GET /api/admin/functions
 * List all Functions. Accessible only to Super_Admin (enforced by RBAC middleware on /api/admin/*).
 */
router.get('/', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const functions = getFunctionRepo().getAll();
    res.status(200).json({ functions });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/functions
 * Create a new Function. Validates name with Zod schema.
 * Returns 201 with created record, 400 on validation failure, 409 on duplicate.
 */
router.post('/', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const parsed = functionNameSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: mapZodErrors(parsed.error),
      });
      return;
    }

    const { name } = parsed.data;
    const created = getFunctionRepo().create(name);
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'A Function with this name already exists') {
        res.status(409).json({ error: error.message });
        return;
      }
      if (
        error.message === 'Function name must not be empty or whitespace-only' ||
        error.message === 'Function name must not exceed 100 characters'
      ) {
        res.status(400).json({
          error: 'Validation failed',
          details: [{ field: 'name', message: error.message }],
        });
        return;
      }
    }
    next(error);
  }
});

/**
 * PUT /api/admin/functions/:id
 * Rename an existing Function. Validates name with Zod schema.
 * Returns 200 with updated record, 400 on validation failure, 404 if not found, 409 on duplicate.
 */
router.put('/:id', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const id = Number(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({
        error: 'Validation failed',
        details: [{ field: 'id', message: 'id must be a valid number' }],
      });
      return;
    }

    const parsed = functionNameSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: mapZodErrors(parsed.error),
      });
      return;
    }

    const { name } = parsed.data;
    const updated = getFunctionRepo().rename(id, name);
    res.status(200).json(updated);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Function not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error.message === 'A Function with this name already exists') {
        res.status(409).json({ error: error.message });
        return;
      }
      if (
        error.message === 'Function name must not be empty or whitespace-only' ||
        error.message === 'Function name must not exceed 100 characters'
      ) {
        res.status(400).json({
          error: 'Validation failed',
          details: [{ field: 'name', message: error.message }],
        });
        return;
      }
    }
    next(error);
  }
});

/**
 * DELETE /api/admin/functions/:id
 * Delete a Function. Only succeeds if no Teams are associated.
 * Returns 200 on success, 404 if not found, 409 if has associated Teams.
 */
router.delete('/:id', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const id = Number(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({
        error: 'Validation failed',
        details: [{ field: 'id', message: 'id must be a valid number' }],
      });
      return;
    }

    getFunctionRepo().delete(id);
    res.status(200).json({ success: true, id });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Function not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error.message === 'Cannot delete: Function has associated Teams') {
        res.status(409).json({ error: error.message });
        return;
      }
    }
    next(error);
  }
});

export default router;
