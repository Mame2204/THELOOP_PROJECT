import { normalizeExternalUrl } from '@/lib/location-actions';
import { applyAdminContentFilters } from '@/lib/admin-content-store';
import {
  getActiveEventCategoryFilter,
  getActiveSpotCategoryFilter,
  getActiveToolCategoryFilter,
  getInactiveEventCategoryFilter,
  getInactiveSpotCategoryFilter,
  getInactiveToolCategoryFilter,
  isCategoryLabelsLoaded,
  refreshCategoryLabelsCache,
  refreshCategoryLabelsFromMemory,
} from '@/lib/category-labels-cache';
import {
  filterEventsByActiveCategories,
  filterLocationsByActiveCategories,
} from '@/lib/category-visibility';
import { isEventPast } from '@/lib/event-list-utils';
import { urlsEquivalent } from '@/lib/event-actions';
import {
  filterPublishedActiveEvents,
  filterPublishedActiveLocations,
  isPublishedActiveContent,
} from '@/lib/content-visibility';
import {
  buildFeaturedBanners,
  buildFeaturedBannersFromLocations,
  buildSlugMaps,
  mapDbEstablishmentToHomeLocation,
  mapDbEventToApp,
  mapDbToolToHomeLocation,
  type DbEstablishmentRow,
  type DbEventRow,
  type DbToolRow,
} from '@/lib/content-mappers';
import { fetchSupabasePages } from '@/lib/supabase-list';
import { isToolLocation } from '@/lib/location-kind-utils';
import {
  DEMO_EVENTS,
  DEMO_HOME_LOCATIONS,
  type HomeLocation,
} from '@/lib/demo-data';
import { prunePublishedStagingLocal } from '@/lib/partner-staging-store';
import { isNetworkOnline, readLocalCache, writeLocalCache } from '@/lib/offline-store';
import {
  fetchCatalogFingerprint,
  readCachedCatalogFingerprint,
  writeCachedCatalogFingerprint,
  clearCachedCatalogFingerprint,
} from '@/lib/content-catalog-fingerprint';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Event, ResolvedHeroBanner } from '@/types';

const CONTENT_CACHE_KEY = 'loop_content_snapshot_v1';

function formatContentCounts(snapshot: ContentSnapshot): string {
  const tools = snapshot.locations.filter(isToolLocation).length;
  const spots = snapshot.locations.length - tools;
  return `${snapshot.events.length} events, ${spots} spots, ${tools} outils`;
}

