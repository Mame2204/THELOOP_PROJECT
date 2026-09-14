import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { RootStackParamList } from '@/navigation/types';

export interface AdminPermissionDef {
  id: AdminPermissionId;
  label: string;
  description: string;
  route?: keyof RootStackParamList;
  /** Groupe d'affichage dans l'écran Permission */
  group: AdminPermissionGroupId;
  /** Module parent — sous-onglet ou entrée Paramètres */
  parentId?: AdminPermissionId;
  /** Non proposé aux admins délégués (super admin uniquement) */
  superAdminOnly?: boolean;
}

export type AdminPermissionGroupId =
  | 'navigation'
  | 'parametres'
  | 'accueil'
  | 'privilèges'
  | 'teams'
  | 'etoiles'
  | 'insights'
  | 'contenu'
  | 'moderation'
  | 'demandes'
  | 'onglets'
  | 'pass';

export const ADMIN_PERMISSION_GROUPS: { id: AdminPermissionGroupId; label: string; hint?: string }[] = [
  { id: 'navigation', label: 'Navigation Control Tower', hint: 'Modules visibles dans la barre latérale.' },
  { id: 'parametres', label: 'Paramètres plateforme', hint: 'Réglages avancés (écran Param.).' },
  { id: 'accueil', label: 'Accueil — sous-onglets', hint: 'Sans sous-onglet coché = accès complet au module Accueil.' },
  { id: 'privilèges', label: 'Privilèges — sous-onglets', hint: 'Sans sous-onglet coché = accès complet aux Privilèges.' },
  { id: 'teams', label: 'TEAMS — sous-onglets', hint: 'Pack équipe et ajustements par admin.' },
  { id: 'etoiles', label: 'Étoiles — sous-onglets', hint: 'Octroi, classement et réglages étoiles.' },
  { id: 'insights', label: 'Insights — sous-onglets', hint: 'Sections statistiques et plateforme.' },
  { id: 'contenu', label: 'Contenu — filtres', hint: 'Types de contenu dans Control Tower → Contenu.' },
  { id: 'moderation', label: 'Modération — filtres', hint: 'Types dans Demandes → Modération.' },
  { id: 'demandes', label: 'Demandes', hint: 'Hub Partenariats · Modération · Idées.' },
  { id: 'onglets', label: 'Onglets app — sections', hint: 'Visibilité onglets membres et blocs partenaire.' },
  { id: 'pass', label: 'PASS — sections', hint: 'Gestion PASS, prix et modèles de notification.' },
];

