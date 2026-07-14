import { Router, Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/rbac';
import { getDatabase } from '../database/connection';

const router = Router();

/**
 * GET /api/auth/me
 * Returns the current authenticated user's context.
 * Auth routes bypass RBAC, so we check if user context is available
 * (it will be if a valid token is provided even though RBAC doesn't enforce it).
 *
 * If no token is provided, queries the database to see if the request can be
 * resolved. Since auth routes skip RBAC, we manually check the Authorization header.
 */
router.get('/me', (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Since /api/auth routes bypass RBAC middleware, user context may not be set.
    // We need to manually decode the token if present.
    const authReq = req as AuthenticatedRequest;

    if (authReq.user && authReq.user.userId) {
      res.status(200).json({
        userId: authReq.user.userId,
        role: authReq.user.role,
      });
      return;
    }

    // If no user context, try to decode token manually
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required. No token provided.' });
      return;
    }

    const token = authHeader.slice(7);
    if (!token) {
      res.status(401).json({ error: 'Authentication required. Empty token.' });
      return;
    }

    // Look up the user by token in the database
    const db = getDatabase();
    const user = db.prepare('SELECT id, username, role FROM users WHERE token = ?').get(token) as
      | { id: string; username: string; role: string }
      | undefined;

    if (!user) {
      res.status(401).json({ error: 'Authentication failed. Invalid token.' });
      return;
    }

    res.status(200).json({
      userId: user.id,
      username: user.username,
      role: user.role,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/mock-users
 * Dev-only endpoint that returns all mock users with their tokens.
 * Used for development/testing to easily obtain valid tokens.
 */
router.get('/mock-users', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const db = getDatabase();
    const users = db.prepare('SELECT id, username, role, token FROM users').all() as Array<{
      id: string;
      username: string;
      role: string;
      token: string;
    }>;

    res.status(200).json({
      users: users.map((u) => ({
        userId: u.id,
        username: u.username,
        role: u.role,
        token: u.token,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
