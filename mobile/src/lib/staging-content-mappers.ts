import { normalizeCategoriesList } from '@/lib/content-categories-utils';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';
import type { HomeLocation } from '@/lib/demo-data';
import type { StagingEvent, StagingSpot } from '@/lib/partner-staging-store';
import { getSpotCategoryEmoji, getSpotCategoryLabel, getToolCategoryEmoji, getToolCategoryLabel } from '@/lib/category-labels-cache';
import type { Event } from '@/types';

export function mapStagingEventToApp(row: StagingEvent, slug: string): Event {
  const categories = normalizeCategoriesList(row.categories ?? row.category, 'corporate');
  return {
    id: row.id,
    title: row.title,
    slug,
    description: row.description,
    program: row.program,
    category: categories[0] as Event['category'],
    categories,
    visibility: 'public',
    status: 'published',
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    venueName: row.venueName,
    venueAddress: row.venueAddress,
    locationId: row.spotId,
    entryPrice: row.entryPrice,
    currency: row.currency,
    coverImageUrl: row.coverImageUrl,
    speakers: (row.speakers ?? []).map((sp, index) => ({
      id: `staging-speaker-${row.id}-${index}`,
      name: sp.name,
      title: sp.title ?? null,
      company: sp.company ?? null,
      photoUrl: null,
    })),
    partnerId: row.partnerId,
    clickCount: 0,
    infoUrl: row.infoUrl,
    instagramUrl: row.instagramUrl ?? null,
    facebookUrl: row.facebookUrl ?? null,
    websiteUrl: row.websiteUrl ?? null,
    organizerName: row.organizerName ?? null,
    masterId: row.masterId,
    countryCode: row.countryCode ?? DEFAULT_COUNTRY_CODE,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapStagingSpotToHomeLocation(row: StagingSpot, slug: string): HomeLocation {
  const district = row.district?.trim() || row.address.split(',')[0]?.trim() || 'CONAKRY';
  const categories = normalizeCategoriesList(row.categories ?? row.subCategory, 'fine_dining');
  const tags = row.subCategory === 'tools'
    ? (row.toolCategory
      ? [{ emoji: getToolCategoryEmoji(row.toolCategory), label: getToolCategoryLabel(row.toolCategory) }]
      : [])
    : categories.map((slug) => ({
        emoji: getSpotCategoryEmoji(slug),
        label: getSpotCategoryLabel(slug),
      }));

  return {
    id: row.id,
    name: row.name,
    slug,
    description: row.description,
    subCategory: row.subCategory,
    categories,
    address: row.address,
    phone: row.phone,
    website: row.website,
    logoUrl: row.logoUrl ?? row.coverImageUrl,
    toolCategory: row.toolCategory ?? null,
    isVerified: row.isVerified ?? false,
    developer: row.developer ?? row.organizerName ?? null,
    partnershipStatus: row.partnershipStatus ?? 'none',
    visibility: 'public',
    coverImageUrl: row.coverImageUrl ?? row.logoUrl ?? null,
    isVip: false,
    clickCount: 0,
    district: district.toUpperCase(),
    rating: 4,
    subtitle: row.subCategory === 'tools'
      ? (row.toolCategory ?? row.developer ?? 'Application')
      : (row.priceLabel ?? getSpotCategoryLabel(row.subCategory)),
    tags,
    galleryImages: row.galleryImages,
    openingHours: row.openingHours ?? '—',
    priceLabel: row.priceLabel ?? '—',
    favoriteCount: 0,
    ctaUrl: row.ctaUrl,
    instagramUrl: row.instagramUrl,
    facebookUrl: row.facebookUrl,
    organizerName: row.organizerName ?? null,
    countryCode: row.countryCode ?? DEFAULT_COUNTRY_CODE,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
