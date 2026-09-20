import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Event } from '@/types';
import type { HomeLocation } from '@/lib/demo-data';
import {
  listAllStagingEvents,
  listAllStagingSpots,
  type StagingEvent,
  type StagingSpot,
} from '@/lib/partner-staging-store';
import type { AdminContentItem, ContentStatus } from '@/lib/admin-types';
import { CONTENT_STATUS_LABELS } from '@/lib/admin-types';
import { isEventPast } from '@/lib/event-list-utils';
import { contentOriginFromStaging, isTeamContentOrigin } from '@/lib/content-origin';
import type { ContentOrigin } from '@/lib/content-origin';
import { isToolLocation } from '@/lib/location-kind-utils';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export { CONTENT_STATUS_LABELS };

interface ContentOverride {
  contentStatus?: ContentStatus;
  isFeatured?: boolean;
  featuredStartDate?: string | null;
  featuredEndDate?: string | null;
  deleted?: boolean;
  updatedAt: string;
}

interface FeaturedSpotMeta {
  isFeatured: boolean;
  featuredStartDate: string | null;
  featuredEndDate: string | null;
}

const OVERRIDES_KEY = 'loop_admin_content_overrides_v1';
const FEATURED_SPOTS_KEY = 'loop_admin_featured_spots_v1';

