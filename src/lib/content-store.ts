import {
  buildFeaturedBanners,
  buildSlugMaps,
  mapDbEstablishmentToHomeLocation,
  mapDbEventToApp,
  organizerDisplayName,
  type DbEstablishmentRow,
  type DbEventRow,
} from '@/lib/content-mappers';
import {
  DEMO_EVENTS,
  DEMO_HOME_LOCATIONS,
  type HomeLocation,
} from '@/lib/demo-data';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { fetchSupabasePages } from '@/lib/supabase-list';
import type { Event, ResolvedHeroBanner } from '@/types';

export interface ContentSnapshot {
  events: Event[];
  locations: HomeLocation[];
  organizers: Record<string, string>;
  featuredBanners: ResolvedHeroBanner[];
  slugToEventId: Map<string, string>;
  slugToLocationId: Map<string, string>;
  source: 'supabase' | 'demo';
}

const EVENT_SELECT = `
  id, title, description, banner_url, fallback_color, organizer_id, master_id, organizer_name,
  is_external_location, establishment_id, custom_location_name, location_id,
  start_date, end_date, is_free, is_invitation_only, ticket_price, action_link, website_url,
  instagram_url, facebook_url, is_loop_x, reveal_price, is_featured, featured_end_date,
  country_code, category_slugs, created_at, click_count, favorite_count, gallery_images,
  locations ( id, neighborhood_name, city, country, country_code ),
  establishments ( id, name ),
  users!events_organizer_id_fkey ( first_name, last_name ),
  event_speakers ( id, full_name, professional_title, company_name, photo_url ),
  event_schedules ( id, time_label, activity_title, order_index )
`;

const ESTABLISHMENT_SELECT = `
  id, name, description, price_indicator, phone_contact, action_link, website_url,
  instagram_url, facebook_url, latitude, longitude, location_id, is_active, country_code,
  click_count, favorite_count, category_slugs, created_at,
  locations ( id, neighborhood_name, city, country, country_code ),
  establishment_photos ( id, photo_url, is_primary ),
  establishment_schedules ( id, day_of_week, opening_time, closing_time, is_closed )
`;

function buildDemoSnapshot(): ContentSnapshot {
  const eventSlugs = buildSlugMaps(DEMO_EVENTS.map((e) => ({ id: e.id, label: e.title })));
  const locationSlugs = buildSlugMaps(DEMO_HOME_LOCATIONS.map((l) => ({ id: l.id, label: l.name })));

  const events = DEMO_EVENTS.map((e) => ({
    ...e,
    slug: eventSlugs.idToSlug.get(e.id) ?? e.slug,
  }));

  const locations = DEMO_HOME_LOCATIONS.map((l) => ({
    ...l,
    slug: locationSlugs.idToSlug.get(l.id) ?? l.slug,
  }));

  const featured = events
    .filter((e) => e.visibility === 'public' && e.coverImageUrl)
    .slice(0, 3);

  return {
    events,
    locations,
    organizers: {},
    featuredBanners: buildFeaturedBanners(featured),
    slugToEventId: eventSlugs.slugToId,
    slugToLocationId: locationSlugs.slugToId,
    source: 'demo',
  };
}

