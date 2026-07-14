import { Router, Request, Response, NextFunction } from 'express';
import { ConfigRepository } from '../repositories/config.repository';
import { getDatabase } from '../database/connection';
import type { TeamConfig } from '../types/index';

const router = Router();

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
 * Returns all team configurations, optionally filtered by portfolio.
 * Accepts optional query param: portfolio.
 */
router.get('/teams', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const portfolio = req.query.portfolio as string | undefined;

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
 * Accepts optional query params: team, portfolio.
 */
router.get('/projects', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const team = req.query.team as string | undefined;
    const portfolio = req.query.portfolio as string | undefined;

    const conditions: string[] = [];
    const params: Record<string, string> = {};

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