async function loadOverrides(): Promise<Record<string, ContentOverride>> {
  try {
    const raw = await AsyncStorage.getItem(OVERRIDES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ContentOverride>;
  } catch {
    return {};
  }
}

async function saveOverrides(data: Record<string, ContentOverride>): Promise<void> {
  await AsyncStorage.setItem(OVERRIDES_KEY, JSON.stringify(data));
}

async function loadFeaturedSpots(): Promise<Record<string, FeaturedSpotMeta>> {
  try {
    const raw = await AsyncStorage.getItem(FEATURED_SPOTS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, FeaturedSpotMeta>;
  } catch {
    return {};
  }
}

async function saveFeaturedSpots(data: Record<string, FeaturedSpotMeta>): Promise<void> {
  await AsyncStorage.setItem(FEATURED_SPOTS_KEY, JSON.stringify(data));
}

function overrideKey(kind: 'event' | 'spot', id: string) {
  return `${kind}:${id}`;
}

function normalizeFeaturedDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const dateOnly = trimmed.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? dateOnly : null;
}

export function isFeaturedWindowActive(
  isFeatured: boolean,
  featuredStartDate: string | null | undefined,
  featuredEndDate: string | null | undefined,
): boolean {
  if (!isFeatured) return false;
  const today = new Date().toISOString().slice(0, 10);
  const start = normalizeFeaturedDate(featuredStartDate);
  const end = normalizeFeaturedDate(featuredEndDate);
  if (start && start > today) return false;
  if (end && end < today) return false;
  return true;
}

function stagingEventStatus(e: StagingEvent): ContentStatus {
  if (e.status === 'approved') return 'published';
  if (e.status === 'rejected') return 'deactivated';
  if (e.status === 'draft') return 'draft';
  return 'draft';
}

function stagingSpotStatus(status: StagingSpot['status']): ContentStatus {
  if (status === 'approved') return 'published';
  if (status === 'rejected') return 'deactivated';
  if (status === 'draft') return 'draft';
  return 'draft';
}

/**
 * File Modération ≠ module Contenu.
 * - pending / rejected → Modération uniquement
 * - draft partenaire → Espace Pro partenaire uniquement
 * - draft équipe (admin/loop) → Contenu OK
 * - approved → catalogue publié (déjà dans events/spots), pas en doublon staging
 */
function isStagingForContentModule(item: {
  status: StagingEvent['status'] | StagingSpot['status'];
  contentOrigin?: ContentOrigin | null;
  partnerId?: string | null;
  partnerName?: string | null;
}): boolean {
  if (item.status === 'pending' || item.status === 'rejected' || item.status === 'approved') {
    return false;
  }
  if (item.status === 'draft') {
    const origin = item.contentOrigin ?? contentOriginFromStaging(item);
    return isTeamContentOrigin(origin);
  }
  return false;
}

export async function getAdminContentStatus(
  kind: 'event' | 'spot',
  id: string,
): Promise<ContentStatus> {
  const overrides = await loadOverrides();
  const ov = overrides[overrideKey(kind, id)];
  if (ov?.contentStatus) return ov.contentStatus;

  if (kind === 'event' && id.startsWith('evt-')) {
    const { getStagingEventById } = await import('@/lib/partner-staging-store');
    const item = await getStagingEventById(id);
    return item ? stagingEventStatus(item) : 'draft';
  }

  if (kind === 'spot' && (id.startsWith('spot-') || id.startsWith('tool-'))) {
    const { getStagingSpotById } = await import('@/lib/partner-staging-store');
    const item = await getStagingSpotById(id);
    return item ? stagingSpotStatus(item.status) : 'draft';
  }

  return 'published';
}

function isLocalStagingId(id: string): boolean {
  return id.startsWith('evt-') || id.startsWith('spot-') || id.startsWith('tool-');
}

/**
 * Brouillon local (evt-/spot-/tool-) → insert réel dans events / establishments / tools.
 * Sans ça, Contenu affichait « Publié » + staging sans jamais alimenter l’Agenda.
 */
export async function promoteStagingDraftToCatalog(
  kind: 'event' | 'spot',
  id: string,
): Promise<{ ok: boolean; publishedId?: string; error?: string }> {
  const {
    createAdminEventDirect,
    createAdminEstablishmentDirect,
    createAdminToolDirect,
  } = await import('@/lib/admin-direct-publish');
  const {
    getStagingEventById,
    getStagingSpotById,
    removeStagingEvent,
    removeStagingSpot,
  } = await import('@/lib/partner-staging-store');

  if (kind === 'event') {
    const item = await getStagingEventById(id);
    if (!item) return { ok: false, error: 'Brouillon introuvable.' };
    const direct = await createAdminEventDirect({
      title: item.title,
      description: item.description,
      program: item.program,
      category: item.category,
      categories: item.categories,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      venueName: item.venueName,
      venueAddress: item.venueAddress,
      spotId: item.spotId,
      entryPrice: item.entryPrice,
      isInvitationOnly: item.isInvitationOnly === true,
      isLoopX: item.isLoopX === true,
      infoUrl: item.infoUrl,
      websiteUrl: item.websiteUrl,
      instagramUrl: item.instagramUrl,
      facebookUrl: item.facebookUrl,
      coverImageUrl: item.coverImageUrl,
      galleryImages: item.galleryImages ?? [],
      organizerName: item.organizerName,
      speakers: item.speakers,
      contentOrigin: item.contentOrigin ?? 'admin',
      countryCode: item.countryCode,
      contentStatus: 'published',
    });
    if (!direct.ok || !direct.id) {
      return { ok: false, error: direct.reason ?? 'Publication catalogue impossible.' };
    }
    if (item.speakers?.length) {
      const { syncEditableEventSpeakers } = await import('@/lib/admin-edit-store');
      await syncEditableEventSpeakers(direct.id, item.speakers);
    }
    await removeStagingEvent(id);
    return { ok: true, publishedId: direct.id };
  }

  const item = await getStagingSpotById(id);
  if (!item) return { ok: false, error: 'Brouillon introuvable.' };
  const isTool =
    item.subCategory === 'tools'
    || id.startsWith('tool-')
    || (item.categories?.includes('tools') ?? false);

  if (isTool) {
    const direct = await createAdminToolDirect({
      name: item.name,
      description: item.description,
      phone: item.phone,
      website: item.website,
      logoUrl: item.logoUrl,
      coverImageUrl: item.coverImageUrl,
      galleryImages: item.galleryImages,
      instagramUrl: item.instagramUrl,
      facebookUrl: item.facebookUrl,
      ctaUrl: item.ctaUrl,
      toolCategory: item.toolCategory,
      developer: item.developer,
      isVerified: item.isVerified,
      partnershipStatus: item.partnershipStatus,
      contentOrigin: item.contentOrigin ?? 'admin',
      countryCode: item.countryCode,
      contentStatus: 'published',
    });
    if (!direct.ok || !direct.id) {
      return { ok: false, error: direct.reason ?? 'Publication outil impossible.' };
    }
    await removeStagingSpot(id);
    return { ok: true, publishedId: direct.id };
  }

  const direct = await createAdminEstablishmentDirect({
    name: item.name,
    description: item.description,
    address: item.address,
    district: item.district,
    subCategory: item.subCategory,
    categories: item.categories,
    phone: item.phone,
    website: item.website,
    logoUrl: item.logoUrl,
    coverImageUrl: item.coverImageUrl,
    galleryImages: item.galleryImages,
    openingHours: item.openingHours,
    priceLabel: item.priceLabel,
    instagramUrl: item.instagramUrl,
    facebookUrl: item.facebookUrl,
    ctaUrl: item.ctaUrl,
    organizerName: item.organizerName,
    contentOrigin: item.contentOrigin ?? 'admin',
    countryCode: item.countryCode,
    contentStatus: 'published',
  });
  if (!direct.ok || !direct.id) {
    return { ok: false, error: direct.reason ?? 'Publication spot impossible.' };
  }
  await removeStagingSpot(id);
  return { ok: true, publishedId: direct.id };
}

export async function setContentStatus(
  kind: 'event' | 'spot',
  id: string,
  contentStatus: ContentStatus,
): Promise<{ ok: boolean; error?: string; publishedId?: string }> {
  const overrides = await loadOverrides();
  const key = overrideKey(kind, id);
  let publishedId: string | undefined;

  // Brouillon local : « Publier » doit créer la ligne catalogue (sinon faux « Publié » + staging).
  if (contentStatus === 'published' && isLocalStagingId(id)) {
    const promoted = await promoteStagingDraftToCatalog(kind, id);
    if (!promoted.ok) {
      return { ok: false, error: promoted.error };
    }
    publishedId = promoted.publishedId;
    delete overrides[key];
    if (kind === 'spot') {
      const featured = await loadFeaturedSpots();
      if (featured[id]) {
        delete featured[id];
        await saveFeaturedSpots(featured);
      }
    }
    await saveOverrides(overrides);
  } else {
    overrides[key] = { ...overrides[key], contentStatus, updatedAt: new Date().toISOString() };
    await saveOverrides(overrides);

    if (isSupabaseConfigured() && supabase && !isLocalStagingId(id)) {
      const remoteStatus: 'draft' | 'published' | 'deactivated' | 'archived' =
        contentStatus === 'archived'
          ? 'archived'
          : contentStatus === 'deactivated'
            ? 'deactivated'
            : contentStatus === 'published'
              ? 'published'
              : 'draft';
      const isActive = remoteStatus === 'published';
      if (kind === 'event') {
        const { error } = await supabase
          .from('events')
          .update({ content_status: remoteStatus, is_active: isActive })
          .eq('id', id);
        if (error) {
          console.warn('[AdminContent] event status:', error.message);
          return { ok: false, error: error.message };
        }
      } else {
        const toolPatch = await supabase
          .from('tools')
          .update({ content_status: remoteStatus, is_active: isActive, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (toolPatch.error) {
          const { error } = await supabase
            .from('establishments')
            .update({ content_status: remoteStatus, is_active: isActive })
            .eq('id', id);
          if (error) {
            console.warn('[AdminContent] spot status:', error.message);
            return { ok: false, error: error.message };
          }
        }
      }
    }
  }

  try {
    const { invalidateContentCache, clearPersistedContentCache } = await import('@/lib/content-store');
    invalidateContentCache();
    await clearPersistedContentCache();
  } catch {
    /* ignore */
  }

  // Pas de passage par moderate* ici : la validation partenaire se fait
  // uniquement dans le module Modération.
  try {
    const { emitHomeRefresh } = await import('@/lib/home-refresh');
    emitHomeRefresh('admin-content-status');
  } catch {
    /* ignore */
  }
  return { ok: true, publishedId };
}

export async function setContentFeatured(
  kind: 'event' | 'spot',
  id: string,
  isFeatured: boolean,
  featuredStartDate?: string | null,
  featuredEndDate?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const start = normalizeFeaturedDate(featuredStartDate);
  const end = normalizeFeaturedDate(featuredEndDate);

  if (kind === 'spot') {
    const spots = await loadFeaturedSpots();
    spots[id] = {
      isFeatured,
      featuredStartDate: start ?? spots[id]?.featuredStartDate ?? null,
      featuredEndDate: end ?? spots[id]?.featuredEndDate ?? null,
    };
    await saveFeaturedSpots(spots);
  } else {
    const overrides = await loadOverrides();
    const key = overrideKey(kind, id);
    overrides[key] = {
      ...overrides[key],
      isFeatured,
      featuredStartDate: start ?? overrides[key]?.featuredStartDate ?? null,
      featuredEndDate: end ?? overrides[key]?.featuredEndDate ?? null,
      updatedAt: new Date().toISOString(),
    };
    await saveOverrides(overrides);
  }

  if (!isSupabaseConfigured() || !supabase) {
    return { ok: true };
  }

  const endIso = end ? `${end}T23:59:59.999Z` : null;
  const startIso = start ? `${start}T00:00:00.000Z` : null;

  if (kind === 'event') {
    const { data, error } = await supabase
      .from('events')
      .update({
        is_featured: isFeatured,
        featured_end_date: endIso,
      })
      .eq('id', id)
      .select('id');
    if (error) {
      console.warn('[AdminContent] featured event:', error.message);
      return { ok: false, error: error.message };
    }
    if (!data?.length) {
      return { ok: false, error: 'Événement introuvable en base.' };
    }
    return { ok: true };
  }

  const toolResult = await supabase
    .from('tools')
    .update({
      is_featured: isFeatured,
      featured_start_date: startIso,
      featured_end_date: endIso,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id');
  if (toolResult.error) {
    console.warn('[AdminContent] featured tool:', toolResult.error.message);
    return { ok: false, error: toolResult.error.message };
  }
  if ((toolResult.data?.length ?? 0) > 0) {
    return { ok: true };
  }

  const spotResult = await supabase
    .from('establishments')
    .update({
      is_featured: isFeatured,
      featured_end_date: endIso,
    })
    .eq('id', id)
    .select('id');
  if (spotResult.error) {
    console.warn('[AdminContent] featured spot:', spotResult.error.message);
    return { ok: false, error: spotResult.error.message };
  }
  if (!spotResult.data?.length) {
    return { ok: false, error: 'Spot introuvable en base (establishments/tools).' };
  }
  return { ok: true };
}

export async function markContentArchived(kind: 'event' | 'spot', id: string): Promise<void> {
  await setContentStatus(kind, id, 'archived');
}

export async function markContentPermanentlyRemoved(kind: 'event' | 'spot', id: string): Promise<void> {
  await setContentStatus(kind, id, 'archived');
  const overrides = await loadOverrides();
  const key = overrideKey(kind, id);
  overrides[key] = {
    ...overrides[key],
    deleted: true,
    contentStatus: 'archived',
    updatedAt: new Date().toISOString(),
  };
  await saveOverrides(overrides);
}

/** @deprecated Utiliser markContentArchived — aucune suppression définitive. */
export async function markContentDeleted(kind: 'event' | 'spot', id: string): Promise<void> {
  await markContentPermanentlyRemoved(kind, id);
}

export async function getContentOverride(
  kind: 'event' | 'spot',
  id: string,
): Promise<ContentOverride | null> {
  const overrides = await loadOverrides();
  return overrides[overrideKey(kind, id)] ?? null;
}

export async function loadContentOverrides(): Promise<Record<string, ContentOverride>> {
  return loadOverrides();
}

async function loadPartnerPublishedLocationIds(
  stagingSpots: StagingSpot[],
): Promise<Set<string>> {
  const ids = new Set<string>();

  for (const spot of stagingSpots) {
    const origin = spot.contentOrigin ?? contentOriginFromStaging(spot);
    if (origin === 'partner') ids.add(spot.id);
  }

  if (!isSupabaseConfigured() || !supabase) return ids;

  try {
    const [subsRes, adminsRes] = await Promise.all([
      supabase
        .from('partner_spot_submissions')
        .select('published_establishment_id, published_tool_id, local_id, partner_user_id')
        .or('published_establishment_id.not.is.null,published_tool_id.not.is.null')
        .limit(15),
      supabase
        .from('users')
        .select('id')
        .in('user_role', ['admin', 'super_admin'])
        .limit(15),
    ]);

    if (subsRes.error) {
      console.warn('[AdminContent] partner_spot_submissions:', subsRes.error.message);
      return ids;
    }

    const adminUserIds = new Set((adminsRes.data ?? []).map((u) => String(u.id)));

    for (const row of subsRes.data ?? []) {
      // Soumissions créées par un compte admin / super admin = contenu équipe, pas partenaire
      if (row.partner_user_id && adminUserIds.has(String(row.partner_user_id))) {
        continue;
      }
      if (row.published_establishment_id) ids.add(String(row.published_establishment_id));
      if (row.published_tool_id) ids.add(String(row.published_tool_id));
      if (row.local_id) ids.add(String(row.local_id));
    }
  } catch (err) {
    console.warn('[AdminContent] partner ids:', err);
  }

  return ids;
}

function resolveLocationContentOrigin(
  locationId: string,
  explicit: ContentOrigin | null | undefined,
  staging: StagingSpot | undefined,
  partnerPublishedIds: Set<string>,
): ContentOrigin {
  if (explicit === 'admin' || explicit === 'loop') return explicit;

  if (staging) {
    const fromStaging = staging.contentOrigin ?? contentOriginFromStaging(staging);
    if (fromStaging === 'admin' || fromStaging === 'loop') return fromStaging;
    if (fromStaging === 'partner') return 'partner';
  }

  if (partnerPublishedIds.has(locationId)) return 'partner';

  // `partner` en base mais pas une vraie soumission partenaire → correction (créations équipe)
  if (explicit === 'partner') return 'admin';

  // Création admin / super admin sans content_origin → équipe THE LOOP
  return 'admin';
}

function resolveFeaturedFromCatalog(item: {
  catalogFeatured?: boolean;
  featuredStartDate?: string | null;
  featuredEndDate?: string | null;
}): {
  isFeatured: boolean;
  featuredStartDate: string | null;
  featuredEndDate: string | null;
} {
  const start = item.featuredStartDate ?? null;
  const end = item.featuredEndDate ?? null;
  return {
    isFeatured: isFeaturedWindowActive(Boolean(item.catalogFeatured), start, end),
    featuredStartDate: start,
    featuredEndDate: end,
  };
}

function resolveAdminContentStatus(
  ov: ContentOverride | undefined,
  dbStatus: ContentStatus | undefined,
  fallback: ContentStatus = 'published',
): ContentStatus {
  return ov?.contentStatus ?? dbStatus ?? fallback;
}

export async function buildAdminContentList(
  events: Event[],
  spots: HomeLocation[],
): Promise<{ events: AdminContentItem[]; spots: AdminContentItem[] }> {
  const [overrides, featuredSpots, stagingEvents, stagingSpots] = await Promise.all([
    loadOverrides(),
    loadFeaturedSpots(),
    listAllStagingEvents(),
    listAllStagingSpots(),
  ]);

  const partnerPublishedIds = await loadPartnerPublishedLocationIds(stagingSpots);

  const stagingEventIds = new Set(stagingEvents.map((e) => e.id));
  const stagingSpotIds = new Set(stagingSpots.map((s) => s.id));
  const stagingEventById = new Map(stagingEvents.map((e) => [e.id, e]));
  const stagingSpotById = new Map(stagingSpots.map((s) => [s.id, s]));

  const eventItems: AdminContentItem[] = events
    .filter((e) => !overrides[overrideKey('event', e.id)]?.deleted)
    .map((e) => {
      const ov = overrides[overrideKey('event', e.id)];
      const staging = stagingEventById.get(e.id);
      const isStaging = stagingEventIds.has(e.id);
      const featured = isStaging
        ? {
            isFeatured: isFeaturedWindowActive(
              ov?.isFeatured ?? false,
              ov?.featuredStartDate ?? null,
              ov?.featuredEndDate ?? null,
            ),
            featuredStartDate: ov?.featuredStartDate ?? null,
            featuredEndDate: ov?.featuredEndDate ?? null,
          }
        : resolveFeaturedFromCatalog(e);
      return {
        id: e.id,
        kind: 'event' as const,
        title: e.title,
        subtitle: e.venueName,
        slug: e.slug,
        contentStatus: resolveAdminContentStatus(
          ov,
          e.contentStatus,
          isStaging && staging ? stagingEventStatus(staging) : 'published',
        ),
        isFeatured: featured.isFeatured,
        featuredStartDate: featured.featuredStartDate,
        featuredEndDate: featured.featuredEndDate,
        source: isStaging ? 'staging' as const : 'supabase' as const,
        contentOrigin: e.contentOrigin ?? staging?.contentOrigin ?? (staging ? contentOriginFromStaging(staging) : null),
        organizerName: e.organizerName ?? staging?.organizerName ?? null,
        startsAt: e.startsAt,
        updatedAt: e.updatedAt,
      };
    });

  for (const se of stagingEvents) {
    if (!isStagingForContentModule(se)) continue;
    if (eventItems.some((i) => i.id === se.id)) continue;
    const ov = overrides[overrideKey('event', se.id)];
    if (ov?.deleted) continue;
    eventItems.push({
      id: se.id,
      kind: 'event',
      title: se.title,
      subtitle: se.venueName,
      slug: null,
      contentStatus: ov?.contentStatus ?? stagingEventStatus(se),
      isFeatured: ov?.isFeatured ?? false,
      featuredStartDate: ov?.featuredStartDate ?? null,
      featuredEndDate: ov?.featuredEndDate ?? null,
      source: 'staging',
      contentOrigin: se.contentOrigin ?? contentOriginFromStaging(se),
      organizerName: se.organizerName,
      startsAt: se.startsAt,
      updatedAt: se.updatedAt,
    });
  }

  const spotItems: AdminContentItem[] = spots
    .filter((s) => !overrides[overrideKey('spot', s.id)]?.deleted)
    .reduce<AdminContentItem[]>((acc, s) => {
      if (acc.some((i) => i.id === s.id)) return acc;
      const ov = overrides[overrideKey('spot', s.id)];
      const feat = featuredSpots[s.id];
      const staging = stagingSpotById.get(s.id);
      const isStaging = stagingSpotIds.has(s.id);
      const contentOrigin = resolveLocationContentOrigin(
        s.id,
        s.contentOrigin,
        staging,
        partnerPublishedIds,
      );
      const featured = isStaging
        ? {
            isFeatured: isFeaturedWindowActive(
              feat?.isFeatured ?? ov?.isFeatured ?? false,
              feat?.featuredStartDate ?? ov?.featuredStartDate ?? null,
              feat?.featuredEndDate ?? ov?.featuredEndDate ?? null,
            ),
            featuredStartDate: feat?.featuredStartDate ?? ov?.featuredStartDate ?? null,
            featuredEndDate: feat?.featuredEndDate ?? ov?.featuredEndDate ?? null,
          }
        : resolveFeaturedFromCatalog(s);
      acc.push({
        id: s.id,
        kind: 'spot' as const,
        title: s.name,
        subtitle: s.address,
        slug: s.slug,
        contentStatus: resolveAdminContentStatus(
          ov,
          s.contentStatus,
          isStaging && staging ? stagingSpotStatus(staging.status) : 'published',
        ),
        isFeatured: featured.isFeatured,
        featuredStartDate: featured.featuredStartDate,
        featuredEndDate: featured.featuredEndDate,
        source: isStaging ? 'staging' as const : 'supabase' as const,
        contentOrigin,
        organizerName: s.organizerName ?? staging?.organizerName ?? null,
        updatedAt: s.updatedAt ?? new Date().toISOString(),
      });
      return acc;
    }, []);

  for (const ss of stagingSpots) {
    if (!isStagingForContentModule(ss)) continue;
    if (spotItems.some((i) => i.id === ss.id)) continue;
    const ov = overrides[overrideKey('spot', ss.id)];
    if (ov?.deleted) continue;
    const feat = featuredSpots[ss.id];
    spotItems.push({
      id: ss.id,
      kind: 'spot',
      title: ss.name,
      subtitle: ss.address,
      slug: null,
      contentStatus: ov?.contentStatus ?? stagingSpotStatus(ss.status),
      isFeatured: feat?.isFeatured ?? false,
      featuredStartDate: feat?.featuredStartDate ?? null,
      featuredEndDate: feat?.featuredEndDate ?? null,
      source: 'staging',
      contentOrigin: resolveLocationContentOrigin(
        ss.id,
        ss.contentOrigin,
        ss,
        partnerPublishedIds,
      ),
      organizerName: ss.organizerName,
      updatedAt: ss.updatedAt,
    });
  }

  return {
    events: eventItems.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    spots: spotItems.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}

/** Contenu de l'équipe admin / THE LOOP (hors partenaires). */
export async function buildTeamAdminContentList(
  events: Event[],
  spots: HomeLocation[],
): Promise<{ events: AdminContentItem[]; spots: AdminContentItem[] }> {
  const all = await buildAdminContentList(events, spots);
  return {
    events: all.events.filter((i) => isTeamContentOrigin(i.contentOrigin)),
    spots: all.spots.filter((i) => isTeamContentOrigin(i.contentOrigin)),
  };
}

/** Filtre le contenu public selon les overrides admin. */
export interface AdminContentFilterOptions {
  /** Overrides locaux pour le hero — false = Supabase uniquement (tous les appareils / visiteurs). */
  includeLocalFeaturedOverrides?: boolean;
}

export async function applyAdminContentFilters<T extends Event>(
  events: T[],
  spots: HomeLocation[],
  options: AdminContentFilterOptions = {},
): Promise<{ events: T[]; spots: HomeLocation[]; featuredEventIds: Set<string>; featuredSpotIds: Set<string> }> {
  const includeLocalFeatured = options.includeLocalFeaturedOverrides ?? true;
  // Toujours charger les overrides statut/suppression — sinon un event désactivé
  // reste visible tant que le cache catalogue n'a pas resync.
  const [overrides, featuredSpots] = await Promise.all([
    loadOverrides(),
    includeLocalFeatured ? loadFeaturedSpots() : Promise.resolve({} as Record<string, FeaturedSpotMeta>),
  ]);

  const filteredEvents = events.filter((e) => {
    const ov = overrides[overrideKey('event', e.id)];
    if (ov?.deleted) return false;
    if (e.isActive === false) return false;
    const status = ov?.contentStatus ?? e.contentStatus ?? 'published';
    return status === 'published';
  });

  const filteredSpots = spots.filter((s) => {
    const ov = overrides[overrideKey('spot', s.id)];
    if (ov?.deleted) return false;
    if (s.hidden === true || s.isActive === false) return false;
    const status = ov?.contentStatus ?? s.contentStatus ?? 'published';
    return status === 'published';
  });

  const featuredEventIds = new Set(
    events
      .filter((e) => {
        if (includeLocalFeatured) {
          const ov = overrides[overrideKey('event', e.id)];
          const isFeatured = ov?.isFeatured ?? e.catalogFeatured ?? false;
          const start = ov?.featuredStartDate ?? e.featuredStartDate ?? null;
          const end = ov?.featuredEndDate ?? e.featuredEndDate ?? null;
          return isFeaturedWindowActive(isFeatured, start, end);
        }
        return isFeaturedWindowActive(
          Boolean(e.catalogFeatured),
          e.featuredStartDate ?? null,
          e.featuredEndDate ?? null,
        );
      })
      .map((e) => e.id),
  );

  const featuredSpotIds = new Set<string>();
  for (const spot of spots) {
    if (includeLocalFeatured) {
      const ov = overrides[overrideKey('spot', spot.id)];
      const localMeta = featuredSpots[spot.id];
      const isFeatured = ov?.isFeatured ?? localMeta?.isFeatured ?? spot.catalogFeatured ?? false;
      const start = ov?.featuredStartDate ?? localMeta?.featuredStartDate ?? spot.featuredStartDate ?? null;
      const end = ov?.featuredEndDate ?? localMeta?.featuredEndDate ?? spot.featuredEndDate ?? null;
      if (isFeaturedWindowActive(isFeatured, start, end)) featuredSpotIds.add(spot.id);
      continue;
    }
    if (
      isFeaturedWindowActive(
        Boolean(spot.catalogFeatured),
        spot.featuredStartDate ?? null,
        spot.featuredEndDate ?? null,
      )
    ) {
      featuredSpotIds.add(spot.id);
    }
  }

  return { events: filteredEvents, spots: filteredSpots, featuredEventIds, featuredSpotIds };
}

export async function listFeaturedCandidates(
  events: Event[],
  spots: HomeLocation[],
): Promise<AdminContentItem[]> {
  const eventById = new Map(events.map((e) => [e.id, e]));
  const spotById = new Map(spots.map((s) => [s.id, s]));
  const { events: allEvents, spots: allSpots } = await buildAdminContentList(events, spots);

  function isSpotFeaturedEligible(item: AdminContentItem): boolean {
    if (item.contentStatus !== 'published') return false;
    const raw = spotById.get(item.id);
    // Pas de fiche catalogue → ne pas proposer à la une
    if (!raw) return false;
    if (raw.isActive === false) return false;
    if (raw.hidden === true) return false;
    // Outils : uniquement s'ils sont validés par THE LOOP
    if (isToolLocation(raw) && raw.isVerified !== true) return false;
    return true;
  }

  function isEventFeaturedEligible(item: AdminContentItem): boolean {
    if (item.contentStatus !== 'published') return false;
    const raw = eventById.get(item.id);
    if (!raw) return false;
    return !isEventPast(raw);
  }

  return [
    ...allEvents.filter(isEventFeaturedEligible),
    ...allSpots.filter(isSpotFeaturedEligible),
  ].sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));
}
