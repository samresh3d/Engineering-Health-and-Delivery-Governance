import { Router, Request, Response, NextFunction } from 'express';
import { ConfigRepository } from '../repositories/config.repository';
import { FunctionRepository } from '../repositories/function.repository';
import { TeamRepository } from '../repositories/team.repository';
import { getDatabase } from '../database/connection';
import type { TeamConfig } from '../types/index';
import type { AuthenticatedRequest } from '../middleware/rbac';

const router = Router();

/**
 * GET /api/filters/functions
 *
 * Returns the list of all active Function names from the Function_Registry.
 * Visible only to Leadership and Super_Admin roles.
 * Engineering_Manager users receive a 403 since their view is scoped to their assigned Function.
 */
router.get('/functions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userRole = authReq.user?.role;

    // Restrict Function filter visibility to Leadership/Super_Admin roles (Req 11.5, 11.6)
    if (userRole === 'Engineering_Manager') {
      res.status(403).json({
        error: 'Forbidden. Function filter is not available for Engineering Manager role.',
      });
      return;
    }

    const functionRepo = new FunctionRepository();
    const functions = functionRepo.getAll();
    const functionNames = functions.map((f) => f.name);

    res.status(200).json({ success: true, data: functionNames });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/filters/portfolios
 *
 * Returns the list of supported portfolios extracted from the track_portfolio_mapping table.
 */
router.get('/portfolios', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const configRepo = new ConfigRepository();
    const mapping = await configRepo.getTrackPortfolioMapping();

    // Extract unique portfolio values
    const portfolios = [...new Set(Object.values(mapping))].sort();

    res.status(200).json({ success: true, data: portfolios });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/filters/teams
 *
 * Returns all team configurations, optionally filtered by portfolio or functionName.
 * Accepts optional query params: portfolio, functionName.
 *
 * When functionName is provided, returns only teams belonging to that Function (Req 11.2).
 * When no functionName is selected, returns all teams across all Functions (Req 11.8).
 */
router.get('/teams', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const portfolio = req.query.portfolio as string | undefined;
    const functionName = req.query.functionName as string | undefined;

    // If functionName is provided, cascade Team dropdown to show only teams of that Function
    if (functionName) {
      const functionRepo = new FunctionRepository();
      const func = functionRepo.getByName(functionName);

      if (!func) {
        // Function not found → return empty teams list (Req 11.7)
        res.status(200).json({ success: true, data: [] });
        return;
      }

      const teamRepo = new TeamRepository();
      const teams = teamRepo.getByFunction(func.id);
      const teamData = teams.map((t) => ({
        teamName: t.name,
        functionName: functionName,
      }));

      res.status(200).json({ success: true, data: teamData });
      return;
    }

    // When no functionName selected, show all teams across all functions (Req 11.8)
    const configRepo = new ConfigRepository();
    let teams: TeamConfig[] = await configRepo.getAllTeams();

    if (portfolio) {
      teams = teams.filter((t) => t.portfolio === portfolio);
    }

    res.status(200).json({ success: true, data: teams });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/filters/projects
 *
 * Returns distinct project names from the sprint_data table.
 * Accepts optional query params: team, portfolio, functionName.
 */
router.get('/projects', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const team = req.query.team as string | undefined;
    const portfolio = req.query.portfolio as string | undefined;
    const functionName = req.query.functionName as string | undefined;

    const conditions: string[] = [];
    const params: Record<string, string> = {};

    if (functionName) {
      conditions.push('function_name = @functionName');
      params.functionName = functionName;
    }

    if (team) {
      conditions.push('team = @team');
      params.team = team;
    }

    if (portfolio) {
      conditions.push('portfolio = @portfolio');
      params.portfolio = portfolio;
    }

    let sql = 'SELECT DISTINCT project FROM sprint_data';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY project ASC';

    const db = getDatabase();
    const rows = db.prepare(sql).all(params) as Array<{ project: string }>;
    const projects = rows.map((r) => r.project);

    res.status(200).json({ success: true, data: projects });
  } catch (err) {
    next(err);
  }
});

export default router;
