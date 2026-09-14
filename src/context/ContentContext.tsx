import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/hooks/useAuth';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';
import type { HomeLocation } from '@/lib/demo-data';
import {
  getEventBySlug,
  getHomeLocations,
  getLocationBySlug,
  getPrimeEvents,
  getPrimeLocations,
  getPublicEvents,
  loadContentSnapshot,
  type ContentSnapshot,
} from '@/lib/content-store';
import type { Event, ResolvedHeroBanner } from '@/types';

interface ContentContextValue {
  isLoading: boolean;
  source: 'supabase' | 'demo';
  activeCountryCode: string | null;
  events: Event[];
  locations: HomeLocation[];
  publicEvents: Event[];
  primeEvents: Event[];
  primeLocations: HomeLocation[];
  organizers: Record<string, string>;
  featuredBanners: ResolvedHeroBanner[];
  getEventBySlug: (slug: string) => Event | undefined;
  getLocationBySlug: (slug: string) => HomeLocation | undefined;
  getHomeLocations: (subCategory?: HomeLocation['subCategory']) => HomeLocation[];
  refresh: () => Promise<void>;
}

const ContentContext = createContext<ContentContextValue | null>(null);

export function ContentProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const [snapshot, setSnapshot] = useState<ContentSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const activeCountryCode = useMemo(() => {
    if (role === 'ADMIN') return null;
    return user?.countryCode ?? DEFAULT_COUNTRY_CODE;
  }, [role, user?.countryCode]);

  const load = useCallback(async (force = false) => {
    setIsLoading(true);
    try {
      const next = await loadContentSnapshot(force);
      setSnapshot(next);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Chargement unique au montage (cache + coalescing dans content-store).
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      try {
        const next = await loadContentSnapshot(false);
        if (!cancelled) setSnapshot(next);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(() => load(true), [load]);

  const value = useMemo<ContentContextValue>(() => {
    const data = snapshot ?? {
      events: [],
      locations: [],
      organizers: {},
      featuredBanners: [],
      slugToEventId: new Map(),
      slugToLocationId: new Map(),
      source: 'demo' as const,
    };

    return {
      isLoading,
      source: data.source,
      activeCountryCode,
      events: data.events,
      locations: data.locations,
      publicEvents: getPublicEvents(data, activeCountryCode),
      primeEvents: getPrimeEvents(data, activeCountryCode),
      primeLocations: getPrimeLocations(data, activeCountryCode),
      organizers: data.organizers,
      featuredBanners: data.featuredBanners,
      getEventBySlug: (slug: string) => getEventBySlug(data, slug),
      getLocationBySlug: (slug: string) => getLocationBySlug(data, slug),
      getHomeLocations: (subCategory?: HomeLocation['subCategory']) =>
        getHomeLocations(data, subCategory, activeCountryCode),
      refresh,
    };
  }, [snapshot, isLoading, refresh, activeCountryCode]);

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useContent(): ContentContextValue {
  const ctx = useContext(ContentContext);
  if (!ctx) throw new Error('useContent must be used within ContentProvider');
  return ctx;
}
