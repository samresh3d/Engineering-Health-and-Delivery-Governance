import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/rbac';
import { getDatabase } from '../database/connection';

const router = Router();
const JWT_SECRET = 'engineering-health-platform-secret';

/**
 * GET /api/auth/me
 * Returns the current authenticated user's context.
 */
router.get('/me', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authReq = req as AuthenticatedRequest;

    if (authReq.user && authReq.user.userId) {
      res.status(200).json({
        userId: authReq.user.userId,
        role: authReq.user.role,
      });
      return;
    }

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
 * GET /api/auth/functions
 * Returns all functions (id, name) for the login dropdown.
 * Public endpoint — no auth required.
 */
router.get('/functions', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const db = getDatabase();
    const functions = db.prepare('SELECT id, name FROM functions ORDER BY name').all() as Array<{
      id: number;
      name: string;
    }>;

    res.status(200).json({ functions });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/login
 * Handles role-based login:
 * - Engineering_Manager: validates functionId + password, returns token
 * - Super_Admin / Leadership: returns existing mock user token
 */
router.post('/login', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { role, functionId, password } = req.body;

    if (!role) {
      res.status(400).json({ error: 'Role is required.' });
      return;
    }

    const db = getDatabase();

    if (role === 'Engineering_Manager') {
      if (!functionId || !password) {
        res.status(400).json({ error: 'Function and password are required for Engineering Manager login.' });
        return;
      }

      // Validate function exists and password matches
      const func = db.prepare('SELECT id, name, password FROM functions WHERE id = ?').get(functionId) as
        | { id: number; name: string; password: string | null }
        | undefined;

      if (!func) {
        res.status(401).json({ error: 'Invalid function selected.' });
        return;
      }

      if (!func.password || func.password !== password) {
        res.status(401).json({ error: 'Invalid password.' });
        return;
      }

      // Find or create an EM user for this function
      let emUser = db.prepare(
        "SELECT id, username, role, token, function_id FROM users WHERE role = 'Engineering_Manager' AND function_id = ?"
      ).get(func.id) as
        | { id: string; username: string; role: string; token: string; function_id: number }
        | undefined;

      if (!emUser) {
        // Create a new EM user for this function
        const userId = `user-em-${uuidv4().slice(0, 8)}`;
        const username = `em_${func.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const token = jwt.sign({ userId, role: 'Engineering_Manager' }, JWT_SECRET, { expiresIn: '365d' });

        db.prepare(
          'INSERT INTO users (id, username, role, token, function_id) VALUES (?, ?, ?, ?, ?)'
        ).run(userId, username, 'Engineering_Manager', token, func.id);

        emUser = { id: userId, username, role: 'Engineering_Manager', token, function_id: func.id };
      } else {
        // Regenerate token for existing user to keep it fresh
        const token = jwt.sign({ userId: emUser.id, role: 'Engineering_Manager' }, JWT_SECRET, { expiresIn: '365d' });
        db.prepare('UPDATE users SET token = ? WHERE id = ?').run(token, emUser.id);
        emUser.token = token;
      }

      res.status(200).json({
        userId: emUser.id,
        username: emUser.username,
        role: 'Engineering_Manager',
        token: emUser.token,
        functionId: func.id,
        functionName: func.name,
      });
      return;
    }

    if (role === 'Super_Admin') {
      const user = db.prepare("SELECT id, username, role, token FROM users WHERE role = 'Super_Admin' LIMIT 1").get() as
        | { id: string; username: string; role: string; token: string }
        | undefined;

      if (!user) {
        res.status(500).json({ error: 'Admin user not found in system.' });
        return;
      }

      res.status(200).json({
        userId: user.id,
        username: user.username,
        role: user.role,
        token: user.token,
      });
      return;
    }

    if (role === 'Leadership') {
      const user = db.prepare("SELECT id, username, role, token FROM users WHERE role = 'Leadership' LIMIT 1").get() as
        | { id: string; username: string; role: string; token: string }
        | undefined;

      if (!user) {
        res.status(500).json({ error: 'Leadership user not found in system.' });
        return;
      }

      res.status(200).json({
        userId: user.id,
        username: user.username,
        role: user.role,
        token: user.token,
      });
      return;
    }

    res.status(400).json({ error: `Invalid role: ${role}` });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/mock-users
 * Dev-only endpoint that returns all mock users with their tokens.
 * Kept for backward compatibility.
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

    const allowedUsernames = ['admin', 'leadership', 'eng_manager'];
    const filteredUsers = users.filter((u) => allowedUsernames.includes(u.username));

    const displayNames: Record<string, string> = {
      admin: 'Admin',
      leadership: 'Leadership',
      eng_manager: 'Engineering Manager',
    };

    res.status(200).json({
      users: filteredUsers.map((u) => ({
        userId: u.id,
        username: u.username,
        role: u.role,
        displayName: displayNames[u.username] || u.username,
        token: u.token,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
