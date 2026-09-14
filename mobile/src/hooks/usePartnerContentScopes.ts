import { useMemo } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import {
  hasAnyPartnerContentScope,
  resolvePartnerContentScopes,
  type PartnerContentScopes,
} from '@/lib/partner-content-scopes';

export function usePartnerContentScopes(): {
  scopes: PartnerContentScopes | null;
  canManageEvents: boolean;
  canManageSpots: boolean;
  canManageTools: boolean;
  hasAnyScope: boolean;
} {
  const { user, role } = useAuthContext();
  const scopes = useMemo(
    () => resolvePartnerContentScopes(role, user?.partnerContentScopes ?? undefined),
    [role, user?.partnerContentScopes],
  );
  return {
    scopes,
    canManageEvents: scopes?.events ?? false,
    canManageSpots: scopes?.spots ?? false,
    canManageTools: scopes?.tools ?? false,
    hasAnyScope: hasAnyPartnerContentScope(scopes),
  };
}
