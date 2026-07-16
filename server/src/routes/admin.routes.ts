import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AdminRepository } from '../repositories/admin.repository.js';
import { AuditLoggerService } from '../services/audit-logger.service.js';
import { AuditLogRepository } from '../repositories/audit-log.repository.js';
import { AuthenticatedRequest } from '../middleware/rbac.js';
import { getDatabase } from '../database/connection.js';
import {
  createEntrySchema,
  updateEntrySchema,
  paginationSchema,
} from '../validators/admin.validators.js';

const router = Router();

let _adminRepo: AdminRepository | null = null;
function getAdminRepo(): AdminRepository {
  if (!_adminRepo) {
    _adminRepo = new AdminRepository();
  }
  return _adminRepo;
}

let _auditLogger: AuditLoggerService | null = null;
function getAuditLogger(): AuditLoggerService {
  if (!_auditLogger) {
    _auditLogger = new AuditLoggerService();
  }
  return _auditLogger;
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
 * GET /analytics
 * Returns platform-wide analytics: total teams, entries, recent uploads, pending items.
 */
router.get('/analytics', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const analytics = getAdminRepo().getAnalytics();
    res.json(analytics);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /teams?search=&portfolio=
 * Returns list of distinct teams with portfolio and entry count.
 * Supports optional search (case-insensitive partial match) and portfolio filter.
 */
router.get('/teams', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const search = req.query.search as string | undefined;
    const portfolio = req.query.portfolio as string | undefined;
    const teams = getAdminRepo().getTeams(search, portfolio);
    res.json({ teams });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /teams/:teamName
 * Returns detailed info for a specific team including all entries.
 * Returns 404 if team not found.
 */
router.get('/teams/:teamName', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const teamName = req.params.teamName as string;
    const teamDetail = getAdminRepo().getTeamDetail(teamName);

    if (!teamDetail) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    res.json(teamDetail);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /entries?limit=25&offset=0&sort=id
 * Returns paginated sprint data entries with optional sorting.
 * Validates pagination params with Zod; returns 400 on invalid params.
 */
router.get('/entries', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const parsed = paginationSchema.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: mapZodErrors(parsed.error),
      });
      return;
    }

    const { limit, offset, sort } = parsed.data;
    const result = getAdminRepo().getEntries(limit, offset, sort);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /entries
 * Creates a new sprint data entry. Validates body with createEntrySchema.
 * Logs an audit entry with action='create' transactionally.
 * Returns 201 with the created entry, or 400 with field-level errors.
 */
router.post('/entries', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = createEntrySchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: mapZodErrors(parsed.error),
      });
      return;
    }

    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.userId ?? 'unknown';
    const teamId = parsed.data.team || authReq.user?.teamId || 'unknown';

    // Use a transaction to ensure both the data creation and audit log are atomic.
    // We create the entry within a transaction, get the ID, then insert the audit log.
    const db = getDatabase();
    const auditRepo = new AuditLogRepository(db);

    const transaction = db.transaction(() => {
      const repo = new AdminRepository(db);
      const entry = repo.createEntry(parsed.data);

      // Log audit entry within the same transaction
      auditRepo.insert(
        {
          userId,
          action: 'create',
          recordId: entry.id as number,
          recordType: 'sprint_data',
          teamId,
          modifiedFields: null,
        },
        db
      );

      return entry;
    });

    const entry = transaction();
    res.status(201).json(entry);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /entries/:id
 * Updates an existing sprint data entry by ID. Validates body with updateEntrySchema.
 * Logs an audit entry with action='update' and the list of modified fields transactionally.
 * Returns 200 with the updated entry, 404 if not found, or 400 on validation failure.
 */
router.put('/entries/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = Number(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({
        error: 'Validation failed',
        details: [{ field: 'id', message: 'id must be a valid number' }],
      });
      return;
    }

    const parsed = updateEntrySchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: mapZodErrors(parsed.error),
      });
      return;
    }

    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.userId ?? 'unknown';

    // Determine which fields are being modified
    const modifiedFields = Object.keys(parsed.data);

    // Use a transaction to ensure both the data update and audit log are atomic.
    const db = getDatabase();
    const auditRepo = new AuditLogRepository(db);

    const transaction = db.transaction(() => {
      const repo = new AdminRepository(db);
      const updated = repo.updateEntry(id, parsed.data);

      if (!updated) {
        return null;
      }

      // Log audit entry with modified fields within the same transaction
      auditRepo.insert(
        {
          userId,
          action: 'update',
          recordId: id,
          recordType: 'sprint_data',
          teamId: updated.team || authReq.user?.teamId || 'unknown',
          modifiedFields: modifiedFields.length > 0 ? modifiedFields : null,
        },
        db
      );

      return updated;
    });

    const updated = transaction();

    if (!updated) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /entries/:id
 * Deletes a sprint data entry by ID.
 * Logs an audit entry with action='delete' transactionally.
 * Returns 200 with success confirmation, or 404 if not found.
 */
