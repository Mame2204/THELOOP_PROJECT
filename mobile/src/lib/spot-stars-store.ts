import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { listRegistryUsers } from '@/lib/user-registry-store';
import { loadDemoFavorites } from '@/lib/demo-auth';
import type { HomeLocation } from '@/lib/demo-data';
import type { SpotEngagementInsight } from '@/lib/admin-types';

export interface SpotStarTier {
  minScore: number;
  maxScore: number | null;
  starCount: number;
}

export interface SpotStarSettings {
  id?: string;
  countryCode: string | null;
  clickWeight: number;
  favoriteWeight: number;
  ratingWeight: number;
  tiers: SpotStarTier[];
}

export interface SpotEngagementRecord {
  clickCount: number;
  favoriteCount: number;
  engagementScore: number;
  starCount: number;
  starsSource: 'auto' | 'admin';
  adminStarOverride: number | null;
  lastCalcAt: string | null;
}

const ENGAGEMENT_KEY = 'loop_spot_engagement_v1';
const SETTINGS_KEY = 'loop_spot_star_settings_v1';
const LAST_CALC_KEY = 'loop_spot_stars_last_calc_v1';
const LOCAL_FAV_KEY = 'loop_local_favorite_counts_v1';

const DEFAULT_TIERS: SpotStarTier[] = [
  { minScore: 0, maxScore: 50, starCount: 1 },
  { minScore: 51, maxScore: 200, starCount: 2 },
  { minScore: 201, maxScore: 500, starCount: 3 },
  { minScore: 501, maxScore: 1000, starCount: 4 },
  { minScore: 1001, maxScore: null, starCount: 5 },
];

const EMPTY_SETTINGS: SpotStarSettings = {
  countryCode: null,
  clickWeight: 1,
  favoriteWeight: 5,
  ratingWeight: 10,
  tiers: DEFAULT_TIERS,
};

export function computeEngagementScore(
  clickCount: number,
  favoriteCount: number,
  ratingAverage: number,
  settings: Pick<SpotStarSettings, 'clickWeight' | 'favoriteWeight' | 'ratingWeight'>,
): number {
  const ratingWeight = settings.ratingWeight ?? 10;
  return Math.round(
    clickCount * settings.clickWeight
    + favoriteCount * settings.favoriteWeight
    + ratingAverage * ratingWeight,
  );
}

export function scoreToStarCount(score: number, tiers: SpotStarTier[]): number {
  const sorted = [...tiers].sort((a, b) => a.minScore - b.minScore);
  for (const tier of sorted) {
    const inRange = score >= tier.minScore && (tier.maxScore == null || score <= tier.maxScore);
    if (inRange) return tier.starCount;
  }
  return sorted.length ? sorted[sorted.length - 1].starCount : 0;
}

async function loadEngagementMap(): Promise<Record<string, SpotEngagementRecord>> {
  try {
    const raw = await AsyncStorage.getItem(ENGAGEMENT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SpotEngagementRecord>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveEngagementMap(map: Record<string, SpotEngagementRecord>): Promise<void> {
  await AsyncStorage.setItem(ENGAGEMENT_KEY, JSON.stringify(map));
}

async function loadLocalSettingsMap(): Promise<Record<string, SpotStarSettings>> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, SpotStarSettings>;
  } catch {
    return {};
  }
}

async function saveLocalSettings(countryCode: string | null, settings: SpotStarSettings): Promise<void> {
  const map = await loadLocalSettingsMap();
  map[countryCode ?? '__GLOBAL__'] = settings;
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(map));
}

function settingsKey(countryCode: string | null): string {
  return countryCode ?? '__GLOBAL__';
}

const SETTINGS_MEMORY_TTL_MS = 15 * 60_000;
const FAV_COUNTS_MEMORY_TTL_MS = 10 * 60_000;
const settingsMemory = new Map<string, { at: number; settings: SpotStarSettings }>();
let favCountsMemory: { at: number; counts: Record<string, number> } | null = null;

