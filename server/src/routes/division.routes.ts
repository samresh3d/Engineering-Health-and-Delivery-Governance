import { Router, Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/rbac';
import { AuthorizationService } from '../services/authorization.service';
import { DivisionService, DivisionError } from '../services/division.service';
import { divisionResponseMapper } from '../middleware/division-mapper.middleware';
import type { UserContext } from '../types/rbac-analytics.types';

const router = Router();

/**
 * Helper: extract UserContext from the authenticated request.
 */
function getUserContext(req: Request): UserContext {
  const authReq = req as AuthenticatedRequest;
  return {
    userId: authReq.user.userId,
    role: authReq.user.role as UserContext['role'],
    teamId: authReq.user.teamId,
  };
}

/**
 * POST /api/divisions
 *
 * Create a new division within a team.
 * Authorization: Engineering_Manager (own team), Super_Admin (any team)
 *
 * Request body: { team: string; name: string; }
 * Response (201): { id, name, team, projectCount, createdAt }
 * Errors: 400 (validation), 403 (wrong team)
 */
router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userContext = getUserContext(req);
      const { team, name } = req.body;

      if (!team) {
        res.status(400).json({ error: 'Team is required' });
        return;
      }

      // Authorization check
      const authService = new AuthorizationService();
      const authResult = authService.canManageDivisions(userContext, team);
      if (!authResult.permitted) {
        res.status(403).json({ error: authResult.errorMessage });
        return;
      }

      const divisionService = new DivisionService();
      const division = await divisionService.create(team, name ?? '', userContext.userId);

      res.status(201).json({
        id: division.id,
        name: division.name,
        team: division.teamId,
        projectCount: division.projectCount,
        createdAt: division.createdAt,
      });
    } catch (error) {
      if (error instanceof DivisionError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      next(error);
    }
  }
);

/**
 * PUT /api/divisions/:name
 *
 * Rename an existing division.
 * Authorization: Engineering_Manager (own team), Super_Admin (any team)
 *
 * Request body: { team: string; newName: string; }
 * Response (200): { id, name, team, projectCount }
 * Errors: 400 (validation), 403 (wrong team), 404 (not found)
 */
router.put(
  '/:name',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userContext = getUserContext(req);
      const oldName = req.params.name as string;
      const { team, newName } = req.body;

      if (!team) {
        res.status(400).json({ error: 'Team is required' });
        return;
      }

      // Authorization check
      const authService = new AuthorizationService();
      const authResult = authService.canManageDivisions(userContext, team);
      if (!authResult.permitted) {
        res.status(403).json({ error: authResult.errorMessage });
        return;
      }

      const divisionService = new DivisionService();
      const division = await divisionService.rename(team, oldName, newName ?? '', userContext.userId);

      res.status(200).json({
        id: division.id,
        name: division.name,
        team: division.teamId,
        projectCount: division.projectCount,
      });
    } catch (error) {
      if (error instanceof DivisionError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      next(error);
    }
  }
);

/**
 * DELETE /api/divisions/:name
 *
 * Delete a division (only if no projects are assigned).
 * Authorization: Engineering_Manager (own team), Super_Admin (any team)
 *
 * Query: ?team=TeamName
 * Response (204): No content
 * Errors: 400 (has projects), 403 (wrong team), 404 (not found)
 */
router.delete(
  '/:name',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userContext = getUserContext(req);
      const divisionName = req.params.name as string;
      const team = req.query.team as string;

      if (!team) {
        res.status(400).json({ error: 'Team query parameter is required' });
        return;
      }

      // Authorization check
      const authService = new AuthorizationService();
      const authResult = authService.canManageDivisions(userContext, team);
      if (!authResult.permitted) {
        res.status(403).json({ error: authResult.errorMessage });
        return;
      }

      const divisionService = new DivisionService();
      await divisionService.delete(team, divisionName, userContext.userId);

      res.status(204).send();
    } catch (error) {
      if (error instanceof DivisionError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      next(error);
    }
  }
);

/**
 * GET /api/divisions
 *
 * List all divisions for a team.
 * Authorization: Read access check (EM can read own team, Leadership/Super_Admin can read all).
 *
 * Query: ?team=TeamName
 * Response (200): Array of division objects with divisionResponseMapper applied
 */
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userContext = getUserContext(req);
      const team = req.query.team as string;

      if (!team) {
        res.status(400).json({ error: 'Team query parameter is required' });
        return;
      }

      // Read access check
      const authService = new AuthorizationService();
      const authResult = authService.canReadTeamData(userContext, team);
      if (!authResult.permitted) {
        res.status(403).json({ error: authResult.errorMessage });
        return;
      }

      const divisionService = new DivisionService();
      const divisions = await divisionService.listByTeam(team);

      // Apply division response mapper to rename track → division in output
      const mappedDivisions = divisionResponseMapper(divisions);

      res.status(200).json(mappedDivisions);
    } catch (error) {
      if (error instanceof DivisionError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      next(error);
    }
  }
);

/**
 * POST /api/divisions/:name/assign
 *
 * Assign a project to a division within the same team.
 * Authorization: Engineering_Manager (own team), Super_Admin (any team)
 *
 * Request body: { team: string; project: string; }
 * Response (200): { division, project, team }
 * Errors: 400 (project not in team), 403 (wrong team), 404 (division not found)
 */
router.post(
  '/:name/assign',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userContext = getUserContext(req);
      const divisionName = req.params.name as string;
      const { team, project } = req.body;

      if (!team) {
        res.status(400).json({ error: 'Team is required' });
        return;
      }

      if (!project) {
        res.status(400).json({ error: 'Project is required' });
        return;
      }

      // Authorization check
      const authService = new AuthorizationService();
      const authResult = authService.canManageDivisions(userContext, team);
      if (!authResult.permitted) {
        res.status(403).json({ error: authResult.errorMessage });
        return;
      }

      const divisionService = new DivisionService();
      await divisionService.assignProject(team, project, divisionName, userContext.userId);

      res.status(200).json({
        division: divisionName,
        project,
        team,
      });
    } catch (error) {
      if (error instanceof DivisionError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      next(error);
    }
  }
);

export default router;