let lastContentSourceKind = '';
function logContentSourceOnce(message: string): void {
  const kind = message.includes('supabase')
    ? 'supabase'
    : message.includes('cache hors-ligne')
      ? 'offline'
      : message.includes('cache local')
        ? 'cache-local'
        : message.includes('demo')
          ? 'demo'
          : message;
  if (kind === lastContentSourceKind) return;
  lastContentSourceKind = kind;
  console.log(message);
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/** Garantit des listes sans doublon d'id (clés React FlatList / maps). */
function normalizeSnapshotUniqueness(snapshot: ContentSnapshot): ContentSnapshot {
  const events = dedupeById(snapshot.events);
  const locations = dedupeById(snapshot.locations);
  const featuredBanners = dedupeById(snapshot.featuredBanners ?? []);
  const featuredSpotBanners = dedupeById(snapshot.featuredSpotBanners ?? []);
  if (
    events.length === snapshot.events.length &&
    locations.length === snapshot.locations.length &&
    featuredBanners.length === snapshot.featuredBanners.length &&
    featuredSpotBanners.length === snapshot.featuredSpotBanners.length
  ) {
    return snapshot;
  }
  return { ...snapshot, events, locations, featuredBanners, featuredSpotBanners };
}

type SerializableContentSnapshot = Omit<ContentSnapshot, 'slugToEventId' | 'slugToLocationId'> & {
  slugToEventId: [string, string][];
  slugToLocationId: [string, string][];
};

function serializeSnapshot(snapshot: ContentSnapshot): SerializableContentSnapshot {
  return {
    ...snapshot,
    slugToEventId: Array.from(snapshot.slugToEventId.entries()),
    slugToLocationId: Array.from(snapshot.slugToLocationId.entries()),
  };
}

function deserializeSnapshot(raw: SerializableContentSnapshot): ContentSnapshot {
  return {
    ...raw,
    slugToEventId: new Map(raw.slugToEventId),
    slugToLocationId: new Map(raw.slugToLocationId),
  };
}

async function readCachedContentSnapshot(): Promise<ContentSnapshot | null> {
  const raw = await readLocalCache<SerializableContentSnapshot>(CONTENT_CACHE_KEY);
  if (!raw || (raw.events.length === 0 && raw.locations.length === 0)) return null;
  return deserializeSnapshot({ ...raw, source: 'cache' });
}

async function writeCachedContentSnapshot(snapshot: ContentSnapshot): Promise<void> {
  if (snapshot.source === 'demo') return;
  await writeLocalCache(CONTENT_CACHE_KEY, serializeSnapshot(snapshot));
}

export interface ContentSnapshot {
  events: Event[];
  locations: HomeLocation[];
  featuredBanners: ResolvedHeroBanner[];
  featuredSpotBanners: ResolvedHeroBanner[];
  slugToEventId: Map<string, string>;
  slugToLocationId: Map<string, string>;
  source: 'supabase' | 'demo' | 'cache';
}

const EVENT_SELECT = `
  id, title, description, banner_url, fallback_color, organizer_id, master_id, organizer_name,
  content_origin, is_external_location, establishment_id, custom_location_name, location_id,
  start_date, end_date, is_free, is_invitation_only, ticket_price, action_link, website_url,
  instagram_url, facebook_url, is_loop_x, reveal_price, is_featured, featured_end_date,
  country_code, category_slugs, content_status, is_active, created_at, click_count, favorite_count, gallery_images,
  locations ( id, neighborhood_name, city, country ),
  establishments ( id, name ),
  event_speakers ( id, full_name, professional_title, company_name, photo_url ),
  event_schedules ( id, time_label, activity_title, order_index )
`;

const ESTABLISHMENT_SELECT = `
  id, name, description, price_indicator, phone_contact, action_link, website_url,
  instagram_url, facebook_url, latitude, longitude, location_id, is_active, country_code,
  content_origin, content_status, click_count, favorite_count, engagement_score, star_count, stars_source,
  admin_star_override, rating_avg, rating_count, category_slugs, opening_hours_label,
  is_featured, featured_end_date, created_at,
  locations ( id, neighborhood_name, city, country ),
  establishment_photos ( id, photo_url, is_primary ),
  establishment_schedules ( id, day_of_week, opening_time, closing_time, is_closed )
`;

const TOOL_SELECT = `
  id, name, description, category_slugs, logo_url, website_url, action_link,
  instagram_url, facebook_url, phone_contact, developer, is_verified, partnership_status,
  country_code, content_origin, content_status, is_active, click_count, favorite_count,
  engagement_score, star_count, stars_source, admin_star_override, rating_avg, rating_count,
  created_at, is_featured, featured_start_date, featured_end_date,
  tool_photos ( id, photo_url, is_primary )
`;

function buildEmptySnapshot(): ContentSnapshot {
  return {
    events: [],
    locations: [],
    featuredBanners: [],
    featuredSpotBanners: [],
    slugToEventId: new Map(),
    slugToLocationId: new Map(),
    source: 'supabase',
  };
}

function fallbackSnapshotWhenRemoteMissing(): ContentSnapshot {
  if (isSupabaseConfigured()) return buildEmptySnapshot();
  return buildDemoSnapshot();
}

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

  const featured: Event[] = [];
  const featuredSpots: HomeLocation[] = [];

  return {
    events,
    locations,
    featuredBanners: buildFeaturedBanners(featured),
    featuredSpotBanners: buildFeaturedBannersFromLocations(featuredSpots),
    slugToEventId: eventSlugs.slugToId,
    slugToLocationId: locationSlugs.slugToId,
    source: 'demo',
  };
}

