import { loadPartnerSpotSession } from '@/lib/partner-session-store';
import { fetchLivePartnerCatalogIds, resolvePartnerQueryUserId } from '@/lib/partner-catalog-ids';
import { loadPermanentlyRemovedContentIds } from '@/lib/admin-catalog-filter';
import { applyPartnerLiveCatalogFilter } from '@/lib/partner-content-visibility';
import { isNetworkOnline } from '@/lib/offline-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type PartnerEstablishmentType = 'event' | 'spot' | 'tool';

export interface PartnerEstablishment {
  id: string;
  type: PartnerEstablishmentType;
  title: string;
  status: string;
}

export interface ListPartnerEstablishmentsOptions {
  /** Scan QR visiteur / partenaire : offres actives uniquement, pas de sync catalogue lourde. */
  lightweight?: boolean;
  /** Admin — lieux de validité avantage : requêtes Supabase directes, sans sync lourde. */
  adminPicker?: boolean;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function resolvePartnerMasterIds(queryUserId: string): Promise<string[]> {
  if (!isSupabaseConfigured() || !supabase || !isUuid(queryUserId)) return [];
  const ids = new Set<string>([queryUserId]);

  try {
    const { data: staffId, error } = await supabase.rpc('ensure_partner_staff', {
      p_user_id: queryUserId,
    });
    if (!error && staffId) ids.add(String(staffId));
  } catch {
    /* RPC absente en local — fallback select */
  }

  const { data: staffRows } = await supabase
    .from('partner_staff')
    .select('id')
    .eq('user_id', queryUserId)
    .limit(15);
  for (const row of staffRows ?? []) ids.add(String(row.id));

  return [...ids];
}

function rowBelongsToPartner(
  row: { master_id?: string | null; organizer_id?: string | null },
  queryUserId: string,
  masterIds: Set<string>,
): boolean {
  const masterId = row.master_id ? String(row.master_id) : '';
  const organizerId = row.organizer_id ? String(row.organizer_id) : '';
  if (masterId && masterIds.has(masterId)) return true;
  if (organizerId && organizerId === queryUserId) return true;
  return false;
}

function belongsToPartnerMasterIds(
  masterId: string | null | undefined,
  organizerId: string | null | undefined,
  queryUserId: string,
  masterIdSet: Set<string>,
): boolean {
  return rowBelongsToPartner(
    { master_id: masterId, organizer_id: organizerId },
    queryUserId,
    masterIdSet,
  );
}

async function appendPublishedCatalogRows(
  queryUserId: string,
  push: (item: PartnerEstablishment) => void,
  options?: { skipRemoved?: boolean; skipLiveFilter?: boolean; partnerName?: string },
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase || !isUuid(queryUserId) || !(await isNetworkOnline())) return;

  const masterIds = await resolvePartnerMasterIds(queryUserId);
  if (!masterIds.length) return;

  const masterIdSet = new Set(masterIds);
  const removed = options?.skipRemoved ? new Set<string>() : await loadPermanentlyRemovedContentIds();
  const liveIds = options?.skipLiveFilter
    ? new Set<string>()
    : await fetchLivePartnerCatalogIds(queryUserId, options?.partnerName);
  const requireLiveFilter = !options?.skipLiveFilter && liveIds.size > 0;

  const [establishments, tools, events] = await Promise.all([
    supabase
      .from('establishments')
      .select('id, name, master_id')
      .eq('is_active', true)
      .eq('content_status', 'published')
      .order('name')
      .limit(15),
    supabase
      .from('tools')
      .select('id, name, master_id')
      .eq('is_active', true)
      .eq('content_status', 'published')
      .order('name')
      .limit(15),
    supabase
      .from('events')
      .select('id, title, master_id, organizer_id')
      .eq('content_status', 'published')
      .eq('is_active', true)
      .order('title')
      .limit(15),
  ]);

  if (establishments.error) {
    console.warn('[PartnerEstablishments] establishments:', establishments.error.message);
  }
  if (tools.error) {
    console.warn('[PartnerEstablishments] tools:', tools.error.message);
  }
  if (events.error) {
    console.warn('[PartnerEstablishments] events:', events.error.message);
  }

  for (const row of establishments.data ?? []) {
    if (!belongsToPartnerMasterIds(row.master_id, null, queryUserId, masterIdSet)) continue;
    const id = String(row.id);
    if (removed.has(id)) continue;
    if (requireLiveFilter && !liveIds.has(id)) continue;
    push({ id, type: 'spot', title: String(row.name), status: 'approved' });
  }
  for (const row of tools.data ?? []) {
    if (!belongsToPartnerMasterIds(row.master_id, null, queryUserId, masterIdSet)) continue;
    const id = String(row.id);
    if (removed.has(id)) continue;
    if (requireLiveFilter && !liveIds.has(id)) continue;
    push({ id, type: 'tool', title: String(row.name), status: 'approved' });
  }
  for (const row of events.data ?? []) {
    if (!belongsToPartnerMasterIds(row.master_id, row.organizer_id, queryUserId, masterIdSet)) continue;
    const id = String(row.id);
    if (removed.has(id)) continue;
    if (requireLiveFilter && !liveIds.has(id)) continue;
    push({ id, type: 'event', title: String(row.title), status: 'approved' });
  }
}

