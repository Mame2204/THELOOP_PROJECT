import {
  listAdminChroniques,
  listAdminCreatorCorners,
  listAdminHomePartnerLogos,
  listAdminLoopWalks,
  type AdminChronique,
  type AdminCreatorCorner,
  type AdminHomePartnerLogo,
} from '@/lib/admin-accueil-store';
import type { AdminContentItem, ContentStatus } from '@/lib/admin-types';
import type { LoopWalk } from '@/lib/loop-walks-store';
import { isSupabaseConfigured } from '@/lib/supabase';

export function accueilActiveToStatus(active: boolean): ContentStatus {
  return active ? 'published' : 'deactivated';
}

function accueilSource(): AdminContentItem['source'] {
  return isSupabaseConfigured() ? 'supabase' : 'demo';
}

export function walkToAdminContentItem(walk: LoopWalk): AdminContentItem {
  return {
    id: walk.id,
    kind: 'walk',
    title: walk.title,
    subtitle: `${walk.categoryLabel || walk.category || 'Parcours'} · ${walk.stepsCount} étape${walk.stepsCount > 1 ? 's' : ''}`,
    slug: walk.slug,
    contentStatus: accueilActiveToStatus(walk.isPublished),
    isFeatured: walk.isFeaturedWeek,
    featuredStartDate: null,
    featuredEndDate: null,
    source: accueilSource(),
    contentOrigin: 'admin',
    updatedAt: '',
  };
}

export function cornerToAdminContentItem(corner: AdminCreatorCorner): AdminContentItem {
  return {
    id: corner.id,
    kind: 'corner',
    title: corner.title,
    subtitle: `${corner.subjectName}${corner.category ? ` · ${corner.category}` : ''}`,
    slug: corner.slug,
    contentStatus: accueilActiveToStatus(corner.isActive),
    isFeatured: false,
    featuredStartDate: corner.periodStart,
    featuredEndDate: corner.periodEnd,
    source: accueilSource(),
    contentOrigin: 'admin',
    updatedAt: '',
  };
}

export function chroniqueToAdminContentItem(chronique: AdminChronique): AdminContentItem {
  return {
    id: chronique.id,
    kind: 'chronique',
    title: chronique.title,
    subtitle: chronique.locationLabel
      ? `${chronique.volumeLabel ?? 'Le Fragment'} · ${chronique.locationLabel}`
      : (chronique.volumeLabel ?? 'Le Fragment'),
    slug: chronique.slug,
    contentStatus: accueilActiveToStatus(chronique.isActive),
    isFeatured: false,
    featuredStartDate: chronique.periodStart,
    featuredEndDate: chronique.periodEnd,
    source: accueilSource(),
    contentOrigin: 'admin',
    updatedAt: '',
  };
}

export function logoToAdminContentItem(logo: AdminHomePartnerLogo): AdminContentItem {
  return {
    id: logo.id,
    kind: 'logo',
    title: logo.name,
    subtitle: logo.websiteUrl ? logo.websiteUrl.replace(/^https?:\/\//i, '') : 'Logo partenaire Accueil',
    slug: null,
    contentStatus: accueilActiveToStatus(logo.isActive),
    isFeatured: false,
    featuredStartDate: null,
    featuredEndDate: null,
    source: accueilSource(),
    contentOrigin: 'admin',
    updatedAt: '',
  };
}

export async function buildAdminAccueilContentList(
  countryCode: string,
  options?: { force?: boolean },
): Promise<{
  walks: AdminContentItem[];
  corners: AdminContentItem[];
  chroniques: AdminContentItem[];
  logos: AdminContentItem[];
}> {
  const [walks, corners, chroniques, logos] = await Promise.all([
    listAdminLoopWalks(countryCode, options),
    listAdminCreatorCorners(countryCode, options),
    listAdminChroniques(countryCode, options),
    listAdminHomePartnerLogos(countryCode, options),
  ]);
  return {
    walks: walks.map(walkToAdminContentItem),
    corners: corners.map(cornerToAdminContentItem),
    chroniques: chroniques.map(chroniqueToAdminContentItem),
    logos: logos.map(logoToAdminContentItem),
  };
}

