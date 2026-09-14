import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { hasMinimumRole, type UserRole } from '@/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  minimumRole?: UserRole;
  allowedRoles?: UserRole[];
  redirectTo?: string;
}

export function ProtectedRoute({
  children,
  minimumRole,
  allowedRoles,
  redirectTo = '/',
}: ProtectedRouteProps) {
  const { role, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-loop-gold border-t-transparent" />
      </div>
    );
  }

  const hasAccess = allowedRoles
    ? allowedRoles.includes(role)
    : minimumRole
      ? hasMinimumRole(role, minimumRole)
      : role !== 'USER_ANONYMOUS';

  if (!hasAccess) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
