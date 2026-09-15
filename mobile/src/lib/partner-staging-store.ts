import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EventCategory, LocationSubCategory } from '@/types';
import type { ContentOrigin } from '@/lib/content-origin';
import { normalizeCategoriesList, primaryCategory } from '@/lib/content-categories-utils';
import { guineaLocationSnapshotFromLabel, guineaLocationSnapshotFromStored, type GuineaLocationSnapshot } from '@/lib/guinea-locations';
import { partnerNamesMatch } from '@/lib/partner-name-utils';
import { scheduleScopedRefresh } from '@/lib/swr-cache';

export type SubmissionStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'withdrawal_requested';

export interface StagingEvent {
  id: string;
  partnerId: string;
  partnerName: string;
  title: string;
  description: string;
  program: string | null;
  category: EventCategory;
  categories?: string[];
  startsAt: string;
  endsAt: string | null;
  venueName: string;
  venueAddress: string | null;
  /** Hiérarchie GN (région → quartier) + libellé canonique. */
  venueLocation?: GuineaLocationSnapshot | null;
  guineaLocationId?: number | null;
  spotId: string | null;
  entryPrice: number | null;
  isInvitationOnly?: boolean;
  currency: string;
  infoUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  websiteUrl: string | null;
  coverImageUrl: string | null;
  galleryImages?: string[];
  speakers?: { name: string; title?: string | null; company?: string | null }[];
  status: SubmissionStatus;
  organizerName: string | null;
  /** Canal : admin, loop, partner. */
  contentOrigin?: ContentOrigin | null;
  /** ID du compte connecté ayant créé l'événement (master_id). */
  masterId: string;
  countryCode: string;
  /** ID events après publication modération. */
  publishedEventId?: string | null;
  createdAt: string;
  updatedAt: string;
  rejectionReason?: string;
}

export interface StagingSpot {
  id: string;
  partnerId: string;
  partnerName: string;
  name: string;
  address: string;
  district: string | null;
  description: string;
  subCategory: LocationSubCategory;
  categories?: string[];
  phone: string | null;
  website: string | null;
  logoUrl?: string | null;
  toolCategory?: string | null;
  isVerified?: boolean;
  developer?: string | null;
  partnershipStatus?: 'none' | 'pending' | 'active' | 'revoked';
  openingHours: string | null;
  priceLabel: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  ctaUrl: string | null;
  galleryImages: string[];
  coverImageUrl: string | null;
  status: SubmissionStatus;
  organizerName: string | null;
  /** Canal : admin, loop, partner. */
  contentOrigin?: ContentOrigin | null;
  countryCode: string;
  /** ID establishments / tools après publication. */
  publishedEstablishmentId?: string | null;
  publishedToolId?: string | null;
  createdAt: string;
  updatedAt: string;
  rejectionReason?: string;
}

interface StagingStore {
  events: StagingEvent[];
  spots: StagingSpot[];
}

const KEY = 'loop_partner_staging_v2';