/** Nettoie le staging local publié ; le catalogue public = Supabase uniquement. */
async function mergeApprovedStaging(base: ContentSnapshot): Promise<ContentSnapshot> {
  const pruned = await prunePublishedStagingLocal();
  if (pruned > 0) {
    console.log(`[Content] Staging local : ${pruned} entrée(s) publiée(s) retirée(s)`);
  }
  return base;
}

async function applyAdminFilters(snapshot: ContentSnapshot): Promise<ContentSnapshot> {
  const { events, spots, featuredEventIds, featuredSpotIds } = await applyAdminContentFilters(
    snapshot.events,
    snapshot.locations,
    { includeLocalFeaturedOverrides: false },
  );

  const adminFeaturedEvents = events.filter(
    (e) =>
      featuredEventIds.has(e.id) &&
      e.visibility === 'public' &&
      e.coverImageUrl &&
      !isEventPast(e),
  );
  const adminFeaturedSpots = spots.filter(
    (s) => featuredSpotIds.has(s.id) && s.visibility !== 'prime' && (s.coverImageUrl || s.logoUrl),
  );

  return normalizeSnapshotUniqueness({
    ...snapshot,
    events,
    locations: spots,
    featuredBanners: buildFeaturedBanners(adminFeaturedEvents),
    featuredSpotBanners: buildFeaturedBannersFromLocations(adminFeaturedSpots),
  });
}

/** Masque les contenus rattachés aux catégories désactivées (Agenda, Spots, Outils). */
async function filterSnapshotByActiveCategories(snapshot: ContentSnapshot): Promise<ContentSnapshot> {
  if (!refreshCategoryLabelsFromMemory()) {
    await refreshCategoryLabelsCache();
  }

  const labelsLoaded = isCategoryLabelsLoaded();
  const eventFilter = getActiveEventCategoryFilter();
  const spotFilter = getActiveSpotCategoryFilter();
  const toolFilter = getActiveToolCategoryFilter();
  const inactiveEventFilter = getInactiveEventCategoryFilter();
  const inactiveSpotFilter = getInactiveSpotCategoryFilter();
  const inactiveToolFilter = getInactiveToolCategoryFilter();

  const events = filterEventsByActiveCategories(
    snapshot.events,
    eventFilter,
    inactiveEventFilter,
    labelsLoaded,
  );
  const locations = filterLocationsByActiveCategories(
    snapshot.locations,
    spotFilter,
    inactiveSpotFilter,
    toolFilter,
    inactiveToolFilter,
    labelsLoaded,
  );

  const eventIds = new Set(events.map((e) => e.id));
  const locationIds = new Set(locations.map((l) => l.id));

  return normalizeSnapshotUniqueness({
    ...snapshot,
    events,
    locations,
    featuredBanners: snapshot.featuredBanners.filter(
      (b) => b.targetType !== 'event' || eventIds.has(b.targetId),
    ),
    featuredSpotBanners: snapshot.featuredSpotBanners.filter((b) => locationIds.has(b.targetId)),
  });
}

async function enrichToolLocationFromSubmissions(locations: HomeLocation[]): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const tools = locations.filter((loc) => loc.subCategory === 'tools');
  if (!tools.length) return;

  const ids = tools.map((tool) => tool.id);
  const { data, error } = await supabase
    .from('partner_spot_submissions')
    .select('published_tool_id, address, district')
    .in('published_tool_id', ids);
  if (error || !data?.length) return;

  const byTool = new Map(data.map((row) => [String(row.published_tool_id), row]));
  for (const tool of tools) {
    const row = byTool.get(tool.id);
    if (!row) continue;
    const address = row.address ? String(row.address).trim() : '';
    if (!address) continue;
    tool.address = address;
    tool.district = row.district ? String(row.district) : tool.district;
  }
}

