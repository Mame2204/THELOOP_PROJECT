import { normalizeCategoriesList } from '@/lib/content-categories-utils';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';
import { getSpotCategoryEmoji, getSpotCategoryLabel, getToolCategoryLabel } from '@/lib/category-labels-cache';
import type { ContentOrigin } from '@/lib/content-origin';
import { buildDetailGalleryImages } from '@/lib/detail-gallery-utils';
import type { HomeLocation } from '@/lib/demo-data';
import { canonicalizeGuineaLocationLabel, spotDistrictFromGuineaLabel } from '@/lib/guinea-locations';
import type {
  Event,
  EventCategory,
  LocationSubCategory,
  ResolvedHeroBanner,
  Speaker,
  ToolPartnershipStatus,
} from '@/types';
import type { ContentStatus } from '@/lib/admin-types';
import { mapDbContentStatus } from '@/lib/admin-types';

export interface DbNeighborhood {
  id: number;
  neighborhood_name: string;
  city: string;
  country: string;
  country_code?: string | null;
}

export interface DbOrganizer {
  first_name: string;
  last_name: string;
}

export interface DbEventSpeaker {
  id: string;
  full_name: string;
  professional_title: string;
  company_name: string;
  photo_url: string | null;
}

export interface DbEventSchedule {
  id: string;
  time_label: string;
  activity_title: string;
  order_index: number;
}

export interface DbEventRow {
  id: string;
  title: string;
  description: string;
  banner_url: string | null;
  fallback_color: string;
  organizer_id: string;
  master_id?: string | null;
  organizer_name?: string | null;
  content_origin?: string | null;
  is_external_location: boolean;
  establishment_id: string | null;
  custom_location_name: string | null;
  location_id: number;
  start_date: string;
  end_date: string;
  is_free: boolean;
  is_invitation_only?: boolean | null;
  ticket_price: number | null;
  action_link: string | null;
  website_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  is_loop_x: boolean;
  reveal_price: number | null;
  is_featured: boolean;
  featured_end_date: string | null;
  country_code?: string | null;
  category_slugs?: string[] | null;
  content_status?: string | null;
  is_active?: boolean | null;
  created_at: string;
  locations: DbNeighborhood | DbNeighborhood[] | null;
  establishments: { id: string; name: string } | { id: string; name: string }[] | null;
  users: DbOrganizer | DbOrganizer[] | null;
  event_speakers: DbEventSpeaker[] | null;
  event_schedules: DbEventSchedule[] | null;
  click_count?: number | null;
  favorite_count?: number | null;
  gallery_images?: string[] | null;
}

export interface DbEstablishmentPhoto {
  id: string;
  photo_url: string;
  is_primary: boolean;
}

export interface DbEstablishmentSchedule {
  id: string;
  day_of_week: number;
  opening_time: string | null;
  closing_time: string | null;
  is_closed: boolean;
}

export interface DbEstablishmentRow {
  id: string;
  name: string;
  description: string;
  price_indicator: string;
  phone_contact: string;
  action_link: string | null;
  website_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  latitude: number | null;
  longitude: number | null;
  location_id: number;
  is_active: boolean;
  country_code?: string | null;
  content_origin?: string | null;
  content_status?: string | null;
  click_count?: number | null;
  favorite_count?: number | null;
  engagement_score?: number | null;
  star_count?: number | null;
  stars_source?: 'auto' | 'admin' | null;
  admin_star_override?: number | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  category_slugs?: string[] | null;
  opening_hours_label?: string | null;
  is_featured?: boolean | null;
  featured_end_date?: string | null;
  created_at: string;
  locations: DbNeighborhood | DbNeighborhood[] | null;
  establishment_photos: DbEstablishmentPhoto[] | null;
  establishment_schedules: DbEstablishmentSchedule[] | null;
}

export interface DbToolPhoto {
  id: string;
  photo_url: string;
  is_primary: boolean;
}

export interface DbToolRow {
  id: string;
  name: string;
  description: string;
  category_slugs?: string[] | null;
  logo_url?: string | null;
  website_url?: string | null;
  action_link?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  phone_contact?: string | null;
  developer?: string | null;
  is_verified?: boolean | null;
  partnership_status?: string | null;
  country_code?: string | null;
  content_origin?: string | null;
  content_status?: string | null;
  is_active?: boolean | null;
  click_count?: number | null;
  favorite_count?: number | null;
  engagement_score?: number | null;
  star_count?: number | null;
  stars_source?: 'auto' | 'admin' | null;
  admin_star_override?: number | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  created_at: string;
  tool_photos?: DbToolPhoto[] | null;
  is_featured?: boolean | null;
  featured_start_date?: string | null;
  featured_end_date?: string | null;
}