export const ADMIN_PERMISSION_CATALOG: AdminPermissionDef[] = [
  // — Navigation —
  { id: 'insights', group: 'navigation', label: 'Insights', description: 'Statistiques plébiscites et engagement', route: 'AdminInsights' },
  { id: 'featured', group: 'navigation', label: 'Accueil', description: 'Blocs Accueil membre (sondage, parcours, Singuliers…)', route: 'AdminAccueil' },
  { id: 'rubrique', group: 'navigation', label: 'Onglets app', description: 'Visibilité onglets Agenda / Spots / Outils et espace pro', route: 'AdminRubrique' },
  { id: 'loop_hub', group: 'navigation', label: 'THE LOOP', description: 'Hub publication équipe THE LOOP', route: 'AdminLoopHub' },
  { id: 'content', group: 'navigation', label: 'Contenu', description: 'Catalogue, parcours, Singuliers et logos — publier et gérer', route: 'AdminContent' },
  { id: 'spot_stars', group: 'navigation', label: 'Étoiles', description: 'Réglages étoiles (via Paramètres)', route: 'AdminSpotStars' },
  { id: 'users', group: 'navigation', label: 'Utilisateurs', description: 'Membres, Prime, partenaires', route: 'AdminUsers' },
  { id: 'prime_benefits', group: 'navigation', label: 'Privilèges THE LOOP', description: 'Catalogue, suivi et octrois privilèges', route: 'AdminPrimeBenefits' },
  { id: 'staff_benefits', group: 'navigation', label: 'TEAMS', description: 'Pack privilèges équipe admin', route: 'AdminStaffBenefits' },
  { id: 'benefit_draw', group: 'navigation', label: 'Tirage au sort', description: 'Tirages privilèges par rôle', route: 'AdminBenefitDraw' },
  { id: 'pass_management', group: 'navigation', label: 'Gestion PASS', description: 'Catalogue PASS et octroi aux membres', route: 'AdminPassManagement' },
  { id: 'manage_admins', group: 'navigation', label: 'Paramètres & permissions', description: 'Réglages plateforme et gestion des admins', route: 'AdminSuperSettings', superAdminOnly: true },

  // — Paramètres (sous-écran Param.) —
  { id: 'content_countries', group: 'parametres', parentId: 'manage_admins', label: 'Pays du contenu', description: 'Activer des pays pour le catalogue', route: 'AdminContentCountries' },
  { id: 'categories', group: 'parametres', parentId: 'manage_admins', label: 'Catégories', description: 'Libellés et activation des catégories', route: 'AdminCategories' },
  { id: 'partner_milestones', group: 'parametres', parentId: 'manage_admins', label: 'Paliers partenaires', description: 'Récompenses milestones partenaires', route: 'AdminPartnerMilestones' },
  { id: 'automation', group: 'parametres', parentId: 'manage_admins', label: 'Automatisations', description: 'Jobs bienvenue, anniversaire, octroi…', route: 'AdminAutomationJobs' },
  { id: 'notifications', group: 'parametres', parentId: 'manage_admins', label: 'Notifications auto', description: 'Push planifiés et envois ciblés', route: 'AdminNotifications' },
  { id: 'standalone_benefit', group: 'parametres', parentId: 'manage_admins', label: 'Privilège standalone', description: 'Modèles privilège THE LOOP sans partenaire', route: 'AdminStandaloneBenefit' },
  { id: 'benefit_types', group: 'parametres', parentId: 'manage_admins', label: 'Types d\'privilège', description: 'Modèles et types catalogue', route: 'AdminBenefitTypes' },
  { id: 'opening_hours', group: 'parametres', parentId: 'manage_admins', label: 'Horaires spots', description: 'Modes et heures par défaut des spots', route: 'AdminOpeningHours' },
  { id: 'legal', group: 'parametres', parentId: 'manage_admins', label: 'CGU & légal', description: 'CGU, conditions partenaires, mentions légales', route: 'AdminLegal' },
  { id: 'admin_permissions', group: 'parametres', parentId: 'manage_admins', label: 'Gestion permissions', description: 'Créer admins et gérer leurs modules', route: 'AdminPermissions', superAdminOnly: true },

  // — Accueil sous-onglets —
  { id: 'featured_overview', group: 'accueil', parentId: 'featured', label: 'Vue d\'ensemble', description: 'Tableau de bord Accueil' },
  { id: 'featured_hero', group: 'accueil', parentId: 'featured', label: 'À la une', description: 'Slider hero Accueil' },
  { id: 'featured_poll', group: 'accueil', parentId: 'featured', label: 'Sondage', description: 'Sondages Accueil' },
  { id: 'featured_walks', group: 'accueil', parentId: 'featured', label: 'Parcours', description: 'Parcours Accueil' },
  { id: 'featured_corner', group: 'accueil', parentId: 'featured', label: 'Le Singulier', description: 'Bloc Le Singulier' },
  { id: 'featured_chronique', group: 'accueil', parentId: 'featured', label: 'Le Fragment', description: 'Bloc Le Fragment' },
  { id: 'featured_logos', group: 'accueil', parentId: 'featured', label: 'Logos', description: 'Logos partenaires Accueil' },

  // — Privilèges sous-onglets —
  { id: 'prime_benefits_creation', group: 'privilèges', parentId: 'prime_benefits', label: 'Création', description: 'Proposer un nouvel privilège' },
  { id: 'prime_benefits_validations', group: 'privilèges', parentId: 'prime_benefits', label: 'Validation partenaire', description: 'Offres en attente de validation' },
  { id: 'prime_benefits_catalog', group: 'privilèges', parentId: 'prime_benefits', label: 'Catalogue', description: 'Liste des privilèges actifs' },
  { id: 'prime_benefits_suivi', group: 'privilèges', parentId: 'prime_benefits', label: 'Suivi', description: 'Statistiques d\'utilisation' },
  { id: 'prime_benefits_grant', group: 'privilèges', parentId: 'prime_benefits', label: 'Octroyer', description: 'Octroi manuel et campagnes' },

  // — TEAMS sous-onglets —
  { id: 'staff_benefits_team', group: 'teams', parentId: 'staff_benefits', label: 'Pack Admin', description: 'Privilèges communs aux admins du pays (hors super admin)' },
  { id: 'staff_benefits_admin', group: 'teams', parentId: 'staff_benefits', label: 'Par admin', description: 'Ajustements individuels par admin' },

  // — Étoiles sous-onglets —
  { id: 'spot_stars_grant', group: 'etoiles', parentId: 'spot_stars', label: 'Octroi manuel', description: 'Attribuer des étoiles manuellement' },
  { id: 'spot_stars_top', group: 'etoiles', parentId: 'spot_stars', label: 'Top étoilés', description: 'Classement des spots et outils' },
  { id: 'spot_stars_settings', group: 'etoiles', parentId: 'spot_stars', label: 'Réglages', description: 'Poids engagement et paliers' },

  // — Insights sous-onglets —
  { id: 'insights_overview', group: 'insights', parentId: 'insights', label: 'Vue d\'ensemble', description: 'KPIs globaux' },
  { id: 'insights_events', group: 'insights', parentId: 'insights', label: 'Événements', description: 'Métriques événements' },
  { id: 'insights_spots', group: 'insights', parentId: 'insights', label: 'Spots', description: 'Métriques spots' },
  { id: 'insights_tools', group: 'insights', parentId: 'insights', label: 'Outils', description: 'Métriques outils' },
  { id: 'insights_benefits', group: 'insights', parentId: 'insights', label: 'Privilèges', description: 'Métriques privilèges' },
  { id: 'insights_platform', group: 'insights', parentId: 'insights', label: 'Accueil plateforme', description: 'Statistiques blocs Accueil' },

  // — Contenu filtres —
  { id: 'content_events', group: 'contenu', parentId: 'content', label: 'Événements', description: 'Filtrer et gérer les événements' },
  { id: 'content_spots', group: 'contenu', parentId: 'content', label: 'Spots', description: 'Filtrer et gérer les spots' },
  { id: 'content_tools', group: 'contenu', parentId: 'content', label: 'Outils', description: 'Filtrer et gérer les outils' },
  { id: 'content_walks', group: 'contenu', parentId: 'content', label: 'Parcours', description: 'Filtrer et gérer les parcours' },
  { id: 'content_corner', group: 'contenu', parentId: 'content', label: 'Le Singulier', description: 'Filtrer et gérer Le Singulier' },
  { id: 'content_chronique', group: 'contenu', parentId: 'content', label: 'Le Fragment', description: 'Filtrer et gérer Le Fragment' },
  { id: 'content_logos', group: 'contenu', parentId: 'content', label: 'Logos', description: 'Filtrer et gérer les logos Accueil' },

  // — Modération filtres —
  { id: 'moderation_events', group: 'moderation', parentId: 'moderation', label: 'Événements', description: 'Modérer les événements soumis' },
  { id: 'moderation_spots', group: 'moderation', parentId: 'moderation', label: 'Spots', description: 'Modérer les spots soumis' },
  { id: 'moderation_tools', group: 'moderation', parentId: 'moderation', label: 'Outils', description: 'Modérer les outils soumis' },

  // — Demandes (hub) —
  { id: 'partnerships', group: 'demandes', label: 'Partenariats', description: 'Pipeline commercial partenaires', route: 'AdminPartnerships' },
  { id: 'moderation', group: 'demandes', label: 'Modération', description: 'Valider soumissions partenaires', route: 'AdminModeration' },
  { id: 'suggestions', group: 'demandes', label: 'Suggestions', description: 'Idées communauté', route: 'AdminSuggestions' },

  // — Onglets app sections —
  { id: 'rubrique_member_tabs', group: 'onglets', parentId: 'rubrique', label: 'Onglets membres', description: 'Agenda, Spots, Outils — visibilité' },
  { id: 'rubrique_partner_blocks', group: 'onglets', parentId: 'rubrique', label: 'Blocs espace pro', description: 'Sections visibles côté partenaire' },

  // — PASS sections —
  { id: 'pass_catalog', group: 'pass', parentId: 'pass_management', label: 'Catalogue & octroi', description: 'Gestion des PASS membres' },
  { id: 'pass_messages', group: 'pass', parentId: 'pass_management', label: 'Modèles notification', description: 'Messages à l\'activation PASS' },
  { id: 'pass_prices', group: 'pass', parentId: 'pass_management', label: 'Prix PASS', description: 'Tarifs standards GNF' },
  { id: 'pass_payments', group: 'pass', parentId: 'pass_management', label: 'Paiements Djomy', description: 'Suivi des transactions et activation PASS', route: 'AdminPayments' },
];

