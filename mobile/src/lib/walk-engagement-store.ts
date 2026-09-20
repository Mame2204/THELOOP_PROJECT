import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizePhone } from '@/lib/otp-auth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const KEY = 'loop_walk_favorites_v1';
const RATINGS_KEY = 'loop_walk_ratings_v1';
const CLICKS_KEY = 'loop_walk_clicks_v1';

type FavMap = Record<string, string[]>;
type RatingMap = Record<string, Record<string, number>>;
type ClickMap = Record<string, number>;

export interface WalkEngagementSnapshot {
  clickCount: number;
  favoriteCount: number;
  ratingAvg: number;
  ratingCount: number;
  starCount: number;
  starsSource: 'auto' | 'admin';
  engagementScore: number;
}

export interface WalkRatingResult extends WalkEngagementSnapshot {
  walkId: string;
  userRating: number;
}

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function parseWalkRatingPayload(
  payload: Record<string, unknown>,
  walkId: string,
  userRating: number,
): WalkRatingResult {
  return {
    walkId: String(payload.walk_id ?? walkId),
    userRating: Number(payload.user_rating ?? userRating),
    ratingAvg: Number(payload.rating_avg ?? 0),
    ratingCount: Number(payload.rating_count ?? 0),
    clickCount: Number(payload.click_count ?? 0),
    favoriteCount: Number(payload.favorite_count ?? 0),
    engagementScore: Number(payload.engagement_score ?? 0),
    starCount: Number(payload.star_count ?? 0),
    starsSource: payload.stars_source === 'admin' ? 'admin' : 'auto',
  };
}

async function loadFavMap(): Promise<FavMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as FavMap;
  } catch {
    return {};
  }
}

async function saveFavMap(map: FavMap): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(map));
}

