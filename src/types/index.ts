// ─── Rôles & permissions (5 acteurs) ────────────────────────────────────────
// Visiteur → USER_ANONYMOUS | Membre → USER_FREE | Loop Prime → USER_PRIME
// Partenaire → PARTNER | Admin → ADMIN

export type UserRole =
  | 'USER_ANONYMOUS'  // Visiteur (sans compte)
  | 'USER_FREE'       // Membre (compte gratuit)
  | 'USER_PRIME'      // Abonnement Loop Prime
  | 'PARTNER'         // Partenaire (jeton SPOT)
  | 'ADMIN';          // Administrateur

export type SubscriptionStatus = 'none' | 'pending' | 'active' | 'expired' | 'suspended';

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
  /** Pays du compte (ISO alpha-2, dérivé de l'indicatif téléphonique). */
  countryCode: string;
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
  visibility: EventVisibility;
  status: EventStatus;
  startsAt: string;
  endsAt: string | null;
  venueName: string;
  venueAddress: string | null;
  locationId: string | null;
  entryPrice: number | null;
  currency: string;
  coverImageUrl: string | null;
  speakers: Speaker[];
  partnerId: string | null;
  clickCount: number;
  /** Lien externe « En savoir plus / S'inscrire » */
  infoUrl?: string | null;
  /** Nom affiché de l'organisateur (saisi à la création). */
  organizerName?: string | null;
  /** Compte créateur (master_id en base). */
  masterId?: string | null;
  /** Pays de l'événement (ISO alpha-2). */
  countryCode: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Lieux (Guide) ──────────────────────────────────────────────────────────

export type LocationSubCategory =
  | 'fine_dining'
  | 'hotels'
  | 'bars_lounges';

export interface Location {
  id: string;
  name: string;
  slug: string;
  description: string;
  subCategory: LocationSubCategory;
  address: string;
  phone: string | null;
  website: string | null;
  coverImageUrl: string | null;
  isVip: boolean;
  visibility?: EventVisibility;
  clickCount: number;
  /** Pays du lieu (ISO alpha-2). */
  countryCode: string;
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
  /** Si true, les visiteurs anonymes déclenchent la connexion au lieu de naviguer. */
  authGate?: boolean;
}

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  corporate: 'Corporate',
  nightlife: 'Nightlife',
  art_culture: 'Art & Culture',
  gastronomie: 'Gastronomie',
};

export const LOCATION_SUBCATEGORY_LABELS: Record<LocationSubCategory, string> = {
  fine_dining: 'Fine Dining',
  hotels: 'Hôtels',
  bars_lounges: 'Bars & Lounges',
};

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

/** Accès au contenu visibility: 'prime' — strictement USER_PRIME. */
export function canViewPrimeContent(userRole: UserRole): boolean {
  return userRole === 'USER_PRIME';
}

export function isAuthenticated(userRole: UserRole): boolean {
  return userRole !== 'USER_ANONYMOUS';
}
