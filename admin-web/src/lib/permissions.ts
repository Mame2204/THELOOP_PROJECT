import {
  ALL_ADMIN_PERMISSION_IDS,
  getChildPermissions,
} from './permission-catalog';

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
  // Enfants Contenu → parent content
  if (
    (permission === 'content_events' ||
      permission === 'content_spots' ||
      permission === 'content_tools' ||
      permission === 'content_walks' ||
      permission === 'content_corner' ||
      permission === 'content_chronique' ||
      permission === 'content_logos') &&
    list.includes('content')
  ) {
    return true;
  }
  // Enfants Accueil → parent featured
  if (
    (permission === 'featured_overview' ||
      permission === 'featured_hero' ||
      permission === 'featured_poll' ||
      permission === 'featured_walks' ||
      permission === 'featured_corner' ||
      permission === 'featured_chronique' ||
      permission === 'featured_logos') &&
    list.includes('featured')
  ) {
    return true;
  }
  // Enfants Insights → parent insights
  if (
    (permission === 'insights_overview' ||
      permission === 'insights_events' ||
      permission === 'insights_spots' ||
      permission === 'insights_tools' ||
      permission === 'insights_benefits' ||
      permission === 'insights_platform') &&
    list.includes('insights')
  ) {
    return true;
  }
  // Enfants Privilèges → parent prime_benefits
  if (
    (permission === 'prime_benefits_creation' ||
      permission === 'prime_benefits_validations' ||
      permission === 'prime_benefits_catalog' ||
      permission === 'prime_benefits_suivi' ||
      permission === 'prime_benefits_grant') &&
    list.includes('prime_benefits')
  ) {
    return true;
  }
  // Alias hub THE LOOP (mobile) : content | featured | prime_benefits
  if (
    permission === 'loop_hub' &&
    (list.includes('loop_hub') ||
      list.includes('content') ||
      list.includes('featured') ||
      list.includes('prime_benefits'))
  ) {
    return true;
  }
  // Enfants Paramètres → parent manage_admins
  if (
    (permission === 'content_countries' ||
      permission === 'categories' ||
      permission === 'legal' ||
      permission === 'admin_permissions' ||
      permission === 'partner_milestones' ||
      permission === 'automation' ||
      permission === 'notifications' ||
      permission === 'standalone_benefit' ||
      permission === 'opening_hours') &&
    list.includes('manage_admins')
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

/**
 * Sous-onglet : parent requis ; si aucun enfant coché → accès complet ;
 * si au moins un enfant coché → uniquement les enfants cochés.
 */
export function hasAdminSubPermission(
  permissions: readonly AdminPermissionId[] | null | undefined,
  parentId: AdminPermissionId,
  subId: AdminPermissionId,
  userRole?: string | null,
): boolean {
  if (isSuperAdminUser(userRole)) return true;
  if (!hasAdminPermission(permissions, parentId, userRole)) return false;

  const children = getChildPermissions(parentId);
  if (!children.length) return true;

  const list = permissions ?? [];
  const grantedChildren = children.filter((c) => list.includes(c.id));
  if (grantedChildren.length === 0) return true;
  return list.includes(subId);
}

export { ALL_ADMIN_PERMISSION_IDS, getChildPermissions };