export async function getSpotStarSettings(countryCode?: string | null): Promise<SpotStarSettings> {
  const memKey = settingsKey(countryCode ?? null);
  const memHit = settingsMemory.get(memKey);
  if (memHit && Date.now() - memHit.at < SETTINGS_MEMORY_TTL_MS) {
    return memHit.settings;
  }

  if (isSupabaseConfigured() && supabase) {
    const queries = countryCode
      ? [
          supabase.from('spot_star_settings').select('id, country_code, click_weight, favorite_weight, rating_weight').eq('country_code', countryCode).maybeSingle(),
          supabase.from('spot_star_settings').select('id, country_code, click_weight, favorite_weight, rating_weight').is('country_code', null).maybeSingle(),
        ]
      : [supabase.from('spot_star_settings').select('id, country_code, click_weight, favorite_weight, rating_weight').is('country_code', null).maybeSingle()];

    for (const q of queries) {
      const { data } = await q;
      if (!data) continue;
      const { data: tiers } = await supabase
        .from('spot_star_tiers')
        .select('min_score, max_score, star_count, sort_order')
        .eq('settings_id', data.id)
        .order('sort_order', { ascending: true })
        .limit(15);
      if (tiers?.length) {
        const settings: SpotStarSettings = {
          id: data.id,
          countryCode: data.country_code,
          clickWeight: data.click_weight,
          favoriteWeight: data.favorite_weight,
          ratingWeight: data.rating_weight ?? 10,
          tiers: tiers.map((t) => ({
            minScore: t.min_score,
            maxScore: t.max_score,
            starCount: t.star_count,
          })),
        };
        await saveLocalSettings(countryCode ?? null, settings);
        settingsMemory.set(memKey, { at: Date.now(), settings });
        return settings;
      }
    }
  }

  const local = await loadLocalSettingsMap();
  const fromLocal = local[memKey];
  if (fromLocal) {
    settingsMemory.set(memKey, { at: Date.now(), settings: fromLocal });
    return fromLocal;
  }
  const fallback = { ...EMPTY_SETTINGS, countryCode: countryCode ?? null, tiers: [...DEFAULT_TIERS] };
  settingsMemory.set(memKey, { at: Date.now(), settings: fallback });
  return fallback;
}

export async function saveSpotStarSettings(settings: SpotStarSettings): Promise<void> {
  await saveLocalSettings(settings.countryCode, settings);

  if (!isSupabaseConfigured() || !supabase) return;

  const payload = {
    country_code: settings.countryCode,
    click_weight: settings.clickWeight,
    favorite_weight: settings.favoriteWeight,
    rating_weight: settings.ratingWeight,
    updated_at: new Date().toISOString(),
  };

  let settingsId = settings.id;
  if (settingsId) {
    await supabase.from('spot_star_settings').update(payload).eq('id', settingsId);
  } else {
    const existingQuery = settings.countryCode
      ? supabase.from('spot_star_settings').select('id').eq('country_code', settings.countryCode).maybeSingle()
      : supabase.from('spot_star_settings').select('id').is('country_code', null).maybeSingle();
    const { data: existing } = await existingQuery;

    if (existing?.id) {
      settingsId = existing.id;
      await supabase.from('spot_star_settings').update(payload).eq('id', settingsId);
    } else {
      const { data } = await supabase.from('spot_star_settings').insert(payload).select('id').maybeSingle();
      settingsId = data?.id;
    }
  }

  if (!settingsId) return;

  await supabase.from('spot_star_tiers').delete().eq('settings_id', settingsId);
  await supabase.from('spot_star_tiers').insert(
    settings.tiers.map((tier, index) => ({
      settings_id: settingsId,
      min_score: tier.minScore,
      max_score: tier.maxScore,
      star_count: tier.starCount,
      sort_order: index + 1,
    })),
  );
}

