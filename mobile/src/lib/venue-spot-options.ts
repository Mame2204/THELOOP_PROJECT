import {
  getHomeLocations,
  getPrimeLocations,
  loadAdminCatalogSnapshot,
  loadContentSnapshot,
  peekAdminCatalogSnapshot,
  peekContentSnapshot,
  type ContentSnapshot,
} from '@/lib/content-store';
import { isSpotLocation } from '@/lib/location-kind-utils';
import type { StagingSpot } from '@/lib/partner-staging-store';

export interface VenueSpotOption {
  id: string;
  name: string;
  address: string;
  district?: string | null;
  source: 'database' | 'staging';
}

function normalizeVenueKey(name: string, address: string): string {
  return `${name.trim().toLowerCase()}|${address.trim().toLowerCase()}`;
}

async function resolveCatalogSnapshot(isAdminMode: boolean): Promise<ContentSnapshot> {
  if (isAdminMode) {
    const peeked = await peekAdminCatalogSnapshot();
    if (peeked.locations.length > 0) return peeked;
    return loadAdminCatalogSnapshot(true);
  }
  const peeked = await peekContentSnapshot();
  if (peeked.locations.length > 0) return peeked;
  return loadContentSnapshot(false);
}

function catalogVenueOptions(snapshot: ContentSnapshot, countryCode: string): VenueSpotOption[] {
  const venues = [
    ...getHomeLocations(snapshot, undefined, countryCode),
    ...getPrimeLocations(snapshot, countryCode),
  ].filter(isSpotLocation);

  const byId = new Map<string, VenueSpotOption>();
  for (const spot of venues) {
    byId.set(spot.id, {
      id: spot.id,
      name: spot.name,
      address: spot.address,
      district: spot.district,
      source: 'database',
    });
  }
  return Array.from(byId.values());
}

function stagingVenueOptions(partnerSpots: StagingSpot[], countryCode: string): VenueSpotOption[] {
  return partnerSpots
    .filter((s) => s.subCategory !== 'tools' && s.countryCode === countryCode)
    .map((s) => ({
      id: s.publishedEstablishmentId ?? s.id,
      name: s.name,
      address: s.address,
      district: s.district,
      source: 'staging' as const,
    }));
}

function mergeVenueSpotOptions(
  catalog: VenueSpotOption[],
  staging: VenueSpotOption[],
): VenueSpotOption[] {
  const byId = new Map<string, VenueSpotOption>();
  const byName = new Map<string, VenueSpotOption>();

  for (const spot of catalog) {
    byId.set(spot.id, spot);
    byName.set(normalizeVenueKey(spot.name, spot.address), spot);
  }

  for (const spot of staging) {
    const key = normalizeVenueKey(spot.name, spot.address);
    if (byName.has(key)) continue;
    if (byId.has(spot.id)) continue;
    byId.set(spot.id, spot);
    byName.set(key, spot);
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Spots publiés + brouillons partenaire, sans filtres catégories du catalogue public. */
export async function buildVenueSpotOptions(params: {
  countryCode: string;
  partnerSpots: StagingSpot[];
  isAdminMode: boolean;
}): Promise<VenueSpotOption[]> {
  const snapshot = await resolveCatalogSnapshot(params.isAdminMode);
  const catalog = catalogVenueOptions(snapshot, params.countryCode);
  const staging = stagingVenueOptions(params.partnerSpots, params.countryCode);
  return mergeVenueSpotOptions(catalog, staging);
}