async function fetchSupabaseSnapshot(): Promise<ContentSnapshot | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  const client = supabase;

  const [eventsPage, spotsPage] = await Promise.all([
    fetchSupabasePages<DbEventRow>(async (from, to) => {
      const { data, error } = await client
        .from('events')
        .select(EVENT_SELECT)
        .order('start_date', { ascending: true })
        .range(from, to);
      return { data: data as DbEventRow[] | null, error };
    }),
    fetchSupabasePages<DbEstablishmentRow>(async (from, to) => {
      const { data, error } = await client
        .from('establishments')
        .select(ESTABLISHMENT_SELECT)
        .eq('is_active', true)
        .order('name', { ascending: true })
        .range(from, to);
      return { data: data as DbEstablishmentRow[] | null, error };
    }),
  ]);

  if (eventsPage.error) {
    console.warn('[Content] Lecture events:', eventsPage.error.message);
    return null;
  }
  if (spotsPage.error) {
    console.warn('[Content] Lecture establishments:', spotsPage.error.message);
    return null;
  }

  const eventRows = eventsPage.data;
  const spotRows = spotsPage.data;

  if (eventRows.length === 0 && spotRows.length === 0) {
    return null;
  }

  const eventSlugs = buildSlugMaps(eventRows.map((e) => ({ id: e.id, label: e.title })));
  const locationSlugs = buildSlugMaps(spotRows.map((s) => ({ id: s.id, label: s.name })));

  const organizers: Record<string, string> = {};
  const events = eventRows.map((row) => {
    const slug = eventSlugs.idToSlug.get(row.id)!;
    const mapped = mapDbEventToApp(row, slug);
    const customOrganizer = row.organizer_name?.trim();
    if (customOrganizer) {
      organizers[row.id] = customOrganizer;
    } else {
      const organizer = Array.isArray(row.users) ? row.users[0] : row.users;
      const label = organizerDisplayName(organizer ?? null);
      if (label) organizers[row.id] = label;
    }
    return mapped;
  });

  const locations = spotRows.map((row) =>
    mapDbEstablishmentToHomeLocation(row, locationSlugs.idToSlug.get(row.id)!),
  );

  const featuredSource = eventRows
    .filter(
      (row) =>
        row.is_featured &&
        row.banner_url &&
        (!row.featured_end_date || new Date(row.featured_end_date) > new Date()),
    )
    .map((row) => mapDbEventToApp(row, eventSlugs.idToSlug.get(row.id)!));

  return {
    events,
    locations,
    organizers,
    featuredBanners: buildFeaturedBanners(
      featuredSource.length > 0 ? featuredSource : events.filter((e) => e.visibility === 'public' && e.coverImageUrl),
    ),
    slugToEventId: eventSlugs.slugToId,
    slugToLocationId: locationSlugs.slugToId,
    source: 'supabase',
  };
}

let cachedSnapshot: ContentSnapshot | null = null;
let loadPromise: Promise<ContentSnapshot> | null = null;

export async function loadContentSnapshot(force = false): Promise<ContentSnapshot> {
  if (!force) {
    if (cachedSnapshot) return cachedSnapshot;
    if (loadPromise) return loadPromise;
  } else {
    cachedSnapshot = null;
    if (loadPromise) {
      try {
        await loadPromise;
      } catch {
        // ignore — on relance un fetch propre ensuite
      }
      cachedSnapshot = null;
    }
  }

  if (!force && cachedSnapshot) return cachedSnapshot;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const remote = await fetchSupabaseSnapshot();
    cachedSnapshot = remote ?? buildDemoSnapshot();
    console.log(`[Content] Source : ${cachedSnapshot.source} (${cachedSnapshot.events.length} events, ${cachedSnapshot.locations.length} spots)`);
    return cachedSnapshot;
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

export function getPublicEvents(snapshot: ContentSnapshot, countryCode?: string | null): Event[] {
  const list = snapshot.events.filter((e) => e.visibility === 'public' && e.status === 'published');
  if (!countryCode) return list;
  return list.filter((e) => e.countryCode === countryCode);
}

export function getPrimeEvents(snapshot: ContentSnapshot, countryCode?: string | null): Event[] {
  const list = snapshot.events.filter((e) => e.visibility === 'prime' && e.status === 'published');
  if (!countryCode) return list;
  return list.filter((e) => e.countryCode === countryCode);
}

export function getPrimeLocations(snapshot: ContentSnapshot, countryCode?: string | null): HomeLocation[] {
  const list = snapshot.locations.filter((l) => l.visibility === 'prime');
  if (!countryCode) return list;
  return list.filter((l) => l.countryCode === countryCode);
}

export function getHomeLocations(
  snapshot: ContentSnapshot,
  subCategory?: HomeLocation['subCategory'],
  countryCode?: string | null,
): HomeLocation[] {
  let list = snapshot.locations.filter((l) => l.visibility !== 'prime');
  if (countryCode) list = list.filter((l) => l.countryCode === countryCode);
  return subCategory ? list.filter((l) => l.subCategory === subCategory) : list;
}

export function getEventBySlug(snapshot: ContentSnapshot, slug: string): Event | undefined {
  const id = snapshot.slugToEventId.get(slug);
  return id ? snapshot.events.find((e) => e.id === id) : undefined;
}

export function getLocationBySlug(snapshot: ContentSnapshot, slug: string): HomeLocation | undefined {
  const id = snapshot.slugToLocationId.get(slug);
  return id ? snapshot.locations.find((l) => l.id === id) : undefined;
}

export function invalidateContentCache(): void {
  cachedSnapshot = null;
}
