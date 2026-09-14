import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { filterByAdminCountry } from '@/lib/admin-country';
import {
  getHomeLocations as pickHomeLocations,
  getPrimeEvents,
  getPublicEvents,
  invalidateContentCache,
  loadAdminCatalogSnapshot,
  peekAdminCatalogSnapshot,
  type ContentSnapshot,
} from '@/lib/content-store';
import type { HomeLocation } from '@/lib/demo-data';
import type { Event, ResolvedHeroBanner } from '@/types';

function filterSnapshotByCountry(snapshot: ContentSnapshot, countryCode: string): ContentSnapshot {
  const events = filterByAdminCountry(snapshot.events, countryCode);
  const locations = filterByAdminCountry(snapshot.locations, countryCode);
  const eventIds = new Set(events.map((e) => e.id));
  const locationIds = new Set(locations.map((l) => l.id));

  return {
    ...snapshot,
    events,
    locations,
    featuredBanners: (snapshot.featuredBanners ?? []).filter((b) =>
      b.targetType === 'event' ? eventIds.has(b.targetId) : locationIds.has(b.targetId),
    ),
    featuredSpotBanners: (snapshot.featuredSpotBanners ?? []).filter((b) => locationIds.has(b.targetId)),
  };
}

/** Catalogue admin filtré par le pays sélectionné dans la barre Administration. */
export function useAdminCatalog() {
  const { countryCode } = useAdminCountry();
  const [snapshot, setSnapshot] = useState<ContentSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applySnapshot = useCallback(
    (raw: ContentSnapshot) => setSnapshot(filterSnapshotByCountry(raw, countryCode)),
    [countryCode],
  );

  const load = useCallback(
    async (force = false) => {
      setError(null);
      if (force) {
        setIsRefreshing(true);
        invalidateContentCache();
      }
      try {
        if (!force) {
          applySnapshot(await peekAdminCatalogSnapshot());
          setIsLoading(false);
        }
        await loadAdminCatalogSnapshot(force, force ? undefined : applySnapshot);
        if (force) {
          applySnapshot(await peekAdminCatalogSnapshot());
        }
      } catch (err) {
        if (!snapshot) setSnapshot(null);
        setError(err instanceof Error ? err.message : 'Impossible de charger le catalogue.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [applySnapshot],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const data = useMemo(
    () =>
      snapshot ?? {
        events: [] as Event[],
        locations: [] as HomeLocation[],
        featuredBanners: [] as ResolvedHeroBanner[],
        featuredSpotBanners: [] as ResolvedHeroBanner[],
        slugToEventId: new Map<string, string>(),
        slugToLocationId: new Map<string, string>(),
        source: 'demo' as const,
      },
    [snapshot],
  );

  const getHomeLocations = useCallback(
    (subCategory?: HomeLocation['subCategory']) => pickHomeLocations(data, subCategory),
    [data],
  );

  return {
    snapshot: data,
    events: data.events,
    locations: data.locations,
    publicEvents: getPublicEvents(data),
    primeEvents: getPrimeEvents(data),
    featuredBanners: data.featuredBanners,
    featuredSpotBanners: data.featuredSpotBanners,
    getHomeLocations,
    isLoading,
    isRefreshing,
    error,
    refresh: () => load(true),
  };
}