const DAY_LABELS = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function featuredDateFromDb(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const dateOnly = trimmed.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? dateOnly : null;
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildSlugMaps(items: { id: string; label: string }[]): {
  slugToId: Map<string, string>;
  idToSlug: Map<string, string>;
} {
  const slugToId = new Map<string, string>();
  const idToSlug = new Map<string, string>();
  const used = new Set<string>();

  for (const item of items) {
    let slug = slugify(item.label) || item.id.slice(0, 8);
    if (used.has(slug)) slug = `${slug}-${item.id.slice(0, 8)}`;
    used.add(slug);
    slugToId.set(slug, item.id);
    idToSlug.set(item.id, slug);
  }

  return { slugToId, idToSlug };
}

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function formatProgramLine(schedule: DbEventSchedule): string {
  const label = schedule.time_label?.trim();
  if (label && /^programme$/i.test(label)) return schedule.activity_title;
  return `${schedule.time_label} — ${schedule.activity_title}`;
}

export function formatProgramFromSchedules(schedules: DbEventSchedule[] | null | undefined): string | null {
  if (!schedules?.length) return null;
  return [...schedules]
    .sort((a, b) => a.order_index - b.order_index)
    .map(formatProgramLine)
    .join('\n');
}

function formatOpeningHours(schedules: DbEstablishmentSchedule[] | null | undefined): string {
  if (!schedules?.length) return 'Horaires sur demande';
  const openDays = schedules
    .filter((s) => !s.is_closed && s.opening_time && s.closing_time)
    .sort((a, b) => a.day_of_week - b.day_of_week);
  if (!openDays.length) return 'Horaires sur demande';
  if (openDays.length === 1) {
    const day = openDays[0];
    return `${DAY_LABELS[day.day_of_week]} · ${day.opening_time?.slice(0, 5)} – ${day.closing_time?.slice(0, 5)}`;
  }
  const first = openDays[0];
  return `${DAY_LABELS[first.day_of_week]}–${DAY_LABELS[openDays[openDays.length - 1].day_of_week]} · ${first.opening_time?.slice(0, 5)} – ${first.closing_time?.slice(0, 5)}`;
}

function mapSpeakers(speakers: DbEventSpeaker[] | null | undefined): Speaker[] {
  return (speakers ?? []).map((sp) => ({
    id: sp.id,
    name: sp.full_name,
    title: sp.professional_title,
    company: sp.company_name,
    photoUrl: sp.photo_url,
  }));
}

function venueLabel(row: DbEventRow): string {
  const establishment = unwrapOne(row.establishments);
  if (establishment?.name) return establishment.name;
  if (row.custom_location_name) return row.custom_location_name;
  const neighborhood = unwrapOne(row.locations);
  if (neighborhood) return `${neighborhood.neighborhood_name}, ${neighborhood.city}`;
  return 'Conakry';
}

function normalizeContentOrigin(value: string | null | undefined): ContentOrigin | null {
  if (value === 'admin' || value === 'loop' || value === 'partner') return value;
  return null;
}

function locationLabelFromNeighborhood(neighborhood: DbNeighborhood | null | undefined): string | null {
  if (!neighborhood) return null;
  return canonicalizeGuineaLocationLabel(
    `${neighborhood.neighborhood_name}, ${neighborhood.city}`,
    neighborhood.neighborhood_name,
  );
}

export function mapDbEventToApp(row: DbEventRow, slug: string): Event {
  const categories = normalizeCategoriesList(row.category_slugs ?? [], 'corporate');
  const category = categories[0] as EventCategory;
  const neighborhood = unwrapOne(row.locations);
  const establishment = unwrapOne(row.establishments);
  const countryCode =
    row.country_code ??
    neighborhood?.country_code ??
    DEFAULT_COUNTRY_CODE;

  return {
    id: row.id,
    title: row.title,
    slug,
    description: row.description,
    program: formatProgramFromSchedules(row.event_schedules),
    category,
    categories,
    visibility: row.is_loop_x ? 'prime' : 'public',
    status:
      mapDbContentStatus(row.content_status) === 'published' && row.is_active !== false
        ? 'published'
        : 'draft',
    startsAt: row.start_date,
    endsAt: row.end_date,
    venueName: venueLabel(row),
    venueAddress: locationLabelFromNeighborhood(neighborhood),
    locationId: establishment?.id ?? null,
    entryPrice: row.is_invitation_only ? null : (row.is_free ? null : row.ticket_price),
    isInvitationOnly: Boolean(row.is_invitation_only),
    currency: 'GNF',
    coverImageUrl: row.banner_url,
    galleryImages: buildDetailGalleryImages(
      row.banner_url,
      Array.isArray(row.gallery_images) ? row.gallery_images : null,
    ),
    speakers: mapSpeakers(row.event_speakers),
    partnerId: row.organizer_id,
    clickCount: row.click_count ?? 0,
    favoriteCount: row.favorite_count ?? 0,
    infoUrl: row.action_link,
    instagramUrl: row.instagram_url?.trim() || null,
    facebookUrl: row.facebook_url?.trim() || null,
    websiteUrl: row.website_url?.trim() || null,
    organizerName: row.organizer_name?.trim() || null,
    contentOrigin: normalizeContentOrigin(row.content_origin),
    masterId: row.master_id ?? row.organizer_id ?? null,
    countryCode,
    catalogFeatured: Boolean(row.is_featured),
    featuredEndDate: featuredDateFromDb(row.featured_end_date),
    contentStatus: mapDbContentStatus(row.content_status) as ContentStatus,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.created_at,
  };
}

export function mapDbEstablishmentToHomeLocation(row: DbEstablishmentRow, slug: string): HomeLocation {
  const neighborhood = unwrapOne(row.locations);
  const photos = [...(row.establishment_photos ?? [])].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary),
  );
  const cover = photos[0]?.photo_url ?? null;
  const categories = normalizeCategoriesList(row.category_slugs ?? [], 'fine_dining').filter(
    (c) => c !== 'tools',
  );
  const subCategory = (categories[0] ?? 'fine_dining') as LocationSubCategory;
  const spotTags = categories.map((slug) => ({
    emoji: getSpotCategoryEmoji(slug),
    label: getSpotCategoryLabel(slug),
  }));
  const canonicalAddress = locationLabelFromNeighborhood(neighborhood) ?? 'Conakry';
  const district = spotDistrictFromGuineaLabel(canonicalAddress) ?? neighborhood?.neighborhood_name?.toUpperCase() ?? 'CONAKRY';
  const countryCode = row.country_code ?? neighborhood?.country_code ?? DEFAULT_COUNTRY_CODE;
  const clickCount = row.click_count ?? 0;
  const favoriteCount = row.favorite_count ?? 0;
  const starCount = row.admin_star_override ?? row.star_count ?? 3;
  const ratingAvg = Number(row.rating_avg ?? 0);
  const ratingCount = row.rating_count ?? 0;
  const websiteUrl = row.website_url?.trim() || null;
  const ctaUrl = row.action_link?.trim() || null;
  const instagramUrl = row.instagram_url?.trim() || null;
  const facebookUrl = row.facebook_url?.trim() || null;

  return {
    id: row.id,
    name: row.name,
    slug,
    description: row.description,
    subCategory,
    categories,
    address: canonicalAddress,
    phone: row.phone_contact,
    website: websiteUrl || (ctaUrl?.startsWith('http') ? ctaUrl : null),
    coverImageUrl: cover,
    isVip: true,
    visibility: 'public',
    clickCount,
    countryCode,
    createdAt: row.created_at,
    updatedAt: row.created_at,
    district,
    rating: starCount > 0 ? starCount : 4.7,
    subtitle: spotTags[0]?.label ?? 'Spot VIP',
    tags: spotTags.length ? spotTags : [{ emoji: '✨', label: 'VIP' }],
    galleryImages: photos.map((p) => p.photo_url),
    openingHours: row.opening_hours_label?.trim()
      || formatOpeningHours(row.establishment_schedules),
    priceLabel: row.price_indicator,
    favoriteCount,
    starCount,
    starsSource: row.stars_source ?? 'auto',
    engagementScore: row.engagement_score ?? undefined,
    ratingAvg,
    ratingCount,
    ctaUrl,
    ctaLabel: ctaUrl?.startsWith('http') ? 'Visiter le lien' : ctaUrl ? 'Voir la fiche' : undefined,
    instagramUrl,
    facebookUrl,
    contentOrigin: normalizeContentOrigin(row.content_origin),
    catalogFeatured: Boolean(row.is_featured),
    featuredEndDate: featuredDateFromDb(row.featured_end_date),
    contentStatus: mapDbContentStatus(row.content_status) as ContentStatus,
    isActive: row.is_active ?? true,
  };
}

