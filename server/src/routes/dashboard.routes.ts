import { Router, Request, Response, NextFunction } from 'express';
import { kpiFilterSchema } from '../schemas/kpi-filter.schema';
import { KpiEngineService } from '../services/kpi-engine.service';
import { RagService } from '../services/rag.service';
import { SprintDataRepository } from '../repositories/sprint-data.repository';
import { KpiResultsRepository } from '../repositories/kpi-results.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { dataScopeMiddleware, FunctionScopedRequest } from '../middleware/data-scope';
import { getDatabase } from '../database/connection';
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
 * Accepts query params: team, portfolio, project, functionName, startDate, endDate.
 * Validated with kpiFilterSchema.
 *
 * Data scope middleware enforces function-level scoping:
 * - Engineering_Manager: functionName is ALWAYS resolved from user's assignment (cannot be overridden by query params).
 * - Leadership/Super_Admin/Delivery_Manager: optional functionName query param allowed for filtering.
 *
 * Requirements: 5.1, 5.3, 5.6
 */
router.get('/kpis', dataScopeMiddleware, async (req: Request, res: Response, next: NextFunction) => {
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

    // Apply server-enforced function scope from middleware.
    // This overrides any client-provided functionName for EM users (Req 5.6, 5.7).
    const scopedReq = req as FunctionScopedRequest;
    if (scopedReq.functionScope.functionName) {
      filter.functionName = scopedReq.functionScope.functionName;
    }

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
 *
 * Data scope middleware enforces function-level scoping:
 * - Engineering_Manager: trends are filtered to their assigned function's teams.
 * - Leadership/Super_Admin/Delivery_Manager: optional functionName filtering via query param.
 *
 * Requirements: 5.1, 5.3, 5.6
 */
router.get('/trends', dataScopeMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const team = (req.query.team as string) ?? '';
    const kpiName = req.query.kpiName as string | undefined;

    // Apply server-enforced function scope from middleware.
    // For EM users, functionName is mandatory and cannot be overridden (Req 5.6, 5.7).
    const scopedReq = req as FunctionScopedRequest;
    const functionName = scopedReq.functionScope.functionName;

    const kpiResultsRepo = new KpiResultsRepository();

    const kpiNames: KpiName[] = kpiName
      ? [kpiName as KpiName]
      : ALL_KPI_NAMES;

    const data: Record<string, KpiComputedResult[]> = {};

    for (const name of kpiNames) {
      let results = await kpiResultsRepo.findTrend(name, team, 6);

      // If function scope is active, filter trend results to matching function data.
      // The findTrend query doesn't inherently filter by function, so we apply
      // post-query filtering when a function scope is enforced.
      if (functionName && results.length > 0) {
        // For function-scoped users, only return trends that match the function's teams.
        // Since kpi_results stores team-level data, we need to look up which teams
        // belong to the function and filter accordingly.
        const sprintDataRepo = new SprintDataRepository();
        const functionTeams = await sprintDataRepo.findByFilter({ functionName });
        const teamNames = new Set(functionTeams.map(r => r.team));

        // If filtering by specific team, it must belong to the function
        if (team && !teamNames.has(team)) {
          results = [];
        }
        // If no specific team filter, only include results for teams in this function
        // (empty team string in findTrend means aggregate - keep those too)
        if (!team) {
          results = results.filter(r => !r.team || teamNames.has(r.team));
        }
      }

      data[name] = results;
    }

    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/dashboard/available-months
 *
 * Returns distinct YYYY-MM values extracted from sprint_data.dev_start_date,
 * scoped by the authenticated user's role and function assignment.
 *
 * - Engineering_Manager: returns months only for their assigned function.
 * - Leadership/Super_Admin/Delivery_Manager: returns months across all functions.
 *
 * The dev_start_date field is stored in DD-MM-YYYY format and is parsed accordingly.
 * Response: { success: true, months: string[] } sorted descending.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
router.get(
  '/available-months',
  dataScopeMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { functionName } = (req as FunctionScopedRequest).functionScope;
      const db = getDatabase();

      let rows: Array<{ dev_start_date: string }>;

      if (functionName) {
        // EM scope: only months for their assigned function
        rows = db
          .prepare(
            `SELECT DISTINCT dev_start_date FROM sprint_data
             WHERE function_name = ? AND dev_start_date IS NOT NULL AND dev_start_date != ''`
          )
          .all(functionName) as Array<{ dev_start_date: string }>;
      } else {
        // Leadership/Super_Admin/DM: all months across all functions
        rows = db
          .prepare(
            `SELECT DISTINCT dev_start_date FROM sprint_data
             WHERE dev_start_date IS NOT NULL AND dev_start_date != ''`
          )
          .all() as Array<{ dev_start_date: string }>;
      }

      // Parse DD-MM-YYYY dates to extract unique YYYY-MM values
      const monthSet = new Set<string>();

      for (const row of rows) {
        const dateStr = row.dev_start_date;
        // Expected format: DD-MM-YYYY
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          const day = parts[0];
          const month = parts[1];
          const year = parts[2];
          // Validate that parts are numeric and form a reasonable date
          if (day && month && year && month.length <= 2 && year.length === 4) {
            const paddedMonth = month.padStart(2, '0');
            monthSet.add(`${year}-${paddedMonth}`);
          }
        }
      }

      // Sort descending (most recent first)
      const months = Array.from(monthSet).sort((a, b) => b.localeCompare(a));

      res.status(200).json({ success: true, months });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
