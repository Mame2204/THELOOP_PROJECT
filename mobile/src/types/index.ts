// ─── Rôles & permissions ────────────────────────────────────────────────────
// Sans compte → USER_ANONYMOUS | Membre → USER_FREE | Loop Prime → USER_PRIME
// Partenaire → PARTNER (événements, spots, outils) | Admin → ADMIN

export type UserRole =
  | 'USER_ANONYMOUS'  // Non connecté (écran Auth — pas d'accès contenu)
  | 'USER_FREE'       // Membre (compte gratuit)
  | 'USER_PRIME'      // Abonnement Loop Prime
  | 'PARTNER'         // Partenaire (événements, spots, outils)
  | 'ADMIN';          // Administrateur

export type SubscriptionStatus = 'none' | 'pending' | 'active' | 'expired' | 'suspended';

/** Modules activés pour un partenaire (Espace Pro). */
export interface PartnerContentScopes {
  events: boolean;
  spots: boolean;
  tools: boolean;
}

export interface User {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  /** Nom complet dérivé (affichage legacy / démo). */
  fullName: string | null;
  phoneNumber: string | null;
  /** Valeur brute `users.user_role` (member, admin, …). */
  userRole: string | null;
  /** Token `users.qr_code_token` pour la carte membre. */
  qrCodeToken: string | null;
  avatarUrl: string | null;
  role: UserRole;
  company: string | null;
  jobTitle: string | null;
  sector: string | null;
  isDirectoryOptIn: boolean;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionExpiresAt?: string | null;
  primeInviteToken?: string | null;
  /** Date de naissance (optionnelle) — avantages anniversaire. */
  birthDate?: string | null;
  /** Code de parrainage personnel (ex. LOOP-AISS2026). */
  referralCode?: string | null;
  /** Code du parrain utilisé à l'inscription. */
  referredByCode?: string | null;
  /** Pays du compte — pays de vie, lié à l'inscription et aux avantages. */
  countryCode: string;
  /** Pays d'intérêt pour le contenu (vacances, déplacement). NULL = pays du compte. */
  interestCountryCode?: string | null;
  /** Ville de résidence — ciblage avantages et notifications. */
  city?: string | null;
  /** Gel admin Prime → membre (source cloud `users.prime_role_locked`). */
  primeRoleLocked?: boolean;
  /** Modules Espace Pro (événements / spots / outils) — renseigné si role = PARTNER. */
  partnerContentScopes?: PartnerContentScopes | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Événements ─────────────────────────────────────────────────────────────

export type EventCategory =
  | 'corporate'
  | 'nightlife'
  | 'art_culture'
  | 'gastronomie';

export type EventVisibility = 'public' | 'prime';

export type EventStatus = 'draft' | 'pending' | 'published' | 'rejected';

export interface Speaker {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  photoUrl: string | null;
}

export interface Event {
  id: string;
  title: string;
  slug: string;
  description: string;
  program: string | null;
  category: EventCategory;
  /** Toutes les catégories associées (la première = category). */
  categories?: string[];
  visibility: EventVisibility;
  status: EventStatus;
  startsAt: string;
  endsAt: string | null;
  venueName: string;
  venueAddress: string | null;
  locationId: string | null;
  entryPrice: number | null;
  /** Entrée sur invitation uniquement (distinct du gratuit). */
  isInvitationOnly?: boolean;
  currency: string;
  coverImageUrl: string | null;
  /** Galerie fiche détail (cover incluse en tête si absente). */
  galleryImages?: string[];
  speakers: Speaker[];
  partnerId: string | null;
  clickCount: number;
  /** Nombre de mises en favori (dénormalisé). */
  favoriteCount?: number;
  /** Lien externe « En savoir plus / S'inscrire » */
  infoUrl?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  websiteUrl?: string | null;
  /** Nom affiché de l'organisateur (pas le créateur du contenu). */
  organizerName?: string | null;
  /** Canal de création : admin, loop, partner. */
  contentOrigin?: 'admin' | 'loop' | 'partner' | null;
  /** Compte créateur (master_id en base) — distinct de l'organisateur affiché. */
  masterId?: string | null;
  /** Pays de l'événement (ISO alpha-2). */
  countryCode: string;
  /** À la une — état catalogue Supabase (merge avec override admin local). */
  catalogFeatured?: boolean;
  featuredStartDate?: string | null;
  featuredEndDate?: string | null;
  /** Statut admin catalogue (draft, published, deactivated, archived). */
  contentStatus?: 'draft' | 'published' | 'deactivated' | 'archived';
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Lieux (Guide) ──────────────────────────────────────────────────────────

export type LocationSubCategory =
  | 'fine_dining'
  | 'hotels'
  | 'bars_lounges'
  | 'tools';

export type ToolPartnershipStatus = 'none' | 'pending' | 'active' | 'revoked';

export interface Location {
  id: string;
  name: string;
  slug: string;
  description: string;
  subCategory: LocationSubCategory;
  /** Toutes les catégories associées (la première = subCategory). */
  categories?: string[];
  address: string;
  phone: string | null;
  website: string | null;
  coverImageUrl: string | null;
  isVip: boolean;
  visibility?: EventVisibility;
  clickCount: number;
  /** Canal de création : admin, loop, partner. */
  contentOrigin?: 'admin' | 'loop' | 'partner' | null;
  /** Pays du lieu (ISO alpha-2). */
  countryCode: string;
  /** Logo / icône (outils). */
  logoUrl?: string | null;
  /** Catégorie fonctionnelle (outils). */
  toolCategory?: string | null;
  /** Outil vérifié par THE LOOP. */
  isVerified?: boolean;
  /** Éditeur / développeur (outils). */
  developer?: string | null;
  /** Statut partenariat outil. */
  partnershipStatus?: ToolPartnershipStatus;
  createdAt: string;
  updatedAt: string;
}

// ─── Slider Hero ────────────────────────────────────────────────────────────

export type HeroBannerTargetType = 'event' | 'location';

/** Mise en avant d'un événement ou lieu déjà publié — pas de contenu autonome. */
export interface HeroBanner {
  id: string;
  targetType: HeroBannerTargetType;
  targetId: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedHeroBanner {
  id: string;
  targetType: HeroBannerTargetType;
  targetId: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string;
  sortOrder: number;
  isActive: boolean;
}

// ─── Partenaires ────────────────────────────────────────────────────────────

export type PartnerTokenStatus = 'active' | 'expired' | 'revoked';

export interface PartnerToken {
  id: string;
  partnerName: string;
  tokenCode: string;
  expiresAt: string;
  status: PartnerTokenStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerEventSubmission {
  id: string;
  partnerTokenId: string;
  title: string;
  description: string;
  category: EventCategory;
  startsAt: string;
  venueName: string;
  speakers: Omit<Speaker, 'id'>[];
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

// ─── Favoris ────────────────────────────────────────────────────────────────

export interface UserFavoriteEvent {
  id: string;
  userId: string;
  eventId: string;
  createdAt: string;
}

export interface UserFavoriteLocation {
  id: string;
  userId: string;
  locationId: string;
  createdAt: string;
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export interface AnalyticsKPIs {
  totalVisits: number;
  eventClicks: number;
  globalClickRate: number;
  activePartners: number;
  clicksByCategory: Record<EventCategory, number>;
  topLocations: { locationId: string; name: string; clicks: number }[];
}

// ─── Navigation ─────────────────────────────────────────────────────────────

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  roles: UserRole[];
  /** Si true, les utilisateurs non connectés déclenchent la connexion au lieu de naviguer. */
  authGate?: boolean;
}


export const ROLE_HIERARCHY: Record<UserRole, number> = {
  USER_ANONYMOUS: 0,
  USER_FREE: 1,
  USER_PRIME: 2,
  PARTNER: 2,
  ADMIN: 3,
};

export function hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function canInteract(userRole: UserRole): boolean {
  return userRole !== 'USER_ANONYMOUS';
}

/** Favoris : tout utilisateur connecté (Member, Prime, Partenaire, Admin). */
export function canSaveFavorites(userRole: UserRole): boolean {
  return canInteract(userRole);
}

/** Thème sombre Loop Prime (shell agenda/spots/répertoire). */
export function isPrimeMember(userRole: UserRole): boolean {
  return userRole === 'USER_PRIME';
}

/** Accès contenu Prime (agenda, spots, favoris) — Partenaire événement/spot inclus. */
export function canViewPrimeContent(
  userRole: UserRole,
  user?: { subscriptionStatus?: string; userRole?: string | null } | null,
): boolean {
  if (userRole === 'USER_PRIME' || userRole === 'ADMIN' || userRole === 'PARTNER') return true;
  if (user?.userRole === 'prime' && user?.subscriptionStatus === 'active') return true;
  return false;
}

export function isAuthenticated(userRole: UserRole): boolean {
  return userRole !== 'USER_ANONYMOUS';
}