export async function countSpotFavorites(): Promise<Record<string, number>> {
  if (favCountsMemory && Date.now() - favCountsMemory.at < FAV_COUNTS_MEMORY_TTL_MS) {
    return favCountsMemory.counts;
  }

  const counts: Record<string, number> = {};

  if (isSupabaseConfigured() && supabase) {
    const [spotsRes, toolsRes] = await Promise.all([
      supabase.from('favorite_spots').select('establishment_id').limit(15),
      supabase.from('favorite_tools').select('tool_id').limit(15),
    ]);
    for (const row of spotsRes.data ?? []) {
      const id = String(row.establishment_id);
      counts[id] = (counts[id] ?? 0) + 1;
    }
    for (const row of toolsRes.data ?? []) {
      const id = String(row.tool_id);
      counts[id] = (counts[id] ?? 0) + 1;
    }
    favCountsMemory = { at: Date.now(), counts };
    return counts;
  }

  const users = await listRegistryUsers();
  for (const user of users) {
    const fav = await loadDemoFavorites(user.id);
    for (const id of fav.locations) counts[id] = (counts[id] ?? 0) + 1;
  }

  try {
    const raw = await AsyncStorage.getItem(LOCAL_FAV_KEY);
    if (raw) {
      const extra = JSON.parse(raw) as { spots?: Record<string, number> };
      for (const [id, c] of Object.entries(extra.spots ?? {})) counts[id] = (counts[id] ?? 0) + c;
    }
  } catch {
    /* ignore */
  }

  favCountsMemory = { at: Date.now(), counts };
  return counts;
}

export async function getSpotEngagement(spotId: string): Promise<SpotEngagementRecord | null> {
  const map = await loadEngagementMap();
  return map[spotId] ?? null;
}

export async function recordSpotClick(
  spotId: string,
  options?: { countryCode?: string | null; ratingAverage?: number },
): Promise<{ starCount: number; clickCount: number; engagementScore: number }> {
  const map = await loadEngagementMap();
  const current = map[spotId] ?? {
    clickCount: 0,
    favoriteCount: 0,
    engagementScore: 0,
    starCount: 0,
    starsSource: 'auto' as const,
    adminStarOverride: null,
    lastCalcAt: null,
  };
  current.clickCount += 1;

  if (current.starsSource !== 'admin') {
    const settings = await getSpotStarSettings(options?.countryCode ?? null);
    current.engagementScore = computeEngagementScore(
      current.clickCount,
      current.favoriteCount,
      options?.ratingAverage ?? 0,
      settings,
    );
    current.starCount = scoreToStarCount(current.engagementScore, settings.tiers);
  }

  map[spotId] = current;
  await saveEngagementMap(map);

  if (isSupabaseConfigured() && supabase && /^[0-9a-f-]{36}$/i.test(spotId)) {
    await supabase.rpc('increment_spot_click', { p_establishment_id: spotId });
    // Filet de sécurité si l’ancienne RPC n’appelait pas encore recalculate_tool_engagement
    await supabase.rpc('recalculate_tool_engagement', { p_tool_id: spotId });

    const [{ data: toolRow }, { data: spotRow }] = await Promise.all([
      supabase
        .from('tools')
        .select('click_count, favorite_count, engagement_score, star_count, stars_source, admin_star_override, rating_avg')
        .eq('id', spotId)
        .maybeSingle(),
      supabase
        .from('establishments')
        .select('click_count, favorite_count, engagement_score, star_count, stars_source, admin_star_override, rating_avg')
        .eq('id', spotId)
        .maybeSingle(),
    ]);
    const row = toolRow ?? spotRow;
    if (row) {
      const starsSource = row.stars_source === 'admin' ? 'admin' as const : 'auto' as const;
      const clicks = Number(row.click_count ?? current.clickCount);
      const favorites = Number(row.favorite_count ?? current.favoriteCount);
      const ratingAvg = Number(row.rating_avg ?? options?.ratingAverage ?? 0);
      let score = Number(row.engagement_score ?? current.engagementScore);
      let starCount = Number(row.star_count ?? current.starCount);

      if (starsSource !== 'admin') {
        const settings = await getSpotStarSettings(options?.countryCode ?? null);
        score = computeEngagementScore(clicks, favorites, ratingAvg, settings);
        starCount = scoreToStarCount(score, settings.tiers);
        // Persiste si le serveur n’a pas encore recalculé (migration 20260771 absente)
        if (toolRow && starCount !== Number(row.star_count ?? -1)) {
          await supabase
            .from('tools')
            .update({ engagement_score: score, star_count: starCount })
            .eq('id', spotId);
        }
      }

      map[spotId] = {
        clickCount: clicks,
        favoriteCount: favorites,
        engagementScore: score,
        starCount,
        starsSource,
        adminStarOverride: row.admin_star_override != null ? Number(row.admin_star_override) : null,
        lastCalcAt: new Date().toISOString(),
      };
      await saveEngagementMap(map);
      return {
        starCount: map[spotId].starCount,
        clickCount: map[spotId].clickCount,
        engagementScore: map[spotId].engagementScore,
      };
    }
  }

  return {
    starCount: current.starCount,
    clickCount: current.clickCount,
    engagementScore: current.engagementScore,
  };
}

