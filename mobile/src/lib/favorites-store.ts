import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { loadDemoFavorites, saveDemoFavorites } from '@/lib/demo-auth';
import type { HomeLocation } from '@/lib/demo-data';

/** IDs locaux / staging (pas encore en UUID Supabase). */
export function isDemoContentId(id: string): boolean {
  return /^(evt|loc|spot)-/.test(id);
}

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function isMissingRelationError(err: unknown): boolean {
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  return /favorite_tools|schema cache|does not exist|PGRST205/i.test(msg);
}

function isEstablishmentFkError(err: unknown): boolean {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  return code === '23503' || /favorite_spots_establishment_id_fkey|not present in table "establishments"/i.test(msg);
}

function isDuplicateFavoriteError(err: unknown): boolean {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  return code === '23505' || /duplicate key|unique constraint|unique_user/i.test(msg);
}

export type FavoriteLocationKind = 'spot' | 'tool';

export interface UserFavorites {
  events: string[];
  /** IDs spots + outils (même liste côté app). */
  locations: string[];
}

/** Charge favoris : events + spots + outils + localStorage démo. */
export async function loadUserFavorites(userId: string): Promise<UserFavorites> {
  const local = await loadDemoFavorites(userId);

  if (!isValidUuid(userId) || !isSupabaseConfigured() || !supabase) {
    return local;
  }

  try {
    const [eventsRes, spotsRes, toolsRes] = await Promise.all([
      supabase.from('favorite_events').select('event_id').eq('user_id', userId).limit(15),
      supabase.from('favorite_spots').select('establishment_id').eq('user_id', userId).limit(15),
      supabase.from('favorite_tools').select('tool_id').eq('user_id', userId).limit(15),
    ]);

    if (eventsRes.error) {
      console.warn('[Favoris] Lecture événements:', eventsRes.error.message);
    }
    if (spotsRes.error) {
      console.warn('[Favoris] Lecture spots:', spotsRes.error.message);
    }
    if (toolsRes.error && !isMissingRelationError(toolsRes.error)) {
      console.warn('[Favoris] Lecture outils:', toolsRes.error.message);
    }

    const remoteEvents = eventsRes.error
      ? []
      : (eventsRes.data ?? []).map((row) => String(row.event_id));
    const remoteSpots = spotsRes.error
      ? []
      : (spotsRes.data ?? []).map((row) => String(row.establishment_id));
    const remoteTools =
      toolsRes.error && !isMissingRelationError(toolsRes.error)
        ? []
        : (toolsRes.data ?? []).map((row) => String(row.tool_id));
    const demoEvents = local.events.filter(isDemoContentId);
    const demoSpots = local.locations.filter(isDemoContentId);
    const remoteLocationIds = new Set([...remoteSpots, ...remoteTools]);
    /** Favoris locaux UUID non encore lus côté Supabase (sync en attente). */
    const pendingLocalLocations = local.locations.filter(
      (id) => isValidUuid(id) && !remoteLocationIds.has(id),
    );

    return {
      events: [...new Set([...remoteEvents, ...demoEvents])],
      locations: [...new Set([...remoteSpots, ...remoteTools, ...demoSpots, ...pendingLocalLocations])],
    };
  } catch (err) {
    console.warn('[Favoris] Erreur chargement — fallback local.', err);
    return local;
  }
}

function persistLocalFavorites(
  userId: string,
  type: 'event' | 'location',
  itemId: string,
  remove: boolean,
): Promise<UserFavorites> {
  return loadDemoFavorites(userId).then((current) => {
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
    return saveDemoFavorites(userId, next).then(() => next);
  });
}

async function idExistsInTools(itemId: string): Promise<boolean> {
  if (!isValidUuid(itemId) || !isSupabaseConfigured() || !supabase) return false;
  const { data, error } = await supabase.from('tools').select('id').eq('id', itemId).maybeSingle();
  if (error) {
    console.warn('[Favoris] lookup tool:', error.message);
    return false;
  }
  return Boolean(data?.id);
}

async function idExistsInEstablishments(itemId: string): Promise<boolean> {
  if (!isValidUuid(itemId) || !isSupabaseConfigured() || !supabase) return false;
  const { data, error } = await supabase
    .from('establishments')
    .select('id')
    .eq('id', itemId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.id);
}

async function toggleToolFavorite(
  userId: string,
  itemId: string,
  currentlyFavorite: boolean,
): Promise<{ ok: boolean; error?: unknown }> {
  if (!supabase) return { ok: false, error: 'no_supabase' };

  if (currentlyFavorite) {
    const { error } = await supabase
      .from('favorite_tools')
      .delete()
      .eq('user_id', userId)
      .eq('tool_id', itemId);
    return error ? { ok: false, error } : { ok: true };
  }

  const { error } = await supabase
    .from('favorite_tools')
    .insert({ user_id: userId, tool_id: itemId });
  if (!error) return { ok: true };
  if (isDuplicateFavoriteError(error)) return { ok: true };
  return { ok: false, error };
}

async function toggleSpotFavorite(
  userId: string,
  itemId: string,
  currentlyFavorite: boolean,
): Promise<{ ok: boolean; error?: unknown }> {
  if (!supabase) return { ok: false, error: 'no_supabase' };

  if (currentlyFavorite) {
    const { error } = await supabase
      .from('favorite_spots')
      .delete()
      .eq('user_id', userId)
      .eq('establishment_id', itemId);
    return error ? { ok: false, error } : { ok: true };
  }

  const { error } = await supabase
    .from('favorite_spots')
    .insert({ user_id: userId, establishment_id: itemId });
  if (!error) return { ok: true };
  if (isDuplicateFavoriteError(error)) return { ok: true };
  return { ok: false, error };
}

