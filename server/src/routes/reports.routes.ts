import { Router, Request, Response, NextFunction } from 'express';
import { exportRequestSchema } from '../validators/analytics.validators';
import { AuthenticatedRequest } from '../middleware/rbac';
import { AuthorizationService } from '../services/authorization.service';
import { ReportExporterService } from '../services/report-exporter.service';
import { SprintDataRepository } from '../repositories/sprint-data.repository';
import type { UserContext, DataScope } from '../types/rbac-analytics.types';
import type { UserRole } from '../types/rbac-analytics.types';

const router = Router();

/** Singleton AuthorizationService instance */
const authorizationService = new AuthorizationService();

/**
 * Creates a configured ReportExporterService instance.
 */
function createReportExporterService(): ReportExporterService {
  const sprintDataRepo = new SprintDataRepository();
  return new ReportExporterService(sprintDataRepo);
}

/**
 * Builds a UserContext from the authenticated request's user object.
 */
function buildUserContext(req: AuthenticatedRequest): UserContext {
  return {
    userId: req.user.userId,
    role: req.user.role as UserRole,
    teamId: req.user.teamId,
  };
}

/**
 * POST /api/reports/export
 *
 * Generate and download an export file (Excel, CSV, or PDF).
 * Validates request body, checks export permissions, enforces 50,000 row limit,
 * and streams the generated file to the client.
 *
 * Roles: Engineering_Manager, Leadership, Super_Admin
 * - Engineering Managers: export is automatically scoped to their team
 * - Leadership/Super_Admin: export respects the provided filter
 *
 * Request body: { format: 'xlsx' | 'csv' | 'pdf', filter: AnalyticsFilter }
 *
 * Success: Binary file stream with Content-Type and Content-Disposition headers
 * Validation error: 400 { success: false, errors: [...] }
 * Permission denied: 403 { error: "..." }
 * Export limit exceeded: 400 { success: false, error: "Export limit exceeded..." }
 * Server error: 500 { error: "Failed to generate export. Please try again." }
 */
router.post(
  '/export',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userContext = buildUserContext(authReq);

      // 1. Check export permissions
      const exportPermission = authorizationService.canExportReports(userContext);
      if (!exportPermission.permitted) {
        res.status(403).json({
          error: exportPermission.errorMessage || 'Forbidden. Insufficient permissions for this resource.',
        });
        return;
      }

      // 2. Validate request body
      const parseResult = exportRequestSchema.safeParse(req.body);
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

      const { format, filter } = parseResult.data;

      // 3. Determine data scope based on user role
      const dataScope: DataScope = authorizationService.getDataScope(userContext);

      // 4. Validate export size (50,000 row limit)
      const reportExporter = createReportExporterService();
      const sizeValidation = await reportExporter.validateExportSize(filter, dataScope);

      if (!sizeValidation.valid) {
        res.status(400).json({
          success: false,
          error: 'Export limit exceeded. Maximum 50,000 rows. Please apply additional filters.',
        });
        return;
      }

      // 5. Generate the export
      const exportResult = await reportExporter.generateExport({
        format,
        filter,
        userScope: dataScope,
        requestedBy: userContext.userId,
        requestedAt: new Date().toISOString(),
      });

      // 6. Stream the file buffer to the client
      res.setHeader('Content-Type', exportResult.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
      res.status(200).send(exportResult.buffer);
    } catch (err) {
      // Return generic error message on failure
      res.status(500).json({
        error: 'Failed to generate export. Please try again.',
      });
    }
  }
);

export default router;
