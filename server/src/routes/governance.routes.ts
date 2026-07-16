import { Router, Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/rbac';
import { divisionResponseMapper } from '../middleware/division-mapper.middleware';
import { GovernanceDashboardService } from '../services/governance-dashboard.service';

const router = Router();

/**
 * Helper: Checks if the authenticated user has Leadership or Super_Admin role.
 * Returns true if authorized, false otherwise.
 */
function isLeadershipOrAdmin(user: AuthenticatedRequest['user']): boolean {
  return user.role === 'Leadership' || user.role === 'Super_Admin';
}

/**
 * Helper: Creates a GovernanceDashboardService instance.
 * Extracted to allow future dependency injection or caching.
 */
function createGovernanceDashboardService(): GovernanceDashboardService {
  return new GovernanceDashboardService();
}

/**
 * GET /api/governance/leadership
 *
 * Returns the Leadership dashboard data: all teams, all period aggregations
 * (month, quarter, year), team cards with health scores and sparklines.
 *
 * Authorization: Leadership, Super_Admin only.
 * Applies division response mapper on the response.
 *
 * Requirements: 2.1, 2.3, 8.1, 8.2
 */
router.get(
  '/leadership',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { user } = authReq;

      // Enforce role-based access: only Leadership and Super_Admin
      if (!isLeadershipOrAdmin(user)) {
        res.status(403).json({
          error: 'Forbidden. Insufficient permissions for this resource.',
        });
        return;
      }

      const service = createGovernanceDashboardService();
      const data = await service.getLeadershipDashboard();

      // Apply division response mapper to rename track → division in response
      const mappedData = divisionResponseMapper(data);

      res.status(200).json({ success: true, data: mappedData });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/governance/em
 *
 * Returns the EM dashboard data: team-scoped period aggregations,
 * divisions with KPIs, and projects grouped by division.
 *
 * Authorization: Engineering_Manager only (auto-scoped to their assigned team).
 * Applies division response mapper on the response.
 *
 * Requirements: 5.1, 5.4, 8.4
 */
router.get(
  '/em',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { user } = authReq;

      // Enforce role-based access: only Engineering_Manager
      if (user.role !== 'Engineering_Manager') {
        res.status(403).json({
          error: 'Forbidden. This endpoint is restricted to Engineering Managers.',
        });
        return;
      }

      // Auto-scope to the EM's assigned team or function
      const scopeId = user.teamId || user.functionId;
      if (!scopeId) {
        res.status(403).json({
          error: 'Forbidden. No team or function assigned to this Engineering Manager.',
        });
        return;
      }

      const service = createGovernanceDashboardService();
      const data = await service.getEmDashboard(String(scopeId));

      // Apply division response mapper to rename track → division in response
      const mappedData = divisionResponseMapper(data);

      res.status(200).json({ success: true, data: mappedData });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/governance/team/:teamId
 *
 * Returns team drill-down data: divisions with metrics, health scores,
 * and project breakdowns for a specific team.
 *
 * Authorization: Leadership, Super_Admin only.
 * Applies division response mapper on the response.
 *
 * Requirements: 3.1, 3.2, 3.3, 8.1, 8.2
 */
router.get(
  '/team/:teamId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { user } = authReq;

      // Enforce role-based access: only Leadership and Super_Admin
      if (!isLeadershipOrAdmin(user)) {
        res.status(403).json({
          error: 'Forbidden. Insufficient permissions for this resource.',
        });
        return;
      }

      const teamId = req.params.teamId as string;

      if (!teamId) {
        res.status(400).json({
          error: 'Bad Request. Team ID is required.',
        });
        return;
      }

      const service = createGovernanceDashboardService();
      const data = await service.getTeamDrillDown(teamId);

      // Apply division response mapper to rename track → division in response
      const mappedData = divisionResponseMapper(data);

      res.status(200).json({ success: true, data: mappedData });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/governance/division/:teamId/:divisionName
 *
 * Returns division-level drill-down data: detailed metrics with project breakdowns
 * for a specific division within a team.
 *
 * Authorization:
 * - Leadership, Super_Admin: any team
 * - Engineering_Manager: own team only
 *
 * Applies division response mapper on the response.
 *
 * Requirements: 3.2, 3.3, 8.1, 8.4
 */
router.get(
  '/division/:teamId/:divisionName',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { user } = authReq;

      const teamId = req.params.teamId as string;
      const divisionName = req.params.divisionName as string;

      if (!teamId || !divisionName) {
        res.status(400).json({
          error: 'Bad Request. Team ID and division name are required.',
        });
        return;
      }

      // Enforce role-based access
      if (isLeadershipOrAdmin(user)) {
        // Leadership and Super_Admin can access any team's division data
      } else if (user.role === 'Engineering_Manager') {
        // EM can only access their own team's division data
        if (!user.teamId || user.teamId !== teamId) {
          res.status(403).json({
            error: 'Forbidden. You do not have permission to access this team\'s data.',
          });
          return;
        }
      } else {
        // All other roles are denied
        res.status(403).json({
          error: 'Forbidden. Insufficient permissions for this resource.',
        });
        return;
      }

      const service = createGovernanceDashboardService();
      const data = await service.getDivisionDrillDown(teamId, divisionName);

      // Apply division response mapper to rename track → division in response
      const mappedData = divisionResponseMapper(data);

      res.status(200).json({ success: true, data: mappedData });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