async function appendApprovedSubmissionCatalogRows(
  queryUserId: string,
  push: (item: PartnerEstablishment) => void,
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase || !isUuid(queryUserId) || !(await isNetworkOnline())) return;

  const [spotSubs, eventSubs] = await Promise.all([
    supabase
      .from('partner_spot_submissions')
      .select('name, sub_category, published_establishment_id, published_tool_id, status')
      .eq('partner_user_id', queryUserId)
      .in('status', ['approved', 'pending'])
      .limit(15),
    supabase
      .from('partner_event_submissions')
      .select('title, published_event_id, status')
      .eq('partner_user_id', queryUserId)
      .in('status', ['approved', 'pending'])
      .limit(15),
  ]);

  for (const row of spotSubs.data ?? []) {
    const isTool = String(row.sub_category ?? '') === 'tools';
    const publishedId = (isTool ? row.published_tool_id : row.published_establishment_id)?.trim();
    if (!publishedId) continue;
    push({
      id: publishedId,
      type: isTool ? 'tool' : 'spot',
      title: String(row.name),
      status: String(row.status),
    });
  }

  for (const row of eventSubs.data ?? []) {
    const publishedId = row.published_event_id?.trim();
    if (!publishedId) continue;
    push({
      id: publishedId,
      type: 'event',
      title: String(row.title),
      status: String(row.status),
    });
  }
}

/**
 * Contenu partenaire lié à THE LOOP (event / spot / outil).
 * Catalogue publié + soumissions + contenu lié aux avantages acceptés.
 */
export async function listPartnerEstablishments(
  partnerUserId: string,
  partnerNameHint?: string,
  options?: ListPartnerEstablishmentsOptions,
): Promise<PartnerEstablishment[]> {
  const lightweight = options?.lightweight === true;
  const adminPicker = options?.adminPicker === true;
  const rows: PartnerEstablishment[] = [];
  const seen = new Set<string>();
  const session = await loadPartnerSpotSession();
  const partnerName =
    partnerNameHint?.trim()
    || session?.user?.company?.trim()
    || session?.user?.fullName?.trim()
    || '';
  const queryUserId = (await resolvePartnerQueryUserId(partnerUserId, partnerName)) ?? partnerUserId;

  function push(item: PartnerEstablishment) {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(item);
  }

  if (lightweight) {
    if (isSupabaseConfigured() && supabase && isUuid(partnerUserId) && (await isNetworkOnline())) {
      const { data: est } = await supabase
        .from('establishments')
        .select('id, name')
        .eq('id', partnerUserId)
        .eq('is_active', true)
        .maybeSingle();
      if (est?.id) {
        push({ id: String(est.id), type: 'spot', title: String(est.name), status: 'approved' });
      }
    }
    await appendBenefitLinkedEstablishments(partnerUserId, partnerName, push, seen, { skipCatalog: true });
    return rows.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  }

  if (adminPicker) {
    if (isSupabaseConfigured() && supabase && isUuid(queryUserId) && (await isNetworkOnline())) {
      const masterIds = await resolvePartnerMasterIds(queryUserId);
      if (masterIds.length) {
        const eventFilter = `organizer_id.eq.${queryUserId},master_id.in.(${masterIds.join(',')})`;
        const [establishments, tools, events] = await Promise.all([
          supabase
            .from('establishments')
            .select('id, name, master_id')
            .eq('is_active', true)
            .eq('content_status', 'published')
            .in('master_id', masterIds)
            .order('name')
            .limit(15),
          supabase
            .from('tools')
            .select('id, name, master_id')
            .eq('is_active', true)
            .eq('content_status', 'published')
            .in('master_id', masterIds)
            .order('name')
            .limit(15),
          supabase
            .from('events')
            .select('id, title, master_id, organizer_id')
            .eq('content_status', 'published')
            .eq('is_active', true)
            .or(eventFilter)
            .order('title')
            .limit(15),
        ]);

        for (const row of establishments.data ?? []) {
          push({ id: String(row.id), type: 'spot', title: String(row.name), status: 'approved' });
        }
        for (const row of tools.data ?? []) {
          push({ id: String(row.id), type: 'tool', title: String(row.name), status: 'approved' });
        }
        for (const row of events.data ?? []) {
          push({ id: String(row.id), type: 'event', title: String(row.title), status: 'approved' });
        }
      }
    }
    await appendApprovedSubmissionCatalogRows(queryUserId, push);
    await appendBenefitLinkedEstablishments(partnerUserId, partnerName, push, seen, { skipCatalog: true });
    return rows.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  }

  await appendPublishedCatalogRows(queryUserId, push, { partnerName });

  if (queryUserId && isUuid(queryUserId)) {
    const { fetchRemotePartnerEventSubmissions, fetchRemotePartnerSpotSubmissions } = await import(
      '@/lib/partner-content-sync'
    );
    const [remoteEvents, remoteSpots] = await Promise.all([
      fetchRemotePartnerEventSubmissions({ partnerUserId: queryUserId }),
      fetchRemotePartnerSpotSubmissions({ partnerUserId: queryUserId }),
    ]);

    const { events: stagingEvents, spots: stagingSpots } = await applyPartnerLiveCatalogFilter(
      remoteEvents,
      remoteSpots,
      partnerUserId,
      partnerName,
    );

    for (const event of stagingEvents) {
      if (event.status === 'draft' || event.status === 'rejected') continue;
      if (event.status === 'pending') {
        push({ id: event.id, type: 'event', title: event.title, status: event.status });
        continue;
      }
      const publishedId = event.publishedEventId?.trim();
      if (publishedId) {
        push({ id: publishedId, type: 'event', title: event.title, status: event.status });
      }
    }

    for (const spot of stagingSpots) {
      if (spot.status === 'draft' || spot.status === 'rejected') continue;
      const isTool = spot.subCategory === 'tools';
      const type: PartnerEstablishmentType = isTool ? 'tool' : 'spot';
      if (spot.status === 'pending') {
        push({ id: spot.id, type, title: spot.name, status: spot.status });
        continue;
      }
      const publishedId = (isTool ? spot.publishedToolId : spot.publishedEstablishmentId)?.trim();
      if (publishedId) {
        push({ id: publishedId, type, title: spot.name, status: spot.status });
      }
    }
  }

  await appendBenefitLinkedEstablishments(partnerUserId, partnerName, push, seen);

  return rows.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
}

