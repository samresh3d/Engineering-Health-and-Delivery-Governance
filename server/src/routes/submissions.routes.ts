import { Router, Request, Response, NextFunction } from 'express';
import { dataScopeMiddleware, DataScopedRequest } from '../middleware/data-scope.middleware';
import { getDatabase } from '../database/connection';

const router = Router();

// Apply read scope middleware for team-based access control
const readScope = dataScopeMiddleware({ operationType: 'read' }) as unknown as (
  req: Request,
  res: Response,
  next: NextFunction
) => void;

/**
 * Represents a historical submission record combining upload metadata
 * with sprint entry counts.
 */
interface SubmissionRecord {
  id: string;
  fileName: string;
  uploadedBy: string;
  rowsIngested: number;
  status: string;
  uploadedAt: string;
  team: string | null;
}

/**
 * GET /api/submissions/history
 *
 * Returns historical submission records (past uploads and associated sprint entries)
 * ordered by ingestion/upload date descending (newest first).
 *
 * For Engineering Managers: only returns submissions belonging to their assigned team.
 * For Leadership/Super_Admin: returns all submissions.
 *
 * Query params:
 * - limit (optional, default 50, max 200)
 * - offset (optional, default 0)
 *
 * Requirements: 2.4, 1.7
 */
router.get(
  '/history',
  readScope,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scopedReq = req as unknown as DataScopedRequest;
      const { dataScope } = scopedReq;

      // Parse pagination params
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      const db = getDatabase();

      // Build query to get upload records with associated team info
      // Join uploads with sprint_data to get team for each upload
      // For EM users, filter by their assigned team
      const conditions: string[] = [];
      const params: Record<string, string | number> = {};

      if (dataScope.type === 'single_team' && dataScope.teamId) {
        conditions.push('sd.team = @teamId');
        params.teamId = dataScope.teamId;
      }

      // Query uploads with the primary team from associated sprint_data rows
      // Uses a subquery to get the team from the first sprint_data row per upload
      let sql = `
        SELECT 
          u.id,
          u.file_name AS fileName,
          u.uploaded_by AS uploadedBy,
          u.rows_ingested AS rowsIngested,
          u.status,
          u.uploaded_at AS uploadedAt,
          (SELECT sd.team FROM sprint_data sd WHERE sd.upload_id = u.id LIMIT 1) AS team
        FROM uploads u
      `;

      if (conditions.length > 0) {
        // When filtering by team, we need to ensure the upload has sprint_data for that team
        sql = `
          SELECT DISTINCT
            u.id,
            u.file_name AS fileName,
            u.uploaded_by AS uploadedBy,
            u.rows_ingested AS rowsIngested,
            u.status,
            u.uploaded_at AS uploadedAt,
            sd.team AS team
          FROM uploads u
          INNER JOIN sprint_data sd ON sd.upload_id = u.id
          WHERE ${conditions.join(' AND ')}
        `;
      }

      // Order by uploaded_at descending (newest first) - Requirement 2.4
      sql += ' ORDER BY u.uploaded_at DESC';
      sql += ' LIMIT @limit OFFSET @offset';

      params.limit = limit;
      params.offset = offset;

      const rows = db.prepare(sql).all(params) as SubmissionRecord[];

      // Get total count for pagination
      let countSql: string;
      const countParams: Record<string, string> = {};

      if (dataScope.type === 'single_team' && dataScope.teamId) {
        countSql = `
          SELECT COUNT(DISTINCT u.id) AS total
          FROM uploads u
          INNER JOIN sprint_data sd ON sd.upload_id = u.id
          WHERE sd.team = @teamId
        `;
        countParams.teamId = dataScope.teamId;
      } else {
        countSql = 'SELECT COUNT(*) AS total FROM uploads';
      }

      const countResult = db.prepare(countSql).get(countParams) as { total: number };

      res.status(200).json({
        success: true,
        data: rows,
        total: countResult.total,
        limit,
        offset,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/submissions/entries
 *
 * Returns individual sprint data entries (historical submissions detail view)
 * ordered by ingested_at descending (newest first).
 *
 * For Engineering Managers: only returns entries belonging to their assigned team.
 * For Leadership/Super_Admin: returns all entries.
 *
 * Query params:
 * - limit (optional, default 50, max 200)
 * - offset (optional, default 0)
 * - uploadId (optional, filter by specific upload)
 *
 * Requirements: 2.4, 1.7
 */
router.get(
  '/entries',
  readScope,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scopedReq = req as unknown as DataScopedRequest;
      const { dataScope } = scopedReq;

      // Parse pagination params
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const uploadId = req.query.uploadId as string | undefined;

      const db = getDatabase();

      const conditions: string[] = [];
      const params: Record<string, string | number> = {};

      // Apply team scoping for Engineering Managers (Requirement 1.7)
      if (dataScope.type === 'single_team' && dataScope.teamId) {
        conditions.push('team = @teamId');
        params.teamId = dataScope.teamId;
      }

      // Optional filter by upload ID
      if (uploadId) {
        conditions.push('upload_id = @uploadId');
        params.uploadId = uploadId;
      }

      let sql = 'SELECT * FROM sprint_data';
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      // Order by ingested_at descending (newest first) - Requirement 2.4
      sql += ' ORDER BY ingested_at DESC';
      sql += ' LIMIT @limit OFFSET @offset';

      params.limit = limit;
      params.offset = offset;

      const rows = db.prepare(sql).all(params) as Record<string, unknown>[];

      // Map database rows to camelCase format
      const entries = rows.map((row) => ({
        id: row.id,
        uploadId: row.upload_id,
        sno: row.sno,
        team: row.team,
        track: row.track,
        project: row.project,
        portfolio: row.portfolio,
        status: row.status,
        itemsList: row.items_list,
        walkthroughGivenOn: row.walkthrough_given_on,
        jiraId: row.jira_id,
        estimatedEffortWithAi: row.estimated_effort_with_ai,
        estimatedEffortWithoutAi: row.estimated_effort_without_ai,
        actualEffortWithAi: row.actual_effort_with_ai,
        aiUsed: row.ai_used,
        devStartDate: row.dev_start_date,
        devEndDate: row.dev_end_date,
        developmentStatus: row.development_status,
        uatDeliveryDate: row.uat_delivery_date,
        uatDeliveryTarget: row.uat_delivery_target,
        resources: row.resources,
        goLivePlannedDate: row.go_live_planned_date,
        goLiveDate: row.go_live_date,
        productionStatus: row.production_status,
        rollback: row.rollback,
        rollbackReason: row.rollback_reason,
        storyDropReason: row.story_drop_reason,
        ingestedAt: row.ingested_at,
      }));

      // Get total count
      let countSql = 'SELECT COUNT(*) AS total FROM sprint_data';
      const countConditions: string[] = [];
      const countParams: Record<string, string> = {};

      if (dataScope.type === 'single_team' && dataScope.teamId) {
        countConditions.push('team = @teamId');
        countParams.teamId = dataScope.teamId;
      }
      if (uploadId) {
        countConditions.push('upload_id = @uploadId');
        countParams.uploadId = uploadId;
      }

      if (countConditions.length > 0) {
        countSql += ' WHERE ' + countConditions.join(' AND ');
      }

      const countResult = db.prepare(countSql).get(countParams) as { total: number };

      res.status(200).json({
        success: true,
        data: entries,
        total: countResult.total,
        limit,
        offset,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