async function getLastCalcDate(countryCode: string): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_CALC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed[countryCode] ?? null;
  } catch {
    return null;
  }
}

async function setLastCalcDate(countryCode: string, date: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LAST_CALC_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    parsed[countryCode] = date;
    await AsyncStorage.setItem(LAST_CALC_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }

  if (isSupabaseConfigured() && supabase) {
    await supabase.from('spot_star_calc_runs').upsert(
      { country_code: countryCode, run_date: date, spots_updated: 0 },
      { onConflict: 'country_code,run_date' },
    );
  }
}

async function hasCalcRunToday(countryCode: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const local = await getLastCalcDate(countryCode);
  if (local === today) return true;

  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase
      .from('spot_star_calc_runs')
      .select('id')
      .eq('country_code', countryCode)
      .eq('run_date', today)
      .maybeSingle();
    if (data) return true;
  }

  return false;
}

export async function processDailySpotStarCalculation(
  countryCode: string,
  spots: Array<{
    id: string;
    countryCode?: string | null;
    ratingAvg?: number;
    clickCount?: number;
    favoriteCount?: number;
  }>,
): Promise<{ updated: number; skipped: boolean }> {
  if (await hasCalcRunToday(countryCode)) return { updated: 0, skipped: true };

  const settings = await getSpotStarSettings(countryCode);
  const favCounts = await countSpotFavorites();
  const map = await loadEngagementMap();
  const today = new Date().toISOString().slice(0, 10);
  let updated = 0;

  for (const spot of spots) {
    if (spot.countryCode && spot.countryCode !== countryCode) continue;

    const existing = map[spot.id];
    if (existing?.starsSource === 'admin' && existing.adminStarOverride != null) continue;

    const clicks = Math.max(existing?.clickCount ?? 0, spot.clickCount ?? 0);
    const favorites = Math.max(
      existing?.favoriteCount ?? 0,
      favCounts[spot.id] ?? 0,
      spot.favoriteCount ?? 0,
    );
    const ratingAverage = spot.ratingAvg ?? 0;
    let score = computeEngagementScore(clicks, favorites, ratingAverage, settings);
    let starCount = scoreToStarCount(score, settings.tiers);

    if (isSupabaseConfigured() && supabase && /^[0-9a-f-]{36}$/i.test(spot.id)) {
      await Promise.all([
        supabase.rpc('recalculate_tool_engagement', { p_tool_id: spot.id }),
        supabase.rpc('recalculate_establishment_engagement', { p_establishment_id: spot.id }),
      ]);

      const [{ data: toolRow }, { data: spotRow }] = await Promise.all([
        supabase
          .from('tools')
          .select('click_count, favorite_count, engagement_score, star_count')
          .eq('id', spot.id)
          .maybeSingle(),
        supabase
          .from('establishments')
          .select('click_count, favorite_count, engagement_score, star_count, last_star_calc_at')
          .eq('id', spot.id)
          .maybeSingle(),
      ]);
      const row = toolRow ?? spotRow;
      if (row) {
        score = Number(row.engagement_score ?? score);
        starCount = Number(row.star_count ?? starCount);
        map[spot.id] = {
          clickCount: Number(row.click_count ?? clicks),
          favoriteCount: Number(row.favorite_count ?? favorites),
          engagementScore: score,
          starCount,
          starsSource: 'auto',
          adminStarOverride: null,
          lastCalcAt: new Date().toISOString(),
        };
        if (spotRow) {
          await supabase
            .from('establishments')
            .update({ last_star_calc_at: new Date().toISOString() })
            .eq('id', spot.id);
        }
        updated += 1;
        continue;
      }

      const payload = {
        engagement_score: score,
        star_count: starCount,
        stars_source: 'auto' as const,
        admin_star_override: null as null,
      };
      await Promise.all([
        supabase.from('establishments').update({
          ...payload,
          favorite_count: favorites,
          last_star_calc_at: new Date().toISOString(),
        }).eq('id', spot.id),
        supabase.from('tools').update({
          ...payload,
          favorite_count: favorites,
        }).eq('id', spot.id),
      ]);
    }

    map[spot.id] = {
      clickCount: clicks,
      favoriteCount: favorites,
      engagementScore: score,
      starCount,
      starsSource: 'auto',
      adminStarOverride: null,
      lastCalcAt: new Date().toISOString(),
    };
    updated += 1;
  }

  await saveEngagementMap(map);
  await setLastCalcDate(countryCode, today);

  if (isSupabaseConfigured() && supabase) {
    await supabase
      .from('spot_star_calc_runs')
      .upsert({ country_code: countryCode, run_date: today, spots_updated: updated }, { onConflict: 'country_code,run_date' });
  }

  return { updated, skipped: false };
}

