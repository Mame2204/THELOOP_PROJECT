/** Catalogue permissions admin — aligné mobile (`admin-permissions.ts`). */

export type AdminPermissionGroupId =
  | 'navigation'
  | 'parametres'
  | 'accueil'
  | 'privileges'
  | 'teams'
  | 'etoiles'
  | 'insights'
  | 'contenu'
  | 'moderation'
  | 'demandes'
  | 'onglets'
  | 'pass';

export interface AdminPermissionDef {
  id: string;
  label: string;
  description: string;
  group: AdminPermissionGroupId;
  parentId?: string;
  superAdminOnly?: boolean;
}

export const ADMIN_PERMISSION_GROUPS: { id: AdminPermissionGroupId; label: string; hint?: string }[] = [
  { id: 'navigation', label: 'Navigation', hint: 'Modules visibles dans la barre latérale.' },
  { id: 'parametres', label: 'Paramètres plateforme', hint: 'Réglages avancés (écran Param.).' },
  { id: 'accueil', label: 'Accueil — sous-onglets', hint: 'Sans sous-onglet coché = accès complet au module Accueil.' },
  { id: 'privileges', label: 'Privilèges — sous-onglets', hint: 'Sans sous-onglet coché = accès complet aux Privilèges.' },
  { id: 'teams', label: 'TEAMS — sous-onglets', hint: 'Pack équipe et ajustements par admin.' },
  { id: 'etoiles', label: 'Étoiles — sous-onglets', hint: 'Octroi, classement et réglages étoiles.' },
  { id: 'insights', label: 'Insights — sous-onglets', hint: 'Sections statistiques et plateforme.' },
  { id: 'contenu', label: 'Contenu — filtres', hint: 'Types de contenu dans Contenu.' },
  { id: 'moderation', label: 'Modération — filtres', hint: 'Types dans Demandes → Modération.' },
  { id: 'demandes', label: 'Demandes', hint: 'Hub Partenariats · Modération · Idées.' },
  { id: 'onglets', label: 'Onglets app', hint: 'Visibilité onglets membres et blocs partenaire.' },
  { id: 'pass', label: 'PASS — sections', hint: 'Gestion PASS, prix et modèles de notification.' },
];