export function mapDbToolToHomeLocation(row: DbToolRow, slug: string): HomeLocation {
  const photos = [...(row.tool_photos ?? [])].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary),
  );
  const cover = photos[0]?.photo_url ?? row.logo_url?.trim() ?? null;
  const toolSlugs = normalizeCategoriesList(row.category_slugs ?? [], 'tool-autre');
  const toolCategory = toolSlugs[0] ?? 'tool-autre';
  const toolLabel = getToolCategoryLabel(toolCategory);
  const clickCount = row.click_count ?? 0;
  const favoriteCount = row.favorite_count ?? 0;
  const starCount = row.admin_star_override ?? row.star_count ?? 3;
  const ratingAvg = Number(row.rating_avg ?? 0);
  const ratingCount = row.rating_count ?? 0;
  const websiteUrl = row.website_url?.trim() || null;
  const ctaUrl = row.action_link?.trim() || null;
  const developer = row.developer?.trim() || null;
  const logoUrl = row.logo_url?.trim() || cover;

  return {
    id: row.id,
    name: row.name,
    slug,
    description: row.description,
    subCategory: 'tools',
    categories: ['tools'],
    address: 'En ligne',
    phone: row.phone_contact?.trim() || null,
    website: websiteUrl || (ctaUrl?.startsWith('http') ? ctaUrl : null),
    coverImageUrl: cover,
    isVip: true,
    visibility: 'public',
    clickCount,
    countryCode: row.country_code ?? DEFAULT_COUNTRY_CODE,
    createdAt: row.created_at,
    updatedAt: row.created_at,
    district: 'EN LIGNE',
    rating: starCount > 0 ? starCount : 4.7,
    subtitle: toolCategory ?? developer ?? 'Outil',
    tags: [{ emoji: '🏷️', label: toolLabel }],
    galleryImages: photos.map((p) => p.photo_url),
    openingHours: null,
    priceLabel: null,
    favoriteCount,
    starCount,
    starsSource: row.stars_source ?? 'auto',
    engagementScore: row.engagement_score ?? undefined,
    ratingAvg,
    ratingCount,
    ctaUrl,
    ctaLabel: ctaUrl?.startsWith('http') ? 'Visiter le lien' : ctaUrl ? 'Voir la fiche' : undefined,
    instagramUrl: row.instagram_url?.trim() || null,
    facebookUrl: row.facebook_url?.trim() || null,
    logoUrl,
    toolCategory,
    developer,
    isVerified: Boolean(row.is_verified),
    partnershipStatus: (row.partnership_status as ToolPartnershipStatus | null) ?? 'pending',
    contentOrigin: normalizeContentOrigin(row.content_origin),
    catalogFeatured: Boolean(row.is_featured),
    featuredStartDate: featuredDateFromDb(row.featured_start_date),
    featuredEndDate: featuredDateFromDb(row.featured_end_date),
    contentStatus: mapDbContentStatus(row.content_status) as ContentStatus,
    isActive: row.is_active ?? true,
  };
}

