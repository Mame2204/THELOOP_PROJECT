import {

  createContext,

  useCallback,

  useContext,

  useEffect,

  useMemo,

  useState,

  type ReactNode,

} from 'react';

import { loadUserFavorites, toggleUserFavorite } from '@/lib/favorites-store';

import { useAuthContext } from '@/context/AuthContext';

import { canInteract } from '@/types';



interface FavoritesContextValue {

  favoriteEventIds: Set<string>;

  favoriteLocationIds: Set<string>;

  isEventFavorite: (eventId: string) => boolean;

  isLocationFavorite: (locationId: string) => boolean;

  toggleEventFavorite: (eventId: string) => Promise<boolean>;

  toggleLocationFavorite: (locationId: string) => Promise<boolean>;

  showAuthModal: boolean;

  openAuthModal: () => void;

  closeAuthModal: () => void;

}



const FavoritesContext = createContext<FavoritesContextValue | null>(null);



export function FavoritesProvider({ children }: { children: ReactNode }) {

  const { user, role } = useAuthContext();

  const [favoriteEventIds, setFavoriteEventIds] = useState<Set<string>>(new Set());

  const [favoriteLocationIds, setFavoriteLocationIds] = useState<Set<string>>(new Set());

  const [showAuthModal, setShowAuthModal] = useState(false);



  const userId = user?.id;



  useEffect(() => {

    if (!userId || userId === 'anonymous') {

      setFavoriteEventIds(new Set());

      setFavoriteLocationIds(new Set());

      return;

    }



    let cancelled = false;



    void loadUserFavorites(userId).then((favorites) => {

      if (cancelled) return;

      setFavoriteEventIds(new Set(favorites.events));

      setFavoriteLocationIds(new Set(favorites.locations));

    });



    return () => {

      cancelled = true;

    };

  }, [userId]);



  const openAuthModal = useCallback(() => setShowAuthModal(true), []);

  const closeAuthModal = useCallback(() => setShowAuthModal(false), []);



  const guardInteraction = useCallback((): boolean => {

    if (!canInteract(role)) {

      openAuthModal();

      return false;

    }

    return true;

  }, [role, openAuthModal]);



  const toggleEventFavorite = useCallback(

    async (eventId: string): Promise<boolean> => {

      if (!guardInteraction() || !user) return false;



      const isFav = favoriteEventIds.has(eventId);

      const ok = await toggleUserFavorite(user.id, 'event', eventId, isFav);

      if (!ok) return false;



      setFavoriteEventIds((prev) => {

        const next = new Set(prev);

        if (isFav) next.delete(eventId);

        else next.add(eventId);

        return next;

      });

      return true;

    },

    [guardInteraction, user, favoriteEventIds],

  );



  const toggleLocationFavorite = useCallback(

    async (locationId: string): Promise<boolean> => {

      if (!guardInteraction() || !user) return false;



      const isFav = favoriteLocationIds.has(locationId);

      const ok = await toggleUserFavorite(user.id, 'location', locationId, isFav);

      if (!ok) return false;



      setFavoriteLocationIds((prev) => {

        const next = new Set(prev);

        if (isFav) next.delete(locationId);

        else next.add(locationId);

        return next;

      });

      return true;

    },

    [guardInteraction, user, favoriteLocationIds],

  );



  const value = useMemo(

    () => ({

      favoriteEventIds,

      favoriteLocationIds,

      isEventFavorite: (id: string) => favoriteEventIds.has(id),

      isLocationFavorite: (id: string) => favoriteLocationIds.has(id),

      toggleEventFavorite,

      toggleLocationFavorite,

      showAuthModal,

      openAuthModal,

      closeAuthModal,

    }),

    [

      favoriteEventIds,

      favoriteLocationIds,

      toggleEventFavorite,

      toggleLocationFavorite,

      showAuthModal,

      openAuthModal,

      closeAuthModal,

    ],

  );



  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;

}



export function useFavoritesContext() {

  const ctx = useContext(FavoritesContext);

  if (!ctx) throw new Error('useFavoritesContext must be used within FavoritesProvider');

  return ctx;

}

