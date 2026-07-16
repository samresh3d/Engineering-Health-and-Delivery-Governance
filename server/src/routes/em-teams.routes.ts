import { Router, Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/rbac';
import { TeamRepository } from '../repositories/team.repository';
import { FunctionRepository } from '../repositories/function.repository';
import { getDatabase } from '../database/connection.js';

const router = Router();

/**
 * GET /api/em/teams
 *
 * Returns all teams under the EM's assigned function, with sprint data summary
 * (row count, last upload date) for each team.
 *
 * Requires: Engineering_Manager role with function_id assigned.
 */
router.get('/teams', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { user } = authReq;

    if (user.role !== 'Engineering_Manager') {
      res.status(403).json({ error: 'Restricted to Engineering Managers.' });
      return;
    }

    if (!user.functionId) {
      res.status(400).json({ error: 'No function assigned. Contact your administrator.' });
      return;
    }

    const db = getDatabase();
    const teamRepo = new TeamRepository(db);
    const functionRepo = new FunctionRepository(db);

    const functionRecord = functionRepo.getById(user.functionId);
    if (!functionRecord) {
      res.status(404).json({ error: 'Assigned function not found.' });
      return;
    }

    const teams = teamRepo.getByFunction(user.functionId);

    // Get sprint data summary per team
    const teamSummaries = teams.map((team: { id: number; name: string; functionId: number }) => {
      const stats = db.prepare(`
        SELECT 
          COUNT(*) as rowCount,
          MAX(ingested_at) as lastIngestedAt
        FROM sprint_data 
        WHERE team = ? AND function_name = ?
      `).get(team.name, functionRecord.name) as { rowCount: number; lastIngestedAt: string | null };

      return {
        id: team.id,
        name: team.name,
        rowCount: stats.rowCount,
        lastIngestedAt: stats.lastIngestedAt,
      };
    });

    res.status(200).json({
      success: true,
      functionName: functionRecord.name,
      teams: teamSummaries,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/em/teams
 *
 * Creates a new team under the EM's assigned function.
 * Requires: Engineering_Manager role with function_id assigned.
 */
router.post('/teams', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { user } = authReq;

    if (user.role !== 'Engineering_Manager') {
      res.status(403).json({ error: 'Restricted to Engineering Managers.' });
      return;
    }

    if (!user.functionId) {
      res.status(400).json({ error: 'No function assigned. Contact your administrator.' });
      return;
    }

    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Team name is required.' });
      return;
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 100) {
      res.status(400).json({ error: 'Team name must be 100 characters or fewer.' });
      return;
    }

    const db = getDatabase();
    const teamRepo = new TeamRepository(db);

    // Check for duplicate
    const existing = teamRepo.getByNameAndFunction(trimmedName, user.functionId);
    if (existing) {
      res.status(409).json({ error: `Team "${trimmedName}" already exists under this function.` });
      return;
    }

    const newTeam = teamRepo.create(trimmedName, user.functionId);

    res.status(201).json({
      success: true,
      team: newTeam,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/em/available-months
 *
 * Returns a list of months (YYYY-MM) that have sprint data for the EM's function.
 * Ordered most recent first.
 */
router.get('/available-months', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { user } = authReq;

    if (!user.functionId) {
      res.status(400).json({ error: 'No function assigned.' });
      return;
    }

    const db = getDatabase();
    const functionRepo = new FunctionRepository(db);
    const functionRecord = functionRepo.getById(user.functionId);

    if (!functionRecord) {
      res.status(404).json({ error: 'Function not found.' });
      return;
    }

    // Extract distinct months from dev_start_date (DD-MM-YYYY format)
    const rows = db.prepare(`
      SELECT DISTINCT dev_start_date FROM sprint_data 
      WHERE function_name = ? AND dev_start_date IS NOT NULL AND dev_start_date != ''
    `).all(functionRecord.name) as Array<{ dev_start_date: string }>;

    const monthSet = new Set<string>();
    for (const row of rows) {
      const dateStr = row.dev_start_date;
      // Parse DD-MM-YYYY to extract YYYY-MM
      const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      if (match) {
        monthSet.add(`${match[3]}-${match[2]}`);
      }
      // Also handle YYYY-MM-DD format
      const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        monthSet.add(`${isoMatch[1]}-${isoMatch[2]}`);
      }
    }

    const months = Array.from(monthSet).sort().reverse();

    res.status(200).json({ success: true, months });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/em/teams/:teamId/data
 *
 * Returns paginated sprint data rows for a specific team under the EM's function.
 * Query params: page (default 1), pageSize (default 50)
 */
router.get('/teams/:teamId/data', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { user } = authReq;

    if (user.role !== 'Engineering_Manager') {
      res.status(403).json({ error: 'Restricted to Engineering Managers.' });
      return;
    }

    if (!user.functionId) {
      res.status(400).json({ error: 'No function assigned.' });
      return;
    }

    const teamId = Number(req.params.teamId);
    if (isNaN(teamId)) {
      res.status(400).json({ error: 'Invalid team ID.' });
      return;
    }

    const db = getDatabase();
    const teamRepo = new TeamRepository(db);
    const functionRepo = new FunctionRepository(db);

    const functionRecord = functionRepo.getById(user.functionId);
    if (!functionRecord) {
      res.status(404).json({ error: 'Function not found.' });
      return;
    }

    // Verify team belongs to EM's function
    const team = teamRepo.getById(teamId);
    if (!team || team.functionId !== user.functionId) {
      res.status(404).json({ error: 'Team not found under your function.' });
      return;
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    const totalRow = db.prepare(`
      SELECT COUNT(*) as total FROM sprint_data 
      WHERE team = ? AND function_name = ?
    `).get(team.name, functionRecord.name) as { total: number };

    const rows = db.prepare(`
      SELECT 
        sno, team, jira_id, story_name, dev_start_date, dev_end_date,
        production_status, story_name as items_list, resources,
        ai_used, rollback, ingested_at, upload_id
      FROM sprint_data 
      WHERE team = ? AND function_name = ?
      ORDER BY ingested_at DESC
      LIMIT ? OFFSET ?
    `).all(team.name, functionRecord.name, pageSize, offset);

    res.status(200).json({
      success: true,
      team: { id: team.id, name: team.name },
      pagination: {
        page,
        pageSize,
        total: totalRow.total,
        totalPages: Math.ceil(totalRow.total / pageSize),
      },
      rows,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
