import { loadPartnerSpotSession } from '@/lib/partner-session-store';
import {
  loadAdminHiddenContentIds,
  loadPermanentlyRemovedContentIds,
} from '@/lib/admin-catalog-filter';
import { resolvePartnerUserIdForSync } from '@/lib/partner-user-resolve';
import { resolveExplicitPartnerUserId } from '@/lib/partner-session-user-id';
import { isNetworkOnline } from '@/lib/offline-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { fetchSupabasePages } from '@/lib/supabase-list';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Session Supabase courante — source de vérité pour l'espace partenaire connecté. */
async function resolvePartnerAuthUserId(): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data } = await supabase.auth.getUser();
  const authId = data.user?.id?.trim();
  return authId && isUuid(authId) ? authId : null;
}

async function fetchPartnerContentIdsViaRpc(): Promise<Set<string> | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const authId = await resolvePartnerAuthUserId();
  if (!authId) return null;

  try {
    const { data, error } = await supabase.rpc('list_my_partner_published_content_ids');
    if (error) {
      const msg = error.message ?? '';
      if (
        !/does not exist|could not find|schema cache|network request failed|failed to fetch|network error|fetch/i.test(
          msg,
        )
      ) {
        console.warn('[PartnerCatalog] RPC content ids:', msg);
      }
      return null;
    }

    let parsed: unknown = data;
    if (typeof data === 'string') {
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = [];
      }
    }

    const ids = new Set<string>();
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        const id = typeof entry === 'string' ? entry : String(entry ?? '').trim();
        if (id) ids.add(id);
      }
    }
    return ids;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/network request failed|failed to fetch|network error/i.test(message)) {
      console.warn('[PartnerCatalog] RPC content ids:', message);
    }
    return null;
  }
}

/** Résout l'UUID `users.id` pour requêtes Supabase (jeton SPOT, staging local_id, etc.). */
export async function resolvePartnerQueryUserId(
  partnerUserId: string,
  partnerName?: string,
): Promise<string | null> {
  const fromParam = partnerUserId.startsWith('user:')
    ? partnerUserId.slice(5).trim()
    : partnerUserId.trim();
  const explicitFromParam = isUuid(fromParam) ? fromParam : null;

  const explicitResolved = await resolveExplicitPartnerUserId(partnerUserId, partnerName);
  const explicit =
    (explicitResolved && isUuid(explicitResolved) ? explicitResolved : null)
    ?? explicitFromParam;

  const authId = await resolvePartnerAuthUserId();

  // Compte cible explicite (admin qui associe un partenaire) : ne jamais remplacer par auth.uid()
  if (explicit) {
    if (!authId || authId === explicit) return explicit;
    return explicit;
  }

  if (authId) return authId;

  const session = await loadPartnerSpotSession();
  const name =
    partnerName?.trim()
    || session?.user?.company?.trim()
    || session?.user?.fullName?.trim()
    || '';
  const resolved = await resolvePartnerUserIdForSync(partnerUserId, name);
  if (resolved && isUuid(resolved)) return resolved;
  if (isUuid(partnerUserId)) return partnerUserId;
  return null;
}

async function fetchSubmissionPublishedIds(userId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!isSupabaseConfigured() || !supabase) return ids;

  const client = supabase;
  const [eventSubs, spotSubs] = await Promise.all([
    fetchSupabasePages<{ published_event_id: string | null }>(async (from, to) => {
      const { data, error } = await client
        .from('partner_event_submissions')
        .select('published_event_id')
        .eq('partner_user_id', userId)
        .eq('status', 'approved')
        .not('published_event_id', 'is', null)
        .range(from, to);
      return { data, error };
    }),
    fetchSupabasePages<{ published_establishment_id: string | null; published_tool_id: string | null }>(
      async (from, to) => {
        const { data, error } = await client
          .from('partner_spot_submissions')
          .select('published_establishment_id, published_tool_id')
          .eq('partner_user_id', userId)
          .eq('status', 'approved')
          .range(from, to);
        return { data, error };
      },
    ),
  ]);

  for (const row of eventSubs.data) {
    if (row.published_event_id) ids.add(String(row.published_event_id));
  }
  for (const row of spotSubs.data) {
    if (row.published_establishment_id) ids.add(String(row.published_establishment_id));
    if (row.published_tool_id) ids.add(String(row.published_tool_id));
  }
  return ids;
}

