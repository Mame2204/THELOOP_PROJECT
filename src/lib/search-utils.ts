import type { Event } from '@/types';
import type { HomeLocation } from '@/lib/demo-data';
import { EVENT_CATEGORY_LABELS, LOCATION_SUBCATEGORY_LABELS } from '@/types';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function matchesSearchQuery(text: string, query: string): boolean {
  if (!query.trim()) return true;
  return normalize(text).includes(normalize(query));
}

export function filterEventsByQuery(events: Event[], query: string, organizers: Record<string, string>): Event[] {
  const q = query.trim();
  if (!q) return events;

  return events.filter((event) => {
    const organizer = organizers[event.id] ?? '';
    const haystack = [
      event.title,
      event.description,
      event.venueName,
      event.program ?? '',
      organizer,
      EVENT_CATEGORY_LABELS[event.category],
    ].join(' ');

    return matchesSearchQuery(haystack, q);
  });
}

export function filterLocationsByQuery(locations: HomeLocation[], query: string): HomeLocation[] {
  const q = query.trim();
  if (!q) return locations;

  return locations.filter((location) => {
    const haystack = [
      location.name,
      location.subtitle,
      location.description,
      location.district,
      location.address,
      LOCATION_SUBCATEGORY_LABELS[location.subCategory],
      ...location.tags.map((t) => `${t.emoji} ${t.label}`),
    ].join(' ');

    return matchesSearchQuery(haystack, q);
  });
}
