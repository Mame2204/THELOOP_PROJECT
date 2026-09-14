import type { ContentStatus } from '@/lib/admin-types';
import type { HomeLocation } from '@/lib/demo-data';
import type { Event } from '@/types';

/** Contenu catalogue visible côté public (Accueil, Agenda, Spots, Outils, Favoris…). */
export function isPublishedActiveContent(item: {
  contentStatus?: ContentStatus | string | null;
  isActive?: boolean | null;
  hidden?: boolean | null;
}): boolean {
  if (item.hidden === true) return false;
  if (item.isActive === false) return false;
  const status = item.contentStatus ?? 'published';
  return status === 'published';
}

export function filterPublishedActiveEvents<T extends Event>(events: T[]): T[] {
  return events.filter((e) => isPublishedActiveContent(e));
}

export function filterPublishedActiveLocations<T extends HomeLocation>(locations: T[]): T[] {
  return locations.filter((l) => isPublishedActiveContent(l));
}