/** Garde uniquement les UUID encore publiés actifs en base. */
export async function confirmPublishedContentIds(ids: Set<string>): Promise<Set<string>> {
  if (!ids.size) return new Set<string>();
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) {
    return ids;
  }

  const uuidList = [...ids].filter((id) => isUuid(id));
  if (!uuidList.length) return new Set<string>();

  const confirmed = new Set<string>();
  const inLimit = Math.max(15, uuidList.length);
  const [events, establishments, tools] = await Promise.all([
    supabase
      .from('events')
      .select('id')
      .in('id', uuidList)
      .eq('content_status', 'published')
      .eq('is_active', true)
      .limit(inLimit),
    supabase
      .from('establishments')
      .select('id')
      .in('id', uuidList)
      .eq('content_status', 'published')
      .eq('is_active', true)
      .limit(inLimit),
    supabase
      .from('tools')
      .select('id')
      .in('id', uuidList)
      .eq('content_status', 'published')
      .eq('is_active', true)
      .limit(inLimit),
  ]);

  for (const row of events.data ?? []) confirmed.add(String(row.id));
  for (const row of establishments.data ?? []) confirmed.add(String(row.id));
  for (const row of tools.data ?? []) confirmed.add(String(row.id));

  if (confirmed.size === 0 && uuidList.length > 0) {
    const hadError = Boolean(events.error || establishments.error || tools.error);
    if (hadError) return ids;
    // Ne pas vider les IDs issus de la RPC partenaire (RLS partiel / latence réseau)
    return ids;
  }

  return confirmed;
}

export type PartnerCatalogIdScope = 'workspace' | 'public';

type LiveIdsCacheEntry = { key: string; ids: Set<string>; at: number };
const LIVE_IDS_TTL_MS = 45_000;
let liveIdsCache: LiveIdsCacheEntry | null = null;
let liveIdsInFlight: Promise<Set<string>> | null = null;
let liveIdsInFlightKey: string | null = null;

function liveIdsCacheKey(partnerUserId: string, scope: PartnerCatalogIdScope): string {
  return `${partnerUserId}:${scope}`;
}

function readLiveIdsCache(key: string, allowStale = false): Set<string> | null {
  if (!liveIdsCache || liveIdsCache.key !== key) return null;
  const age = Date.now() - liveIdsCache.at;
  if (age <= LIVE_IDS_TTL_MS || allowStale) {
    return new Set(liveIdsCache.ids);
  }
  return null;
}

function writeLiveIdsCache(key: string, ids: Set<string>): void {
  if (!ids.size) return;
  liveIdsCache = { key, ids: new Set(ids), at: Date.now() };
}

/** Invalide le cache catalogue partenaire (ex. après transfert admin). */
export function invalidatePartnerCatalogIdsCache(): void {
  liveIdsCache = null;
  liveIdsInFlight = null;
  liveIdsInFlightKey = null;
}

/** IDs catalogue publiés du partenaire (ownership + soumissions approuvées). */
export async function fetchPartnerPublishedCatalogIds(
  partnerUserId: string,
  partnerName?: string,
  scope: PartnerCatalogIdScope = 'workspace',
): Promise<Set<string>> {
  const cacheKey = liveIdsCacheKey(partnerUserId, scope);
  const cachedFresh = readLiveIdsCache(cacheKey);
  if (cachedFresh?.size) return cachedFresh;

  if (liveIdsInFlight && liveIdsInFlightKey === cacheKey) {
    return liveIdsInFlight;
  }

  liveIdsInFlightKey = cacheKey;
  liveIdsInFlight = fetchPartnerPublishedCatalogIdsInner(partnerUserId, partnerName, scope, cacheKey);
  try {
    return await liveIdsInFlight;
  } finally {
    liveIdsInFlight = null;
    liveIdsInFlightKey = null;
  }
}

