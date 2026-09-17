import { loadPermanentlyRemovedContentIds } from '@/lib/admin-catalog-filter';
import {
  confirmPublishedContentIds,
  fetchLivePartnerCatalogIds,
  isPublishedContentLive,
} from '@/lib/partner-catalog-ids';
import { isNetworkOnline } from '@/lib/offline-store';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { StagingEvent, StagingSpot } from '@/lib/partner-staging-store';

function spotPublishedId(spot: StagingSpot): string | null {
  const isTool = spot.subCategory === 'tools';
  return (isTool ? spot.publishedToolId : spot.publishedEstablishmentId)?.trim() || null;
}

/** Soumission approuvée sans catalogue publié = retirée par l'admin (FK ON DELETE SET NULL). */
export function isPartnerEventVisible(event: StagingEvent): boolean {
  if (event.status === 'approved') {
    const pub = event.publishedEventId?.trim();
    if (pub) return true;
    // Transfert local : id = UUID catalogue ou transfer-{uuid}
    const raw = event.id.replace(/^transfer-/, '').replace(/^catalog-event-/, '');
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
  }
  return (
    event.status === 'draft'
    || event.status === 'pending'
    || event.status === 'rejected'
    || event.status === 'withdrawal_requested'
  );
}

export function isPartnerSpotVisible(spot: StagingSpot): boolean {
  if (spot.status === 'approved') {
    return Boolean(spotPublishedId(spot));
  }
  return (
    spot.status === 'draft'
    || spot.status === 'pending'
    || spot.status === 'rejected'
    || spot.status === 'withdrawal_requested'
  );
}

export function filterVisiblePartnerEvents(events: StagingEvent[]): StagingEvent[] {
  return events.filter(isPartnerEventVisible);
}

export function filterVisiblePartnerSpots(spots: StagingSpot[]): StagingSpot[] {
  return spots.filter(isPartnerSpotVisible);
}

async function buildPartnerLiveIdSet(
  events: StagingEvent[],
  spots: StagingSpot[],
  partnerUserId: string,
  partnerName?: string,
): Promise<Set<string>> {
  const liveIds = await fetchLivePartnerCatalogIds(partnerUserId, partnerName, 'workspace');

  for (const event of events) {
    const pub = event.publishedEventId?.trim();
    if (event.status === 'approved' && pub) liveIds.add(pub);
  }
  for (const spot of spots) {
    const pub = spotPublishedId(spot);
    if (spot.status === 'approved' && pub) liveIds.add(pub);
  }

  return confirmPublishedContentIds(liveIds);
}

/** Masque le contenu approuvé retiré du catalogue (suppression admin). */
export async function applyPartnerLiveCatalogFilter(
  events: StagingEvent[],
  spots: StagingSpot[],
  partnerUserId: string,
  partnerName?: string,
): Promise<{ events: StagingEvent[]; spots: StagingSpot[] }> {
  const removed = await loadPermanentlyRemovedContentIds();

  const dropRemoved = {
    events: events.filter((e) => {
      const pub = e.publishedEventId?.trim();
      if (e.status === 'approved' && pub && removed.has(pub)) return false;
      if (removed.has(e.id)) return false;
      return true;
    }),
    spots: spots.filter((s) => {
      const pub = spotPublishedId(s);
      if (s.status === 'approved' && pub && removed.has(pub)) return false;
      if (removed.has(s.id)) return false;
      return true;
    }),
  };

  if (!isSupabaseConfigured() || !(await isNetworkOnline())) {
    return {
      events: filterVisiblePartnerEvents(dropRemoved.events),
      spots: filterVisiblePartnerSpots(dropRemoved.spots),
    };
  }

  const liveIds = await buildPartnerLiveIdSet(dropRemoved.events, dropRemoved.spots, partnerUserId, partnerName);

  const approvedPubIds = new Set<string>();
  for (const event of dropRemoved.events) {
    const pub = event.publishedEventId?.trim();
    if (event.status === 'approved' && pub) approvedPubIds.add(pub);
  }
  for (const spot of dropRemoved.spots) {
    const pub = spotPublishedId(spot);
    if (spot.status === 'approved' && pub) approvedPubIds.add(pub);
  }

  // Réseau / RPC KO : conserver le staging approuvé plutôt qu'une liste vide
  if (liveIds.size === 0 && approvedPubIds.size > 0) {
    for (const id of approvedPubIds) liveIds.add(id);
  }

  return {
    events: dropRemoved.events.filter((e) => {
      if (e.status === 'withdrawal_requested') return true;
      if (e.status !== 'approved') return isPartnerEventVisible(e);
      const pub =
        e.publishedEventId?.trim()
        || e.id.replace(/^transfer-/, '').replace(/^catalog-event-/, '');
      if (!pub) return false;
      return liveIds.has(pub) || liveIds.has(e.id);
    }),
    spots: dropRemoved.spots.filter((s) => {
      if (s.status === 'withdrawal_requested') return true;
      if (s.status !== 'approved') return isPartnerSpotVisible(s);
      const pub = spotPublishedId(s);
      if (!pub) return false;
      return liveIds.has(pub);
    }),
  };
}

/** Clé catalogue pour stats / avantages (UUID publié prioritaire). */
export function partnerEventContentKey(event: StagingEvent): string {
  const pub = event.publishedEventId?.trim();
  if (pub) return pub;
  return event.id.replace(/^transfer-/, '').replace(/^catalog-event-/, '');
}

export function partnerSpotContentKey(spot: StagingSpot): string {
  return spotPublishedId(spot) || spot.id;
}

export { fetchLivePartnerCatalogIds as buildPartnerValidContentIdSet } from '@/lib/partner-catalog-ids';

export function isPartnerContentIdStillValid(
  contentId: string | null | undefined,
  validIds: Set<string>,
): boolean {
  if (!contentId?.trim()) return true;
  if (validIds.size === 0) return true;
  return validIds.has(contentId.trim());
}

export { isPublishedContentLive };