function normalizeEvent(raw: Partial<StagingEvent> & { id: string; partnerId: string; partnerName: string; title: string }): StagingEvent {
  const now = raw.updatedAt ?? raw.createdAt ?? new Date().toISOString();
  const categories = normalizeCategoriesList(raw.categories ?? raw.category, 'corporate');
  return {
    id: raw.id,
    partnerId: raw.partnerId,
    partnerName: raw.partnerName,
    title: raw.title,
    description: raw.description ?? '',
    program: raw.program ?? null,
    category: primaryCategory(categories, 'corporate') as EventCategory,
    categories,
    startsAt: raw.startsAt ?? now,
    endsAt: raw.endsAt ?? null,
    venueName: raw.venueName ?? '',
    venueAddress: raw.venueAddress ?? null,
    venueLocation: raw.venueLocation
      ? guineaLocationSnapshotFromStored(raw.venueLocation, raw.countryCode ?? 'GN')
      : (raw.venueAddress
        ? guineaLocationSnapshotFromLabel(String(raw.venueAddress), raw.countryCode ?? 'GN')
        : null),
    guineaLocationId: raw.guineaLocationId ?? null,
    spotId: raw.spotId ?? null,
    entryPrice: raw.entryPrice ?? null,
    isInvitationOnly: raw.isInvitationOnly === true,
    currency: raw.currency ?? 'GNF',
    infoUrl: raw.infoUrl ?? null,
    instagramUrl: raw.instagramUrl ?? null,
    facebookUrl: raw.facebookUrl ?? null,
    websiteUrl: raw.websiteUrl ?? null,
    coverImageUrl: raw.coverImageUrl ?? null,
    galleryImages: Array.isArray(raw.galleryImages) ? raw.galleryImages : [],
    speakers: Array.isArray(raw.speakers)
      ? raw.speakers
          .map((sp) => ({
            name: String(sp?.name ?? '').trim(),
            title: sp?.title ? String(sp.title).trim() : null,
            company: sp?.company ? String(sp.company).trim() : null,
          }))
          .filter((sp) => sp.name.length > 0)
      : [],
    status: raw.status ?? 'pending',
    organizerName: raw.organizerName ?? null,
    contentOrigin: raw.contentOrigin ?? null,
    masterId: raw.masterId ?? raw.partnerId,
    countryCode: raw.countryCode ?? 'GN',
    publishedEventId: raw.publishedEventId ?? null,
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
    rejectionReason: raw.rejectionReason,
  };
}

function normalizeSpot(raw: Partial<StagingSpot> & { id: string; partnerId: string; partnerName: string; name: string }): StagingSpot {
  const now = raw.updatedAt ?? raw.createdAt ?? new Date().toISOString();
  const categories = normalizeCategoriesList(raw.categories ?? raw.subCategory, 'fine_dining');
  const looksLikeTool =
    raw.subCategory === 'tools'
    || categories.includes('tools')
    || Boolean(raw.toolCategory?.trim())
    || Boolean(raw.developer?.trim() && raw.logoUrl);
  const resolvedCategories = looksLikeTool
    ? ['tools', ...categories.filter((c) => c !== 'tools')]
    : categories;
  return {
    id: raw.id,
    partnerId: raw.partnerId,
    partnerName: raw.partnerName,
    name: raw.name,
    address: raw.address ?? '',
    district: raw.district ?? null,
    description: raw.description ?? '',
    subCategory: (looksLikeTool ? 'tools' : primaryCategory(resolvedCategories, 'fine_dining')) as LocationSubCategory,
    categories: resolvedCategories,
    phone: raw.phone ?? null,
    website: raw.website ?? null,
    logoUrl: raw.logoUrl ?? null,
    toolCategory: raw.toolCategory ?? null,
    isVerified: raw.isVerified ?? false,
    developer: raw.developer ?? null,
    partnershipStatus: raw.partnershipStatus ?? (looksLikeTool ? 'pending' : 'none'),
    openingHours: raw.openingHours ?? null,
    priceLabel: raw.priceLabel ?? null,
    instagramUrl: raw.instagramUrl ?? null,
    facebookUrl: raw.facebookUrl ?? null,
    ctaUrl: raw.ctaUrl ?? null,
    galleryImages: Array.isArray(raw.galleryImages) ? raw.galleryImages : [],
    coverImageUrl: raw.coverImageUrl ?? null,
    status: raw.status === 'approved' ? 'approved' : (raw.status ?? 'pending'),
    organizerName: raw.organizerName ?? null,
    contentOrigin: raw.contentOrigin ?? null,
    countryCode: raw.countryCode ?? 'GN',
    publishedEstablishmentId: raw.publishedEstablishmentId ?? null,
    publishedToolId: raw.publishedToolId ?? null,
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
    rejectionReason: raw.rejectionReason,
  };
}

async function loadStore(): Promise<StagingStore> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { events: [], spots: [] };
    const parsed = JSON.parse(raw) as StagingStore;
    return {
      events: Array.isArray(parsed.events) ? parsed.events.map((e) => normalizeEvent(e)) : [],
      spots: Array.isArray(parsed.spots) ? parsed.spots.map((s) => normalizeSpot(s)) : [],
    };
  } catch {
    return { events: [], spots: [] };
  }
}