export function organizerDisplayName(organizer: DbOrganizer | null): string | null {
  if (!organizer) return null;
  const name = `${organizer.first_name} ${organizer.last_name}`.trim();
  return name || null;
}

export function buildFeaturedBanners(events: Event[]): ResolvedHeroBanner[] {
  return events
    .filter((e) => e.coverImageUrl)
    .slice(0, 5)
    .map((event, index) => ({
      id: `featured-${event.id}`,
      targetType: 'event' as const,
      targetId: event.id,
      title: event.title,
      subtitle: event.venueName,
      imageUrl: event.coverImageUrl!,
      linkUrl: `/agenda/${event.slug}`,
      sortOrder: index,
      isActive: true,
    }));
}

export function buildFeaturedBannersFromLocations(locations: HomeLocation[]): ResolvedHeroBanner[] {
  return locations
    .filter((l) => l.coverImageUrl || l.logoUrl)
    .slice(0, 5)
    .map((location, index) => ({
      id: `featured-spot-${location.id}`,
      targetType: 'location' as const,
      targetId: location.id,
      title: location.name,
      subtitle: location.subCategory === 'tools'
        ? (location.toolCategory ?? location.developer ?? location.subtitle)
        : location.subtitle,
      imageUrl: (location.coverImageUrl ?? location.logoUrl)!,
      linkUrl: `/spots/${location.slug}`,
      sortOrder: index,
      isActive: true,
    }));
}