export async function setAdminStarOverride(
  spotId: string,
  starCount: number,
  adminId: string,
): Promise<void> {
  const map = await loadEngagementMap();
  const existing = map[spotId] ?? {
    clickCount: 0,
    favoriteCount: 0,
    engagementScore: 0,
    starCount: 0,
    starsSource: 'auto' as const,
    adminStarOverride: null,
    lastCalcAt: null,
  };

  map[spotId] = {
    ...existing,
    starCount,
    starsSource: 'admin',
    adminStarOverride: starCount,
    lastCalcAt: new Date().toISOString(),
  };
  await saveEngagementMap(map);

  if (isSupabaseConfigured() && supabase && /^[0-9a-f-]{36}$/i.test(spotId)) {
    const patch = {
      star_count: starCount,
      stars_source: 'admin' as const,
      admin_star_override: starCount,
      admin_star_override_at: new Date().toISOString(),
      admin_star_override_by: adminId,
    };
    await Promise.all([
      supabase.from('establishments').update(patch).eq('id', spotId),
      supabase.from('tools').update(patch).eq('id', spotId),
      supabase.from('loop_walks').update(patch).eq('id', spotId),
    ]);
  }
}

export async function clearAdminStarOverride(
  spotId: string,
  countryCode: string,
  options?: {
    ratingAverage?: number;
    clickCount?: number;
    favoriteCount?: number;
  },
): Promise<{ starCount: number; engagementScore: number }> {
  const settings = await getSpotStarSettings(countryCode);
  const favCounts = await countSpotFavorites();
  const map = await loadEngagementMap();
  const existing = map[spotId] ?? {
    clickCount: 0,
    favoriteCount: 0,
    engagementScore: 0,
    starCount: 0,
    starsSource: 'auto' as const,
    adminStarOverride: null,
    lastCalcAt: null,
  };

  const clicks = Math.max(options?.clickCount ?? 0, existing.clickCount);
  const favorites = Math.max(
    options?.favoriteCount ?? 0,
    existing.favoriteCount,
    favCounts[spotId] ?? 0,
  );
  const ratingAverage = options?.ratingAverage ?? 0;
  let score = computeEngagementScore(clicks, favorites, ratingAverage, settings);
  let starCount = scoreToStarCount(score, settings.tiers);

  if (isSupabaseConfigured() && supabase && /^[0-9a-f-]{36}$/i.test(spotId)) {
    const clearPatch = {
      stars_source: 'auto' as const,
      admin_star_override: null as null,
      admin_star_override_at: null as null,
      admin_star_override_by: null as null,
    };
    await Promise.all([
      supabase.from('establishments').update(clearPatch).eq('id', spotId),
      supabase.from('tools').update(clearPatch).eq('id', spotId),
      supabase.from('loop_walks').update(clearPatch).eq('id', spotId),
    ]);

    const { error: walkCalcError } = await supabase.rpc('recalculate_walk_engagement', {
      p_walk_id: spotId,
    });
    const { error: calcError } = await supabase.rpc('recalculate_establishment_engagement', {
      p_establishment_id: spotId,
    });
    const { error: toolCalcError } = await supabase.rpc('recalculate_tool_engagement', {
      p_tool_id: spotId,
    });

    if (!calcError || !toolCalcError || !walkCalcError) {
      const [{ data: estData }, { data: toolData }, { data: walkData }] = await Promise.all([
        supabase
          .from('establishments')
          .select('engagement_score, star_count, click_count, favorite_count, rating_avg')
          .eq('id', spotId)
          .maybeSingle(),
        supabase
          .from('tools')
          .select('engagement_score, star_count, click_count, favorite_count, rating_avg')
          .eq('id', spotId)
          .maybeSingle(),
        supabase
          .from('loop_walks')
          .select('engagement_score, star_count, click_count, favorite_count, rating_avg')
          .eq('id', spotId)
          .maybeSingle(),
      ]);
      const data = walkData ?? toolData ?? estData;
      if (data) {
        score = Number(data.engagement_score ?? score);
        starCount = Number(data.star_count ?? starCount);
        map[spotId] = {
          clickCount: Number(data.click_count ?? clicks),
          favoriteCount: Number(data.favorite_count ?? favorites),
          engagementScore: score,
          starCount,
          starsSource: 'auto',
          adminStarOverride: null,
          lastCalcAt: new Date().toISOString(),
        };
        await saveEngagementMap(map);
        return { starCount, engagementScore: score };
      }
    }

    const fallbackPatch = {
      engagement_score: score,
      star_count: starCount,
      stars_source: 'auto' as const,
      admin_star_override: null as null,
      admin_star_override_at: null as null,
      admin_star_override_by: null as null,
    };
    await Promise.all([
      supabase.from('establishments').update(fallbackPatch).eq('id', spotId),
      supabase.from('tools').update(fallbackPatch).eq('id', spotId),
      supabase.from('loop_walks').update(fallbackPatch).eq('id', spotId),
    ]);
  }

  map[spotId] = {
    ...existing,
    clickCount: clicks,
    favoriteCount: favorites,
    engagementScore: score,
    starCount,
    starsSource: 'auto',
    adminStarOverride: null,
    lastCalcAt: new Date().toISOString(),
  };
  await saveEngagementMap(map);
  return { starCount, engagementScore: score };
}

