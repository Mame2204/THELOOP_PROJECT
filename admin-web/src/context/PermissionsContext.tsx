import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import {
  ALL_NAV_PERMISSIONS,
  hasAdminPermission,
  hasAnyDemandesAccess,
  isSuperAdminUser,
  sanitizePermissions,
  type AdminPermissionId,
} from '../lib/permissions';
import { useAuth } from './AuthContext';

interface PermissionsContextValue {
  ready: boolean;
  permissions: AdminPermissionId[];
  can: (permission: AdminPermissionId) => boolean;
  canDemandes: boolean;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [ready, setReady] = useState(false);
  const [permissions, setPermissions] = useState<AdminPermissionId[]>([]);

  useEffect(() => {
    if (!profile) {
      setPermissions([]);
      setReady(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      setReady(false);
      if (isSuperAdminUser(profile.role)) {
        if (!cancelled) {
          setPermissions([...ALL_NAV_PERMISSIONS]);
          setReady(true);
        }
        return;
      }

      const { data, error } = await supabase.rpc('get_my_admin_permissions');
      if (cancelled) return;
      if (!error && Array.isArray(data)) {
        setPermissions(sanitizePermissions(data));
      } else {
        // Défaut délégué (aligné mobile)
        setPermissions(['moderation', 'content', 'insights']);
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [profile]);

  const can = useCallback(
    (permission: AdminPermissionId) =>
      hasAdminPermission(permissions, permission, profile?.role),
    [permissions, profile?.role],
  );

  const value = useMemo(
    () => ({
      ready,
      permissions,
      can,
      canDemandes: hasAnyDemandesAccess(permissions, profile?.role),
    }),
    [ready, permissions, can, profile?.role],
  );

  return (
    <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions hors PermissionsProvider');
  return ctx;
}