async function fetchPartnerPublishedCatalogIdsInner(
  partnerUserId: string,
  partnerName: string | undefined,
  scope: PartnerCatalogIdScope,
  cacheKey: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!isSupabaseConfigured() || !supabase) {
    return readLiveIdsCache(cacheKey, true) ?? ids;
  }

  const authUserId = await resolvePartnerAuthUserId();
  const userId = await resolvePartnerQueryUserId(partnerUserId, partnerName);
  if (!userId) {
    return readLiveIdsCache(cacheKey, true) ?? ids;
  }

  const online = await isNetworkOnline();
  if (!online) {
    if (authUserId && userId === authUserId) {
      const fromRpcOffline = await fetchPartnerContentIdsViaRpc();
      if (fromRpcOffline?.size) {
        for (const id of fromRpcOffline) ids.add(id);
      }
    }
    const fromSubs = await fetchSubmissionPublishedIds(userId);
    for (const id of fromSubs) ids.add(id);
    if (ids.size) {
      const hidden =
        scope === 'public'
          ? await loadAdminHiddenContentIds()
          : await loadPermanentlyRemovedContentIds();
      for (const id of hidden) ids.delete(id);
      writeLiveIdsCache(cacheKey, ids);
      return ids;
    }
    return readLiveIdsCache(cacheKey, true) ?? ids;
  }

  const fromRpc =
    authUserId && userId === authUserId ? await fetchPartnerContentIdsViaRpc() : null;
  if (fromRpc?.size) {
    for (const id of fromRpc) ids.add(id);
  }

  const { data: staffRows } = await supabase
    .from('partner_staff')
    .select('id')
    .eq('user_id', userId)
    .limit(15);
  const masterIds = [
    ...new Set([...(staffRows ?? []).map((row) => String(row.id)), userId]),
  ];

  const ownerFilter = `organizer_id.eq.${userId},master_id.in.(${masterIds.join(',')})`;
  const masterFilter = `master_id.in.(${masterIds.join(',')})`;

  const [events, establishments, tools, submissionIds] = await Promise.all([
    supabase
      .from('events')
      .select('id')
      .eq('content_status', 'published')
      .eq('is_active', true)
      .or(ownerFilter)
      .limit(15),
    supabase
      .from('establishments')
      .select('id')
      .eq('is_active', true)
      .eq('content_status', 'published')
      .or(masterFilter)
      .limit(15),
    supabase
      .from('tools')
      .select('id')
      .eq('is_active', true)
      .eq('content_status', 'published')
      .or(masterFilter)
      .limit(15),
    fetchSubmissionPublishedIds(userId),
  ]);

  for (const row of events.data ?? []) ids.add(String(row.id));
  for (const row of establishments.data ?? []) ids.add(String(row.id));
  for (const row of tools.data ?? []) ids.add(String(row.id));
  for (const id of submissionIds) ids.add(id);

  const hidden =
    scope === 'public'
      ? await loadAdminHiddenContentIds()
      : await loadPermanentlyRemovedContentIds();
  for (const id of hidden) ids.delete(id);

  const confirmed = await confirmPublishedContentIds(ids);
  if (confirmed.size) {
    writeLiveIdsCache(cacheKey, confirmed);
    return confirmed;
  }
  if (ids.size) {
    writeLiveIdsCache(cacheKey, ids);
    return ids;
  }

  return readLiveIdsCache(cacheKey, true) ?? ids;
}

/** Alias explicite pour filtrage Mon contenu / Performances. */
export const fetchLivePartnerCatalogIds = fetchPartnerPublishedCatalogIds;

/** Vérifie qu'un UUID publié existe encore en catalogue actif. */
export async function isPublishedContentLive(contentId: string | null | undefined): Promise<boolean> {
  const id = contentId?.trim();
  if (!id || !isUuid(id)) return false;
  const confirmed = await confirmPublishedContentIds(new Set([id]));
  return confirmed.has(id);
}
