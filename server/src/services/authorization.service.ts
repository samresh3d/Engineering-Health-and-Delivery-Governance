import type { UserContext, AuthorizationResult, DataScope } from '../types/rbac-analytics.types';

/**
 * Interface for the Authorization Service.
 * Evaluates data-level access permissions based on user role and team assignment.
 */
export interface IAuthorizationService {
  /** Check if user can read data for a given team */
  canReadTeamData(user: UserContext, targetTeam: string): AuthorizationResult;

  /** Check if user can write (create/edit) data for a given team */
  canWriteTeamData(user: UserContext, targetTeam: string): AuthorizationResult;

  /** Check if user can delete data */
  canDeleteData(user: UserContext): AuthorizationResult;

  /** Get the data scope for a user (which teams they can see) */
  getDataScope(user: UserContext): DataScope;

  /** Check if user can export reports */
  canExportReports(user: UserContext): AuthorizationResult;

  /** Check if user can access audit logs */
  canAccessAuditLogs(user: UserContext): AuthorizationResult;

  /** Check if user can manage divisions (create/rename/delete/assign) for a given team */
  canManageDivisions(user: UserContext, targetTeam: string): AuthorizationResult;
}

/** Error messages for authorization failures */
const ERROR_MESSAGES = {
  TEAM_SCOPE_VIOLATION: 'Access denied. You do not have permission to access this team\'s data.',
  TEAM_SCOPE_DIVISION_VIOLATION: 'Access denied. You do not have permission to manage divisions for this team.',
  WRITE_OPERATION_DENIED: 'Forbidden. Your role does not permit this operation.',
  DELETE_DENIED_EM: 'Forbidden. Engineering Managers cannot delete records.',
} as const;

/**
 * Authorization Service implementation.
 * Enforces the Authorization Rules Matrix:
 * - Engineering_Manager: own team read/write only, no delete, export own team only, no audit logs
 * - Leadership: read-only all teams, no write/delete, export all, no audit logs
 * - Super_Admin: full access to everything
 */
export class AuthorizationService implements IAuthorizationService {
  /**
   * Check if user can read data for a given team.
   *
   * Rules:
   * - Engineering_Manager: can read only own team's data
   * - Leadership: can read all teams' data
   * - Super_Admin: can read all teams' data
   */
  canReadTeamData(user: UserContext, targetTeam: string): AuthorizationResult {
    if (user.role === 'Super_Admin' || user.role === 'Leadership') {
      return { permitted: true, scopedTeam: null };
    }

    if (user.role === 'Engineering_Manager') {
      if (user.teamId && user.teamId === targetTeam) {
        return { permitted: true, scopedTeam: user.teamId };
      }
      return {
        permitted: false,
        scopedTeam: null,
        errorMessage: ERROR_MESSAGES.TEAM_SCOPE_VIOLATION,
      };
    }

    // For other roles (Admin, Delivery_Manager), deny by default
    return {
      permitted: false,
      scopedTeam: null,
      errorMessage: ERROR_MESSAGES.TEAM_SCOPE_VIOLATION,
    };
  }

  /**
   * Check if user can write (create/edit) data for a given team.
   *
   * Rules:
   * - Engineering_Manager: can write only to own team
   * - Leadership: cannot write to any team
   * - Super_Admin: can write to any team
   */
  canWriteTeamData(user: UserContext, targetTeam: string): AuthorizationResult {
    if (user.role === 'Super_Admin') {
      return { permitted: true, scopedTeam: null };
    }

    if (user.role === 'Leadership') {
      return {
        permitted: false,
        scopedTeam: null,
        errorMessage: ERROR_MESSAGES.WRITE_OPERATION_DENIED,
      };
    }

    if (user.role === 'Engineering_Manager') {
      if (user.teamId && user.teamId === targetTeam) {
        return { permitted: true, scopedTeam: user.teamId };
      }
      return {
        permitted: false,
        scopedTeam: null,
        errorMessage: ERROR_MESSAGES.TEAM_SCOPE_VIOLATION,
      };
    }

    // For other roles, deny by default
    return {
      permitted: false,
      scopedTeam: null,
      errorMessage: ERROR_MESSAGES.WRITE_OPERATION_DENIED,
    };
  }