async function enrichLocationSocialLinks(locations: HomeLocation[]): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const missing = locations.filter(
    (loc) =>
      !loc.instagramUrl ||
      !loc.facebookUrl ||
      !loc.website ||
      (loc.subCategory === 'tools' && (!loc.ctaUrl || !loc.toolCategory || !loc.developer || !loc.logoUrl)),
  );
  if (!missing.length) return;

  const ids = missing.map((loc) => loc.id);
  const { data, error } = await supabase
    .from('partner_spot_submissions')
    .select('published_establishment_id, instagram_url, facebook_url, website, cta_url, tool_category, developer, logo_url, is_verified, partnership_status')
    .in('published_establishment_id', ids);
  if (error || !data?.length) return;

  const byEstablishment = new Map(
    data.map((row) => [String(row.published_establishment_id), row]),
  );

  for (const loc of missing) {
    const row = byEstablishment.get(loc.id);
    if (!row) continue;
    if (!loc.instagramUrl && row.instagram_url) loc.instagramUrl = String(row.instagram_url);
    if (!loc.facebookUrl && row.facebook_url) loc.facebookUrl = String(row.facebook_url);
    if (!loc.website && row.website) loc.website = String(row.website);
    if (!loc.ctaUrl && row.cta_url) loc.ctaUrl = String(row.cta_url);
    if (!loc.toolCategory && row.tool_category) loc.toolCategory = String(row.tool_category);
    if (!loc.developer && row.developer) loc.developer = String(row.developer);
    if (!loc.logoUrl && row.logo_url) loc.logoUrl = String(row.logo_url);
    if (row.is_verified != null) loc.isVerified = Boolean(row.is_verified);
    if (!loc.partnershipStatus && row.partnership_status) {
      loc.partnershipStatus = row.partnership_status as HomeLocation['partnershipStatus'];
    }
    if (loc.toolCategory && loc.subCategory !== 'tools') {
      loc.subCategory = 'tools';
      loc.categories = ['tools', ...(loc.categories ?? []).filter((c) => c !== 'tools')];
    }
  }
}

async function enrichEventLocationFromSubmissions(events: import('@/types').Event[]): Promise<void> {
  if (!isSupabaseConfigured() || !supabase || !events.length) return;

  const ids = events.map((ev) => ev.id);
  const { data, error } = await supabase
    .from('partner_event_submissions')
    .select('published_event_id, venue_name, venue_address, spot_id')
    .in('published_event_id', ids);
  if (error || !data?.length) return;

  const byEvent = new Map(data.map((row) => [String(row.published_event_id), row]));

  for (const ev of events) {
    const row = byEvent.get(ev.id);
    if (!row) continue;
    if (row.venue_address != null) {
      ev.venueAddress = String(row.venue_address);
    }
    if (row.venue_name) {
      ev.venueName = String(row.venue_name);
    }
    if (row.spot_id) {
      ev.locationId = String(row.spot_id);
    }
  }
}

async function enrichEventSocialLinks(events: import('@/types').Event[]): Promise<void> {
  if (!isSupabaseConfigured() || !supabase || !events.length) return;

  const ids = events.map((ev) => ev.id);
  const { data, error } = await supabase
    .from('partner_event_submissions')
    .select('published_event_id, program, info_url, instagram_url, facebook_url, website_url')
    .in('published_event_id', ids);
  if (error) return;

  const byEvent = new Map((data ?? []).map((row) => [String(row.published_event_id), row]));

  for (const ev of events) {
    const row = byEvent.get(ev.id);
    if (row) {
      if (!ev.program && row.program) ev.program = String(row.program);
      if (!ev.instagramUrl && row.instagram_url) ev.instagramUrl = String(row.instagram_url);
      if (!ev.facebookUrl && row.facebook_url) ev.facebookUrl = String(row.facebook_url);
      if (!ev.infoUrl && row.info_url) ev.infoUrl = String(row.info_url);

      const submissionWebsite = row.website_url ? String(row.website_url).trim() : '';
      if (submissionWebsite) {
        const ticketNorm = ev.infoUrl ? normalizeExternalUrl(ev.infoUrl) : null;
        if (!ticketNorm || !urlsEquivalent(submissionWebsite, ticketNorm)) {
          ev.websiteUrl = submissionWebsite;
        }
      }
    }

    if (ev.websiteUrl && ev.infoUrl && urlsEquivalent(ev.websiteUrl, ev.infoUrl)) {
      ev.websiteUrl = null;
    }
  }
}

