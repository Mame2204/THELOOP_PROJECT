import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';


import { useViewingCountry } from '@/context/ViewingCountryContext';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';
import { applyCategoryVisibilityToContent } from '@/lib/category-visibility';
import {
  getActiveEventCategoryFilter,
  getActiveSpotCategoryFilter,
  getActiveToolCategoryFilter,
  getInactiveEventCategoryFilter,
  getInactiveSpotCategoryFilter,
  getInactiveToolCategoryFilter,
  isCategoryLabelsLoaded,
  subscribeCategoryLabelsRevision,
} from '@/lib/category-labels-cache';
import { isToolLocation } from '@/lib/location-kind-utils';

import {



  getEventBySlug,



  getHomeLocations,



  getLocationBySlug,



  getPrimeEvents,



  getPrimeLocations,



  getPublicEvents,



  loadContentSnapshotWithStatus,
  peekContentSnapshot,
  refreshContentCatalogIfStale,
  type ContentSnapshot,
} from '@/lib/content-store';



import { enrichLocationsWithEngagement } from '@/lib/spot-stars-store';
import { subscribeHomeRefresh } from '@/lib/home-refresh';



import type { Event, ResolvedHeroBanner } from '@/types';
import type { HomeLocation } from '@/lib/demo-data';







interface ContentContextValue {



  isLoading: boolean;



  source: 'supabase' | 'demo' | 'cache';

  isUnavailable: boolean;



  /** Pays actif pour le filtrage du catalogue. */

  activeCountryCode: string;



  publicEvents: Event[];



  primeEvents: Event[];



  primeLocations: HomeLocation[];



  featuredBanners: ResolvedHeroBanner[];



  featuredSpotBanners: ResolvedHeroBanner[];

  featuredToolBanners: ResolvedHeroBanner[];



  getEventBySlug: (slug: string) => Event | undefined;



  getLocationBySlug: (slug: string) => HomeLocation | undefined;



  getHomeLocations: (subCategory?: HomeLocation['subCategory']) => HomeLocation[];



  refresh: () => Promise<void>;



}







const ContentContext = createContext<ContentContextValue | null>(null);







