import { getStoredUser } from '../auth';

export interface RoleAdapterProps {
  allowedRoles: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders children based on the authenticated user's role.
 *
 * This is a pure UI adapter — server-side permission enforcement is the true guard.
 * The component reads the current user's role from the auth context and renders
 * children only if the role is in the allowedRoles array.
 */
export function RoleAdapter({ allowedRoles, children, fallback = null }: RoleAdapterProps) {
  const user = getStoredUser();

  if (!user) {
    return <>{fallback}</>;
  }

  if (allowedRoles.includes(user.role)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

export default RoleAdapter;
