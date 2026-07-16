import { Navigate } from 'react-router-dom';
import { isAuthenticated, isSuperAdmin } from '../auth';

interface Props {
  children: React.ReactNode;
  requireSuperAdmin?: boolean;
}

export function ProtectedRoute({ children, requireSuperAdmin = false }: Props) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  if (requireSuperAdmin && !isSuperAdmin()) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