export function ContentProvider({ children }: { children: ReactNode }) {

  const { viewingCountryCode, isReady: viewingCountryReady } = useViewingCountry();
  const [categoryRevision, setCategoryRevision] = useState(0);

  useEffect(() => subscribeCategoryLabelsRevision(() => setCategoryRevision((v) => v + 1)), []);

  const categoriesReady = isCategoryLabelsLoaded();
  const activeEventFilter = getActiveEventCategoryFilter();
  const inactiveEventFilter = getInactiveEventCategoryFilter();
  const activeSpotFilter = getActiveSpotCategoryFilter();
  const inactiveSpotFilter = getInactiveSpotCategoryFilter();
  const activeToolFilter = getActiveToolCategoryFilter();
  const inactiveToolFilter = getInactiveToolCategoryFilter();

  const [snapshot, setSnapshot] = useState<ContentSnapshot | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);



  /** Pays de contenu affiché (Accueil, Agenda, Spots, Outils, Favoris) — indépendant du pays admin. */
  const activeCountryCode = useMemo(() => {
    return viewingCountryReady ? viewingCountryCode : DEFAULT_COUNTRY_CODE;
  }, [viewingCountryCode, viewingCountryReady]);







  const load = useCallback(async (force = false) => {
    const applyEngagement = (snap: ContentSnapshot) => {
      void enrichLocationsWithEngagement(snap.locations).then((enrichedLocations) => {
        setSnapshot((prev) => {
          if (!prev || prev.source !== snap.source) return prev;
          return { ...prev, locations: enrichedLocations };
        });
      });
    };

    if (!force) {
      const peeked = await peekContentSnapshot();
      setSnapshot(peeked);
      applyEngagement(peeked);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    try {
      const { snapshot: snap, unavailable } = await loadContentSnapshotWithStatus(
        force,
        (fresh) => {
          setSnapshot(fresh);
          applyEngagement(fresh);
        },
      );
      setIsUnavailable(unavailable);
      if (snap) {
        setSnapshot(snap);
        applyEngagement(snap);
      } else if (force) {
        setSnapshot(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);







  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    let lastAt = 0;
    return subscribeHomeRefresh((reason) => {
      if (reason === 'cache-reconcile') return;
      if (reason === 'accueil-blocks') return;
      if (reason === 'catalog-stale-check' || reason === 'auth-session') {
        // Jamais force sur auth : un full catalog = méga egress (jointures photos/galeries).
        void refreshContentCatalogIfStale((fresh) => {
          setSnapshot(fresh);
          void enrichLocationsWithEngagement(fresh.locations).then((enrichedLocations) => {
            setSnapshot((prev) => (prev ? { ...prev, locations: enrichedLocations } : prev));
          });
        });
        return;
      }
      // Statut contenu : forcer immédiatement (pas de debounce) pour retirer les désactivés de l’agenda
      if (reason === 'admin-content-status') {
        void load(true);
        return;
      }
      // Autres raisons (featured, sections, benefit-catalog…) : fingerprint / cache seulement.
      // load(true) ici rechargeait tout le catalogue + galeries → explosion d’egress.
      const now = Date.now();
      if (now - lastAt < 8000) return;
      lastAt = now;
      void refreshContentCatalogIfStale((fresh) => {
        setSnapshot(fresh);
        void enrichLocationsWithEngagement(fresh.locations).then((enrichedLocations) => {
          setSnapshot((prev) => (prev ? { ...prev, locations: enrichedLocations } : prev));
        });
      });
    });
  }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // Empreinte seule (~100 octets) — pas de full catalogue ni de polling périodique (egress).
        void refreshContentCatalogIfStale((fresh) => {
          setSnapshot(fresh);
          void enrichLocationsWithEngagement(fresh.locations).then((enrichedLocations) => {
            setSnapshot((prev) => (prev ? { ...prev, locations: enrichedLocations } : prev));
          });
        });
      }
    });
    return () => sub.remove();
  }, []);







  const value = useMemo<ContentContextValue>(() => {



    const raw = snapshot ?? {



      events: [],



      locations: [],



      featuredBanners: [],



      featuredSpotBanners: [],

      featuredToolBanners: [],



      slugToEventId: new Map(),



      slugToLocationId: new Map(),



      source: 'demo' as const,



    };

    const data = applyCategoryVisibilityToContent(raw, {
      activeEvent: activeEventFilter,
      inactiveEvent: inactiveEventFilter,
      activeSpot: activeSpotFilter,
      inactiveSpot: inactiveSpotFilter,
      activeTool: activeToolFilter,
      inactiveTool: inactiveToolFilter,
      labelsLoaded: categoriesReady,
    });



    const countryFilter = activeCountryCode;



    const filterBanners = (banners: ResolvedHeroBanner[]) => {

      if (!countryFilter) return banners;

      return banners.filter((b) => {

        if (b.targetType === 'event') {

          const ev = data.events.find((e) => e.id === b.targetId);

          return ev?.countryCode === countryFilter;

        }

        const loc = data.locations.find((l) => l.id === b.targetId);

        return loc?.countryCode === countryFilter;

      });

    };



    const toolIds = new Set(data.locations.filter((l) => isToolLocation(l)).map((l) => l.id));
    const allLocationBanners = filterBanners(data.featuredSpotBanners);

    return {



      isLoading,



      source: raw.source,

      isUnavailable,



      activeCountryCode: countryFilter ?? DEFAULT_COUNTRY_CODE,



      publicEvents: getPublicEvents(data, countryFilter),



      primeEvents: getPrimeEvents(data, countryFilter),



      primeLocations: getPrimeLocations(data, countryFilter),



      featuredBanners: filterBanners(data.featuredBanners),

      featuredSpotBanners: allLocationBanners.filter((b) => !toolIds.has(b.targetId)),

      featuredToolBanners: allLocationBanners.filter((b) => {
        if (!toolIds.has(b.targetId)) return false;
        const loc = data.locations.find((l) => l.id === b.targetId);
        return loc?.isVerified === true;
      }),



      getEventBySlug: (slug: string) => getEventBySlug(data, slug),



      getLocationBySlug: (slug: string) => getLocationBySlug(data, slug),



      getHomeLocations: (sub?: HomeLocation['subCategory']) => getHomeLocations(data, sub, countryFilter),



      refresh: () => load(true),



    };



  }, [
    snapshot,
    isLoading,
    isUnavailable,
    load,
    activeCountryCode,
    categoriesReady,
    activeEventFilter,
    inactiveEventFilter,
    activeSpotFilter,
    inactiveSpotFilter,
    activeToolFilter,
    inactiveToolFilter,
    categoriesReady,
    categoryRevision,
  ]);







  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;



}







export function useContent() {



  const ctx = useContext(ContentContext);



  if (!ctx) throw new Error('useContent requires ContentProvider');



  return ctx;



}