async function fetchSupabaseSnapshot(includeInactiveSpots = false): Promise<ContentSnapshot | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  const client = supabase;

  const [eventsPage, spotsPage, toolsPage] = await Promise.all([
    fetchSupabasePages<DbEventRow>(async (from, to) => {
      let query = client.from('events').select(EVENT_SELECT).order('start_date', { ascending: true });
      if (!includeInactiveSpots) {
        query = query.eq('is_active', true).eq('content_status', 'published');
      }
      const { data, error } = await query.range(from, to);
      return { data: data as DbEventRow[] | null, error };
    }),
    fetchSupabasePages<DbEstablishmentRow>(async (from, to) => {
      let query = client.from('establishments').select(ESTABLISHMENT_SELECT).order('name', { ascending: true });
      if (!includeInactiveSpots) {
        query = query.eq('is_active', true).eq('content_status', 'published');
      }
      const { data, error } = await query.range(from, to);
      return { data: data as DbEstablishmentRow[] | null, error };
    }),
    fetchSupabasePages<DbToolRow>(async (from, to) => {
      let query = client.from('tools').select(TOOL_SELECT).order('name', { ascending: true });
      if (!includeInactiveSpots) {
        query = query.eq('is_active', true).eq('content_status', 'published');
      }
      const { data, error } = await query.range(from, to);
      return { data: data as DbToolRow[] | null, error };
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
  // Table tools absente tant que la migration n'est pas appliquée : on continue sans outils.
  if (toolsPage.error) {
    console.warn('[Content] Lecture tools:', toolsPage.error.message);
  }

  const eventRows = eventsPage.data;
  const spotRows = spotsPage.data.filter((row) => !row.category_slugs?.includes('tools'));
  const toolRows = toolsPage.error ? [] : toolsPage.data;

  const eventSlugs = buildSlugMaps(eventRows.map((e) => ({ id: e.id, label: e.title })));
  const locationSlugs = buildSlugMaps([
    ...spotRows.map((s) => ({ id: s.id, label: s.name })),
    ...toolRows.map((t) => ({ id: t.id, label: t.name })),
  ]);

  const events = eventRows.map((row) => {
    const slug = eventSlugs.idToSlug.get(row.id)!;
    return mapDbEventToApp(row, slug);
  });
  const spotLocations = spotRows.map((row) =>
    mapDbEstablishmentToHomeLocation(row, locationSlugs.idToSlug.get(row.id)!),
  );
  const toolLocations = toolRows.map((row) =>
    mapDbToolToHomeLocation(row, locationSlugs.idToSlug.get(row.id)!),
  );
  const locations = [...spotLocations, ...toolLocations];
  void enrichEventSocialLinks(events);
  void enrichEventLocationFromSubmissions(events);
  void enrichLocationSocialLinks(locations);
  void enrichToolLocationFromSubmissions(locations);

  const featuredSource: Event[] = [];
  const featuredSpots: HomeLocation[] = [];

  return {
    events,
    locations,
    featuredBanners: buildFeaturedBanners(featuredSource),
    featuredSpotBanners: buildFeaturedBannersFromLocations(featuredSpots),
    slugToEventId: eventSlugs.slugToId,
    slugToLocationId: locationSlugs.slugToId,
    source: 'supabase',
  };
}

let cachedSnapshot: ContentSnapshot | null = null;
let loadPromise: Promise<ContentSnapshot | null> | null = null;
let adminCatalogSnapshot: ContentSnapshot | null = null;
let adminCatalogLoadPromise: Promise<ContentSnapshot> | null = null;
let adminCatalogFetchedAt = 0;
/** Évite un full-fetch catalogue admin à chaque mount d’écran (egress). */
const ADMIN_CATALOG_TTL_MS = 10 * 60 * 1000;

const STALE_CATALOG_CHECK_MIN_MS = 45_000;
let lastStaleCatalogCheckAt = 0;
let staleCatalogCheckInflight: Promise<boolean> | null = null;

async function persistRemoteCatalogSnapshot(filtered: ContentSnapshot): Promise<void> {
  cachedSnapshot = filtered;
  await writeCachedContentSnapshot(filtered);
  const fp = await fetchCatalogFingerprint();
  if (fp) await writeCachedCatalogFingerprint(fp);
}

async function fetchAndProcessRemoteSnapshot(): Promise<ContentSnapshot | null> {
  const online = await isNetworkOnline();
  if (!online) return null;
  const remote = await fetchSupabaseSnapshot();
  if (!remote) return null;
  const filtered = await processSnapshot(remote);
  await persistRemoteCatalogSnapshot(filtered);
  logContentSourceOnce(`[Content] Source : ${filtered.source} (${formatContentCounts(filtered)})`);
  return filtered;
}

/**
 * Vérifie l’empreinte Supabase (~100 octets) et ne retélécharge le catalogue que si nécessaire.
 * Affiche le cache local immédiatement, met à jour en arrière-plan si le cloud a changé.
 */
export async function refreshContentCatalogIfStale(
  onUpdate?: (snap: ContentSnapshot) => void,
  options?: { force?: boolean },
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const now = Date.now();
  if (!options?.force && now - lastStaleCatalogCheckAt < STALE_CATALOG_CHECK_MIN_MS) {
    return false;
  }
  if (staleCatalogCheckInflight) {
    return staleCatalogCheckInflight;
  }

  staleCatalogCheckInflight = (async () => {
    lastStaleCatalogCheckAt = now;
    try {
      if (!(await isNetworkOnline())) return false;

      const remoteFp = await fetchCatalogFingerprint();
      if (!remoteFp) return false;

      const localFp = await readCachedCatalogFingerprint();
      if (!options?.force && localFp === remoteFp) return false;

      console.log('[Content] Empreinte catalogue changée — resync');
      const fresh = await fetchAndProcessRemoteSnapshot();
      if (!fresh) return false;

      const { invalidateAccueilScopedCaches } = await import('@/lib/device-cache-reconcile');
      invalidateAccueilScopedCaches();
      adminCatalogSnapshot = null;
      adminCatalogFetchedAt = 0;

      onUpdate?.(fresh);
      void import('@/lib/home-refresh').then((m) => m.emitHomeRefresh('accueil-blocks'));
      return true;
    } finally {
      staleCatalogCheckInflight = null;
    }
  })();

  return staleCatalogCheckInflight;
}

async function processSnapshot(base: ContentSnapshot): Promise<ContentSnapshot> {
  const merged = await mergeApprovedStaging(base);
  const filtered = await filterSnapshotByActiveCategories(await applyAdminFilters(merged));
  // Filet de sécurité : jamais brouillon / désactivé / archivé dans le catalogue public (cache inclus).
  const events = filterPublishedActiveEvents(filtered.events);
  const locations = filterPublishedActiveLocations(filtered.locations);
  const eventIds = new Set(events.map((e) => e.id));
  const locationIds = new Set(locations.map((l) => l.id));
  return normalizeSnapshotUniqueness({
    ...filtered,
    events,
    locations,
    featuredBanners: filtered.featuredBanners.filter(
      (b) => b.targetType !== 'event' || eventIds.has(b.targetId),
    ),
    featuredSpotBanners: filtered.featuredSpotBanners.filter((b) => locationIds.has(b.targetId)),
  });
}

export async function loadAdminCatalogSnapshot(
  force = false,
  onBackgroundUpdate?: (snap: ContentSnapshot) => void,
): Promise<ContentSnapshot> {
  if (!force && adminCatalogSnapshot) {
    const stale = Date.now() - adminCatalogFetchedAt >= ADMIN_CATALOG_TTL_MS;
    if (stale && onBackgroundUpdate) {
      void refreshAdminCatalogSnapshot().then((fresh) => {
        adminCatalogSnapshot = fresh;
        onBackgroundUpdate(fresh);
      });
    }
    return adminCatalogSnapshot;
  }
  if (adminCatalogLoadPromise) {
    return adminCatalogLoadPromise;
  }

  adminCatalogLoadPromise = refreshAdminCatalogSnapshot().finally(() => {
    adminCatalogLoadPromise = null;
  });
  const snapshot = await adminCatalogLoadPromise;
  onBackgroundUpdate?.(snapshot);
  return snapshot;
}

async function refreshAdminCatalogSnapshot(): Promise<ContentSnapshot> {
  const online = await isNetworkOnline();
  let remote: ContentSnapshot | null = null;
  if (online) {
    remote = await fetchSupabaseSnapshot(true);
  }
  const fallback = adminCatalogSnapshot ?? (await peekContentSnapshot());
  const base = remote ?? fallback;
  const merged = await mergeApprovedStaging(base);
  adminCatalogSnapshot = merged;
  adminCatalogFetchedAt = Date.now();
  return merged;
}

/** Catalogue admin — cache mémoire / peek public uniquement (zéro full-fetch ici). */
export async function peekAdminCatalogSnapshot(): Promise<ContentSnapshot> {
  if (adminCatalogSnapshot) return adminCatalogSnapshot;
  const base = await peekContentSnapshot();
  const merged = await mergeApprovedStaging(base);
  adminCatalogSnapshot = merged;
  // Marque comme « frais » pour ne pas déclencher un refresh réseau immédiat au mount.
  adminCatalogFetchedAt = Date.now();
  return merged;
}

export type ContentLoadResult = {
  snapshot: ContentSnapshot | null;
  unavailable: boolean;
};

export async function loadContentSnapshot(force = false): Promise<ContentSnapshot> {
  const result = await loadContentSnapshotWithStatus(force);
  if (result.snapshot) return result.snapshot;
  return fallbackSnapshotWhenRemoteMissing();
}

/** Catalogue en mémoire / disque — sans attente réseau. */
export async function peekContentSnapshot(): Promise<ContentSnapshot> {
  if (cachedSnapshot) return cachedSnapshot;
  const disk = await readCachedContentSnapshot();
  if (disk) return disk;
  return fallbackSnapshotWhenRemoteMissing();
}

export async function loadContentSnapshotWithStatus(
  force = false,
  onBackgroundUpdate?: (snap: ContentSnapshot) => void,
): Promise<ContentLoadResult> {
  if (!force && cachedSnapshot) {
    void refreshContentCatalogIfStale(onBackgroundUpdate);
    return { snapshot: cachedSnapshot, unavailable: false };
  }
  if (!force && loadPromise) {
    const snap = await loadPromise;
    return snap ? { snapshot: snap, unavailable: false } : { snapshot: null, unavailable: true };
  }

  if (!force) {
    const disk = await readCachedContentSnapshot();
    if (disk) {
      const processed = await processSnapshot({ ...disk, source: 'cache' });
      cachedSnapshot = processed;
      logContentSourceOnce(`[Content] Source : cache local (${formatContentCounts(processed)})`);
      void refreshContentCatalogIfStale(onBackgroundUpdate);
      return { snapshot: processed, unavailable: false };
    }
  }

  let loadUnavailable = false;

  loadPromise = (async () => {
    const fresh = await fetchAndProcessRemoteSnapshot();
    if (fresh) return fresh;

    const online = await isNetworkOnline();
    const cached = await readCachedContentSnapshot();
    if (cached && !online) {
      cachedSnapshot = await processSnapshot({ ...cached, source: 'cache' });
      logContentSourceOnce(
        `[Content] Source : cache hors-ligne (${formatContentCounts(cachedSnapshot)})`,
      );
      return cachedSnapshot;
    }

    if (!online && isSupabaseConfigured()) {
      cachedSnapshot = await processSnapshot(fallbackSnapshotWhenRemoteMissing());
      console.warn(
        `[Content] Supabase injoignable — catalogue ${isSupabaseConfigured() ? 'vide' : 'demo'} (${formatContentCounts(cachedSnapshot)})`,
      );
      return cachedSnapshot;
    }

    cachedSnapshot = await processSnapshot(fallbackSnapshotWhenRemoteMissing());
    logContentSourceOnce(`[Content] Source : ${cachedSnapshot.source} (${formatContentCounts(cachedSnapshot)})`);
    return cachedSnapshot;
  })();

  try {
    const snap = await loadPromise;
    if (!snap) return { snapshot: null, unavailable: true };
    return { snapshot: snap, unavailable: loadUnavailable && !snap };
  } finally {
    loadPromise = null;
  }
}

export function getPublicEvents(snapshot: ContentSnapshot, countryCode?: string | null): Event[] {
  const list = filterPublishedActiveEvents(snapshot.events).filter(
    (e) => e.visibility === 'public' && e.status === 'published',
  );
  if (!countryCode) return list;
  return list.filter((e) => e.countryCode === countryCode);
}

export function getPrimeEvents(snapshot: ContentSnapshot, countryCode?: string | null): Event[] {
  const list = filterPublishedActiveEvents(snapshot.events).filter(
    (e) => e.visibility === 'prime' && e.status === 'published',
  );
  if (!countryCode) return list;
  return list.filter((e) => e.countryCode === countryCode);
}

export function getPrimeLocations(snapshot: ContentSnapshot, countryCode?: string | null): HomeLocation[] {
  const list = filterPublishedActiveLocations(snapshot.locations).filter((l) => l.visibility === 'prime');
  if (!countryCode) return list;
  return list.filter((l) => l.countryCode === countryCode);
}

export function getHomeLocations(
  snapshot: ContentSnapshot,
  subCategory?: HomeLocation['subCategory'],
  countryCode?: string | null,
): HomeLocation[] {
  let list = filterPublishedActiveLocations(snapshot.locations).filter((l) => l.visibility !== 'prime');
  if (subCategory) {
    list = list.filter(
      (l) => l.subCategory === subCategory || (l.categories?.includes(subCategory) ?? false),
    );
  }
  if (countryCode) list = list.filter((l) => l.countryCode === countryCode);
  return list;
}

export function getEventBySlug(snapshot: ContentSnapshot, slug: string): Event | undefined {
  const id = snapshot.slugToEventId.get(slug);
  const event = id ? snapshot.events.find((e) => e.id === id) : undefined;
  if (!event || !isPublishedActiveContent(event)) return undefined;
  return event;
}

export function getLocationBySlug(snapshot: ContentSnapshot, slug: string): HomeLocation | undefined {
  const id = snapshot.slugToLocationId.get(slug);
  const location = id ? snapshot.locations.find((l) => l.id === id) : undefined;
  if (!location || !isPublishedActiveContent(location)) return undefined;
  return location;
}

/** Met à jour le compteur de clics en cache après increment_event_click. */
export async function bumpEventClickCountInCache(eventId: string, clickCount?: number): Promise<void> {
  if (!cachedSnapshot) return;
  const idx = cachedSnapshot.events.findIndex((e) => e.id === eventId);
  if (idx < 0) return;
  const current = cachedSnapshot.events[idx].clickCount ?? 0;
  const next = clickCount != null && clickCount > 0 ? clickCount : current + 1;
  if (next === current) return;
  const events = [...cachedSnapshot.events];
  events[idx] = { ...events[idx], clickCount: next };
  cachedSnapshot = { ...cachedSnapshot, events };
  await writeCachedContentSnapshot(cachedSnapshot);
}

export function invalidateContentCache(): void {
  cachedSnapshot = null;
  loadPromise = null;
  adminCatalogSnapshot = null;
  adminCatalogLoadPromise = null;
  adminCatalogFetchedAt = 0;
}

/** Vide le cache catalogue en mémoire et sur l'appareil (AsyncStorage). */
export async function clearPersistedContentCache(): Promise<void> {
  cachedSnapshot = null;
  loadPromise = null;
  const { clearLocalCache } = await import('@/lib/offline-store');
  await Promise.all([clearLocalCache(CONTENT_CACHE_KEY), clearCachedCatalogFingerprint()]);
}
