import { Router, Request, Response, NextFunction } from 'express';
import { ConfigRepository } from '../repositories/config.repository';
import { getDatabase } from '../database/connection';
import { thresholdUpdateSchema } from '../schemas/threshold.schema';

const router = Router();

/**
 * GET /api/config/thresholds
 * Returns all RAG threshold configurations.
 */
router.get('/thresholds', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const configRepository = new ConfigRepository(getDatabase());
    const thresholds = await configRepository.getThresholds();
    res.status(200).json({ success: true, data: thresholds });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/config/thresholds
 * Update a threshold configuration for a specific KPI.
 * Request body is validated against thresholdUpdateSchema.
 */
router.put('/thresholds', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = thresholdUpdateSchema.parse(req.body);
    const configRepository = new ConfigRepository(getDatabase());
    await configRepository.updateThreshold(body.kpiName, {
      greenThreshold: body.greenThreshold,
      amberThreshold: body.amberThreshold,
      redThreshold: body.redThreshold,
      comparisonType: body.comparisonType,
    });
    res.status(200).json({ success: true, message: 'Threshold updated' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/config/teams
 * Returns all team configurations.
 */
router.get('/teams', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const configRepository = new ConfigRepository(getDatabase());
    const teams = await configRepository.getAllTeams();
    res.status(200).json({ success: true, data: teams });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/config/teams/:teamName
 * Insert or update a team configuration.
 */
router.put('/teams/:teamName', async (req: Request<{ teamName: string }>, res: Response, next: NextFunction) => {
  try {
    const teamName = req.params.teamName;
    const { portfolio, capacityHoursPerSprint } = req.body;
    const configRepository = new ConfigRepository(getDatabase());
    await configRepository.upsertTeamConfig({
      teamName,
      portfolio,
      capacityHoursPerSprint,
      updatedAt: new Date().toISOString(),
    });
    res.status(200).json({ success: true, message: 'Team configuration updated' });
  } catch (err) {
    next(err);
  }
});

export default router;
