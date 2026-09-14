import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { loadUserFavorites, toggleUserFavorite, type FavoriteLocationKind } from '@/lib/favorites-store';
import { useAuthContext } from '@/context/AuthContext';
import { canInteract } from '@/types';

interface FavoritesContextValue {
  favoriteEventIds: Set<string>;
  favoriteLocationIds: Set<string>;
  isEventFavorite: (id: string) => boolean;
  isLocationFavorite: (id: string) => boolean;
  toggleEventFavorite: (id: string) => Promise<void>;
  toggleLocationFavorite: (id: string, options?: { kind?: FavoriteLocationKind }) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuthContext();
  const [favoriteEventIds, setFavoriteEventIds] = useState<Set<string>>(new Set());
  const [favoriteLocationIds, setFavoriteLocationIds] = useState<Set<string>>(new Set());

  const userId = user?.id;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!userId || !canInteract(role)) {
        if (!cancelled) {
          setFavoriteEventIds(new Set());
          setFavoriteLocationIds(new Set());
        }
        return;
      }
      const favs = await loadUserFavorites(userId);
      if (cancelled) return;
      setFavoriteEventIds(new Set(favs.events));
      setFavoriteLocationIds(new Set(favs.locations));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, role]);


  const toggleEventFavorite = useCallback(
    async (itemId: string) => {
      if (!user || !canInteract(role)) return;
      let removed = false;
      setFavoriteEventIds((prev) => {
        removed = prev.has(itemId);
        const next = new Set(prev);
        if (removed) next.delete(itemId);
        else next.add(itemId);
        return next;
      });
      const ok = await toggleUserFavorite(user.id, 'event', itemId, removed);
      if (!ok) {
        setFavoriteEventIds((prev) => {
          const next = new Set(prev);
          if (removed) next.add(itemId);
          else next.delete(itemId);
          return next;
        });
      }
    },
    [user, role],
  );

  const toggleLocationFavorite = useCallback(
    async (itemId: string, options?: { kind?: FavoriteLocationKind }) => {
      if (!user || !canInteract(role)) return;
      let removed = false;
      setFavoriteLocationIds((prev) => {
        removed = prev.has(itemId);
        const next = new Set(prev);
        if (removed) next.delete(itemId);
        else next.add(itemId);
        return next;
      });
      const ok = await toggleUserFavorite(user.id, 'location', itemId, removed, options);
      if (!ok) {
        setFavoriteLocationIds((prev) => {
          const next = new Set(prev);
          if (removed) next.add(itemId);
          else next.delete(itemId);
          return next;
        });
      }
    },
    [user, role],
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({
      favoriteEventIds,
      favoriteLocationIds,
      isEventFavorite: (id) => favoriteEventIds.has(id),
      isLocationFavorite: (id) => favoriteLocationIds.has(id),
      toggleEventFavorite,
      toggleLocationFavorite,
    }),
    [favoriteEventIds, favoriteLocationIds, toggleEventFavorite, toggleLocationFavorite],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites requires FavoritesProvider');
  return ctx;
}
