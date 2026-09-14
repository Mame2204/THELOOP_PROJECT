import type { HomeLocation } from '@/lib/demo-data';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';
import type { Event, EventCategory, LocationSubCategory, ResolvedHeroBanner, Speaker } from '@/types';

export interface DbCategory {
  id: number;
  name: string;
  slug: string;
}

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
  is_external_location: boolean;
  establishment_id: string | null;
  custom_location_name: string | null;
  location_id: number;
  start_date: string;
  end_date: string;
  is_free: boolean;
  ticket_price: number | null;
  action_link: string | null;
  is_loop_x: boolean;
  reveal_price: number | null;
  is_featured: boolean;
  featured_end_date: string | null;
  country_code?: string | null;
  category_slugs?: string[] | null;
  created_at: string;
  locations: DbNeighborhood | DbNeighborhood[] | null;
  establishments: { id: string; name: string } | { id: string; name: string }[] | null;
  users: DbOrganizer | DbOrganizer[] | null;
  event_speakers: DbEventSpeaker[] | null;
  event_schedules: DbEventSchedule[] | null;
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
  latitude: number | null;
  longitude: number | null;
  location_id: number;
  is_active: boolean;
  country_code?: string | null;
  category_slugs?: string[] | null;
  created_at: string;
  locations: DbNeighborhood | DbNeighborhood[] | null;
  establishment_photos: DbEstablishmentPhoto[] | null;
  establishment_schedules: DbEstablishmentSchedule[] | null;
}

const EVENT_CATEGORY_SLUGS = new Set<EventCategory>([
  'corporate',
  'nightlife',
  'art_culture',
  'gastronomie',
]);

const SPOT_CATEGORY_SLUGS = new Set<LocationSubCategory>([
  'fine_dining',
  'hotels',
  'bars_lounges',
]);

const DAY_LABELS = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

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

function mapEventCategory(slug: string | undefined): EventCategory {
  if (slug && EVENT_CATEGORY_SLUGS.has(slug as EventCategory)) {
    return slug as EventCategory;
  }
  return 'corporate';
}

function mapSpotCategory(slug: string | undefined): LocationSubCategory {
  if (slug && SPOT_CATEGORY_SLUGS.has(slug as LocationSubCategory)) {
    return slug as LocationSubCategory;
  }
  return 'fine_dining';
}

function formatProgram(schedules: DbEventSchedule[] | null | undefined): string | null {
  if (!schedules?.length) return null;
  return [...schedules]
    .sort((a, b) => a.order_index - b.order_index)
    .map((s) => `${s.time_label} — ${s.activity_title}`)
    .join('\n');
}

function formatOpeningHours(schedules: DbEstablishmentSchedule[] | null | undefined): string {
  if (!schedules?.length) return 'Horaires sur demande';
  const openDays = schedules
    .filter((s) => !s.is_closed && s.opening_time && s.closing_time)
    .sort((a, b) => a.day_of_week - b.day_of_week);
  if (!openDays.length) return 'Horaires sur demande';
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

export function mapDbEventToApp(row: DbEventRow, slug: string): Event {
  const category = mapEventCategory(row.category_slugs?.[0]);
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
    program: formatProgram(row.event_schedules),
    category,
    visibility: row.is_loop_x ? 'prime' : 'public',
    status: 'published',
    startsAt: row.start_date,
    endsAt: row.end_date,
    venueName: venueLabel(row),
    venueAddress: neighborhood ? `${neighborhood.neighborhood_name}, ${neighborhood.city}` : null,
    locationId: establishment?.id ?? null,
    entryPrice: row.is_free ? null : row.ticket_price,
    currency: 'GNF',
    coverImageUrl: row.banner_url,
    speakers: mapSpeakers(row.event_speakers),
    partnerId: row.organizer_id,
    clickCount: 0,
    infoUrl: row.action_link,
    organizerName: row.organizer_name?.trim() || null,
    masterId: row.master_id ?? row.organizer_id ?? null,
    countryCode,
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
  const subCategory = mapSpotCategory(row.category_slugs?.[0]);
  const district = neighborhood?.neighborhood_name?.toUpperCase() ?? 'CONAKRY';
  const countryCode = row.country_code ?? neighborhood?.country_code ?? DEFAULT_COUNTRY_CODE;

  return {
    id: row.id,
    name: row.name,
    slug,
    description: row.description,
    subCategory,
    address: neighborhood ? `${neighborhood.neighborhood_name}, ${neighborhood.city}` : 'Conakry',
    phone: row.phone_contact,
    website: row.action_link?.startsWith('http') ? row.action_link : null,
    coverImageUrl: cover,
    isVip: true,
    visibility: 'public',
    clickCount: 0,
    countryCode,
    createdAt: row.created_at,
    updatedAt: row.created_at,
    district,
    rating: 4.7,
    subtitle: subCategory,
    tags: [{ emoji: '✨', label: subCategory }],
    galleryImages: photos.map((p) => p.photo_url),
    openingHours: formatOpeningHours(row.establishment_schedules),
    priceLabel: row.price_indicator,
    favoriteCount: 0,
    ctaUrl: row.action_link,
    ctaLabel: row.action_link?.startsWith('http') ? 'Visiter le site' : undefined,
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
