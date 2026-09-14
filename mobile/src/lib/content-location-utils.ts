import { getCountryLabel } from '@/lib/countries';
import {
  canonicalizeGuineaLocationLabel,
  formatCommuneDistrictDisplay,
  formatLocationPrefectureLabel,
  parseGuineaLocationLabel,
  resolveGuineaEntryFromLabel,
  sanitizePhysicalLocationInput,
} from '@/lib/guinea-locations';
import type { Event } from '@/types';

/** Valeur stockée en base pour un contenu en ligne. */
export const CONTENT_LOCATION_ONLINE = 'En ligne';

/** Valeur stockée en base pour une localisation non renseignée. */
export const CONTENT_LOCATION_NA = 'N/A';

export const CONTENT_LOCATION_NA_LABEL = 'Non fourni pour le moment';

export type ContentLocationMode = 'physical' | 'online' | 'na';

function normalizeStoredLocationToken(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function isStoredOnlineLocation(value: string | null | undefined): boolean {
  const token = normalizeStoredLocationToken(value);
  return token === CONTENT_LOCATION_ONLINE.toLowerCase() || token === 'en ligne';
}

export function isStoredNaLocation(value: string | null | undefined): boolean {
  const token = normalizeStoredLocationToken(value);
  return token === CONTENT_LOCATION_NA.toLowerCase() || token === 'n/a';
}

export function parseStoredContentLocation(address: string | null | undefined): {
  mode: ContentLocationMode;
  physicalValue: string;
} {
  const trimmed = address?.trim() ?? '';
  if (isStoredOnlineLocation(trimmed)) return { mode: 'online', physicalValue: '' };
  if (isStoredNaLocation(trimmed)) return { mode: 'na', physicalValue: '' };
  return { mode: 'physical', physicalValue: trimmed };
}

/** Valeurs formulaire à partir de l'adresse stockée (+ district spot si présent). */
export function resolveStoredContentLocationInput(
  address: string | null | undefined,
  district?: string | null,
  options?: { excludeLabel?: string | null },
): { mode: ContentLocationMode; physicalValue: string } {
  const parsed = parseStoredContentLocation(address);
  if (parsed.mode !== 'physical') return parsed;
  return {
    mode: 'physical',
    physicalValue: sanitizePhysicalLocationInput(address, district, options?.excludeLabel),
  };
}

export function serializeContentLocation(
  mode: ContentLocationMode,
  physicalValue: string,
): string | null {
  if (mode === 'online') return CONTENT_LOCATION_ONLINE;
  if (mode === 'na') return CONTENT_LOCATION_NA;
  return physicalValue.trim() || null;
}

function formatPhysicalLocation(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || isStoredOnlineLocation(trimmed) || isStoredNaLocation(trimmed)) return null;
  return formatLocationPrefectureLabel(trimmed) ?? trimmed;
}

/** Nom du lieu / spot pour cartes et fiche (sans commune · quartier). */
export function formatEventVenueDisplay(
  event: Pick<Event, 'venueName' | 'venueAddress' | 'countryCode'>,
): string | null {
  const addr = event.venueAddress?.trim() ?? '';
  if (isStoredOnlineLocation(addr)) {
    return `En ligne · ${getCountryLabel(event.countryCode)}`;
  }
  if (isStoredNaLocation(addr)) {
    return CONTENT_LOCATION_NA_LABEL;
  }

  const venue = event.venueName?.trim();
  if (venue && !isStoredOnlineLocation(venue) && !isStoredNaLocation(venue)) {
    return venue;
  }

  return null;
}

/** Libellé affichage lieu événement (fiche détail, bandeau meta). */
export function formatEventLocationDisplay(
  event: Pick<Event, 'venueName' | 'venueAddress' | 'countryCode'>,
): string | null {
  return formatEventVenueDisplay(event);
}

/** Libellé sous-titre carte liste événement : nom du lieu / spot uniquement. */
export function formatEventCardLocationDisplay(
  event: Pick<Event, 'venueName' | 'venueAddress' | 'countryCode'>,
): string | null {
  return formatEventVenueDisplay(event);
}

/** Libellé affichage pour spot / outil (préfecture / libellé physique). */
export function formatSpotLocationDisplay(input: {
  address?: string | null;
  district?: string | null;
  countryCode?: string | null;
}): string | null {
  const addr = input.address?.trim() ?? '';
  if (addr === CONTENT_LOCATION_ONLINE) {
    return `En ligne · ${getCountryLabel(input.countryCode)}`;
  }
  if (addr === CONTENT_LOCATION_NA) {
    return CONTENT_LOCATION_NA_LABEL;
  }

  const physical = formatPhysicalLocation(addr) ?? formatPhysicalLocation(input.district);
  return physical;
}

/** Hero spot : « quartier, ville » (ex. Almamya, Kaloum). */
export function formatSpotQuartierVilleDisplay(input: {
  address?: string | null;
  district?: string | null;
  countryCode?: string | null;
}): string | null {
  const addr = input.address?.trim() ?? '';
  if (addr === CONTENT_LOCATION_ONLINE) {
    return `En ligne · ${getCountryLabel(input.countryCode)}`;
  }
  if (addr === CONTENT_LOCATION_NA) {
    return CONTENT_LOCATION_NA_LABEL;
  }

  const canonical = canonicalizeGuineaLocationLabel(addr, input.district);
  if (!canonical) {
    const fallback = (input.district ?? addr).trim();
    return fallback || null;
  }

  const { commune, district } = parseGuineaLocationLabel(canonical);
  const ville = commune.trim();
  const quartier = (district ?? '').trim();
  if (quartier && ville) return `${quartier}, ${ville}`;
  return ville || quartier || null;
}

/** Commune seule pour la fiche spot (bloc Adresse — sans quartier ni préfecture). */
export function formatSpotCommuneDisplay(input: {
  address?: string | null;
  district?: string | null;
  countryCode?: string | null;
}): string | null {
  const addr = input.address?.trim() ?? '';
  if (addr === CONTENT_LOCATION_ONLINE) {
    return `En ligne · ${getCountryLabel(input.countryCode)}`;
  }
  if (addr === CONTENT_LOCATION_NA) {
    return CONTENT_LOCATION_NA_LABEL;
  }

  const canonical = canonicalizeGuineaLocationLabel(addr, input.district);
  if (!canonical) return null;

  const entry = resolveGuineaEntryFromLabel(canonical);
  if (entry?.commune?.trim()) return entry.commune.trim();

  const { commune } = parseGuineaLocationLabel(canonical);
  return commune.trim() || null;
}