async function loadRatings(): Promise<RatingMap> {
  try {
    const raw = await AsyncStorage.getItem(RATINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as RatingMap;
  } catch {
    return {};
  }
}

async function saveRatings(map: RatingMap): Promise<void> {
  await AsyncStorage.setItem(RATINGS_KEY, JSON.stringify(map));
}

async function loadClicks(): Promise<ClickMap> {
  try {
    const raw = await AsyncStorage.getItem(CLICKS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ClickMap;
  } catch {
    return {};
  }
}

async function saveClicks(map: ClickMap): Promise<void> {
  await AsyncStorage.setItem(CLICKS_KEY, JSON.stringify(map));
}

const WALK_FAV_TTL_MS = 10 * 60_000;
let walkFavMemory: { userId: string; at: number; ids: string[] } | null = null;

export async function listWalkFavorites(userId: string): Promise<string[]> {
  if (walkFavMemory && walkFavMemory.userId === userId && Date.now() - walkFavMemory.at < WALK_FAV_TTL_MS) {
    return walkFavMemory.ids;
  }

  const local = (await loadFavMap())[userId] ?? [];

  if (!isValidUuid(userId) || !isSupabaseConfigured() || !supabase) {
    walkFavMemory = { userId, at: Date.now(), ids: local };
    return local;
  }

  const { data, error } = await supabase
    .from('favorite_walks')
    .select('walk_id')
    .eq('user_id', userId)
    .limit(15);

  if (error) {
    console.warn('[WalkEngagement] favoris:', error.message);
    walkFavMemory = { userId, at: Date.now(), ids: local };
    return local;
  }

  const remote = (data ?? []).map((row) => String(row.walk_id));
  const demoOnly = local.filter((id) => !isValidUuid(id));
  const ids = [...new Set([...remote, ...demoOnly])];
  walkFavMemory = { userId, at: Date.now(), ids };
  return ids;
}

function isDuplicateFavoriteError(err: unknown): boolean {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  return code === '23505' || /duplicate key|unique constraint|unique_user_walk/i.test(msg);
}

async function syncLocalWalkFavorite(userId: string, walkId: string, favorited: boolean): Promise<void> {
  const map = await loadFavMap();
  const set = new Set(map[userId] ?? []);
  if (favorited) set.add(walkId);
  else set.delete(walkId);
  map[userId] = [...set];
  await saveFavMap(map);
  walkFavMemory = { userId, at: Date.now(), ids: [...set] };
}

export async function toggleWalkFavorite(userId: string, walkId: string): Promise<boolean> {
  const currentlyFavorite = await isWalkFavorite(userId, walkId);
  const next = !currentlyFavorite;

  if (isValidUuid(userId) && isValidUuid(walkId) && isSupabaseConfigured() && supabase) {
    if (next) {
      const { error } = await supabase.from('favorite_walks').insert({ user_id: userId, walk_id: walkId });
      if (!error || isDuplicateFavoriteError(error)) {
        await syncLocalWalkFavorite(userId, walkId, true);
        return true;
      }
      console.warn('[WalkEngagement] insert favori:', error.message);
    } else {
      const { error } = await supabase
        .from('favorite_walks')
        .delete()
        .eq('user_id', userId)
        .eq('walk_id', walkId);
      if (!error) {
        await syncLocalWalkFavorite(userId, walkId, false);
        return false;
      }
      console.warn('[WalkEngagement] delete favori:', error.message);
    }
  }

  await syncLocalWalkFavorite(userId, walkId, next);
  return next;
}

export async function isWalkFavorite(userId: string, walkId: string): Promise<boolean> {
  const list = await listWalkFavorites(userId);
  return list.includes(walkId);
}

export async function getWalkUserRating(userId: string, walkId: string): Promise<number | null> {
  if (isValidUuid(userId) && isValidUuid(walkId) && isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('walk_ratings')
      .select('rating')
      .eq('user_id', userId)
      .eq('walk_id', walkId)
      .maybeSingle();

    if (!error && data?.rating != null) {
      return Number(data.rating);
    }
  }

  const map = await loadRatings();
  const n = map[walkId]?.[userId];
  return typeof n === 'number' ? n : null;
}

/** @deprecated Préférer upsertWalkRating(userId, walkId, rating) */
export async function setWalkUserRating(ownerKey: string, walkId: string, rating: number): Promise<void> {
  const map = await loadRatings();
  if (!map[walkId]) map[walkId] = {};
  map[walkId][ownerKey] = Math.max(1, Math.min(5, Math.round(rating)));
  await saveRatings(map);
}

export async function upsertWalkRating(
  userId: string,
  walkId: string,
  rating: number,
): Promise<WalkRatingResult | null> {
  const clamped = Math.max(1, Math.min(5, Math.round(rating)));

  if (isValidUuid(userId) && isValidUuid(walkId) && isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.rpc('upsert_walk_rating', {
      p_walk_id: walkId,
      p_rating: clamped,
    });

    if (!error && data && typeof data === 'object') {
      return parseWalkRatingPayload(data as Record<string, unknown>, walkId, clamped);
    }
    if (error) {
      console.warn('[WalkEngagement] upsert rating:', error.message);
    }
  }

  await setWalkUserRating(userId, walkId, clamped);
  const stats = await getWalkRatingStats(walkId);
  return {
    walkId,
    userRating: clamped,
    ratingAvg: stats.avg,
    ratingCount: stats.count,
    clickCount: stats.clickCount,
    favoriteCount: stats.favoriteCount,
    engagementScore: stats.engagementScore,
    starCount: stats.starCount,
    starsSource: stats.starsSource,
  };
}

export async function getWalkRatingStats(walkId: string): Promise<{
  avg: number;
  count: number;
  starCount: number;
  engagementScore: number;
  starsSource: 'auto' | 'admin';
  clickCount: number;
  favoriteCount: number;
}> {
  if (isValidUuid(walkId) && isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('loop_walks')
      .select(
        'rating_avg, rating_count, star_count, engagement_score, stars_source, click_count, favorite_count',
      )
      .eq('id', walkId)
      .maybeSingle();

    if (!error && data) {
      return {
        avg: Number(data.rating_avg ?? 0),
        count: Number(data.rating_count ?? 0),
        starCount: Number(data.star_count ?? 0),
        engagementScore: Number(data.engagement_score ?? 0),
        starsSource: data.stars_source === 'admin' ? 'admin' : 'auto',
        clickCount: Number(data.click_count ?? 0),
        favoriteCount: Number(data.favorite_count ?? 0),
      };
    }
  }

  const map = await loadRatings();
  const votes = Object.values(map[walkId] ?? {});
  if (!votes.length) {
    return {
      avg: 0,
      count: 0,
      starCount: 0,
      engagementScore: 0,
      starsSource: 'auto',
      clickCount: 0,
      favoriteCount: 0,
    };
  }
  const sum = votes.reduce((a, b) => a + b, 0);
  return {
    avg: sum / votes.length,
    count: votes.length,
    starCount: 0,
    engagementScore: 0,
    starsSource: 'auto',
    clickCount: 0,
    favoriteCount: 0,
  };
}

export function walkOwnerKey(userId: string | null | undefined, phone?: string | null): string {
  if (userId && userId !== 'anonymous') return userId;
  const digits = phone ? normalizePhone(phone) : '';
  if (digits) return `phone:${digits}`;
  return 'anon';
}

/** Agrégats walks depuis loop_walks (source Insights admin). */
export async function loadWalkEngagementFromDb(): Promise<{
  clicks: Record<string, number>;
  favorites: Record<string, number>;
  ratings: Record<string, { avg: number; count: number }>;
}> {
  const clicks: Record<string, number> = {};
  const favorites: Record<string, number> = {};
  const ratings: Record<string, { avg: number; count: number }> = {};

  if (!isSupabaseConfigured() || !supabase) {
    return { clicks, favorites, ratings };
  }

  const { data, error } = await supabase
    .from('loop_walks')
    .select('id, click_count, favorite_count, rating_avg, rating_count')
    .limit(15);

  if (error) {
    console.warn('[WalkEngagement] stats DB:', error.message);
    return { clicks, favorites, ratings };
  }

  for (const row of data ?? []) {
    const id = String(row.id);
    clicks[id] = Number(row.click_count ?? 0);
    favorites[id] = Number(row.favorite_count ?? 0);
    const count = Number(row.rating_count ?? 0);
    if (count > 0) {
      ratings[id] = { avg: Number(row.rating_avg ?? 0), count };
    }
  }

  const { data: favRows, error: favErr } = await supabase.from('favorite_walks').select('walk_id').limit(15);
  if (!favErr && favRows?.length) {
    const liveFavorites: Record<string, number> = {};
    for (const row of favRows) {
      const id = String(row.walk_id);
      liveFavorites[id] = (liveFavorites[id] ?? 0) + 1;
    }
    for (const [id, count] of Object.entries(liveFavorites)) {
      favorites[id] = count;
    }
  } else if (favErr) {
    console.warn('[WalkEngagement] favorite_walks:', favErr.message);
  }

  return { clicks, favorites, ratings };
}

function aggregateLocalWalkFavoriteCounts(map: FavMap): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const list of Object.values(map)) {
    for (const walkId of list) {
      counts[walkId] = (counts[walkId] ?? 0) + 1;
    }
  }
  return counts;
}

