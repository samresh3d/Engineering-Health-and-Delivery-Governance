import { Router, Request, Response, NextFunction } from 'express';
import { ConfigRepository } from '../repositories/config.repository';
import { getDatabase } from '../database/connection';
import { thresholdUpdateSchema } from '../schemas/threshold.schema';
import { DropdownRepository, DropdownFieldName } from '../repositories/dropdown.repository.js';
import { AuthenticatedRequest } from '../middleware/rbac.js';

const router = Router();

/** Valid dropdown field names for validation */
const VALID_DROPDOWN_FIELDS: readonly string[] = ['production_status', 'story_status', 'delay_reason'];

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

/**
 * GET /api/config/dropdowns
 * Returns all dropdown options grouped by field name.
 * Accessible to all authenticated users.
 */
router.get('/dropdowns', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const dropdownRepo = new DropdownRepository(getDatabase());
    const options = dropdownRepo.getAllOptions();
    res.status(200).json({ success: true, data: options });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/config/dropdowns/:field
 * Replace all dropdown options for a specific field.
 * Restricted to Super_Admin role only.
 * Validates that :field is one of: production_status, story_status, delay_reason.
 * Request body: { options: string[] }
 */
router.put('/dropdowns/:field', (req: Request<{ field: string }>, res: Response, next: NextFunction): void => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;

    // Enforce Super_Admin only
    if (!authReq.user || authReq.user.role !== 'Super_Admin') {
      res.status(403).json({ error: 'Forbidden. Insufficient permissions for this resource.' });
      return;
    }

    const { field } = req.params;

    // Validate field is one of the allowed dropdown fields
    if (!VALID_DROPDOWN_FIELDS.includes(field)) {
      res.status(400).json({
        error: `Invalid field: "${field}". Must be one of: ${VALID_DROPDOWN_FIELDS.join(', ')}`,
      });
      return;
    }

    const { options } = req.body;

    // Validate request body has an options array
    if (!options || !Array.isArray(options)) {
      res.status(400).json({
        error: 'Request body must contain an "options" array of strings',
      });
      return;
    }

    // Validate all items are strings
    if (!options.every((opt: unknown) => typeof opt === 'string')) {
      res.status(400).json({
        error: 'All option values must be strings',
      });
      return;
    }

    const dropdownRepo = new DropdownRepository(getDatabase());
    const updatedOptions = dropdownRepo.setOptions(field as DropdownFieldName, options);

    res.status(200).json({ success: true, data: updatedOptions });
  } catch (err: unknown) {
    // Handle known validation errors from the repository
    if (err instanceof Error && (
      err.message.includes('At least one option') ||
      err.message.includes('Cannot exceed') ||
      err.message.includes('non-empty string') ||
      err.message.includes('maximum length') ||
      err.message.includes('Duplicate option')
    )) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
});

export default router;