type EngagementEnrichmentContext = {
  favCounts: Record<string, number>;
  engagementMap: Record<string, SpotEngagementRecord>;
  settingsByCountry: Map<string, SpotStarSettings>;
};

function countrySettingsKey(countryCode: string | null | undefined): string {
  return countryCode ?? '__GLOBAL__';
}

function enrichLocationWithContext(
  location: HomeLocation,
  ctx: EngagementEnrichmentContext,
): HomeLocation {
  const engagement = ctx.engagementMap[location.id] ?? null;
  const settings =
    ctx.settingsByCountry.get(countrySettingsKey(location.countryCode))
    ?? ctx.settingsByCountry.get('__GLOBAL__')
    ?? { ...EMPTY_SETTINGS, countryCode: location.countryCode ?? null, tiers: [...DEFAULT_TIERS] };
  const favoriteCount = Math.max(
    location.favoriteCount,
    ctx.favCounts[location.id] ?? 0,
    engagement?.favoriteCount ?? 0,
  );
  const clickCount = Math.max(location.clickCount, engagement?.clickCount ?? 0);
  const ratingAverage = location.ratingAvg ?? 0;

  const isAdminStars =
    location.starsSource === 'admin'
    || (engagement?.starsSource === 'admin' && engagement.adminStarOverride != null);

  if (isAdminStars) {
    const adminStars = engagement?.adminStarOverride ?? engagement?.starCount ?? location.starCount ?? 0;
    return {
      ...location,
      favoriteCount,
      clickCount,
      starCount: adminStars,
      starsSource: 'admin',
      engagementScore: engagement?.engagementScore ?? location.engagementScore,
    };
  }

  const score = computeEngagementScore(clickCount, favoriteCount, ratingAverage, settings);
  const starCount = scoreToStarCount(score, settings.tiers);

  return {
    ...location,
    favoriteCount,
    clickCount,
    starCount,
    starsSource: 'auto',
    engagementScore: score,
  };
}

