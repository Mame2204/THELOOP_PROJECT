import type { HomeLocation } from '@/lib/demo-data';
import type { Event } from '@/types';
import {
  matchesAnyCategoryToken,
  matchesCategoryToken,
  type CategoryVisibilityFilter,
} from '@/lib/category-filter-utils';
import {
  getEventCategoryLabel,
  getSpotCategoryLabel,
  getToolCategoryLabel,
} from '@/lib/category-labels-cache';
import { isToolLocation } from '@/lib/location-kind-utils';

export type { CategoryVisibilityFilter } from '@/lib/category-filter-utils';
export {
  buildCategoryVisibilityFilter,
  emptyCategoryVisibilityFilter,
  matchesAnyCategoryToken,
  matchesCategoryToken,
  normalizeCategoryToken,
} from '@/lib/category-filter-utils';

function eventCategoryTokens(event: Event): string[] {
  const slugs = event.categories?.length ? event.categories : [event.category];
  return slugs.flatMap((slug) => {
    const label = getEventCategoryLabel(slug);
    return [slug, label];
  });
}

function spotCategoryTokens(location: HomeLocation): string[] {
  const slugs = location.categories?.length ? location.categories : [location.subCategory];
  const tagLabels = (location.tags ?? []).map((t) => t.label);
  return slugs.flatMap((slug) => {
    const label = getSpotCategoryLabel(slug);
    return [slug, label];
  }).concat([location.subtitle, ...tagLabels]);
}

function toolCategoryTokens(location: HomeLocation): string[] {
  const raw = location.toolCategory?.trim();
  if (!raw) {
    // Outil sans catégorie fonctionnelle : ne pas le masquer du catalogue.
    return ['tool-autre', getToolCategoryLabel('tool-autre'), 'Autre'];
  }
  return [raw, getToolCategoryLabel(raw)];
}

/**
 * Visible sauf si rattaché à une catégorie désactivée.
 * Les slugs custom (hors catalogue) restent visibles.
 */
function isCategoryTokensVisible(
  tokens: string[],
  active: CategoryVisibilityFilter,
  inactive: CategoryVisibilityFilter,
): boolean {
  if (matchesAnyCategoryToken(tokens, inactive)) return false;
  if (active.slugs.size === 0 && active.labels.size === 0) return false;
  return true;
}

export function isEventCategoryVisible(
  event: Event,
  active: CategoryVisibilityFilter,
  inactive: CategoryVisibilityFilter,
  labelsLoaded: boolean,
): boolean {
  if (!labelsLoaded) return true;
  return isCategoryTokensVisible(eventCategoryTokens(event), active, inactive);
}

export function isSpotCategoryVisible(
  location: HomeLocation,
  active: CategoryVisibilityFilter,
  inactive: CategoryVisibilityFilter,
  labelsLoaded: boolean,
): boolean {
  // Toujours exclure les outils, même avant chargement des libellés catégories.
  if (isToolLocation(location)) return false;
  if (!labelsLoaded) return true;
  return isCategoryTokensVisible(spotCategoryTokens(location), active, inactive);
}

export function isToolCategoryVisible(
  location: HomeLocation,
  active: CategoryVisibilityFilter,
  inactive: CategoryVisibilityFilter,
  labelsLoaded: boolean,
): boolean {
  if (!isToolLocation(location)) return false;
  if (!labelsLoaded) return true;
  return isCategoryTokensVisible(toolCategoryTokens(location), active, inactive);
}

export function filterEventsByActiveCategories(
  events: Event[],
  active: CategoryVisibilityFilter,
  inactive: CategoryVisibilityFilter,
  labelsLoaded: boolean,
): Event[] {
  return events.filter((e) => isEventCategoryVisible(e, active, inactive, labelsLoaded));
}

export function filterSpotsByActiveCategories(
  locations: HomeLocation[],
  active: CategoryVisibilityFilter,
  inactive: CategoryVisibilityFilter,
  labelsLoaded: boolean,
): HomeLocation[] {
  return locations.filter((l) => isSpotCategoryVisible(l, active, inactive, labelsLoaded));
}

export function filterToolsByActiveCategories(
  locations: HomeLocation[],
  active: CategoryVisibilityFilter,
  inactive: CategoryVisibilityFilter,
  labelsLoaded: boolean,
): HomeLocation[] {
  return locations.filter((l) => isToolCategoryVisible(l, active, inactive, labelsLoaded));
}

export function filterLocationsByActiveCategories(
  locations: HomeLocation[],
  spotActive: CategoryVisibilityFilter,
  spotInactive: CategoryVisibilityFilter,
  toolActive: CategoryVisibilityFilter,
  toolInactive: CategoryVisibilityFilter,
  labelsLoaded: boolean,
): HomeLocation[] {
  // Partition stricte avant concat — évite les doublons d'id (même UUID en spot + outil).
  const spots = filterSpotsByActiveCategories(locations, spotActive, spotInactive, labelsLoaded);
  const tools = filterToolsByActiveCategories(locations, toolActive, toolInactive, labelsLoaded);
  const seen = new Set<string>();
  const out: HomeLocation[] = [];
  for (const loc of [...spots, ...tools]) {
    if (seen.has(loc.id)) continue;
    seen.add(loc.id);
    out.push(loc);
  }
  return out;
}

export interface ContentCategoryVisibilityFilters {
  activeEvent: CategoryVisibilityFilter;
  inactiveEvent: CategoryVisibilityFilter;
  activeSpot: CategoryVisibilityFilter;
  inactiveSpot: CategoryVisibilityFilter;
  activeTool: CategoryVisibilityFilter;
  inactiveTool: CategoryVisibilityFilter;
  labelsLoaded: boolean;
}

/** Applique les filtres catégories sur événements, spots et bannières liées. */
export function applyCategoryVisibilityToContent<
  T extends {
    events: Event[];
    locations: HomeLocation[];
    featuredBanners: Array<{ targetType: string; targetId: string }>;
    featuredSpotBanners: Array<{ targetId: string }>;
  },
>(data: T, filters: ContentCategoryVisibilityFilters): T {
  if (!filters.labelsLoaded) return data;

  const events = filterEventsByActiveCategories(
    data.events,
    filters.activeEvent,
    filters.inactiveEvent,
    true,
  );
  const locations = filterLocationsByActiveCategories(
    data.locations,
    filters.activeSpot,
    filters.inactiveSpot,
    filters.activeTool,
    filters.inactiveTool,
    true,
  );
  const eventIds = new Set(events.map((e) => e.id));
  const locationIds = new Set(locations.map((l) => l.id));

  return {
    ...data,
    events,
    locations,
    featuredBanners: data.featuredBanners.filter(
      (b) => b.targetType !== 'event' || eventIds.has(b.targetId),
    ),
    featuredSpotBanners: data.featuredSpotBanners.filter((b) => locationIds.has(b.targetId)),
  };
}

/** @deprecated Utiliser matchesCategoryToken */
export function matchesActiveCategory(
  slugOrLabel: string | null | undefined,
  filter: CategoryVisibilityFilter,
): boolean {
  return matchesCategoryToken(slugOrLabel, filter);
}
