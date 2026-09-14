import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { loadDemoFavorites, saveDemoFavorites } from '@/lib/demo-auth';

/** IDs issus de demo-data.ts (pas encore migrés vers UUID production). */
export function isDemoContentId(id: string): boolean {
  return /^(evt|loc)-/.test(id);
}

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export interface UserFavorites {
  events: string[];
  /** IDs établissements (establishments.id) — alias « locations » côté app démo. */
  locations: string[];
}

const favoritesLoadPromises = new Map<string, Promise<UserFavorites>>();

/** Charge favoris : Production V1.0 (`favorite_events` + `favorite_spots`) + localStorage démo. */
export async function loadUserFavorites(userId: string): Promise<UserFavorites> {
  const inFlight = favoritesLoadPromises.get(userId);
  if (inFlight) return inFlight;

  const promise = (async (): Promise<UserFavorites> => {
    const local = loadDemoFavorites(userId);

    if (!isSupabaseConfigured() || !supabase) {
      return local;
    }

    try {
      const [eventsRes, spotsRes] = await Promise.all([
        supabase.from('favorite_events').select('event_id').eq('user_id', userId).limit(15),
        supabase.from('favorite_spots').select('establishment_id').eq('user_id', userId).limit(15),
      ]);

      if (eventsRes.error || spotsRes.error) {
        console.warn('[Favoris] Lecture Supabase — fallback local.', eventsRes.error ?? spotsRes.error);
        return local;
      }

      const remoteEvents = (eventsRes.data ?? []).map((row) => String(row.event_id));
      const remoteSpots = (spotsRes.data ?? []).map((row) => String(row.establishment_id));
      const demoEvents = local.events.filter(isDemoContentId);
      const demoSpots = local.locations.filter(isDemoContentId);

      return {
        events: [...new Set([...remoteEvents, ...demoEvents])],
        locations: [...new Set([...remoteSpots, ...demoSpots])],
      };
    } catch (err) {
      console.warn('[Favoris] Erreur chargement — fallback local.', err);
      return local;
    }
  })();

  favoritesLoadPromises.set(userId, promise);
  try {
    return await promise;
  } finally {
    favoritesLoadPromises.delete(userId);
  }
}

function persistLocalFavorites(
  userId: string,
  type: 'event' | 'location',
  itemId: string,
  remove: boolean,
): UserFavorites {
  const current = loadDemoFavorites(userId);
  const events = new Set(current.events);
  const locations = new Set(current.locations);

  if (type === 'event') {
    if (remove) events.delete(itemId);
    else events.add(itemId);
  } else {
    if (remove) locations.delete(itemId);
    else locations.add(itemId);
  }

  const next = { events: [...events], locations: [...locations] };
  saveDemoFavorites(userId, next);
  return next;
}

/** Bascule un favori — `favorite_events` / `favorite_spots` (Production V1.0). */
export async function toggleUserFavorite(
  userId: string,
  type: 'event' | 'location',
  itemId: string,
  currentlyFavorite: boolean,
): Promise<boolean> {
  const useLocalOnly = isDemoContentId(itemId) || !isValidUuid(itemId);

  if (useLocalOnly || !isSupabaseConfigured() || !supabase) {
    persistLocalFavorites(userId, type, itemId, currentlyFavorite);
    return true;
  }

  try {
    if (type === 'event') {
      if (currentlyFavorite) {
        const { error } = await supabase
          .from('favorite_events')
          .delete()
          .eq('user_id', userId)
          .eq('event_id', itemId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('favorite_events')
          .insert({ user_id: userId, event_id: itemId });
        if (error) throw error;
      }
    } else if (currentlyFavorite) {
      const { error } = await supabase
        .from('favorite_spots')
        .delete()
        .eq('user_id', userId)
        .eq('establishment_id', itemId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('favorite_spots')
        .insert({ user_id: userId, establishment_id: itemId });
      if (error) throw error;
    }
    return true;
  } catch (err) {
    console.warn('[Favoris] Écriture Supabase — fallback local.', err);
    persistLocalFavorites(userId, type, itemId, currentlyFavorite);
    return true;
  }
}
