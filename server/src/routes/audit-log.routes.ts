import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AuthenticatedRequest } from '../middleware/rbac';
import { auditLogFilterSchema } from '../validators/analytics.validators';
import { AuditLoggerService } from '../services/audit-logger.service';

const router = Router();

let _auditLoggerService: AuditLoggerService | null = null;
function getAuditLoggerService(): AuditLoggerService {
  if (!_auditLoggerService) {
    _auditLoggerService = new AuditLoggerService();
  }
  return _auditLoggerService;
}

/**
 * Maps Zod validation errors to field-level error details.
 */
function mapZodErrors(error: ZodError): Array<{ field: string; message: string }> {
  return error.errors.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * GET /api/audit-logs
 * Query audit log entries with optional filter parameters.
 *
 * Restricted to: Super_Admin only.
 *
 * Query parameters:
 * - userId: filter by user ID
 * - action: filter by action type ('create' | 'update' | 'delete')
 * - startDate: filter entries from this date (YYYY-MM-DD)
 * - endDate: filter entries up to this date (YYYY-MM-DD)
 * - teamId: filter by team ID
 * - limit: max number of results (default: 100)
 * - offset: number of results to skip (default: 0)
 *
 * Success: 200 { success: true, data: AuditEntry[] }
 * Validation error: 400 { success: false, errors: [...] }
 * Unauthorized: 403 { error: "..." }
 */
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;

      // Enforce Super_Admin only
      if (authReq.user.role !== 'Super_Admin') {
        res.status(403).json({ error: 'Forbidden. Insufficient permissions for this resource.' });
        return;
      }

      // Validate filter parameters
      const filterInput = {
        userId: req.query.userId as string | undefined,
        action: req.query.action as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        teamId: req.query.teamId as string | undefined,
      };

      // Remove undefined keys so zod optional fields work correctly
      const cleanedFilter = Object.fromEntries(
        Object.entries(filterInput).filter(([, v]) => v !== undefined)
      );

      const parsed = auditLogFilterSchema.safeParse(cleanedFilter);

      if (!parsed.success) {
        res.status(400).json({
          success: false,
          errors: mapZodErrors(parsed.error),
        });
        return;
      }

      // Parse limit and offset from query
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      if (isNaN(limit) || limit < 1) {
        res.status(400).json({
          success: false,
          errors: [{ field: 'limit', message: 'limit must be a positive integer' }],
        });
        return;
      }

      if (isNaN(offset) || offset < 0) {
        res.status(400).json({
          success: false,
          errors: [{ field: 'offset', message: 'offset must be a non-negative integer' }],
        });
        return;
      }

      const auditLoggerService = getAuditLoggerService();
      const entries = await auditLoggerService.query(parsed.data, limit, offset);

      res.status(200).json({
        success: true,
        data: entries,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/audit-logs/record/:id
 * Get audit history for a specific record, ordered chronologically (timestamp ascending).
 *
 * Restricted to: Super_Admin only.
 *
 * Path parameters:
 * - id: the record ID to get audit history for
 *
 * Success: 200 { success: true, data: AuditEntry[] }
 * Invalid ID: 400 { success: false, errors: [...] }
 * Unauthorized: 403 { error: "..." }
 */
router.get(
  '/record/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;

      // Enforce Super_Admin only
      if (authReq.user.role !== 'Super_Admin') {
        res.status(403).json({ error: 'Forbidden. Insufficient permissions for this resource.' });
        return;
      }

      const recordId = parseInt(req.params.id as string, 10);

      if (isNaN(recordId) || recordId < 1) {
        res.status(400).json({
          success: false,
          errors: [{ field: 'id', message: 'id must be a valid positive integer' }],
        });
        return;
      }

      const auditLoggerService = getAuditLoggerService();
      const entries = await auditLoggerService.getRecordHistory(recordId);

      res.status(200).json({
        success: true,
        data: entries,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
