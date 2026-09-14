import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { isDemoContentId } from '@/lib/favorites-store';

export interface EstablishmentRatingResult {
  establishmentId: string;
  userRating: number;
  ratingAvg: number;
  ratingCount: number;
  engagementScore: number;
  starCount: number;
  starsSource: 'auto' | 'admin';
}

export type RatingTargetKind = 'spot' | 'tool';

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function demoRatingsKey(userId: string): string {
  return `loop_demo_ratings_${userId}`;
}

async function loadDemoRatings(userId: string): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(demoRatingsKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveDemoRatings(userId: string, ratings: Record<string, number>): Promise<void> {
  await AsyncStorage.setItem(demoRatingsKey(userId), JSON.stringify(ratings));
}

function parseRatingPayload(
  payload: Record<string, unknown>,
  fallbackId: string,
  fallbackRating: number,
): EstablishmentRatingResult {
  return {
    establishmentId: String(payload.establishment_id ?? payload.tool_id ?? fallbackId),
    userRating: Number(payload.user_rating ?? fallbackRating),
    ratingAvg: Number(payload.rating_avg ?? 0),
    ratingCount: Number(payload.rating_count ?? 0),
    engagementScore: Number(payload.engagement_score ?? 0),
    starCount: Number(payload.star_count ?? 0),
    starsSource: payload.stars_source === 'admin' ? 'admin' : 'auto',
  };
}

export async function loadUserEstablishmentRatings(userId: string): Promise<Record<string, number>> {
  const local = await loadDemoRatings(userId);

  if (!isValidUuid(userId) || !isSupabaseConfigured() || !supabase) {
    return local;
  }

  try {
    const [spotsRes, toolsRes] = await Promise.all([
      supabase.from('establishment_ratings').select('establishment_id, rating').eq('user_id', userId).limit(15),
      supabase.from('tool_ratings').select('tool_id, rating').eq('user_id', userId).limit(15),
    ]);

    if (spotsRes.error) {
      console.warn('[Ratings] Lecture spots — fallback local.', spotsRes.error.message);
    }
    if (toolsRes.error) {
      console.warn('[Ratings] Lecture outils:', toolsRes.error.message);
    }

    const remote: Record<string, number> = {};
    for (const row of spotsRes.data ?? []) {
      remote[String(row.establishment_id)] = Number(row.rating);
    }
    for (const row of toolsRes.data ?? []) {
      remote[String(row.tool_id)] = Number(row.rating);
    }

    const demoOnly = Object.fromEntries(
      Object.entries(local).filter(([id]) => isDemoContentId(id)),
    );

    return { ...demoOnly, ...remote };
  } catch (err) {
    console.warn('[Ratings] Erreur chargement — fallback local.', err);
    return local;
  }
}

export async function upsertUserEstablishmentRating(
  userId: string,
  targetId: string,
  rating: number,
  options?: { kind?: RatingTargetKind },
): Promise<EstablishmentRatingResult | null> {
  if (rating < 1 || rating > 5) return null;

  if (!isValidUuid(targetId) || !isValidUuid(userId) || !isSupabaseConfigured() || !supabase) {
    const map = await loadDemoRatings(userId);
    map[targetId] = rating;
    await saveDemoRatings(userId, map);
    return {
      establishmentId: targetId,
      userRating: rating,
      ratingAvg: rating,
      ratingCount: 1,
      engagementScore: rating * 10,
      starCount: Math.min(5, Math.max(1, Math.round(rating))),
      starsSource: 'auto',
    };
  }

  const kind = options?.kind ?? 'spot';

  if (kind === 'tool') {
    const { data, error } = await supabase.rpc('upsert_tool_rating', {
      p_tool_id: targetId,
      p_rating: rating,
    });

    if (error) {
      console.warn('[Ratings] upsert tool:', error.message);
      return null;
    }

    return parseRatingPayload((data ?? {}) as Record<string, unknown>, targetId, rating);
  }

  const { data, error } = await supabase.rpc('upsert_establishment_rating', {
    p_establishment_id: targetId,
    p_rating: rating,
  });

  if (error) {
    console.warn('[Ratings] upsert spot:', error.message);
    return null;
  }

  return parseRatingPayload((data ?? {}) as Record<string, unknown>, targetId, rating);
}
