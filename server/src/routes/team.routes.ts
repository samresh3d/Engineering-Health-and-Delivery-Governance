import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { TeamRepository } from '../repositories/team.repository.js';
import { FunctionRepository } from '../repositories/function.repository.js';
import { createTeamSchema, renameTeamSchema } from '../validators/team.validators.js';

const router = Router();

let _teamRepo: TeamRepository | null = null;
function getTeamRepo(): TeamRepository {
  if (!_teamRepo) {
    _teamRepo = new TeamRepository();
  }
  return _teamRepo;
}

let _functionRepo: FunctionRepository | null = null;
function getFunctionRepo(): FunctionRepository {
  if (!_functionRepo) {
    _functionRepo = new FunctionRepository();
  }
  return _functionRepo;
}

/**
 * Maps Zod validation errors to field-level error details.
 */
function mapZodErrors(error: ZodError): Array<{ field: string; message: string }> {
  return error.errors.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * GET /functions/:functionId/teams
 * List all teams for a given function. Super_Admin only (enforced by RBAC middleware on /api/admin/*).
 * Returns 404 if the parent function does not exist.
 */
router.get('/functions/:functionId/teams', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const functionId = Number(req.params.functionId);

    if (isNaN(functionId)) {
      res.status(400).json({
        error: 'Validation failed',
        details: [{ field: 'functionId', message: 'functionId must be a valid number' }],
      });
      return;
    }

    // Verify parent function exists
    const func = getFunctionRepo().getById(functionId);
    if (!func) {
      res.status(404).json({ error: 'Function not found' });
      return;
    }

    const teams = getTeamRepo().getByFunction(functionId);
    res.json({ teams });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /functions/:functionId/teams
 * Create a new team under the specified function. Super_Admin only.
 * Returns 404 if parent function does not exist.
 * Returns 409 if a team with the same name already exists in this function.
 * Returns 400 on validation failure.
 */
router.post('/functions/:functionId/teams', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const functionId = Number(req.params.functionId);

    if (isNaN(functionId)) {
      res.status(400).json({
        error: 'Validation failed',
        details: [{ field: 'functionId', message: 'functionId must be a valid number' }],
      });
      return;
    }

    const parsed = createTeamSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: mapZodErrors(parsed.error),
      });
      return;
    }

    const { name } = parsed.data;

    const team = getTeamRepo().create(name, functionId);
    res.status(201).json(team);
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'Parent Function does not exist') {
        res.status(404).json({ error: 'Parent Function does not exist' });
        return;
      }
      if (error.message === 'A Team with this name already exists in this Function') {
        res.status(409).json({ error: 'A Team with this name already exists in this Function' });
        return;
      }
      if (error.message === 'Team name must not be empty or whitespace-only' ||
          error.message === 'Team name must not exceed 100 characters') {
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
 * PUT /teams/:id
 * Rename an existing team. Super_Admin only.
 * Returns 404 if team not found.
 * Returns 409 if the new name duplicates an existing team in the same function.
 * Returns 400 on validation failure.
 */
router.put('/teams/:id', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const id = Number(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({
        error: 'Validation failed',
        details: [{ field: 'id', message: 'id must be a valid number' }],
      });
      return;
    }

    const parsed = renameTeamSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: mapZodErrors(parsed.error),
      });
      return;
    }

    const { name } = parsed.data;

    const team = getTeamRepo().rename(id, name);
    res.json(team);
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'Team not found') {
        res.status(404).json({ error: 'Team not found' });
        return;
      }
      if (error.message === 'A Team with this name already exists in this Function') {
        res.status(409).json({ error: 'A Team with this name already exists in this Function' });
        return;
      }
      if (error.message === 'Team name must not be empty or whitespace-only' ||
          error.message === 'Team name must not exceed 100 characters') {
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
 * DELETE /teams/:id
 * Delete a team by ID. Super_Admin only.
 * Returns 404 if team not found.
 * Returns 409 if team has associated sprint data entries.
 */
router.delete('/teams/:id', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const id = Number(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({
        error: 'Validation failed',
        details: [{ field: 'id', message: 'id must be a valid number' }],
      });
      return;
    }

    getTeamRepo().delete(id);
    res.json({ success: true, id });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'Team not found') {
        res.status(404).json({ error: 'Team not found' });
        return;
      }
      if (error.message === 'Cannot delete: Team has associated sprint data entries') {
        res.status(409).json({ error: 'Cannot delete: Team has associated sprint data entries' });
        return;
      }
    }
    next(error);
  }
});

export default router;
