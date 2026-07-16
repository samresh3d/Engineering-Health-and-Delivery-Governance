import { Router, Request, Response, NextFunction } from 'express';
import { analyticsFilterSchema } from '../validators/analytics.validators';
import { dataScopeMiddleware, DataScopedRequest } from '../middleware/data-scope.middleware';
import { AnalyticsService } from '../services/analytics.service';
import { KpiEngineService } from '../services/kpi-engine.service';
import { RagService } from '../services/rag.service';
import { SprintDataRepository } from '../repositories/sprint-data.repository';
import { KpiResultsRepository } from '../repositories/kpi-results.repository';
import { ConfigRepository } from '../repositories/config.repository';

const router = Router();

/**
 * Creates a configured AnalyticsService instance with all dependencies.
 */
async function createAnalyticsService(): Promise<AnalyticsService> {
  const sprintDataRepo = new SprintDataRepository();
  const kpiResultsRepo = new KpiResultsRepository();
  const configRepo = new ConfigRepository();
  const ragService = new RagService(configRepo);
  await ragService.loadThresholds();

  const kpiEngine = new KpiEngineService(sprintDataRepo, kpiResultsRepo, configRepo, ragService);
  return new AnalyticsService(kpiEngine, sprintDataRepo, configRepo, ragService);
}

// Cast the data-scope middleware to Express-compatible type for router usage.
// The middleware mutates `req` to add `dataScope` and `userContext` properties.
const readScope = dataScopeMiddleware({ operationType: 'read' }) as unknown as (
  req: Request,
  res: Response,
  next: NextFunction
) => void;

/**
 * GET /api/analytics/scorecard
 *
 * Returns KPI scorecard for the current scope (team or organization).
 * Accepts query params: team, engineeringManager, startDate, endDate, developmentStatus, period.
 *
 * Roles: Engineering_Manager, Leadership, Super_Admin
 * Data scoping: Applied via dataScopeMiddleware
 */
router.get(
  '/scorecard',
  readScope,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parseResult = analyticsFilterSchema.safeParse(req.query);
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
      const scopedReq = req as unknown as DataScopedRequest;
      const { dataScope } = scopedReq;

      const analyticsService = await createAnalyticsService();
      const scorecard = await analyticsService.getScorecard(filter, dataScope);

      res.status(200).json({ success: true, data: scorecard });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/analytics/comparison
 *
 * Returns team comparison data with KPI values per team.
 * Restricted to Leadership and Super_Admin roles only.
 *
 * Roles: Leadership, Super_Admin
 * Data scoping: Applied via dataScopeMiddleware (all teams for these roles)
 */
router.get(
  '/comparison',
  readScope,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Restrict to Leadership and Super_Admin only
      const scopedReq = req as unknown as DataScopedRequest;
      const { userContext } = scopedReq;

      if (userContext.role !== 'Leadership' && userContext.role !== 'Super_Admin') {
        res.status(403).json({
          error: 'Forbidden. Insufficient permissions for this resource.',
        });
        return;
      }

      const parseResult = analyticsFilterSchema.safeParse(req.query);
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
      const analyticsService = await createAnalyticsService();
      const comparison = await analyticsService.getTeamComparison(filter);

      res.status(200).json({ success: true, data: comparison });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/analytics/trends
 *
 * Returns trend data for a specific KPI over time.
 * Accepts query param `kpiName` to specify which KPI to trend, plus filter params.
 *
 * If insufficient data (< 2 data points), returns success with null data and a message.
 *
 * Roles: Engineering_Manager, Leadership, Super_Admin
 * Data scoping: Applied via dataScopeMiddleware
 */
router.get(
  '/trends',
  readScope,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kpiName = req.query.kpiName as string | undefined;
      if (!kpiName) {
        res.status(400).json({
          success: false,
          errors: [{ field: 'kpiName', message: 'kpiName query parameter is required' }],
        });
        return;
      }

      const parseResult = analyticsFilterSchema.safeParse(req.query);
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
      const scopedReq = req as unknown as DataScopedRequest;
      const { dataScope } = scopedReq;

      const analyticsService = await createAnalyticsService();
      const trends = await analyticsService.getTrends(kpiName, filter, dataScope);

      if (trends.length === 0) {
        res.status(200).json({
          success: true,
          data: null,
          insufficientData: true,
          message: 'Not enough data points for trend analysis. At least 2 periods required.',
        });
        return;
      }

      res.status(200).json({ success: true, data: trends });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/analytics/historical
 *
 * Returns historical performance trends for all KPIs.
 * Returns a record mapping each KPI name to its trend data points.
 *
 * Roles: Engineering_Manager, Leadership, Super_Admin
 * Data scoping: Applied via dataScopeMiddleware
 */
router.get(
  '/historical',
  readScope,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parseResult = analyticsFilterSchema.safeParse(req.query);
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
      const scopedReq = req as unknown as DataScopedRequest;
      const { dataScope } = scopedReq;

      const analyticsService = await createAnalyticsService();
      const historical = await analyticsService.getHistoricalTrends(filter, dataScope);

      res.status(200).json({ success: true, data: historical });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