export const ADMIN_PERMISSION_CATALOG: AdminPermissionDef[] = [
  { id: 'insights', group: 'navigation', label: 'Insights', description: 'Statistiques plébiscites et engagement' },
  { id: 'featured', group: 'navigation', label: 'Accueil', description: 'Blocs Accueil membre' },
  { id: 'rubrique', group: 'navigation', label: 'Onglets app', description: 'Visibilité onglets Agenda / Spots / Outils' },
  { id: 'loop_hub', group: 'navigation', label: 'THE LOOP', description: 'Hub publication équipe THE LOOP' },
  { id: 'content', group: 'navigation', label: 'Contenu', description: 'Catalogue et gestion contenu' },
  { id: 'spot_stars', group: 'navigation', label: 'Étoiles', description: 'Réglages étoiles (via Param.)' },
  { id: 'users', group: 'navigation', label: 'Utilisateurs', description: 'Membres, Prime, partenaires' },
  { id: 'prime_benefits', group: 'navigation', label: 'Privilèges THE LOOP', description: 'Catalogue, suivi et octrois' },
  { id: 'staff_benefits', group: 'navigation', label: 'TEAMS', description: 'Pack privilèges équipe admin' },
  { id: 'benefit_draw', group: 'navigation', label: 'Tirage au sort', description: 'Tirages privilèges par rôle' },
  { id: 'pass_management', group: 'navigation', label: 'Gestion PASS', description: 'Catalogue PASS et octroi' },
  { id: 'manage_admins', group: 'navigation', label: 'Paramètres & permissions', description: 'Réglages plateforme', superAdminOnly: true },

  { id: 'content_countries', group: 'parametres', parentId: 'manage_admins', label: 'Pays du contenu', description: 'Activer des pays catalogue' },
  { id: 'categories', group: 'parametres', parentId: 'manage_admins', label: 'Catégories', description: 'Libellés et activation catégories' },
  { id: 'partner_milestones', group: 'parametres', parentId: 'manage_admins', label: 'Paliers partenaires', description: 'Récompenses milestones' },
  { id: 'automation', group: 'parametres', parentId: 'manage_admins', label: 'Automatisations', description: 'Jobs bienvenue, anniversaire…' },
  { id: 'notifications', group: 'parametres', parentId: 'manage_admins', label: 'Notifications auto', description: 'Push planifiés' },
  { id: 'standalone_benefit', group: 'parametres', parentId: 'manage_admins', label: 'Privilège standalone', description: 'Modèles sans partenaire' },
  { id: 'benefit_types', group: 'parametres', parentId: 'manage_admins', label: 'Types de privilège', description: 'Modèles catalogue' },
  { id: 'opening_hours', group: 'parametres', parentId: 'manage_admins', label: 'Horaires spots', description: 'Presets horaires' },
  { id: 'legal', group: 'parametres', parentId: 'manage_admins', label: 'CGU & légal', description: 'Documents légaux' },
  { id: 'admin_permissions', group: 'parametres', parentId: 'manage_admins', label: 'Gestion permissions', description: 'Créer admins et modules', superAdminOnly: true },

  { id: 'featured_overview', group: 'accueil', parentId: 'featured', label: 'Vue d\'ensemble', description: 'Tableau de bord Accueil' },
  { id: 'featured_hero', group: 'accueil', parentId: 'featured', label: 'À la une', description: 'Slider hero' },
  { id: 'featured_poll', group: 'accueil', parentId: 'featured', label: 'Sondage', description: 'Sondages Accueil' },
  { id: 'featured_walks', group: 'accueil', parentId: 'featured', label: 'Parcours', description: 'Parcours Accueil' },
  { id: 'featured_corner', group: 'accueil', parentId: 'featured', label: 'Le Singulier', description: 'Bloc Le Singulier' },
  { id: 'featured_chronique', group: 'accueil', parentId: 'featured', label: 'Le Fragment', description: 'Bloc Le Fragment' },
  { id: 'featured_logos', group: 'accueil', parentId: 'featured', label: 'Logos', description: 'Logos partenaires' },

  { id: 'prime_benefits_creation', group: 'privileges', parentId: 'prime_benefits', label: 'Création', description: 'Nouveau privilège' },
  { id: 'prime_benefits_validations', group: 'privileges', parentId: 'prime_benefits', label: 'Validation partenaire', description: 'Offres en attente' },
  { id: 'prime_benefits_catalog', group: 'privileges', parentId: 'prime_benefits', label: 'Catalogue', description: 'Privilèges actifs' },
  { id: 'prime_benefits_suivi', group: 'privileges', parentId: 'prime_benefits', label: 'Suivi', description: 'Statistiques utilisation' },
  { id: 'prime_benefits_grant', group: 'privileges', parentId: 'prime_benefits', label: 'Octroyer', description: 'Octroi manuel' },

  { id: 'staff_benefits_team', group: 'teams', parentId: 'staff_benefits', label: 'Pack Admin', description: 'Pack communs admins délégués' },
  { id: 'staff_benefits_admin', group: 'teams', parentId: 'staff_benefits', label: 'Par admin', description: 'Ajustements individuels' },

  { id: 'spot_stars_grant', group: 'etoiles', parentId: 'spot_stars', label: 'Octroi manuel', description: 'Attribuer étoiles' },
  { id: 'spot_stars_top', group: 'etoiles', parentId: 'spot_stars', label: 'Top étoilés', description: 'Classement' },
  { id: 'spot_stars_settings', group: 'etoiles', parentId: 'spot_stars', label: 'Réglages', description: 'Poids engagement' },

  { id: 'insights_overview', group: 'insights', parentId: 'insights', label: 'Vue d\'ensemble', description: 'KPIs globaux' },
  { id: 'insights_events', group: 'insights', parentId: 'insights', label: 'Événements', description: 'Métriques événements' },
  { id: 'insights_spots', group: 'insights', parentId: 'insights', label: 'Spots', description: 'Métriques spots' },
  { id: 'insights_tools', group: 'insights', parentId: 'insights', label: 'Outils', description: 'Métriques outils' },
  { id: 'insights_benefits', group: 'insights', parentId: 'insights', label: 'Privilèges', description: 'Métriques privilèges' },
  { id: 'insights_platform', group: 'insights', parentId: 'insights', label: 'Accueil plateforme', description: 'Stats blocs Accueil' },

  { id: 'content_events', group: 'contenu', parentId: 'content', label: 'Événements', description: 'Gérer événements' },
  { id: 'content_spots', group: 'contenu', parentId: 'content', label: 'Spots', description: 'Gérer spots' },
  { id: 'content_tools', group: 'contenu', parentId: 'content', label: 'Outils', description: 'Gérer outils' },
  { id: 'content_walks', group: 'contenu', parentId: 'content', label: 'Parcours', description: 'Gérer parcours' },
  { id: 'content_corner', group: 'contenu', parentId: 'content', label: 'Le Singulier', description: 'Gérer Le Singulier' },
  { id: 'content_chronique', group: 'contenu', parentId: 'content', label: 'Le Fragment', description: 'Gérer Le Fragment' },
  { id: 'content_logos', group: 'contenu', parentId: 'content', label: 'Logos', description: 'Gérer logos Accueil' },

  { id: 'moderation_events', group: 'moderation', parentId: 'moderation', label: 'Événements', description: 'Modérer événements' },
  { id: 'moderation_spots', group: 'moderation', parentId: 'moderation', label: 'Spots', description: 'Modérer spots' },
  { id: 'moderation_tools', group: 'moderation', parentId: 'moderation', label: 'Outils', description: 'Modérer outils' },

  { id: 'partnerships', group: 'demandes', label: 'Partenariats', description: 'Pipeline commercial' },
  { id: 'moderation', group: 'demandes', label: 'Modération', description: 'Valider soumissions' },
  { id: 'suggestions', group: 'demandes', label: 'Suggestions', description: 'Idées communauté' },

  { id: 'rubrique_member_tabs', group: 'onglets', parentId: 'rubrique', label: 'Onglets membres', description: 'Agenda, Spots, Outils' },
  { id: 'rubrique_partner_blocks', group: 'onglets', parentId: 'rubrique', label: 'Blocs espace pro', description: 'Sections partenaire' },

  { id: 'pass_catalog', group: 'pass', parentId: 'pass_management', label: 'Catalogue & octroi', description: 'Gestion PASS membres' },
  { id: 'pass_messages', group: 'pass', parentId: 'pass_management', label: 'Modèles notification', description: 'Messages activation PASS' },
  { id: 'pass_prices', group: 'pass', parentId: 'pass_management', label: 'Prix PASS', description: 'Tarifs GNF' },
  { id: 'pass_payments', group: 'pass', parentId: 'pass_management', label: 'Paiements Djomy', description: 'Suivi transactions' },
];

export const ALL_ADMIN_PERMISSION_IDS = ADMIN_PERMISSION_CATALOG.map((p) => p.id);

const PERMISSION_BY_ID = new Map(ADMIN_PERMISSION_CATALOG.map((p) => [p.id, p]));

const CHILDREN_BY_PARENT = new Map<string, AdminPermissionDef[]>();
for (const def of ADMIN_PERMISSION_CATALOG) {
  if (!def.parentId) continue;
  const list = CHILDREN_BY_PARENT.get(def.parentId) ?? [];
  list.push(def);
  CHILDREN_BY_PARENT.set(def.parentId, list);
}

export function getChildPermissions(parentId: string): AdminPermissionDef[] {
  return CHILDREN_BY_PARENT.get(parentId) ?? [];
}

export function getPermissionsByGroup(groupId: AdminPermissionGroupId): AdminPermissionDef[] {
  return ADMIN_PERMISSION_CATALOG.filter((p) => p.group === groupId);
}

export function editableAdminPermissions(): AdminPermissionDef[] {
  return ADMIN_PERMISSION_CATALOG.filter((p) => !p.superAdminOnly);
}

export function adminPermissionDef(id: string): AdminPermissionDef | undefined {
  return PERMISSION_BY_ID.get(id);
}