async function buildEngagementEnrichmentContext(
  locations: HomeLocation[],
): Promise<EngagementEnrichmentContext> {
  const countryKeys = [...new Set(locations.map((loc) => countrySettingsKey(loc.countryCode)))];
  const [favCounts, engagementMap, ...settingsList] = await Promise.all([
    countSpotFavorites(),
    loadEngagementMap(),
    ...countryKeys.map((key) => getSpotStarSettings(key === '__GLOBAL__' ? null : key)),
  ]);
  const settingsByCountry = new Map<string, SpotStarSettings>();
  countryKeys.forEach((key, index) => {
    settingsByCountry.set(key, settingsList[index] ?? { ...EMPTY_SETTINGS, tiers: [...DEFAULT_TIERS] });
  });
  return { favCounts, engagementMap, settingsByCountry };
}

export async function enrichLocationWithEngagement(location: HomeLocation): Promise<HomeLocation> {
  const ctx = await buildEngagementEnrichmentContext([location]);
  return enrichLocationWithContext(location, ctx);
}

export async function enrichLocationsWithEngagement(locations: HomeLocation[]): Promise<HomeLocation[]> {
  if (locations.length === 0) return [];
  const ctx = await buildEngagementEnrichmentContext(locations);
  return locations.map((loc) => enrichLocationWithContext(loc, ctx));
}

export async function getTopSpotEngagementInsights(
  spots: HomeLocation[],
  countryCode: string,
  limit = 10,
): Promise<SpotEngagementInsight[]> {
  const settings = await getSpotStarSettings(countryCode);
  const enriched = await enrichLocationsWithEngagement(
    spots.filter((s) => !s.countryCode || s.countryCode === countryCode),
  );

  return enriched
    .map((spot) => ({
      id: spot.id,
      kind: 'spot' as const,
      title: spot.name,
      clickCount: spot.clickCount,
      favoriteCount: spot.favoriteCount,
      engagementScore: spot.engagementScore ?? computeEngagementScore(
        spot.clickCount,
        spot.favoriteCount,
        spot.ratingAvg ?? 0,
        settings,
      ),
      starCount: spot.starCount ?? 0,
      starsSource: spot.starsSource ?? 'auto',
      ratingAvg: spot.ratingAvg ?? 0,
      ratingCount: spot.ratingCount ?? 0,
    }))
    .sort(
      (a, b) =>
        b.engagementScore - a.engagementScore
        || b.favoriteCount - a.favoriteCount
        || b.clickCount - a.clickCount
        || b.ratingAvg - a.ratingAvg,
    )
    .slice(0, limit);
}
