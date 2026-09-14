import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import {
  fetchMyAdminPermissions,
  getCachedAdminPermissions,
  hasAdminPermission,
  hasAdminSubPermission,
  isAnyAdminUser,
  isSuperAdminUser,
  peekMyAdminPermissions,
  ALL_ADMIN_PERMISSION_IDS,
  type AdminPermissionId,
} from '@/lib/admin-permissions';

interface AdminPermissionsContextValue {
  permissions: AdminPermissionId[];
  isSuperAdmin: boolean;
  isAdmin: boolean;
  /** True seulement tant qu'aucune permission n'est connue (pas de cache). */
  isLoading: boolean;
  hasPermission: (permission: AdminPermissionId) => boolean;
  hasSubPermission: (parentId: AdminPermissionId, subId: AdminPermissionId) => boolean;
  refreshPermissions: () => Promise<void>;
}

const AdminPermissionsContext = createContext<AdminPermissionsContextValue | null>(null);

export function AdminPermissionsProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuthContext();
  const isAdmin = role === 'ADMIN' && isAnyAdminUser(user?.userRole);
  const isSuperAdmin = isSuperAdminUser(user?.userRole);

  const [permissions, setPermissions] = useState<AdminPermissionId[]>(() => {
    if (!isAdmin) return [];
    if (isSuperAdmin) return [...ALL_ADMIN_PERMISSION_IDS];
    return getCachedAdminPermissions() ?? ['moderation', 'content', 'insights'];
  });
  const [isLoading, setIsLoading] = useState(() => {
    if (!isAdmin || isSuperAdmin) return false;
    return getCachedAdminPermissions() === null;
  });

  const refreshPermissions = useCallback(async () => {
    if (!isAdmin) {
      setPermissions([]);
      setIsLoading(false);
      return;
    }
    const fresh = await fetchMyAdminPermissions(user?.userRole);
    setPermissions(fresh);
    setIsLoading(false);
  }, [isAdmin, user?.userRole]);

  useEffect(() => {
    if (!isAdmin) {
      setPermissions([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    void peekMyAdminPermissions(user?.userRole).then((peeked) => {
      if (cancelled) return;
      setPermissions(peeked);
      setIsLoading(false);
    });
    void refreshPermissions();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, user?.id, user?.userRole, refreshPermissions]);

  const hasPermission = useCallback(
    (permission: AdminPermissionId) => hasAdminPermission(permissions, permission, user?.userRole),
    [permissions, user?.userRole],
  );

  const hasSubPermission = useCallback(
    (parentId: AdminPermissionId, subId: AdminPermissionId) =>
      hasAdminSubPermission(permissions, parentId, subId, user?.userRole),
    [permissions, user?.userRole],
  );

  const value = useMemo(
    () => ({
      permissions,
      isSuperAdmin,
      isAdmin,
      isLoading,
      hasPermission,
      hasSubPermission,
      refreshPermissions,
    }),
    [permissions, isSuperAdmin, isAdmin, isLoading, hasPermission, hasSubPermission, refreshPermissions],
  );

  return <AdminPermissionsContext.Provider value={value}>{children}</AdminPermissionsContext.Provider>;
}

export function useAdminPermissions() {
  const ctx = useContext(AdminPermissionsContext);
  if (!ctx) throw new Error('useAdminPermissions requires AdminPermissionsProvider');
  return ctx;
}