/** Contenu lié aux avantages acceptés (catalogue / offres) — visible en validation même sans ownership direct. */
async function appendBenefitLinkedEstablishments(
  partnerUserId: string,
  partnerName: string,
  push: (item: PartnerEstablishment) => void,
  seen: Set<string>,
  options?: { skipCatalog?: boolean },
): Promise<void> {
  const { listPartnerBenefitOffers, isPartnerOfferActive } = await import('@/lib/partner-benefit-offers-store');
  const { listBenefitCatalog } = await import('@/lib/benefit-catalog-store');
  const { resolvePartnerIdentity, partnerNameMatches } = await import('@/lib/partner-identity-store');

  const identity = await resolvePartnerIdentity(partnerUserId, partnerName);
  const offers = await listPartnerBenefitOffers(partnerUserId, partnerName);

  for (const offer of offers) {
    if (!isPartnerOfferActive(offer.status)) continue;
    if (!offer.contentId?.trim()) continue;
    push({
      id: offer.contentId.trim(),
      type: offer.contentType ?? 'spot',
      title: offer.contentTitle?.trim() || offer.catalogTitle || 'Contenu partenaire',
      status: 'approved',
    });
  }

  if (options?.skipCatalog) return;

  const catalog = await listBenefitCatalog(true);
  for (const item of catalog) {
    for (const partner of item.offeringPartners ?? []) {
      if (
        !identity.keys.has(partner.partnerId) &&
        !partnerNameMatches(identity, partner.displayName)
      ) {
        continue;
      }
      if (!partner.contentId?.trim()) continue;
      push({
        id: partner.contentId.trim(),
        type: partner.contentType ?? 'spot',
        title: partner.contentTitle?.trim() || item.title,
        status: 'approved',
      });
    }
  }
}

export function establishmentTypeLabel(type: PartnerEstablishmentType): string {
  if (type === 'event') return 'Événement';
  if (type === 'tool') return 'Outil';
  return 'Spot';
}

/**
 * Prépare les params d'établissement pour le scan :
 * - 1 contenu → association automatique
 * - 0 contenu → pas d'établissement
 * - plusieurs → null (choix sur l'écran scan)
 */
export async function resolveScanEstablishmentParams(
  partnerUserId: string,
): Promise<{
  establishmentId?: string;
  establishmentType?: PartnerEstablishmentType;
  establishmentTitle?: string;
}> {
  const items = await listPartnerEstablishments(partnerUserId);
  if (items.length !== 1) return {};
  const only = items[0];
  return {
    establishmentId: only.id,
    establishmentType: only.type,
    establishmentTitle: only.title,
  };
}
