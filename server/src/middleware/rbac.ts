import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { DecodedToken } from '../types';
import { getDatabase } from '../database';

const JWT_SECRET = 'engineering-health-platform-secret';

/**
 * Extended Express Request that includes decoded user context after authentication.
 * Includes teamId fetched from the users table for team-scoped data isolation.
 */
export interface AuthenticatedRequest extends Request {
  user: { userId: string; role: string; teamId: string | null; functionId: number | null };
}

/**
 * Route permission mapping defining which roles can access which route patterns.
 * Wildcard (*) patterns match any sub-path.
 */
const ROUTE_PERMISSIONS: Record<string, string[]> = {
  '/api/upload': ['Admin', 'Engineering_Manager', 'Super_Admin'],
  '/api/uploads/*': ['Admin', 'Engineering_Manager', 'Super_Admin'],
  '/api/dashboard/*': ['Admin', 'Engineering_Manager', 'Delivery_Manager', 'Leadership', 'Super_Admin'],
  '/api/config/dropdowns': ['Admin', 'Engineering_Manager', 'Delivery_Manager', 'Leadership', 'Super_Admin'],
  '/api/config/dropdowns/*': ['Admin', 'Engineering_Manager', 'Delivery_Manager', 'Leadership', 'Super_Admin'],
  '/api/config/*': ['Admin', 'Super_Admin'],
  '/api/reports/*': ['Engineering_Manager', 'Delivery_Manager', 'Leadership', 'Super_Admin'],
  '/api/filters/*': ['Admin', 'Engineering_Manager', 'Delivery_Manager', 'Leadership', 'Super_Admin'],
  '/api/admin/*': ['Super_Admin'],
  '/api/analytics/*': ['Engineering_Manager', 'Leadership', 'Super_Admin'],
  '/api/audit-logs/*': ['Super_Admin'],
  '/api/audit-logs': ['Super_Admin'],
  '/api/users/*': ['Admin', 'Engineering_Manager', 'Delivery_Manager', 'Leadership', 'Super_Admin'],
  '/api/submissions/*': ['Engineering_Manager', 'Leadership', 'Super_Admin'],
  '/api/divisions': ['Engineering_Manager', 'Leadership', 'Super_Admin'],
  '/api/divisions/*': ['Engineering_Manager', 'Leadership', 'Super_Admin'],
  '/api/governance/*': ['Engineering_Manager', 'Leadership', 'Super_Admin'],
};

/**
 * Checks if a request path matches a route pattern.
 * Supports exact matches and wildcard patterns (e.g., '/api/dashboard/*' matches '/api/dashboard/kpis').
 */
function matchRoute(requestPath: string, pattern: string): boolean {
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return requestPath === prefix || requestPath.startsWith(prefix + '/');
  }
  return requestPath === pattern;
}

/**
 * Finds the allowed roles for a given request path by checking all route permission patterns.
 * Returns null if no matching pattern is found (route is not protected by role permissions).
 */
function getAllowedRoles(requestPath: string): string[] | null {
  for (const [pattern, roles] of Object.entries(ROUTE_PERMISSIONS)) {
    if (matchRoute(requestPath, pattern)) {
      return roles;
    }
  }
  return null;
}

/**
 * RBAC middleware that verifies JWT authentication and enforces role-based route access.
 *
 * Flow:
 * 1. Allow /api/auth/* routes to pass without authentication (mock user endpoints)
 * 2. Extract Bearer token from Authorization header
 * 3. Verify token signature and expiration using local JWT secret
 * 4. Check if the user's role is authorized for the requested route
 * 5. Attach decoded user context (userId, role) to the request object
 *
 * Returns:
 * - 401 Unauthorized: missing/invalid/expired token
 * - 403 Forbidden: valid token but insufficient role permissions
 */
export function rbacMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Allow auth routes to pass without authentication
  if (req.path.startsWith('/api/auth/') || req.path === '/api/auth') {
    next();
    return;
  }

  // Extract Bearer token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Authentication required. No token provided.' });
    return;
  }

  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Malformed authorization header.' });
    return;
  }

  const token = authHeader.slice(7);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Empty token.' });
    return;
  }

  // Verify token
  let decoded: DecodedToken;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Authentication failed. Token has expired.' });
      return;
    }
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Authentication failed. Invalid token.' });
      return;
    }
    res.status(401).json({ error: 'Authentication failed. Token verification error.' });
    return;
  }

  // Validate token payload has required fields
  if (!decoded.userId || !decoded.role) {
    res.status(401).json({ error: 'Authentication failed. Invalid token payload.' });
    return;
  }

  // Check role-based route authorization
  const allowedRoles = getAllowedRoles(req.path);
  if (allowedRoles !== null && !allowedRoles.includes(decoded.role)) {
    res.status(403).json({ error: 'Forbidden. Insufficient permissions for this resource.' });
    return;
  }

  // Attach user context to request and proceed
  // Fetch team_id and function_id from users table to include context for downstream handlers.
  // This avoids an extra DB lookup on every data-access request.
  let teamId: string | null = null;
  let functionId: number | null = null;
  try {
    const db = getDatabase();
    const userRow = db.prepare('SELECT team_id, function_id FROM users WHERE id = ?').get(decoded.userId) as { team_id: string | null; function_id: number | null } | undefined;
    teamId = userRow?.team_id ?? null;
    functionId = userRow?.function_id ?? null;
  } catch {
    // If DB lookup fails, continue with null teamId/functionId.
    // Data-scope middleware will handle authorization checks downstream.
  }

  (req as AuthenticatedRequest).user = {
    userId: decoded.userId,
    role: decoded.role,
    teamId,
    functionId,
  };

  next();
}

export { ROUTE_PERMISSIONS, matchRoute, getAllowedRoles, JWT_SECRET };
