/** Catalogue permissions admin (aligné mobile — modules navigation). */
export const NAV_PERMISSION_IDS = [
  'insights',
  'featured',
  'rubrique',
  'loop_hub',
  'content',
  'users',
  'partnerships',
  'moderation',
  'suggestions',
  'prime_benefits',
  'staff_benefits',
  'benefit_draw',
  'pass_management',
  'pass_payments',
  'pass_catalog',
  'pass_messages',
  'pass_prices',
  'manage_admins',
] as const;

export type AdminPermissionId = (typeof NAV_PERMISSION_IDS)[number] | string;

export const ALL_NAV_PERMISSIONS: AdminPermissionId[] = [...NAV_PERMISSION_IDS];

export function isSuperAdminUser(role: string | null | undefined): boolean {
  return (role ?? '').toLowerCase() === 'super_admin';
}

export function isAnyAdminUser(role: string | null | undefined): boolean {
  const r = (role ?? '').toLowerCase();
  return r === 'admin' || r === 'super_admin';
}

export function hasAdminPermission(
  permissions: readonly AdminPermissionId[] | null | undefined,
  permission: AdminPermissionId,
  userRole?: string | null,
): boolean {
  if (isSuperAdminUser(userRole)) return true;
  const list = permissions ?? [];
  if (list.includes(permission)) return true;
  // Enfants PASS → parent pass_management
  if (
    (permission === 'pass_payments' ||
      permission === 'pass_catalog' ||
      permission === 'pass_messages' ||
      permission === 'pass_prices') &&
    list.includes('pass_management')
  ) {
    return true;
  }
  // Demandes : accès hub si l’une des 3
  if (
    permission === 'demandes' &&
    (list.includes('partnerships') || list.includes('moderation') || list.includes('suggestions'))
  ) {
    return true;
  }
  // Sous-filtres modération → parent moderation
  if (
    (permission === 'moderation_events' ||
      permission === 'moderation_spots' ||
      permission === 'moderation_tools') &&
    list.includes('moderation')
  ) {
    return true;
  }
  return false;
}

export function hasAnyDemandesAccess(
  permissions: readonly AdminPermissionId[] | null | undefined,
  userRole?: string | null,
): boolean {
  return (
    hasAdminPermission(permissions, 'partnerships', userRole) ||
    hasAdminPermission(permissions, 'moderation', userRole) ||
    hasAdminPermission(permissions, 'suggestions', userRole)
  );
}

export function sanitizePermissions(raw: unknown): AdminPermissionId[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is string => typeof p === 'string');
}