function aggregateLocalWalkRatingStats(map: RatingMap): Record<string, { avg: number; count: number }> {
  const stats: Record<string, { avg: number; count: number }> = {};
  for (const [walkId, votes] of Object.entries(map)) {
    const values = Object.values(votes);
    if (!values.length) continue;
    const sum = values.reduce((a, b) => a + b, 0);
    stats[walkId] = { avg: sum / values.length, count: values.length };
  }
  return stats;
}

export async function getAllWalkFavoriteCounts(): Promise<Record<string, number>> {
  if (isSupabaseConfigured() && supabase) {
    const { favorites } = await loadWalkEngagementFromDb();
    return favorites;
  }

  return aggregateLocalWalkFavoriteCounts(await loadFavMap());
}

export async function getAllWalkRatingStats(): Promise<Record<string, { avg: number; count: number }>> {
  if (isSupabaseConfigured() && supabase) {
    const { ratings } = await loadWalkEngagementFromDb();
    return ratings;
  }

  return aggregateLocalWalkRatingStats(await loadRatings());
}

/** Enregistre une ouverture de fiche parcours (insights / plébiscités). */
export async function recordWalkClick(walkId: string): Promise<number> {
  if (isValidUuid(walkId) && isSupabaseConfigured() && supabase) {
    const { error } = await supabase.rpc('increment_walk_click', { p_walk_id: walkId });
    if (error) {
      console.warn('[WalkEngagement] increment click:', error.message);
    } else {
      const { data } = await supabase
        .from('loop_walks')
        .select('click_count')
        .eq('id', walkId)
        .maybeSingle();
      if (data) return Number(data.click_count);
    }
  }

  const map = await loadClicks();
  const next = (map[walkId] ?? 0) + 1;
  map[walkId] = next;
  await saveClicks(map);
  return next;
}

export async function getAllWalkClickCounts(): Promise<Record<string, number>> {
  if (isSupabaseConfigured() && supabase) {
    const { clicks } = await loadWalkEngagementFromDb();
    return clicks;
  }

  return loadClicks();
}