async function saveStore(store: StagingStore) {
  await AsyncStorage.setItem(KEY, JSON.stringify(store));
}

async function syncSpotToRemote(spot: StagingSpot): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { syncPartnerSpotSubmission } = await import('@/lib/partner-content-sync');
    return await syncPartnerSpotSubmission(spot);
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'sync_error';
    console.warn('[Staging] Sync spot remote:', reason);
    return { ok: false, reason };
  }
}

async function syncEventToRemote(event: StagingEvent): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { syncPartnerEventSubmission } = await import('@/lib/partner-content-sync');
    return await syncPartnerEventSubmission(event);
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'sync_error';
    console.warn('[Staging] Sync event remote:', reason);
    return { ok: false, reason };
  }
}

function belongsToPartnerRecord(
  record: { partnerId: string; partnerName: string },
  partnerId: string,
  queryUserId: string | null,
  partnerName: string,
): boolean {
  return (
    record.partnerId === partnerId
    || (queryUserId != null && record.partnerId === queryUserId)
    || (partnerName.length > 0 && (
      record.partnerName === partnerName || partnerNamesMatch(record.partnerName, partnerName)
    ))
  );
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function listPartnerEvents(
  partnerId: string,
  partnerNameHint?: string,
): Promise<StagingEvent[]> {
  const { ensurePartnerSupabaseSession } = await import('@/lib/partner-spot-auth');
  await ensurePartnerSupabaseSession();

  const { loadPartnerSpotSession } = await import('@/lib/partner-session-store');
  const { resolvePartnerQueryUserId } = await import('@/lib/partner-catalog-ids');
  const { resolvePartnerDisplayNameFromDb } = await import('@/lib/partner-user-resolve');
  const { fetchRemotePartnerEventSubmissions, mergeStagingWithRemote } = await import('@/lib/partner-content-sync');
  const { applyPartnerLiveCatalogFilter } = await import('@/lib/partner-content-visibility');
  const { supplementPartnerEventsFromCatalog } = await import('@/lib/partner-content-supplement');

  const session = await loadPartnerSpotSession();
  const partnerName =
    partnerNameHint?.trim()
    || session?.user?.company?.trim()
    || session?.user?.fullName?.trim()
    || (await resolvePartnerDisplayNameFromDb(partnerId))
    || '';
  const queryUserId = await resolvePartnerQueryUserId(partnerId, partnerName);

  const store = await loadStore();
  const local = store.events.filter((e) => belongsToPartnerRecord(e, partnerId, queryUserId, partnerName));

  const remote = queryUserId
    ? await fetchRemotePartnerEventSubmissions({ partnerUserId: queryUserId })
    : [];

  const merged = mergeStagingWithRemote(local, remote);
  const catalogPartnerId = queryUserId ?? partnerId;
  const supplemented = await supplementPartnerEventsFromCatalog(merged, catalogPartnerId, partnerName);
  const { events } = await applyPartnerLiveCatalogFilter(supplemented, [], catalogPartnerId, partnerName);
  return events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listPartnerSpots(
  partnerId: string,
  partnerNameHint?: string,
): Promise<StagingSpot[]> {
  const { ensurePartnerSupabaseSession } = await import('@/lib/partner-spot-auth');
  await ensurePartnerSupabaseSession();

  const { loadPartnerSpotSession } = await import('@/lib/partner-session-store');
  const { resolvePartnerQueryUserId } = await import('@/lib/partner-catalog-ids');
  const { resolvePartnerDisplayNameFromDb } = await import('@/lib/partner-user-resolve');
  const { fetchRemotePartnerSpotSubmissions, mergeStagingWithRemote } = await import('@/lib/partner-content-sync');
  const { applyPartnerLiveCatalogFilter } = await import('@/lib/partner-content-visibility');
  const { supplementPartnerSpotsFromCatalog } = await import('@/lib/partner-content-supplement');

  const session = await loadPartnerSpotSession();
  const partnerName =
    partnerNameHint?.trim()
    || session?.user?.company?.trim()
    || session?.user?.fullName?.trim()
    || (await resolvePartnerDisplayNameFromDb(partnerId))
    || '';
  const queryUserId = await resolvePartnerQueryUserId(partnerId, partnerName);

  const store = await loadStore();
  const local = store.spots.filter((s) => belongsToPartnerRecord(s, partnerId, queryUserId, partnerName));

  const remote = queryUserId
    ? await fetchRemotePartnerSpotSubmissions({ partnerUserId: queryUserId })
    : [];

  const merged = mergeStagingWithRemote(local, remote);
  const catalogPartnerId = queryUserId ?? partnerId;
  const supplemented = await supplementPartnerSpotsFromCatalog(merged, catalogPartnerId, partnerName);
  const { spots } = await applyPartnerLiveCatalogFilter([], supplemented, catalogPartnerId, partnerName);
  return spots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listPendingEvents(countryCode?: string): Promise<StagingEvent[]> {
  const store = await loadStore();
  const peeked = store.events.filter((e) => {
    if (e.status !== 'pending') return false;
    if (!countryCode) return true;
    return (e.countryCode ?? 'GN') === countryCode;
  });

  scheduleScopedRefresh(
    `pending_events_${countryCode ?? 'all'}`,
    async () => {
      const { fetchRemotePartnerEventSubmissions } = await import('@/lib/partner-content-sync');
      const remote = await fetchRemotePartnerEventSubmissions({ statuses: ['pending'] });
      if (!remote.length) return null;
      const s = await loadStore();
      for (const item of remote) {
        const idx = s.events.findIndex((e) => e.id === item.id);
        const normalized = normalizeEvent(item);
        if (idx >= 0) s.events[idx] = normalizeEvent({ ...s.events[idx], ...normalized });
        else s.events.push(normalized);
      }
      await saveStore(s);
      return s.events.filter((e) => e.status === 'pending');
    },
  );

  return peeked;
}

export async function listPendingSpots(countryCode?: string): Promise<StagingSpot[]> {
  const store = await loadStore();
  const peeked = store.spots.filter((s) => {
    if (s.status !== 'pending') return false;
    if (!countryCode) return true;
    return (s.countryCode ?? 'GN') === countryCode;
  });

  scheduleScopedRefresh(
    `pending_spots_${countryCode ?? 'all'}`,
    async () => {
      const { fetchRemotePartnerSpotSubmissions } = await import('@/lib/partner-content-sync');
      const remote = await fetchRemotePartnerSpotSubmissions({ statuses: ['pending'] });
      if (!remote.length) return null;
      const s = await loadStore();
      for (const item of remote) {
        const idx = s.spots.findIndex((sp) => sp.id === item.id);
        const normalized = normalizeSpot(item);
        if (idx >= 0) s.spots[idx] = normalizeSpot({ ...s.spots[idx], ...normalized });
        else s.spots.push(normalized);
      }
      await saveStore(s);
      return s.spots.filter((sp) => sp.status === 'pending');
    },
  );

  return peeked;
}

export type StagingEventInput = Omit<StagingEvent, 'id' | 'status' | 'createdAt' | 'updatedAt'>;
export type StagingSpotInput = Omit<StagingSpot, 'id' | 'status' | 'createdAt' | 'updatedAt'>;

export interface StagingCreateResult<T> {
  item: T;
  remoteSync: { ok: boolean; reason?: string };
}

export async function createPartnerEvent(input: StagingEventInput, options?: { draft?: boolean }): Promise<StagingCreateResult<StagingEvent>> {
  const store = await loadStore();
  const now = new Date().toISOString();
  const status: SubmissionStatus = options?.draft ? 'draft' : 'pending';
  const item = normalizeEvent({
    ...input,
    id: newId('evt'),
    status,
    createdAt: now,
    updatedAt: now,
  });

  let remoteSync: { ok: boolean; reason?: string } = { ok: false, reason: options?.draft ? 'draft_local_only' : 'pending_sync' };
  if (!options?.draft) {
    remoteSync = await syncEventToRemote(item);
  }

  store.events.unshift(item);
  await saveStore(store);
  return { item, remoteSync };
}

export async function updatePartnerEvent(
  id: string,
  partnerId: string,
  patch: Partial<Omit<StagingEvent, 'id' | 'partnerId' | 'partnerName' | 'masterId' | 'status' | 'createdAt'>>,
): Promise<StagingEvent | null> {
  const store = await loadStore();
  const idx = store.events.findIndex((e) => e.id === id && e.partnerId === partnerId);
  if (idx < 0) return null;
  const current = store.events[idx];
  if (current.status === 'approved') return null;
  const updated = normalizeEvent({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
    status: current.status === 'draft' ? 'draft' : 'pending',
  });
  store.events[idx] = updated;
  await saveStore(store);
  void syncEventToRemote(updated);
  return updated;
}

export async function deletePartnerEvent(id: string, partnerId: string): Promise<boolean> {
  const store = await loadStore();
  const item = store.events.find((e) => e.id === id && e.partnerId === partnerId);
  if (!item || item.status === 'approved') return false;
  store.events = store.events.filter((e) => e.id !== id);
  await saveStore(store);
  return true;
}

export async function createPartnerSpot(input: StagingSpotInput, options?: { draft?: boolean }): Promise<StagingCreateResult<StagingSpot>> {
  const store = await loadStore();
  const now = new Date().toISOString();
  const status: SubmissionStatus = options?.draft ? 'draft' : 'pending';
  const isTool =
    input.subCategory === 'tools'
    || (input.categories?.includes('tools') ?? false)
    || Boolean(input.toolCategory?.trim());
  const item = normalizeSpot({
    ...input,
    id: newId(isTool ? 'tool' : 'spot'),
    status,
    subCategory: isTool ? 'tools' : input.subCategory,
    categories: isTool ? ['tools', ...(input.categories ?? []).filter((c) => c !== 'tools')] : input.categories,
    createdAt: now,
    updatedAt: now,
  });

  let remoteSync: { ok: boolean; reason?: string } = { ok: false, reason: options?.draft ? 'draft_local_only' : 'pending_sync' };
  if (!options?.draft) {
    // Soumission à modération uniquement — jamais de publish ici (event/spot/outil).
    remoteSync = await syncSpotToRemote({ ...item, status: 'pending' });
  }

  store.spots.unshift(item);
  await saveStore(store);
  return { item, remoteSync };
}

export async function updatePartnerSpot(
  id: string,
  partnerId: string,
  patch: Partial<Omit<StagingSpot, 'id' | 'partnerId' | 'partnerName' | 'status' | 'createdAt'>>,
): Promise<StagingSpot | null> {
  const store = await loadStore();
  const idx = store.spots.findIndex((s) => s.id === id && s.partnerId === partnerId);
  if (idx < 0) return null;
  const current = store.spots[idx];
  if (current.status === 'approved') return null;
  const updated = normalizeSpot({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
    status: current.status === 'draft' ? 'draft' : 'pending',
  });
  store.spots[idx] = updated;
  await saveStore(store);
  void syncSpotToRemote(updated);
  return updated;
}

export async function deletePartnerSpot(id: string, partnerId: string): Promise<boolean> {
  const store = await loadStore();
  const item = store.spots.find((s) => s.id === id && s.partnerId === partnerId);
  if (!item || item.status === 'approved') return false;
  store.spots = store.spots.filter((s) => s.id !== id);
  await saveStore(store);
  return true;
}

/** Suppression admin (tout statut sauf besoin de partnerId). */
export async function adminDeletePartnerEvent(id: string): Promise<boolean> {
  const store = await loadStore();
  const idx = store.events.findIndex((e) => e.id === id);
  if (idx < 0) return false;
  store.events.splice(idx, 1);
  await saveStore(store);
  return true;
}

export async function adminDeletePartnerSpot(id: string): Promise<boolean> {
  const store = await loadStore();
  const idx = store.spots.findIndex((s) => s.id === id);
  if (idx < 0) return false;
  store.spots.splice(idx, 1);
  await saveStore(store);
  return true;
}

export async function removeStagingEvent(id: string): Promise<void> {
  const store = await loadStore();
  store.events = store.events.filter((e) => e.id !== id);
  await saveStore(store);
}

export async function removeStagingSpot(id: string): Promise<void> {
  const store = await loadStore();
  store.spots = store.spots.filter((s) => s.id !== id);
  await saveStore(store);
}

/** Purge le staging local : soumissions approuvées définitivement retirées (suppression admin). */
export async function pruneOrphanApprovedStaging(
  partnerId: string,
  partnerName = '',
): Promise<number> {
  const { resolvePartnerQueryUserId } = await import('@/lib/partner-catalog-ids');
  const { loadPermanentlyRemovedContentIds } = await import('@/lib/admin-catalog-filter');
  const { isPublishedContentLive } = await import('@/lib/partner-content-visibility');
  const { isNetworkOnline } = await import('@/lib/offline-store');
  const { isSupabaseConfigured } = await import('@/lib/supabase');

  if (!isSupabaseConfigured() || !(await isNetworkOnline())) return 0;

  const queryUserId = await resolvePartnerQueryUserId(partnerId, partnerName);
  if (!queryUserId) return 0;

  const removed = await loadPermanentlyRemovedContentIds();

  const store = await loadStore();
  const before = store.events.length + store.spots.length;
  const eventsToDrop = new Set<string>();
  const spotsToDrop = new Set<string>();

  for (const event of store.events) {
    if (!belongsToPartnerRecord(event, partnerId, queryUserId, partnerName)) continue;
    if (event.id.startsWith('catalog-event-')) {
      eventsToDrop.add(event.id);
      continue;
    }
    if (event.status !== 'approved') continue;
    const pub = event.publishedEventId?.trim();
    if (!pub || removed.has(pub) || removed.has(event.id)) {
      eventsToDrop.add(event.id);
      continue;
    }
    if (!(await isPublishedContentLive(pub))) eventsToDrop.add(event.id);
  }

  for (const spot of store.spots) {
    if (!belongsToPartnerRecord(spot, partnerId, queryUserId, partnerName)) continue;
    if (spot.id.startsWith('catalog-spot-') || spot.id.startsWith('catalog-tool-')) {
      spotsToDrop.add(spot.id);
      continue;
    }
    if (spot.status !== 'approved') continue;
    const isTool = spot.subCategory === 'tools';
    const pub = (isTool ? spot.publishedToolId : spot.publishedEstablishmentId)?.trim();
    if (!pub || removed.has(pub) || removed.has(spot.id)) {
      spotsToDrop.add(spot.id);
      continue;
    }
    if (!(await isPublishedContentLive(pub))) spotsToDrop.add(spot.id);
  }

  store.events = store.events.filter((e) => !eventsToDrop.has(e.id));
  store.spots = store.spots.filter((s) => !spotsToDrop.has(s.id));

  await saveStore(store);
  return before - (store.events.length + store.spots.length);
}

/** Retire les entrées « publiées » locales — le catalogue public vit dans Supabase. */
export async function prunePublishedStagingLocal(): Promise<number> {
  const store = await loadStore();
  const before = store.events.length + store.spots.length;
  store.events = store.events.filter((e) => e.status !== 'approved');
  store.spots = store.spots.filter((s) => s.status !== 'approved');
  await saveStore(store);
  return before - (store.events.length + store.spots.length);
}

export async function moderateEvent(id: string, approve: boolean, reason?: string): Promise<boolean> {
  const store = await loadStore();
  const idx = store.events.findIndex((e) => e.id === id);
  if (idx < 0) return false;
  const event = store.events[idx];

  if (!approve) {
    store.events[idx] = {
      ...event,
      status: 'rejected',
      rejectionReason: reason ?? 'Refusé par l\'admin',
      updatedAt: new Date().toISOString(),
    };
    await saveStore(store);
    try {
      const { rejectPartnerEventSubmission } = await import('@/lib/partner-content-sync');
      await rejectPartnerEventSubmission(id, reason);
    } catch (e) {
      console.warn('[Staging] moderateEvent remote:', e);
    }
    try {
      const { notifyPartnerModerationDecision } = await import('@/lib/partner-moderation-notify');
      await notifyPartnerModerationDecision({
        partnerUserId: event.masterId || event.partnerId,
        kind: 'event',
        title: event.title,
        approve: false,
        reason,
      });
    } catch (e) {
      console.warn('[Staging] notify partner moderateEvent:', e);
    }
    return true;
  }

  try {
    const { publishPartnerEventToEvents, syncPartnerEventSubmission } =
      await import('@/lib/partner-content-sync');
    // Toujours publier au nom du partenaire créateur (pas l'admin qui valide)
    await syncPartnerEventSubmission({
      ...event,
      status: 'approved',
      contentOrigin: 'partner',
    });
    const pub = await publishPartnerEventToEvents(id);
    if (pub.ok) {
      store.events[idx] = {
        ...event,
        status: 'approved',
        contentOrigin: 'partner',
        publishedEventId: pub.eventId ?? event.publishedEventId ?? null,
        updatedAt: new Date().toISOString(),
      };
      await saveStore(store);
      try {
        const { notifyPartnerModerationDecision } = await import('@/lib/partner-moderation-notify');
        await notifyPartnerModerationDecision({
          partnerUserId: event.masterId || event.partnerId,
          kind: 'event',
          title: event.title,
          approve: true,
        });
      } catch (e) {
        console.warn('[Staging] notify partner moderateEvent:', e);
      }
      return true;
    }
    console.warn('[Staging] Publication event:', pub.reason);
    return false;
  } catch (e) {
    console.warn('[Staging] moderateEvent remote:', e);
    return false;
  }
}

export async function moderateSpot(id: string, approve: boolean, reason?: string): Promise<boolean> {
  const store = await loadStore();
  const idx = store.spots.findIndex((s) => s.id === id);
  if (idx < 0) return false;
  const spot = store.spots[idx];

  if (!approve) {
    store.spots[idx] = {
      ...spot,
      status: 'rejected',
      rejectionReason: reason ?? 'Refusé par l\'admin',
      updatedAt: new Date().toISOString(),
    };
    await saveStore(store);
    try {
      const { rejectPartnerSpotSubmission } = await import('@/lib/partner-content-sync');
      await rejectPartnerSpotSubmission(id, reason);
    } catch (e) {
      console.warn('[Staging] moderateSpot remote:', e);
    }
    try {
      const { notifyPartnerModerationDecision } = await import('@/lib/partner-moderation-notify');
      await notifyPartnerModerationDecision({
        partnerUserId: spot.partnerId,
        kind: spot.subCategory === 'tools' ? 'tool' : 'spot',
        title: spot.name,
        approve: false,
        reason,
      });
    } catch (e) {
      console.warn('[Staging] notify partner moderateSpot:', e);
    }
    return true;
  }

  try {
    const { publishPartnerSpotToEstablishments, syncPartnerSpotSubmission } =
      await import('@/lib/partner-content-sync');
    await syncPartnerSpotSubmission({
      ...spot,
      status: 'approved',
      contentOrigin: 'partner',
    });
    const pub = await publishPartnerSpotToEstablishments(id);
    if (pub.ok) {
      const publishedId = pub.establishmentId ?? null;
      const isTool = spot.subCategory === 'tools';
      store.spots[idx] = {
        ...spot,
        status: 'approved',
        contentOrigin: 'partner',
        publishedEstablishmentId: isTool ? null : (publishedId ?? spot.publishedEstablishmentId ?? null),
        publishedToolId: isTool ? (publishedId ?? spot.publishedToolId ?? null) : null,
        updatedAt: new Date().toISOString(),
      };
      await saveStore(store);
      try {
        const { notifyPartnerModerationDecision } = await import('@/lib/partner-moderation-notify');
        await notifyPartnerModerationDecision({
          partnerUserId: spot.partnerId,
          kind: spot.subCategory === 'tools' ? 'tool' : 'spot',
          title: spot.name,
          approve: true,
        });
      } catch (e) {
        console.warn('[Staging] notify partner moderateSpot:', e);
      }
      return true;
    }
    console.warn('[Staging] Publication establishment:', pub.reason);
    return false;
  } catch (e) {
    console.warn('[Staging] moderateSpot remote:', e);
    return false;
  }
}

export async function listAllStagingEvents(): Promise<StagingEvent[]> {
  const store = await loadStore();
  return store.events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listAllStagingSpots(): Promise<StagingSpot[]> {
  const store = await loadStore();
  return store.spots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getStagingEventById(id: string): Promise<StagingEvent | null> {
  const store = await loadStore();
  return store.events.find((e) => e.id === id) ?? null;
}

export async function getStagingSpotById(id: string): Promise<StagingSpot | null> {
  const store = await loadStore();
  return store.spots.find((s) => s.id === id) ?? null;
}

/** Réinjecte ou met à jour un spot staging (ex. rechargé depuis Supabase). */
export async function mergeStagingSpot(spot: StagingSpot): Promise<void> {
  const store = await loadStore();
  const idx = store.spots.findIndex((s) => s.id === spot.id);
  const normalized = normalizeSpot(spot);
  if (idx >= 0) {
    store.spots[idx] = normalizeSpot({ ...store.spots[idx], ...normalized });
  } else {
    store.spots.push(normalized);
  }
  await saveStore(store);
}

/** Réinjecte ou met à jour un événement staging (ex. rechargé depuis Supabase). */
export async function mergeStagingEvent(event: StagingEvent): Promise<void> {
  const store = await loadStore();
  const idx = store.events.findIndex((e) => e.id === event.id);
  const normalized = normalizeEvent(event);
  if (idx >= 0) {
    store.events[idx] = normalizeEvent({ ...store.events[idx], ...normalized });
  } else {
    store.events.push(normalized);
  }
  await saveStore(store);
}

export async function adminUpdatePartnerEvent(
  id: string,
  patch: Partial<Omit<StagingEvent, 'id' | 'partnerId' | 'partnerName' | 'masterId' | 'createdAt'>>,
): Promise<StagingEvent | null> {
  const store = await loadStore();
  const idx = store.events.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  const updated = normalizeEvent({
    ...store.events[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  store.events[idx] = updated;
  await saveStore(store);
  void syncEventToRemote(updated);
  return updated;
}

export async function adminUpdatePartnerSpot(
  id: string,
  patch: Partial<Omit<StagingSpot, 'id' | 'partnerId' | 'partnerName' | 'createdAt'>>,
): Promise<StagingSpot | null> {
  const store = await loadStore();
  const idx = store.spots.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  const updated = normalizeSpot({
    ...store.spots[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  store.spots[idx] = updated;
  await saveStore(store);
  void syncSpotToRemote(updated);
  return updated;
}

export async function retryPartnerStagingSync(partnerId: string): Promise<{ spots: number; events: number; failed: number }> {
  const [spots, events] = await Promise.all([listPartnerSpots(partnerId), listPartnerEvents(partnerId)]);
  let failed = 0;
  for (const spot of spots) {
    const res = await syncSpotToRemote(spot);
    if (!res.ok) failed += 1;
  }
  for (const event of events) {
    const res = await syncEventToRemote(event);
    if (!res.ok) failed += 1;
  }
  return { spots: spots.length, events: events.length, failed };
}

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  draft: 'Brouillon',
  pending: 'En attente',
  approved: 'Publié',
  rejected: 'Refusé',
  withdrawal_requested: 'Retrait demandé',
};

/** Vide tout le staging local (AsyncStorage). Utile pour reset sandbox sur l'appareil. */
export async function clearAllPartnerStaging(): Promise<void> {
  await saveStore({ events: [], spots: [] });
}