/** Bascule un favori — events / spots / outils. */
export async function toggleUserFavorite(
  userId: string,
  type: 'event' | 'location',
  itemId: string,
  currentlyFavorite: boolean,
  options?: { kind?: FavoriteLocationKind },
): Promise<boolean> {
  const useLocalOnly = isDemoContentId(itemId) || !isValidUuid(itemId);

  if (useLocalOnly || !isSupabaseConfigured() || !supabase) {
    await persistLocalFavorites(userId, type, itemId, currentlyFavorite);
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
        if (error && !isDuplicateFavoriteError(error)) throw error;
      }
      return true;
    }

    const hintedTool = options?.kind === 'tool';
    const hintedSpot = options?.kind === 'spot';

    if (hintedTool) {
      const toolRes = await toggleToolFavorite(userId, itemId, currentlyFavorite);
      if (toolRes.ok) return true;
      if (isMissingRelationError(toolRes.error)) {
        console.warn(
          '[Favoris] Table favorite_tools absente — exécutez la migration 20260770_favorite_tools.sql',
        );
      } else {
        console.warn('[Favoris] Écriture outil:', toolRes.error);
      }
      await persistLocalFavorites(userId, type, itemId, currentlyFavorite);
      return true;
    }

    if (hintedSpot) {
      const spotRes = await toggleSpotFavorite(userId, itemId, currentlyFavorite);
      if (spotRes.ok) return true;
      console.warn('[Favoris] Écriture spot:', spotRes.error);
      await persistLocalFavorites(userId, type, itemId, currentlyFavorite);
      return true;
    }

    const [inTools, inEstablishments] = await Promise.all([
      idExistsInTools(itemId),
      idExistsInEstablishments(itemId),
    ]);
    const looksLikeTool = inTools && !inEstablishments;
    const looksLikeSpot = inEstablishments;

    if (looksLikeTool) {
      const toolRes = await toggleToolFavorite(userId, itemId, currentlyFavorite);
      if (toolRes.ok) return true;

      if (isMissingRelationError(toolRes.error)) {
        console.warn(
          '[Favoris] Table favorite_tools absente — exécutez la migration 20260770_favorite_tools.sql',
        );
      } else {
        console.warn('[Favoris] Écriture outil:', toolRes.error);
      }
      await persistLocalFavorites(userId, type, itemId, currentlyFavorite);
      return true;
    }

    const spotRes = await toggleSpotFavorite(userId, itemId, currentlyFavorite);
    if (spotRes.ok) return true;

    // ID outil passé sans hint → retry tools
    if (isEstablishmentFkError(spotRes.error) || (await idExistsInTools(itemId))) {
      const toolRes = await toggleToolFavorite(userId, itemId, currentlyFavorite);
      if (toolRes.ok) return true;
      if (isMissingRelationError(toolRes.error)) {
        console.warn(
          '[Favoris] Table favorite_tools absente — exécutez la migration 20260770_favorite_tools.sql',
        );
      } else {
        console.warn('[Favoris] Retry outil:', toolRes.error);
      }
    } else {
      console.warn('[Favoris] Écriture spot:', spotRes.error);
    }

    await persistLocalFavorites(userId, type, itemId, currentlyFavorite);
    return true;
  } catch (err) {
    console.warn('[Favoris] Écriture Supabase — fallback local.', err);
    await persistLocalFavorites(userId, type, itemId, currentlyFavorite);
    return true;
  }
}

/** Résout des outils favoris absents du catalogue (pays / cache). */
export async function resolveMissingFavoriteTools(
  favoriteIds: string[],
  catalogTools: HomeLocation[],
): Promise<HomeLocation[]> {
  const catalogIds = new Set(catalogTools.map((t) => t.id));
  const missing = favoriteIds.filter((id) => isValidUuid(id) && !catalogIds.has(id));
  if (!missing.length || !isSupabaseConfigured() || !supabase) return [];

  const { data, error } = await supabase
    .from('tools')
    .select(`
      id, name, description, category_slugs, logo_url, website_url, action_link,
      instagram_url, facebook_url, phone_contact, developer, is_verified, partnership_status,
      country_code, content_origin, content_status, is_active, click_count, favorite_count,
      engagement_score, star_count, stars_source, admin_star_override, rating_avg, rating_count,
      created_at, is_featured, featured_start_date, featured_end_date,
      tool_photos ( id, photo_url, is_primary )
    `)
    .in('id', missing)
    .eq('is_active', true)
    .eq('content_status', 'published')
    .limit(15);

  if (error) {
    console.warn('[Favoris] resolve outils:', error.message);
    return [];
  }

  const { mapDbToolToHomeLocation, buildSlugMaps } = await import('@/lib/content-mappers');
  const slugMaps = buildSlugMaps((data ?? []).map((row) => ({ id: String(row.id), label: String(row.name ?? row.id) })));

  return (data ?? []).map((row) => {
    const id = String(row.id);
    const slug = slugMaps.idToSlug.get(id) ?? id;
    return mapDbToolToHomeLocation(row, slug);
  });
}