router.delete('/entries/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = Number(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({
        error: 'Validation failed',
        details: [{ field: 'id', message: 'id must be a valid number' }],
      });
      return;
    }

    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.userId ?? 'unknown';

    // Use a transaction to ensure both the delete and audit log are atomic.
    // We need to fetch the team before deleting so we can log it.
    const db = getDatabase();
    const auditRepo = new AuditLogRepository(db);

    const transaction = db.transaction(() => {
      // Fetch the entry first to get its team for the audit log
      const existingRow = db.prepare('SELECT team FROM sprint_data WHERE id = @id').get({ id }) as { team: string } | undefined;

      if (!existingRow) {
        return false;
      }

      const repo = new AdminRepository(db);
      const deleted = repo.deleteEntry(id);

      if (deleted) {
        // Log audit entry within the same transaction
        auditRepo.insert(
          {
            userId,
            action: 'delete',
            recordId: id,
            recordType: 'sprint_data',
            teamId: existingRow.team || authReq.user?.teamId || 'unknown',
            modifiedFields: null,
          },
          db
        );
      }

      return deleted;
    });

    const deleted = transaction();

    if (!deleted) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    res.json({ success: true, id });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /users
 * Returns all users. Optionally filter by role via query parameter ?role=Engineering_Manager.
 * Includes function assignment info (function_id and function_name) for each user.
 * Restricted to Super_Admin (enforced by RBAC on /api/admin/*).
 */
router.get('/users', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const db = getDatabase();
    const roleFilter = req.query.role as string | undefined;

    let query = `
      SELECT u.id, u.username, u.role, u.team_id, u.function_id, f.name as function_name
      FROM users u
      LEFT JOIN functions f ON u.function_id = f.id
    `;
    const params: string[] = [];

    if (roleFilter) {
      query += ' WHERE u.role = ?';
      params.push(roleFilter);
    }

    query += ' ORDER BY u.username ASC';

    const users = db.prepare(query).all(...params) as Array<{
      id: string;
      username: string;
      role: string;
      team_id: string | null;
      function_id: number | null;
      function_name: string | null;
    }>;

    res.status(200).json({
      data: users.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        teamId: u.team_id,
        functionId: u.function_id,
        functionName: u.function_name,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /users/:id/team
 * Reassigns a user to a different team. Restricted to Super_Admin.
 * Accepts a body with `teamId` (string). Updates the user's team_id in the database.
 * After update, the user's next request will use the new team context.
 */
router.put('/users/:id/team', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const userId = req.params.id;
    const { teamId } = req.body;

    if (!teamId || typeof teamId !== 'string') {
      res.status(400).json({
        error: 'Validation failed',
        details: [{ field: 'teamId', message: 'teamId is required and must be a string' }],
      });
      return;
    }

    const db = getDatabase();

    // Verify the target user exists
    const userRow = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(userId) as
      | { id: string; username: string; role: string }
      | undefined;

    if (!userRow) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Update the user's team assignment
    db.prepare('UPDATE users SET team_id = ? WHERE id = ?').run(teamId, userId);

    res.status(200).json({
      success: true,
      userId: userRow.id,
      username: userRow.username,
      role: userRow.role,
      teamId,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /users/:id/function
 * Assigns an Engineering Manager to a Function. Restricted to Super_Admin (enforced by RBAC on /api/admin/*).
 * Accepts a body with `functionId` (number). Updates the user's function_id in the database.
 * The change takes effect immediately for subsequent API requests without requiring re-login.
 *
 * Validates:
 * - User exists and has Engineering_Manager role (Req 8.5)
 * - Target function exists in Function_Registry (Req 8.4)
 * - Updates function_id column (single column ensures max one function per EM) (Req 8.6)
 */
router.put('/users/:id/function', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const userId = req.params.id;
    const { functionId } = req.body;

    // Validate functionId is provided and is a number
    if (functionId === undefined || functionId === null || typeof functionId !== 'number') {
      res.status(400).json({
        error: 'Validation failed',
        details: [{ field: 'functionId', message: 'functionId is required and must be a number' }],
      });
      return;
    }

    const db = getDatabase();

    // Verify the target user exists and has Engineering_Manager role
    const userRow = db.prepare('SELECT id, username, role, function_id FROM users WHERE id = ?').get(userId) as
      | { id: string; username: string; role: string; function_id: number | null }
      | undefined;

    if (!userRow || userRow.role !== 'Engineering_Manager') {
      res.status(400).json({ error: 'user is invalid' });
      return;
    }

    // Verify the target function exists in the Function_Registry
    const functionRow = db.prepare('SELECT id, name FROM functions WHERE id = ?').get(functionId) as
      | { id: number; name: string }
      | undefined;

    if (!functionRow) {
      res.status(400).json({ error: 'Function is invalid' });
      return;
    }

    // Update the user's function assignment
    db.prepare('UPDATE users SET function_id = ? WHERE id = ?').run(functionId, userId);

    res.status(200).json({
      success: true,
      userId: userRow.id,
      username: userRow.username,
      role: userRow.role,
      functionId: functionRow.id,
      functionName: functionRow.name,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