export type AdminPermissionId = (typeof ADMIN_PERMISSION_CATALOG)[number]['id'];

export const ALL_ADMIN_PERMISSION_IDS: AdminPermissionId[] = ADMIN_PERMISSION_CATALOG.map((p) => p.id);

const PERMISSION_BY_ID = new Map<AdminPermissionId, AdminPermissionDef>(
  ADMIN_PERMISSION_CATALOG.map((p) => [p.id, p]),
);

const CHILDREN_BY_PARENT = new Map<AdminPermissionId, AdminPermissionDef[]>();
for (const def of ADMIN_PERMISSION_CATALOG) {
  if (!def.parentId) continue;
  const list = CHILDREN_BY_PARENT.get(def.parentId) ?? [];
  list.push(def);
  CHILDREN_BY_PARENT.set(def.parentId, list);
}

/** Permissions racine (modules navigation + demandes sans parent). */
export function getRootAdminPermissions(): AdminPermissionDef[] {
  return ADMIN_PERMISSION_CATALOG.filter((p) => !p.parentId && p.group !== 'demandes')
    .concat(ADMIN_PERMISSION_CATALOG.filter((p) => p.group === 'demandes'));
}

export function getChildPermissions(parentId: AdminPermissionId): AdminPermissionDef[] {
  return CHILDREN_BY_PARENT.get(parentId) ?? [];
}