  /**
   * Check if user can delete data.
   *
   * Rules:
   * - Engineering_Manager: cannot delete any records
   * - Leadership: cannot delete any records
   * - Super_Admin: can delete any records
   */
  canDeleteData(user: UserContext): AuthorizationResult {
    if (user.role === 'Super_Admin') {
      return { permitted: true, scopedTeam: null };
    }

    if (user.role === 'Engineering_Manager') {
      return {
        permitted: false,
        scopedTeam: null,
        errorMessage: ERROR_MESSAGES.DELETE_DENIED_EM,
      };
    }

    // Leadership and other roles
    return {
      permitted: false,
      scopedTeam: null,
      errorMessage: ERROR_MESSAGES.WRITE_OPERATION_DENIED,
    };
  }

  /**
   * Get the data scope for a user (which teams they can see).
   *
   * Rules:
   * - Engineering_Manager: single_team scoped to their assigned team
   * - Leadership: all_teams
   * - Super_Admin: all_teams
   */
  getDataScope(user: UserContext): DataScope {
    if (user.role === 'Super_Admin' || user.role === 'Leadership') {
      return { type: 'all_teams', teamId: null };
    }

    if (user.role === 'Engineering_Manager') {
      return { type: 'single_team', teamId: user.teamId };
    }

    // Default: scope to their team if available, otherwise single_team with null
    return { type: 'single_team', teamId: user.teamId };
  }

  /**
   * Check if user can export reports.
   *
   * Rules:
   * - Engineering_Manager: can export (scoped to own team)
   * - Leadership: can export (all teams)
   * - Super_Admin: can export (all teams)
   */
  canExportReports(user: UserContext): AuthorizationResult {
    if (user.role === 'Super_Admin' || user.role === 'Leadership') {
      return { permitted: true, scopedTeam: null };
    }

    if (user.role === 'Engineering_Manager') {
      return { permitted: true, scopedTeam: user.teamId };
    }

    // Other roles cannot export
    return {
      permitted: false,
      scopedTeam: null,
      errorMessage: ERROR_MESSAGES.WRITE_OPERATION_DENIED,
    };
  }

  /**
   * Check if user can access audit logs.
   *
   * Rules:
   * - Engineering_Manager: no access
   * - Leadership: no access
   * - Super_Admin: full access
   */
  canAccessAuditLogs(user: UserContext): AuthorizationResult {
    if (user.role === 'Super_Admin') {
      return { permitted: true, scopedTeam: null };
    }

    return {
      permitted: false,
      scopedTeam: null,
      errorMessage: ERROR_MESSAGES.WRITE_OPERATION_DENIED,
    };
  }

  /**
   * Check if user can manage divisions (create/rename/delete/assign) for a given team.
   *
   * Rules:
   * - Super_Admin: permitted for any team
   * - Engineering_Manager: permitted only for own team (team_id match)
   * - Leadership: denied (read-only role)
   * - Others: denied
   */
  canManageDivisions(user: UserContext, targetTeam: string): AuthorizationResult {
    if (user.role === 'Super_Admin') {
      return { permitted: true, scopedTeam: null };
    }

    if (user.role === 'Engineering_Manager') {
      if (user.teamId && user.teamId === targetTeam) {
        return { permitted: true, scopedTeam: user.teamId };
      }
      return {
        permitted: false,
        scopedTeam: null,
        errorMessage: ERROR_MESSAGES.TEAM_SCOPE_DIVISION_VIOLATION,
      };
    }

    // Leadership and other roles cannot manage divisions
    return {
      permitted: false,
      scopedTeam: null,
      errorMessage: ERROR_MESSAGES.WRITE_OPERATION_DENIED,
    };
  }
}
