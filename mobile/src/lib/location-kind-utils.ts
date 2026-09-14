import type { HomeLocation } from '@/lib/demo-data';
import type { LocationSubCategory } from '@/types';

export function isToolLocation(loc: {
  subCategory: LocationSubCategory | string;
  categories?: string[] | null;
  toolCategory?: string | null;
}): boolean {
  if (loc.subCategory === 'tools') return true;
  if (loc.categories?.includes('tools')) return true;
  return Boolean(loc.toolCategory?.trim());
}

export function isSpotLocation(loc: {
  subCategory: LocationSubCategory | string;
  categories?: string[] | null;
  toolCategory?: string | null;
}): boolean {
  return !isToolLocation(loc);
}

export function toolLocationIds(locations: HomeLocation[]): Set<string> {
  return new Set(locations.filter(isToolLocation).map((l) => l.id));
}

export function filterTools(locations: HomeLocation[]): HomeLocation[] {
  return locations.filter(isToolLocation);
}

export function filterSpotsOnly(locations: HomeLocation[]): HomeLocation[] {
  return locations.filter(isSpotLocation);
}
