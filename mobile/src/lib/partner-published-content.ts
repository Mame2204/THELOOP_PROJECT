import { listPartnerEstablishments } from '@/lib/partner-establishments';
import {
  listPartnerEvents,
  listPartnerSpots,
  type StagingEvent,
  type StagingSpot,
} from '@/lib/partner-staging-store';

export interface PartnerPublishedContentIds {
  eventIds: Set<string>;
  spotIds: Set<string>;
  toolIds: Set<string>;
  /** Tous les IDs publiés (events + spots + tools) pour matching banners. */
  allIds: Set<string>;
}

function addId(set: Set<string>, value: string | null | undefined) {
  const id = value?.trim();
  if (id) set.add(id);
}

/**
 * IDs catalogue public du partenaire (UUID publiés), pas les local_id staging.
 * Utilisé pour « À la une », récompenses paliers, etc.
 */
export async function collectPartnerPublishedContentIds(
  partnerUserId: string,
  partnerName?: string,
): Promise<PartnerPublishedContentIds> {
  const eventIds = new Set<string>();
  const spotIds = new Set<string>();
  const toolIds = new Set<string>();

  const [events, spots, establishments] = await Promise.all([
    listPartnerEvents(partnerUserId, partnerName),
    listPartnerSpots(partnerUserId, partnerName),
    listPartnerEstablishments(partnerUserId),
  ]);

  for (const ev of events) {
    if (ev.status !== 'approved') continue;
    addId(eventIds, ev.publishedEventId);
    // Ancien contenu / fallback si publish id manquant
    if (!ev.publishedEventId) addId(eventIds, ev.id);
  }

  for (const spot of spots) {
    if (spot.status !== 'approved') continue;
    if (spot.subCategory === 'tools') {
      addId(toolIds, spot.publishedToolId);
      if (!spot.publishedToolId) addId(toolIds, spot.id);
    } else {
      addId(spotIds, spot.publishedEstablishmentId);
      if (!spot.publishedEstablishmentId) addId(spotIds, spot.id);
    }
  }

  for (const row of establishments) {
    if (row.type === 'event') addId(eventIds, row.id);
    else if (row.type === 'tool') addId(toolIds, row.id);
    else addId(spotIds, row.id);
  }

  const allIds = new Set<string>([...eventIds, ...spotIds, ...toolIds]);
  return { eventIds, spotIds, toolIds, allIds };
}

/** Picks récompense : toujours l'ID publié (UUID) quand disponible. */
export function partnerApprovedContentPicks(
  events: StagingEvent[],
  spots: StagingSpot[],
  scopes: { events: boolean; spots: boolean; tools: boolean },
): Array<{ kind: 'event' | 'spot' | 'tool'; id: string; title: string; subtitle?: string }> {
  const picks: Array<{ kind: 'event' | 'spot' | 'tool'; id: string; title: string; subtitle?: string }> = [];

  if (scopes.events) {
    for (const e of events) {
      if (e.status !== 'approved') continue;
      const id = e.publishedEventId?.trim() || e.id;
      picks.push({
        kind: 'event',
        id,
        title: e.title,
        subtitle: e.venueName || e.venueAddress || undefined,
      });
    }
  }

  if (scopes.spots) {
    for (const s of spots) {
      if (s.status !== 'approved' || s.subCategory === 'tools') continue;
      const id = s.publishedEstablishmentId?.trim() || s.id;
      picks.push({
        kind: 'spot',
        id,
        title: s.name,
        subtitle: s.address || s.district || undefined,
      });
    }
  }

  if (scopes.tools) {
    for (const s of spots) {
      if (s.status !== 'approved' || s.subCategory !== 'tools') continue;
      const id = s.publishedToolId?.trim() || s.id;
      picks.push({
        kind: 'tool',
        id,
        title: s.name,
        subtitle: s.toolCategory || s.developer || undefined,
      });
    }
  }

  return picks;
}
