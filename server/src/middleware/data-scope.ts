import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './rbac';
import { getDatabase } from '../database';

/**
 * Function-level data scope resolved for the authenticated user.
 * Used by downstream route handlers to filter data queries.
 *
 * - functionName: The function name to filter by. null means all functions (Leadership/Super_Admin/DM).
 * - functionId: The numeric ID of the function. null when user has cross-function access.
 */
export interface FunctionDataScope {
  functionName: string | null;
  functionId: number | null;
}

/**
 * Extended request with function-level data scope attached.
 * After dataScopeMiddleware runs, `req.functionScope` is available to route handlers.
 */
export interface FunctionScopedRequest extends AuthenticatedRequest {
  functionScope: FunctionDataScope;
}

/**
 * Resolves the function name from a function ID using the functions table.
 * Returns null if the function ID is not found.
 */
function resolveFunctionName(functionId: number): string | null {
  const db = getDatabase();
  const row = db.prepare('SELECT name FROM functions WHERE id = ?').get(functionId) as { name: string } | undefined;
  return row?.name ?? null;
}

/**
 * Validates that an optional functionName query parameter matches an existing function.
 * Returns the function name if valid, null if not provided, or undefined if invalid.
 */
function resolveOptionalFunctionFilter(functionNameParam: unknown): { functionName: string | null; functionId: number | null } | null {
  if (!functionNameParam || typeof functionNameParam !== 'string' || functionNameParam.trim() === '') {
    return { functionName: null, functionId: null };
  }

  const db = getDatabase();
  const row = db.prepare('SELECT id, name FROM functions WHERE name = ? COLLATE NOCASE').get(functionNameParam.trim()) as { id: number; name: string } | undefined;

  if (!row) {
    // Invalid function name in query param — treat as no filter (return all data)
    return { functionName: null, functionId: null };
  }

  return { functionName: row.name, functionId: row.id };
}

/**
 * Function-scoped data scope middleware.
 *
 * Resolves the data scope based on the authenticated user's role and function assignment:
 *
 * - Engineering_Manager: Mandatory scope. Resolves functionName from the user's functionId
 *   in the database. The server NEVER trusts client-provided functionName for EM users.
 *   Even if an EM sends ?functionName=OtherFunction, the server resolves their actual assignment.
 *
 * - Leadership / Super_Admin / Delivery_Manager: No mandatory scope. Optionally allows
 *   functionName query param for filtering. If provided and valid, filters to that function.
 *   If not provided, functionName is null (meaning all functions).
 *
 * Attaches `functionScope: FunctionDataScope` to the request object.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */
export function dataScopeMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;

  // Ensure user context exists (should be set by RBAC middleware upstream)
  if (!authReq.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const { role, functionId } = authReq.user;

  if (role === 'Engineering_Manager') {
    // MANDATORY scope: resolve from the user's assigned functionId
    // Server never trusts client-provided functionName for EM users
    if (!functionId) {
      res.status(400).json({ error: 'No function assigned to your account.' });
      return;
    }

    const functionName = resolveFunctionName(functionId);
    if (!functionName) {
      res.status(400).json({ error: 'No function assigned to your account.' });
      return;
    }

    (req as FunctionScopedRequest).functionScope = {
      functionName,
      functionId,
    };
  } else {
    // Leadership, Super_Admin, Delivery_Manager: no mandatory scope
    // Allow optional functionName query param for filtering
    const filterResult = resolveOptionalFunctionFilter(req.query.functionName);

    if (filterResult) {
      (req as FunctionScopedRequest).functionScope = {
        functionName: filterResult.functionName,
        functionId: filterResult.functionId,
      };
    } else {
      // Fallback: no filter (all functions visible)
      (req as FunctionScopedRequest).functionScope = {
        functionName: null,
        functionId: null,
      };
    }
  }

  next();
}
