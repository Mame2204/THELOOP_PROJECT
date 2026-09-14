import type { Event } from '@/types';
import type { HomeLocation } from '@/lib/demo-data';
import {
  getEventCategoryLabel,
  getSpotCategoryLabel,
  getToolCategoryLabel,
} from '@/lib/category-labels-cache';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function matchesSearchQuery(text: string, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  const hay = normalize(text);
  if (hay.includes(q)) return true;
  // Tous les mots de la requête doivent être présents (ordre libre)
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length <= 1) return false;
  return tokens.every((t) => hay.includes(t));
}

function eventSearchHaystack(event: Event): string {
  const categoryLabels = (event.categories?.length ? event.categories : [event.category])
    .map((c) => getEventCategoryLabel(c))
    .join(' ');
  const speakers = (event.speakers ?? [])
    .map((s) => [s.name, s.title, s.company].filter(Boolean).join(' '))
    .join(' ');

  return [
    event.title,
    event.description,
    event.program ?? '',
    event.venueName,
    event.venueAddress ?? '',
    event.organizerName ?? '',
    categoryLabels,
    speakers,
    event.infoUrl ?? '',
    event.websiteUrl ?? '',
  ].join('\n');
}

function locationSearchHaystack(location: HomeLocation): string {
  const isTool = location.subCategory === 'tools';
  const categoryLabels = isTool
    ? getToolCategoryLabel(location.toolCategory ?? '')
    : (location.categories?.length ? location.categories : [location.subCategory])
        .map((c) => getSpotCategoryLabel(c))
        .join(' ');

  return [
    location.name,
    location.subtitle,
    location.description,
    location.district,
    location.address,
    location.organizerName ?? '',
    location.developer ?? '',
    location.openingHours ?? '',
    location.priceLabel ?? '',
    location.phone ?? '',
    categoryLabels,
    ...(location.tags ?? []).map((t) => t.label),
    location.website ?? '',
    location.ctaUrl ?? '',
    location.instagramUrl ?? '',
    location.facebookUrl ?? '',
  ].join('\n');
}

export function filterEventsByQuery(events: Event[], query: string): Event[] {
  const q = query.trim();
  if (!q) return events;
  return events.filter((event) => matchesSearchQuery(eventSearchHaystack(event), q));
}

export function filterLocationsByQuery(locations: HomeLocation[], query: string): HomeLocation[] {
  const q = query.trim();
  if (!q) return locations;
  return locations.filter((location) => matchesSearchQuery(locationSearchHaystack(location), q));
}
