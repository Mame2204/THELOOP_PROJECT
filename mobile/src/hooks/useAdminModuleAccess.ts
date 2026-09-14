import { useAuthContext } from '@/context/AuthContext';
import { useAdminPermissions } from '@/context/AdminPermissionsContext';
import { adminPermissionLabel, type AdminPermissionId } from '@/lib/admin-permissions';

export function useAdminModuleAccess(permission: AdminPermissionId) {
  const { role } = useAuthContext();
  const { hasPermission, isLoading, isSuperAdmin, permissions } = useAdminPermissions();
  const isAdmin = role === 'ADMIN';
  const allowed = isAdmin && hasPermission(permission);
  const blocking = isLoading && !isSuperAdmin && permissions.length === 0;

  return {
    allowed,
    isLoading: blocking,
    isAdmin,
    permissionLabel: adminPermissionLabel(permission),
  };
}

export function useAdminSubTabAccess(parentId: AdminPermissionId, subId: AdminPermissionId) {
  const { role } = useAuthContext();
  const { hasSubPermission, hasPermission, isLoading, isSuperAdmin, permissions } = useAdminPermissions();
  const isAdmin = role === 'ADMIN';
  const allowed = isAdmin && hasSubPermission(parentId, subId);
  const moduleAllowed = isAdmin && hasPermission(parentId);
  const blocking = isLoading && !isSuperAdmin && permissions.length === 0;

  return {
    allowed,
    moduleAllowed,
    isLoading: blocking,
    isAdmin,
    permissionLabel: adminPermissionLabel(subId),
  };
}

export function useFilteredAdminTabs<T extends string>(
  parentId: AdminPermissionId,
  tabs: ReadonlyArray<{ id: T; label: string; permission: AdminPermissionId; badge?: number }>,
): Array<{ id: T; label: string; badge?: number }> {
  const { hasSubPermission, isSuperAdmin } = useAdminPermissions();
  if (isSuperAdmin) return tabs.map(({ id, label, badge }) => ({ id, label, badge }));
  const filtered = tabs.filter((tab) => hasSubPermission(parentId, tab.permission));
  return filtered.map(({ id, label, badge }) => ({ id, label, badge }));
}

export function useAnyAdminModuleAccess(permissions: AdminPermissionId | AdminPermissionId[]) {
  const { role } = useAuthContext();
  const { hasPermission, isLoading, isSuperAdmin, permissions: granted } = useAdminPermissions();
  const isAdmin = role === 'ADMIN';
  const list = Array.isArray(permissions) ? permissions : [permissions];
  const allowed = isAdmin && list.some((p) => hasPermission(p));
  const blocking = isLoading && !isSuperAdmin && granted.length === 0;

  return { allowed, isLoading: blocking, isAdmin };
}
