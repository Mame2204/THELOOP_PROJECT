import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  loadUserEstablishmentRatings,
  upsertUserEstablishmentRating,
  type EstablishmentRatingResult,
  type RatingTargetKind,
} from '@/lib/ratings-store';
import { useAuthContext } from '@/context/AuthContext';
import { canInteract } from '@/types';

interface RatingsContextValue {
  getUserRating: (establishmentId: string) => number | null;
  rateEstablishment: (
    establishmentId: string,
    rating: number,
    options?: { kind?: RatingTargetKind },
  ) => Promise<EstablishmentRatingResult | null>;
  isRating: (establishmentId: string) => boolean;
}

const RatingsContext = createContext<RatingsContextValue | null>(null);

export function RatingsProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuthContext();
  const [userRatings, setUserRatings] = useState<Record<string, number>>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const userId = user?.id;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!userId || !canInteract(role)) {
        if (!cancelled) setUserRatings({});
        return;
      }
      const ratings = await loadUserEstablishmentRatings(userId);
      if (!cancelled) setUserRatings(ratings);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, role]);


  const rateEstablishment = useCallback(
    async (establishmentId: string, rating: number, options?: { kind?: RatingTargetKind }) => {
      if (!user || !canInteract(role)) return null;
      setPendingIds((prev) => new Set(prev).add(establishmentId));
      try {
        const result = await upsertUserEstablishmentRating(user.id, establishmentId, rating, options);
        if (result) {
          setUserRatings((prev) => ({ ...prev, [establishmentId]: rating }));
        }
        return result;
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(establishmentId);
          return next;
        });
      }
    },
    [user, role],
  );

  const value = useMemo<RatingsContextValue>(
    () => ({
      getUserRating: (establishmentId) => userRatings[establishmentId] ?? null,
      rateEstablishment,
      isRating: (establishmentId) => pendingIds.has(establishmentId),
    }),
    [userRatings, rateEstablishment, pendingIds],
  );

  return <RatingsContext.Provider value={value}>{children}</RatingsContext.Provider>;
}

export function useRatings() {
  const ctx = useContext(RatingsContext);
  if (!ctx) throw new Error('useRatings must be used within RatingsProvider');
  return ctx;
}
