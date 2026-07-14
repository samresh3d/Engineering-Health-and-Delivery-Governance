import { Router, Request, Response, NextFunction } from 'express';
import { kpiFilterSchema } from '../schemas/kpi-filter.schema';
import { KpiEngineService } from '../services/kpi-engine.service';
import { RagService } from '../services/rag.service';
import { SprintDataRepository } from '../repositories/sprint-data.repository';
import { KpiResultsRepository } from '../repositories/kpi-results.repository';
import { ConfigRepository } from '../repositories/config.repository';
import type { KpiName, KpiComputedResult } from '../types/index';

const router = Router();

/** All 9 KPI names for trend queries */
const ALL_KPI_NAMES: KpiName[] = [
  'sprint_commitment',
  'release_success_rate',
  'deployment_frequency',
  'capacity_utilization',
  'ai_efficiency',
  'uat_predictability',
  'dev_cycle_time',
  'story_drop_rate',
  'rollback_rate',
];

/**
 * GET /api/dashboard/kpis
 *
 * Returns all 9 KPI values with RAG status and percent change.
 * Accepts query params: team, portfolio, project, startDate, endDate.
 * Validated with kpiFilterSchema.
 */
router.get('/kpis', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = kpiFilterSchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        errors: parseResult.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }

    const filter = parseResult.data;

    // Instantiate repositories and services
    const sprintDataRepo = new SprintDataRepository();
    const kpiResultsRepo = new KpiResultsRepository();
    const configRepo = new ConfigRepository();
    const ragService = new RagService(configRepo);
    await ragService.loadThresholds();

    const kpiEngine = new KpiEngineService(
      sprintDataRepo,
      kpiResultsRepo,
      configRepo,
      ragService
    );

    const data = await kpiEngine.calculateAll(filter);

    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/dashboard/trends
 *
 * Returns the last 6 periods of trend data for KPI charts.
 * Accepts query params: team, portfolio, kpiName (optional, defaults to all).
 */
router.get('/trends', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const team = (req.query.team as string) ?? '';
    const kpiName = req.query.kpiName as string | undefined;

    const kpiResultsRepo = new KpiResultsRepository();

    const kpiNames: KpiName[] = kpiName
      ? [kpiName as KpiName]
      : ALL_KPI_NAMES;

    const data: Record<string, KpiComputedResult[]> = {};

    for (const name of kpiNames) {
      data[name] = await kpiResultsRepo.findTrend(name, team, 6);
    }

    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