export function getPermissionsByGroup(groupId: AdminPermissionGroupId): AdminPermissionDef[] {
  return ADMIN_PERMISSION_CATALOG.filter((p) => p.group === groupId);
}

export function adminPermissionDef(id: AdminPermissionId): AdminPermissionDef | undefined {
  return PERMISSION_BY_ID.get(id);
}

const LOCAL_KEY = 'loop_admin_permissions_v1';

const DEFAULT_DELEGATED_PERMISSIONS: AdminPermissionId[] = ['moderation', 'content', 'insights'];

/** Alias legacy — anciens jeux de permissions restent valides. */
const LEGACY_PARENT_ALIASES: Partial<Record<AdminPermissionId, AdminPermissionId[]>> = {
  rubrique: ['content', 'partnerships'],
  loop_hub: ['content', 'featured', 'prime_benefits'],
  staff_benefits: ['prime_benefits'],
};

let memoryPermissions: AdminPermissionId[] | null = null;

export function getCachedAdminPermissions(): AdminPermissionId[] | null {
  return memoryPermissions;
}

export function isSuperAdminUser(userRole: string | null | undefined): boolean {
  return (userRole ?? '').toLowerCase() === 'super_admin';
}

export function isDelegatedAdmin(userRole: string | null | undefined): boolean {
  return (userRole ?? '').toLowerCase() === 'admin';
}

export function isAnyAdminUser(userRole: string | null | undefined): boolean {
  const r = (userRole ?? '').toLowerCase();
  return r === 'admin' || r === 'super_admin';
}

function hasLegacyParentAccess(
  permissions: readonly AdminPermissionId[],
  permission: AdminPermissionId,
): boolean {
  const aliases = LEGACY_PARENT_ALIASES[permission];
  if (!aliases?.length) return false;
  return aliases.some((alias) => permissions.includes(alias));
}

export function hasAdminPermission(
  permissions: readonly AdminPermissionId[] | null | undefined,
  permission: AdminPermissionId,
  userRole?: string | null,
): boolean {
  if (isSuperAdminUser(userRole)) return true;
  const list = permissions ?? [];
  if (list.includes(permission)) return true;
  const def = PERMISSION_BY_ID.get(permission);
  if (def?.parentId && list.includes(def.parentId)) return true;
  return hasLegacyParentAccess(list, permission);
}

