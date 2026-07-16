import { Router, Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/rbac';
import { getDatabase } from '../database/connection';

const router = Router();

/**
 * GET /api/users/me
 * Returns the authenticated user's profile including userId, username, role, and teamId.
 * Accessible by all authenticated users (no specific role restriction needed beyond auth).
 */
router.get('/me', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { userId, role, teamId } = authReq.user;

    // Fetch username from the database
    const db = getDatabase();
    const userRow = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as
      | { username: string }
      | undefined;

    if (!userRow) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.status(200).json({
      userId,
      username: userRow.username,
      role,
      teamId,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
