export type ContentStatus = 'draft' | 'published' | 'deactivated' | 'archived';

export type PartnershipStatus =
  | 'pending'
  | 'to_contact'
  | 'in_discussion'
  | 'approved'
  | 'rejected';

export const PARTNERSHIP_STATUS_LABELS: Record<PartnershipStatus, string> = {
  pending: 'Nouvelle demande',
  to_contact: 'À contacter',
  in_discussion: 'En discussion',
  approved: 'Partenaire validé',
  rejected: 'Refusé',
};

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  deactivated: 'Désactivé',
  archived: 'Archivé',
};

export function mapDbContentStatus(value: string | null | undefined): ContentStatus {
  if (value === 'draft') return 'draft';
  if (value === 'deactivated') return 'deactivated';
  if (value === 'archived') return 'archived';
  return 'published';
}

export interface AdminContentActions {
  canEdit: boolean;
  canPublish: boolean;
  canDeactivate: boolean;
  canMoveToDraft: boolean;
  canArchive: boolean;
  canDelete: boolean;
}

/** Règles Control Tower — actions par statut de publication. */
export function adminContentActionsFor(status: ContentStatus): AdminContentActions {
  switch (status) {
    case 'draft':
      return {
        canEdit: true,
        canPublish: true,
        canDeactivate: false,
        canMoveToDraft: false,
        canArchive: true,
        canDelete: true,
      };
    case 'published':
      return {
        canEdit: true, // ouverture fiche (transfert partenaire) — champs en lecture seule
        canPublish: false,
        canDeactivate: true,
        canMoveToDraft: true,
        canArchive: true,
        canDelete: false,
      };
    case 'deactivated':
      return {
        canEdit: true,
        canPublish: true,
        canDeactivate: false,
        canMoveToDraft: true,
        canArchive: true,
        canDelete: false,
      };
    case 'archived':
      return {
        canEdit: false,
        canPublish: false,
        canDeactivate: false,
        canMoveToDraft: true,
        canArchive: false,
        canDelete: true,
      };
  }
}

/** Actions pour contenus Accueil (walks, corner, logos) — pas de brouillon ni archivage. */
export function adminAccueilContentActionsFor(status: ContentStatus): AdminContentActions {
  if (status === 'published') {
    return {
      canEdit: true,
      canPublish: false,
      canDeactivate: true,
      canMoveToDraft: false,
      canArchive: false,
      canDelete: true,
    };
  }
  return {
    canEdit: true,
    canPublish: true,
    canDeactivate: false,
    canMoveToDraft: false,
    canArchive: false,
    canDelete: true,
  };
}

export interface AdminContentItem {
  id: string;
  kind: 'event' | 'spot' | 'walk' | 'corner' | 'chronique' | 'logo';
  title: string;
  subtitle: string;
  slug?: string | null;
  contentStatus: ContentStatus;
  isFeatured: boolean;
  featuredStartDate: string | null;
  featuredEndDate: string | null;
  source: 'supabase' | 'staging' | 'demo';
  contentOrigin?: 'admin' | 'loop' | 'partner' | null;
  organizerName?: string | null;
  startsAt?: string;
  updatedAt: string;
}

export interface PartnershipNote {
  id: string;
  partnershipId: string;
  body: string;
  authorId: string | null;
  authorName: string;
  createdAt: string;
}

export interface PartnershipRequest {
  id: string;
  establishmentName: string;
  managerName: string;
  email: string;
  phone: string;
  countryCode: string;
  status: PartnershipStatus;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  notes: PartnershipNote[];
}

export interface FavoriteInsight {
  id: string;
  kind: 'event' | 'spot';
  title: string;
  favoriteCount: number;
}

export interface EventInsight extends FavoriteInsight {
  venueName?: string | null;
  clickCount: number;
}

export interface SpotEngagementInsight {
  id: string;
  kind: 'spot';
  title: string;
  clickCount: number;
  favoriteCount: number;
  engagementScore: number;
  starCount: number;
  starsSource: 'auto' | 'admin';
  ratingAvg: number;
  ratingCount: number;
}

export interface CategoryInsight {
  key: string;
  label: string;
  favoriteCount: number;
  clickCount: number;
  ratingAvg: number;
  ratingCount: number;
}

/** Meilleure fiche par catégorie (vue d'ensemble). */
export interface CategoryLeaderInsight {
  categoryKey: string;
  categoryLabel: string;
  itemId: string;
  itemTitle: string;
  favoriteCount: number;
  clickCount: number;
  ratingAvg: number;
  ratingCount: number;
}

export interface ContentTypeUsageInsight {
  kind: 'event' | 'spot' | 'tool' | 'walk' | 'corner' | 'chronique' | 'poll';
  label: string;
  totalFavorites: number;
  totalClicks: number;
  totalRatingCount: number;
  ratingAvg: number;
  itemCount: number;
}

export interface WalkEngagementInsight {
  id: string;
  kind: 'walk';
  title: string;
  favoriteCount: number;
  clickCount: number;
  ratingAvg: number;
  ratingCount: number;
  starCount?: number;
  engagementScore?: number;
  starsSource?: 'auto' | 'admin';
}

export interface PlebiscitedCategoryWinner {
  kind: 'event' | 'spot' | 'tool';
  kindLabel: string;
  category: CategoryInsight | null;
}

export interface PlebiscitedContentItem {
  kind: 'event' | 'spot' | 'tool';
  kindLabel: string;
  id: string;
  title: string;
  favoriteCount: number;
  clickCount: number;
  ratingAvg: number;
  ratingCount: number;
}

export interface PlebiscitedByKind {
  events: PlebiscitedContentItem[];
  spots: PlebiscitedContentItem[];
  tools: PlebiscitedContentItem[];
}

export interface CornerInsight {
  id: string;
  title: string;
  personName: string;
  clickCount: number;
  periodLabel: string | null;
  isActive: boolean;
}

export interface ChroniqueInsight {
  id: string;
  title: string;
  personName: string;
  clickCount: number;
  periodLabel: string | null;
  isActive: boolean;
}

export interface PollOptionInsight {
  optionId: string;
  label: string;
  voteCount: number;
  /** Part du total des votes (%). */
  voteRate: number;
}

export interface PollInsight {
  id: string;
  question: string;
  isActive: boolean;
  weekKey: string;
  viewCount: number;
  responseCount: number;
  /** Votes / vues affichées (%). */
  responseRate: number;
  /** Utilisateurs inscrits actifs (pays admin). */
  totalUsers: number;
  /** Votes / utilisateurs inscrits (%). */
  userParticipationRate: number;
  options: PollOptionInsight[];
}

export const ADMIN_ASSIGNABLE_ROLES = [
  'member',
  'prime',
  'partner',
  'admin',
  'super_admin',
] as const;

export type AdminAssignableRole = (typeof ADMIN_ASSIGNABLE_ROLES)[number];

export interface AdminUserInvite {
  id: string;
  phoneNumber: string;
  email: string | null;
  userRole: AdminAssignableRole;
  firstName: string | null;
  lastName: string | null;
  countryCode: string;
  city?: string | null;
  otpSentAt: string;
  activatedAt: string | null;
  createdAt: string;
}

export const USER_ROLE_LABELS: Record<string, string> = {
  member: 'Membre',
  prime: 'Prime',
  partner: 'Partenaire',
  admin: 'Admin',
  super_admin: 'Super admin',
};