/**
 * Accès sous-onglet : parent requis ; si aucun enfant coché → accès complet ;
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

export function permissionForRoute(route: keyof RootStackParamList): AdminPermissionId | null {
  const match = ADMIN_PERMISSION_CATALOG.find((p) => p.route === route);
  return match?.id ?? null;
}

export function editableAdminPermissions(): AdminPermissionDef[] {
  return ADMIN_PERMISSION_CATALOG.filter((p) => !p.superAdminOnly);
}

async function saveLocal(payload: { permissions: AdminPermissionId[]; defaults: AdminPermissionId[] }): Promise<void> {
  memoryPermissions = payload.permissions;
  await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
}

async function loadLocal(): Promise<{ permissions: AdminPermissionId[]; defaults: AdminPermissionId[] } | null> {
  if (memoryPermissions) {
    return { permissions: memoryPermissions, defaults: [] };
  }
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { permissions: AdminPermissionId[]; defaults: AdminPermissionId[] };
    memoryPermissions = parsed.permissions;
    return parsed;
  } catch {
    return null;
  }
}

function sanitizePermissions(raw: unknown): AdminPermissionId[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is AdminPermissionId => typeof p === 'string' && ALL_ADMIN_PERMISSION_IDS.includes(p as AdminPermissionId),
  );
}

export async function fetchMyAdminPermissions(userRole: string | null | undefined): Promise<AdminPermissionId[]> {
  if (!isAnyAdminUser(userRole)) return [];
  if (isSuperAdminUser(userRole)) return [...ALL_ADMIN_PERMISSION_IDS];

  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.rpc('get_my_admin_permissions');
    if (!error && Array.isArray(data)) {
      const permissions = sanitizePermissions(data);
      await saveLocal({ permissions, defaults: [] });
      return permissions;
    }
  }

  const local = await loadLocal();
  return local?.permissions ?? DEFAULT_DELEGATED_PERMISSIONS;
}

export async function peekMyAdminPermissions(userRole: string | null | undefined): Promise<AdminPermissionId[]> {
  if (!isAnyAdminUser(userRole)) return [];
  if (isSuperAdminUser(userRole)) return [...ALL_ADMIN_PERMISSION_IDS];
  const local = await loadLocal();
  return local?.permissions ?? DEFAULT_DELEGATED_PERMISSIONS;
}

export async function fetchAdminDefaultPermissions(): Promise<AdminPermissionId[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.rpc('get_admin_default_permissions');
    if (!error && Array.isArray(data)) {
      return sanitizePermissions(data);
    }
  }
  return ['moderation', 'content', 'insights'];
}

export async function saveAdminDefaultPermissions(permissions: AdminPermissionId[]): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const { error } = await supabase.rpc('set_admin_default_permissions', { p_permissions: permissions });
  if (error) throw new Error(error.message);
}

export async function saveAdminPermissionOverrides(
  targetUserId: string,
  grants: AdminPermissionId[],
  revokes: AdminPermissionId[],
): Promise<AdminPermissionId[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.rpc('set_admin_permission_overrides', {
    p_target_user_id: targetUserId,
    p_grants: grants,
    p_revokes: revokes,
  });
  if (error) throw new Error(error.message);
  const effective = (data as { effective?: string[] } | null)?.effective ?? [];
  return sanitizePermissions(effective);
}

export async function fetchUserAdminPermissions(userId: string): Promise<AdminPermissionId[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.rpc('get_user_admin_permissions', { p_user_id: userId });
  if (error || !Array.isArray(data)) return [];
  return sanitizePermissions(data);
}

export function computePermissionOverrides(
  defaults: AdminPermissionId[],
  effective: AdminPermissionId[],
): { grants: AdminPermissionId[]; revokes: AdminPermissionId[] } {
  const grants = effective.filter((p) => !defaults.includes(p));
  const revokes = defaults.filter((p) => !effective.includes(p));
  return { grants, revokes };
}

export function adminPermissionLabel(id: AdminPermissionId): string {
  return PERMISSION_BY_ID.get(id)?.label ?? id;
}

/** Retire les enfants si le parent est retiré ; ajoute le parent si un enfant est ajouté. */
export function normalizePermissionSelection(selected: AdminPermissionId[]): AdminPermissionId[] {
  const set = new Set(selected);
  for (const def of ADMIN_PERMISSION_CATALOG) {
    if (def.parentId && set.has(def.id) && !set.has(def.parentId)) {
      set.add(def.parentId);
    }
  }
  for (const def of ADMIN_PERMISSION_CATALOG) {
    if (!def.parentId) continue;
    const children = getChildPermissions(def.id);
    if (!set.has(def.id) && children.some((c) => set.has(c.id))) {
      set.add(def.id);
    }
  }
  for (const def of ADMIN_PERMISSION_CATALOG) {
    if (!def.parentId && !set.has(def.id)) {
      for (const child of getChildPermissions(def.id)) {
        set.delete(child.id);
      }
    }
  }
  return ALL_ADMIN_PERMISSION_IDS.filter((id) => set.has(id));
}

export function togglePermissionSelection(
  selected: AdminPermissionId[],
  id: AdminPermissionId,
  enabled: boolean,
): AdminPermissionId[] {
  const set = new Set(selected);
  if (enabled) {
    set.add(id);
    const def = PERMISSION_BY_ID.get(id);
    if (def?.parentId) set.add(def.parentId);
  } else {
    set.delete(id);
    for (const child of getChildPermissions(id)) {
      set.delete(child.id);
    }
  }
  return normalizePermissionSelection([...set]);
}
