import { Navigate } from 'react-router-dom';
import { usePermissions } from '../context/PermissionsContext';
import type { AdminPermissionId } from '../lib/permissions';
import type { ReactNode } from 'react';

export function RequirePermission({
  permission,
  children,
}: {
  permission: AdminPermissionId | 'demandes';
  children: ReactNode;
}) {
  const { can, canDemandes, ready } = usePermissions();
  if (!ready) return <p className="muted">Vérification des droits…</p>;

  const ok =
    permission === 'demandes'
      ? canDemandes
      : permission === 'pass_payments'
        ? can('pass_payments') || can('pass_management')
        : can(permission);

  if (!ok) return <Navigate to="/" replace />;
  return children;
}
