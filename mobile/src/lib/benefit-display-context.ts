/**
 * Libellés d'affichage avantages — événement / spot / outil, localisation, enseigne.
 * Ne privilégie pas le nom du compte partenaire.
 */
import { peekContentSnapshot } from '@/lib/content-store';
import type { HomeLocation } from '@/lib/demo-data';
import { formatLocationPrefectureLabel } from '@/lib/guinea-locations';
import { isToolLocation } from '@/lib/location-kind-utils';
import { establishmentTypeLabel, type PartnerEstablishmentType } from '@/lib/partner-establishments';

export type BenefitContentType = 'event' | 'spot' | 'tool';

export interface BenefitDisplayContextInput {
  contentType?: BenefitContentType | null;
  contentTitle?: string | null;
  contentId?: string | null;
  partnerName?: string | null;
  locationLabel?: string | null;
  venueName?: string | null;
  organizerName?: string | null;
  developer?: string | null;
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function kindLabel(contentType: BenefitContentType | null | undefined): string | null {
  if (!contentType) return null;
  return establishmentTypeLabel(contentType as PartnerEstablishmentType);
}

function formatGeoLabel(raw: string | null | undefined): string | null {
  const trimmed = normalizeText(raw);
  if (!trimmed) return null;
  return formatLocationPrefectureLabel(trimmed) ?? trimmed;
}

function appendUnique(parts: string[], value: string | null | undefined): void {
  const trimmed = normalizeText(value);
  if (!trimmed) return;
  const lower = trimmed.toLowerCase();
  if (parts.some((part) => part.toLowerCase() === lower)) return;
  parts.push(trimmed);
}

/** Construit le libellé lieu/contenu pour cartes avantages et notifications. */
export function formatBenefitDisplayContext(input: BenefitDisplayContextInput): string | null {
  const title = normalizeText(input.contentTitle);
  const kind = kindLabel(input.contentType ?? null);
  const parts: string[] = [];

  if (title) {
    parts.push(kind ? `${kind} · ${title}` : title);
  } else if (kind) {
    parts.push(kind);
  }

  const geo = formatGeoLabel(input.locationLabel);
  const venue = normalizeText(input.venueName);
  const titleLower = title?.toLowerCase() ?? '';

  if (input.contentType === 'event') {
    if (venue && venue.toLowerCase() !== titleLower) appendUnique(parts, venue);
    appendUnique(parts, geo);
  } else {
    appendUnique(parts, geo);
    appendUnique(parts, venue);
  }

  appendUnique(parts, normalizeText(input.organizerName));
  appendUnique(parts, normalizeText(input.developer));

  if (parts.length > 0) return parts.join(' · ');

  return normalizeText(input.partnerName);
}

/** Enrichit les champs affichage depuis le contenu publié lié. */
export async function enrichBenefitDisplayInput(
  input: Pick<BenefitDisplayContextInput, 'contentId' | 'contentType' | 'contentTitle' | 'partnerName'>,
): Promise<BenefitDisplayContextInput> {
  const base: BenefitDisplayContextInput = {
    contentType: input.contentType ?? null,
    contentTitle: input.contentTitle ?? null,
    contentId: input.contentId ?? null,
    partnerName: input.partnerName ?? null,
  };

  const contentId = input.contentId?.trim();
  if (!contentId) return base;

  const snapshot = await peekContentSnapshot();
  const declaredType = input.contentType ?? null;

  if (declaredType === 'event' || (!declaredType && snapshot.events.some((event) => event.id === contentId))) {
    const event = snapshot.events.find((item) => item.id === contentId);
    if (event) {
      return {
        ...base,
        contentType: 'event',
        contentTitle: base.contentTitle ?? normalizeText(event.title) ?? normalizeText(event.venueName),
        locationLabel: event.venueAddress,
        venueName: event.venueName,
        organizerName: event.organizerName,
      };
    }
  }

  const location = snapshot.locations.find((item) => item.id === contentId);
  if (location) {
    const home = location as HomeLocation;
    const isTool = declaredType === 'tool' || (!declaredType && isToolLocation(location));
    return {
      ...base,
      contentType: isTool ? 'tool' : 'spot',
      contentTitle: base.contentTitle ?? normalizeText(location.name),
      locationLabel: normalizeText(home.address) ?? normalizeText(home.district),
      organizerName: home.organizerName,
      developer: location.developer,
    };
  }

  return base;
}

/** Libellé complet pour un avantage membre (cartes, notifications). */
export async function resolveBenefitDisplayContext(
  benefit: Pick<BenefitDisplayContextInput, 'contentId' | 'contentType' | 'contentTitle' | 'partnerName'>,
): Promise<string | null> {
  const enriched = await enrichBenefitDisplayInput(benefit);
  return formatBenefitDisplayContext(enriched);
}
