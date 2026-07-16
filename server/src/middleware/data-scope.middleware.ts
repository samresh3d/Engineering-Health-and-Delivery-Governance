import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './rbac';
import { AuthorizationService } from '../services/authorization.service';
import type { UserContext, DataScope } from '../types/rbac-analytics.types';
import type { UserRole } from '../types/rbac-analytics.types';

/**
 * Extended request with data scope attached for downstream route handlers.
 * After this middleware runs, `req.dataScope` contains the authorized scope
 * and `req.userContext` provides a typed UserContext for the Authorization Service.
 */
export interface DataScopedRequest extends AuthenticatedRequest {
  dataScope: DataScope;
  userContext: UserContext;
}

/** Error messages matching the design spec */
const ERROR_MESSAGES = {
  TEAM_SCOPE_VIOLATION: 'Access denied. You do not have permission to access this team\'s data.',
  WRITE_OPERATION_DENIED: 'Forbidden. Your role does not permit this operation.',
} as const;

/** HTTP methods that represent write operations */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/** HTTP methods that represent delete operations */
const DELETE_METHODS = new Set(['DELETE']);

/** Singleton authorization service instance */
const authorizationService = new AuthorizationService();

/**
 * Extracts the target team identifier from the request.
 * Checks route params first, then query parameters.
 * Returns null if no team target is specified (e.g., for list-all endpoints).
 */
function getTargetTeam(req: AuthenticatedRequest): string | null {
  // Check route params (e.g., /api/dashboard/team/:teamId)
  if (req.params.teamId) {
    return req.params.teamId as string;
  }
  if (req.params.team) {
    return req.params.team as string;
  }

  // Check query parameters (e.g., ?team=TeamAlpha)
  if (req.query.team && typeof req.query.team === 'string') {
    return req.query.team;
  }
  if (req.query.teamId && typeof req.query.teamId === 'string') {
    return req.query.teamId;
  }

  return null;
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
 * Data-scope middleware factory.
 * Creates middleware that enforces team-scoped data isolation before route handlers execute.
 *
 * Flow:
 * 1. Extracts user context from `req.user` (set by RBAC middleware upstream)
 * 2. Determines the operation type from the HTTP method (read/write/delete)
 * 3. For read operations, determines the target team from query or route params
 * 4. Uses the AuthorizationService to check permissions
 * 5. Attaches the data scope to the request for downstream handlers
 * 6. Returns 403 with proper JSON error format if access is denied
 *
 * @param options - Optional configuration for the middleware behavior
 * @param options.operationType - Override the operation type detection ('read' | 'write' | 'delete')
 */
export function dataScopeMiddleware(options?: { operationType?: 'read' | 'write' | 'delete' }) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // Ensure user context exists (should be set by RBAC middleware)
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const userContext = buildUserContext(req);
    const targetTeam = getTargetTeam(req);

    // Determine operation type from HTTP method or explicit override
    let operationType: 'read' | 'write' | 'delete';
    if (options?.operationType) {
      operationType = options.operationType;
    } else if (DELETE_METHODS.has(req.method)) {
      operationType = 'delete';
    } else if (WRITE_METHODS.has(req.method)) {
      operationType = 'write';
    } else {
      operationType = 'read';
    }

    // Evaluate permissions based on operation type
    if (operationType === 'delete') {
      const result = authorizationService.canDeleteData(userContext);
      if (!result.permitted) {
        res.status(403).json({
          error: result.errorMessage || ERROR_MESSAGES.WRITE_OPERATION_DENIED,
        });
        return;
      }
    } else if (operationType === 'write') {
      // For write operations, a target team is required
      if (targetTeam) {
        const result = authorizationService.canWriteTeamData(userContext, targetTeam);
        if (!result.permitted) {
          res.status(403).json({
            error: result.errorMessage || ERROR_MESSAGES.WRITE_OPERATION_DENIED,
          });
          return;
        }
      } else {
        // If no target team specified for a write, check general write capability
        // For Engineering Managers writing to their own team, use their assigned team
        if (userContext.role === 'Leadership') {
          res.status(403).json({
            error: ERROR_MESSAGES.WRITE_OPERATION_DENIED,
          });
          return;
        }
      }
    } else {
      // Read operation
      if (targetTeam) {
        const result = authorizationService.canReadTeamData(userContext, targetTeam);
        if (!result.permitted) {
          res.status(403).json({
            error: result.errorMessage || ERROR_MESSAGES.TEAM_SCOPE_VIOLATION,
          });
          return;
        }
      }
    }

    // Attach data scope and user context for downstream handlers
    const dataScope = authorizationService.getDataScope(userContext);
    (req as DataScopedRequest).dataScope = dataScope;
    (req as DataScopedRequest).userContext = userContext;

    next();
  };
}

/**
 * Convenience middleware for read-only routes.
 * Applies team scope checking for GET requests accessing team data.
 */
export const readScopeMiddleware = dataScopeMiddleware({ operationType: 'read' });

/**
 * Convenience middleware for write routes.
 * Applies write permission checking for POST/PUT/PATCH requests.
 */
export const writeScopeMiddleware = dataScopeMiddleware({ operationType: 'write' });

/**
 * Convenience middleware for delete routes.
 * Applies delete permission checking for DELETE requests.
 */
export const deleteScopeMiddleware = dataScopeMiddleware({ operationType: 'delete' });

export { authorizationService };
