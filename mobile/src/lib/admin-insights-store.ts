import AsyncStorage from '@react-native-async-storage/async-storage';
import { hydrateScoped, invalidateScope, peekScoped, scheduleScopedRefresh, scopedStorageKey } from '@/lib/swr-cache';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { listRegistryUsers } from '@/lib/user-registry-store';
import { loadDemoFavorites } from '@/lib/demo-auth';
import type { EventInsight, FavoriteInsight, SpotEngagementInsight, CategoryInsight, CategoryLeaderInsight, ContentTypeUsageInsight, PlebiscitedCategoryWinner, PlebiscitedContentItem, PlebiscitedByKind, WalkEngagementInsight, CornerInsight, ChroniqueInsight, PollInsight } from '@/lib/admin-types';
import type { Event } from '@/types';
import type { HomeLocation } from '@/lib/demo-data';
import { listAllLoopWalksForAdmin } from '@/lib/loop-walks-store';
import { getAllWalkClickCounts, getAllWalkFavoriteCounts, getAllWalkRatingStats } from '@/lib/walk-engagement-store';
import { countSpotFavorites } from '@/lib/spot-stars-store';
import {
  getBenefitInsightsDetails,
  getCatalogUsageStats,
  type BenefitInsightsDetails,
  type BenefitOverviewKpis,
  type CatalogUsageStat,
} from '@/lib/prime-benefits-store';
import {
  countDashboardActiveCatalogBenefits,
  isPartnerAssociatedBenefit,
  isStandaloneTheLoopBenefit,
  listBenefitCatalog,
} from '@/lib/benefit-catalog-store';
import { getEventCategoryLabel, getSpotCategoryLabel, getToolCategoryLabel, refreshCategoryLabelsCache } from '@/lib/category-labels-cache';
import type { EventCategory } from '@/types';

const LOCAL_FAV_KEY = 'loop_local_favorite_counts_v1';
const INSIGHTS_CACHE = 'loop_admin_insights_v5';
const ACCUEIL_INSIGHTS_TOP = 5;

async function filterInsightsCatalogBenefitStats(
  stats: CatalogUsageStat[],
  countryCode?: string,
): Promise<CatalogUsageStat[]> {
  const items = await listBenefitCatalog(false);
  const cc = countryCode?.toUpperCase().slice(0, 2);
  const scoped = cc
    ? items.filter((c) => !c.countryCode || c.countryCode.toUpperCase().slice(0, 2) === cc)
    : items;
  const allowed = new Set(
    scoped
      .filter((c) => isPartnerAssociatedBenefit(c) && !isStandaloneTheLoopBenefit(c))
      .map((c) => c.id),
  );
  return stats
    .filter((s) => allowed.has(s.catalogId))
    .sort((a, b) => b.granted - a.granted || b.used - a.used || a.title.localeCompare(b.title, 'fr'));
}

export type FullAdminInsights = Awaited<ReturnType<typeof buildFullAdminInsights>>;

function insightsScope(countryCode?: string, includePlatform = false): string {
  return `${countryCode ?? 'GN'}_${includePlatform ? 'platform' : 'core'}`;
}

/** Insights admin immédiats depuis le cache. */
export async function peekFullAdminInsights(
  countryCode?: string,
  includePlatform = false,
): Promise<FullAdminInsights | null> {
  const scope = insightsScope(countryCode, includePlatform);
  return peekScoped<FullAdminInsights>(scope, scopedStorageKey(INSIGHTS_CACHE, scope));
}

/** Invalide le cache Insights (core + platform) pour un pays. */
export function invalidateAdminInsightsCache(countryCode?: string): void {
  const cc = countryCode ?? 'GN';
  for (const includePlatform of [false, true]) {
    const scope = insightsScope(cc, includePlatform);
    invalidateScope(scope, scopedStorageKey(INSIGHTS_CACHE, scope));
  }
}

async function countLocalFavorites(): Promise<{ events: Record<string, number>; spots: Record<string, number> }> {
  const events: Record<string, number> = {};
  const spots: Record<string, number> = {};

  const users = await listRegistryUsers();
  for (const user of users) {
    const fav = await loadDemoFavorites(user.id);
    for (const id of fav.events) events[id] = (events[id] ?? 0) + 1;
    for (const id of fav.locations) spots[id] = (spots[id] ?? 0) + 1;
  }

  try {
    const raw = await AsyncStorage.getItem(LOCAL_FAV_KEY);
    if (raw) {
      const extra = JSON.parse(raw) as { events?: Record<string, number>; spots?: Record<string, number> };
      for (const [id, c] of Object.entries(extra.events ?? {})) events[id] = (events[id] ?? 0) + c;
      for (const [id, c] of Object.entries(extra.spots ?? {})) spots[id] = (spots[id] ?? 0) + c;
    }
  } catch {
    /* ignore */
  }

  return { events, spots };
}

async function countFavoriteEvents(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.from('favorite_events').select('event_id').limit(15);
    if (error) console.warn('[Insights] favorite_events:', error.message);
    for (const row of data ?? []) {
      const id = String(row.event_id);
      counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }

  const localCounts = await countLocalFavorites();
  return { ...localCounts.events };
}

async function countFavoriteSpotsAndTools(): Promise<Record<string, number>> {
  if (isSupabaseConfigured() && supabase) {
    return countSpotFavorites();
  }
  const localCounts = await countLocalFavorites();
  return { ...localCounts.spots };
}

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

async function fetchEventClickCountsFromDb(events: Event[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (!isSupabaseConfigured() || !supabase || !events.length) return counts;

  const ids = events.map((e) => e.id).filter(isValidUuid);
  if (!ids.length) return counts;

  const { data, error } = await supabase.from('events').select('id, click_count').in('id', ids).limit(15);
  if (error) {
    console.warn('[Insights] events click_count:', error.message);
    return counts;
  }
  for (const row of data ?? []) {
    counts[String(row.id)] = Number(row.click_count ?? 0);
  }
  return counts;
}

function mergeEventClickCounts(events: Event[], dbCounts: Record<string, number>): Event[] {
  return events.map((ev) => ({
    ...ev,
    clickCount: Math.max(ev.clickCount ?? 0, dbCounts[ev.id] ?? 0),
  }));
}

function buildWalkInsightRow(
  w: Awaited<ReturnType<typeof listAllLoopWalksForAdmin>>[number],
  walkFavCounts: Record<string, number>,
  walkClickCounts: Record<string, number>,
  walkRatingStats: Record<string, { avg: number; count: number }>,
): WalkEngagementInsight {
  const rating = walkRatingStats[w.id];
  return {
    id: w.id,
    kind: 'walk',
    title: w.title,
    favoriteCount: walkFavCounts[w.id] ?? w.favoriteCount ?? 0,
    clickCount: walkClickCounts[w.id] ?? w.clickCount ?? 0,
    ratingAvg: rating?.avg ?? w.ratingAvg ?? 0,
    ratingCount: rating?.count ?? w.ratingCount ?? 0,
    starCount: w.starCount ?? 0,
    engagementScore: w.engagementScore ?? 0,
    starsSource: w.starsSource ?? 'auto',
  };
}

function parsePollOptions(raw: unknown): Array<{ id: string; label: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id : null;
      const label = typeof row.label === 'string' ? row.label : null;
      if (!id || !label) return null;
      return { id, label };
    })
    .filter((o): o is { id: string; label: string } => o !== null);
}

export async function getAccueilEngagementInsights(countryCode?: string): Promise<{
  corners: CornerInsight[];
  chroniques: ChroniqueInsight[];
  polls: PollInsight[];
  logoCount: number;
}> {
  const corners: CornerInsight[] = [];
  const chroniques: ChroniqueInsight[] = [];
  const polls: PollInsight[] = [];

  if (!isSupabaseConfigured() || !supabase) {
    return { corners, chroniques, polls, logoCount: 0 };
  }

  let usersQuery = supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);
  if (countryCode) usersQuery = usersQuery.eq('country_code', countryCode);

  let cornersQuery = supabase
    .from('creator_corner_features')
    .select('id, title, person_name, click_count, period_label, is_active, country_code')
    .order('click_count', { ascending: false })
    .order('period_start', { ascending: false })
    .limit(100);
  if (countryCode) cornersQuery = cornersQuery.eq('country_code', countryCode);

  let chroniquesQuery = supabase
    .from('chronique_features')
    .select('id, title, person_name, click_count, period_label, is_active, country_code')
    .order('click_count', { ascending: false })
    .order('period_start', { ascending: false })
    .limit(100);
  if (countryCode) chroniquesQuery = chroniquesQuery.eq('country_code', countryCode);

  let pollsQuery = supabase
    .from('home_polls')
    .select('id, question, options, week_key, is_active, view_count, country_code, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (countryCode) pollsQuery = pollsQuery.eq('country_code', countryCode);

  let logosQuery = supabase
    .from('home_partner_logos')
    .select('id', { count: 'exact', head: true });
  if (countryCode) logosQuery = logosQuery.eq('country_code', countryCode);

  const [usersRes, cornersRes, chroniquesRes, pollsRes, logosRes] = await Promise.all([
    usersQuery,
    cornersQuery,
    chroniquesQuery,
    pollsQuery,
    logosQuery,
  ]);
  const totalUsers = usersRes.count ?? 0;

  if (usersRes.error) {
    console.warn('[Insights] users count:', usersRes.error.message);
  }

  for (const row of cornersRes.data ?? []) {
    corners.push({
      id: String(row.id),
      title: String(row.title ?? ''),
      personName: String(row.person_name ?? ''),
      clickCount: Number(row.click_count ?? 0),
      periodLabel: row.period_label != null ? String(row.period_label) : null,
      isActive: Boolean(row.is_active),
    });
  }

  for (const row of chroniquesRes.data ?? []) {
    chroniques.push({
      id: String(row.id),
      title: String(row.title ?? ''),
      personName: String(row.person_name ?? ''),
      clickCount: Number(row.click_count ?? 0),
      periodLabel: row.period_label != null ? String(row.period_label) : null,
      isActive: Boolean(row.is_active),
    });
  }

  const pollRows = pollsRes.data ?? [];
  const pollIds = pollRows.map((row) => String(row.id));
  const votesByPoll: Record<string, Record<string, number>> = {};

  if (pollIds.length > 0) {
    const { data: voteRows, error: voteErr } = await supabase
      .from('home_poll_votes')
      .select('poll_id, option_id')
      .in('poll_id', pollIds);

    if (voteErr) {
      console.warn('[Insights] home_poll_votes:', voteErr.message);
    } else {
      for (const vote of voteRows ?? []) {
        const pollId = String(vote.poll_id);
        const opt = String(vote.option_id);
        if (!votesByPoll[pollId]) votesByPoll[pollId] = {};
        votesByPoll[pollId][opt] = (votesByPoll[pollId][opt] ?? 0) + 1;
      }
    }
  }

  for (const pollRow of pollRows) {
    const pollId = String(pollRow.id);
    const options = parsePollOptions(pollRow.options);
    const counts = votesByPoll[pollId] ?? {};
    const responseCount = Object.values(counts).reduce((sum, c) => sum + c, 0);
    const viewCount = Number(pollRow.view_count ?? 0);
    const responseRate = viewCount > 0 ? (responseCount / viewCount) * 100 : 0;
    const userParticipationRate = totalUsers > 0 ? (responseCount / totalUsers) * 100 : 0;

    polls.push({
      id: pollId,
      question: String(pollRow.question ?? ''),
      isActive: Boolean(pollRow.is_active),
      weekKey: String(pollRow.week_key ?? ''),
      viewCount,
      responseCount,
      responseRate,
      totalUsers,
      userParticipationRate,
      options: options.map((opt) => ({
        optionId: opt.id,
        label: opt.label,
        voteCount: counts[opt.id] ?? 0,
        voteRate: responseCount > 0 ? ((counts[opt.id] ?? 0) / responseCount) * 100 : 0,
      })),
    });
  }

  return { corners, chroniques, polls, logoCount: logosRes.count ?? 0 };
}

export async function getTopFavoriteInsights(
  events: Event[],
  spots: HomeLocation[],
  limit = 5,
): Promise<{ events: FavoriteInsight[]; spots: FavoriteInsight[] }> {
  const eventTitles = new Map(events.map((e) => [e.id, e.title]));
  const spotTitles = new Map(spots.map((s) => [s.id, s.name]));

  const eventCounts = await countFavoriteEvents();
  const spotCounts = await countFavoriteSpotsAndTools();

  const topEvents = Object.entries(eventCounts)
    .filter(([id]) => eventTitles.has(id))
    .map(([id, favoriteCount]) => ({
      id,
      kind: 'event' as const,
      title: eventTitles.get(id)!,
      favoriteCount,
    }))
    .sort((a, b) => b.favoriteCount - a.favoriteCount)
    .slice(0, limit);

  const topSpots = Object.entries(spotCounts)
    .filter(([id]) => spotTitles.has(id))
    .map(([id, favoriteCount]) => ({
      id,
      kind: 'spot' as const,
      title: spotTitles.get(id)!,
      favoriteCount,
    }))
    .sort((a, b) => b.favoriteCount - a.favoriteCount)
    .slice(0, limit);

  return { events: topEvents, spots: topSpots };
}

function aggregateEventCategories(
  events: Event[],
  eventCounts: Record<string, number>,
): CategoryInsight[] {
  const buckets = new Map<EventCategory, CategoryInsight>();
  for (const ev of events) {
    const label = getEventCategoryLabel(ev.category);
    const existing = buckets.get(ev.category) ?? {
      key: ev.category,
      label,
      favoriteCount: 0,
      clickCount: 0,
      ratingAvg: 0,
      ratingCount: 0,
    };
    existing.favoriteCount += eventCounts[ev.id] ?? 0;
    existing.clickCount += ev.clickCount ?? 0;
    buckets.set(ev.category, existing);
  }
  return [...buckets.values()].sort(
    (a, b) => b.favoriteCount - a.favoriteCount || b.clickCount - a.clickCount || b.ratingCount - a.ratingCount,
  );
}

function aggregateSpotCategories(
  spots: HomeLocation[],
  spotCounts: Record<string, number>,
  toolIds: Set<string>,
  includeTools: boolean,
): CategoryInsight[] {
  const buckets = new Map<string, CategoryInsight & { ratingSum: number }>();
  for (const spot of spots) {
    const isTool = toolIds.has(spot.id) || spot.subCategory === 'tools';
    if (includeTools !== isTool) continue;
    const key = isTool ? 'tools' : spot.subCategory;
    const label = isTool ? getToolCategoryLabel(spot.toolCategory ?? 'tool') : getSpotCategoryLabel(spot.subCategory);
    const existing = buckets.get(key) ?? {
      key,
      label,
      favoriteCount: 0,
      clickCount: 0,
      ratingAvg: 0,
      ratingCount: 0,
      ratingSum: 0,
    };
    existing.favoriteCount += spotCounts[spot.id] ?? 0;
    existing.clickCount += spot.clickCount ?? 0;
    const count = spot.ratingCount ?? 0;
    const avg = spot.ratingAvg ?? 0;
    if (count > 0) {
      existing.ratingCount += count;
      existing.ratingSum += avg * count;
    }
    buckets.set(key, existing);
  }
  return [...buckets.values()]
    .map(({ ratingSum, ...rest }) => ({
      ...rest,
      ratingAvg: rest.ratingCount > 0 ? ratingSum / rest.ratingCount : 0,
    }))
    .sort(
      (a, b) =>
        b.favoriteCount - a.favoriteCount
        || b.clickCount - a.clickCount
        || b.ratingAvg - a.ratingAvg
        || b.ratingCount - a.ratingCount,
    );
}

function buildContentTypeUsage(
  events: Event[],
  spots: HomeLocation[],
  eventCounts: Record<string, number>,
  spotCounts: Record<string, number>,
  toolIds: Set<string>,
  walks: Awaited<ReturnType<typeof listAllLoopWalksForAdmin>>,
  walkFavCounts: Record<string, number>,
  walkClickCounts: Record<string, number>,
  walkRatingStats: Record<string, { avg: number; count: number }>,
): ContentTypeUsageInsight[] {
  const eventFav = events.reduce((sum, e) => sum + (eventCounts[e.id] ?? 0), 0);
  const eventClicks = events.reduce((sum, e) => sum + (e.clickCount ?? 0), 0);
  const pureSpots = spots.filter((s) => !toolIds.has(s.id) && s.subCategory !== 'tools');
  const tools = spots.filter((s) => toolIds.has(s.id) || s.subCategory === 'tools');
  const spotFav = pureSpots.reduce((sum, s) => sum + (spotCounts[s.id] ?? 0), 0);
  const spotClicks = pureSpots.reduce((sum, s) => sum + (s.clickCount ?? 0), 0);
  const toolFav = tools.reduce((sum, s) => sum + (spotCounts[s.id] ?? 0), 0);
  const toolClicks = tools.reduce((sum, s) => sum + (s.clickCount ?? 0), 0);

  const spotRatingCount = pureSpots.reduce((sum, s) => sum + (s.ratingCount ?? 0), 0);
  const spotRatingSum = pureSpots.reduce((sum, s) => sum + (s.ratingAvg ?? 0) * (s.ratingCount ?? 0), 0);
  const toolRatingCount = tools.reduce((sum, s) => sum + (s.ratingCount ?? 0), 0);
  const toolRatingSum = tools.reduce((sum, s) => sum + (s.ratingAvg ?? 0) * (s.ratingCount ?? 0), 0);

  const walkFav = walks.reduce((sum, w) => sum + (walkFavCounts[w.id] ?? w.favoriteCount ?? 0), 0);
  const walkClicks = walks.reduce((sum, w) => sum + (walkClickCounts[w.id] ?? w.clickCount ?? 0), 0);
  const walkRatingCount = walks.reduce(
    (sum, w) => sum + (walkRatingStats[w.id]?.count ?? w.ratingCount ?? 0),
    0,
  );
  const walkRatingSum = walks.reduce((sum, w) => {
    const count = walkRatingStats[w.id]?.count ?? w.ratingCount ?? 0;
    if (count <= 0) return sum;
    const avg = walkRatingStats[w.id]?.avg ?? w.ratingAvg ?? 0;
    return sum + avg * count;
  }, 0);
  const walkCount = walks.length;

  return [
    {
      kind: 'event' as const,
      label: 'Événements',
      totalFavorites: eventFav,
      totalClicks: eventClicks,
      totalRatingCount: 0,
      ratingAvg: 0,
      itemCount: events.length,
    },
    {
      kind: 'spot' as const,
      label: 'Spots',
      totalFavorites: spotFav,
      totalClicks: spotClicks,
      totalRatingCount: spotRatingCount,
      ratingAvg: spotRatingCount > 0 ? spotRatingSum / spotRatingCount : 0,
      itemCount: pureSpots.length,
    },
    {
      kind: 'tool' as const,
      label: 'Outils',
      totalFavorites: toolFav,
      totalClicks: toolClicks,
      totalRatingCount: toolRatingCount,
      ratingAvg: toolRatingCount > 0 ? toolRatingSum / toolRatingCount : 0,
      itemCount: tools.length,
    },
    {
      kind: 'walk' as const,
      label: 'Parcours',
      totalFavorites: walkFav,
      totalClicks: walkClicks,
      totalRatingCount: walkRatingCount,
      ratingAvg: walkRatingCount > 0 ? walkRatingSum / walkRatingCount : 0,
      itemCount: walkCount,
    },
  ].sort(
    (a, b) =>
      b.totalFavorites - a.totalFavorites
      || b.totalClicks - a.totalClicks
      || b.totalRatingCount - a.totalRatingCount
      || b.ratingAvg - a.ratingAvg,
  );
}

function appendAccueilPlatformRows(
  rows: ContentTypeUsageInsight[],
  corners: CornerInsight[],
  chroniques: ChroniqueInsight[],
  polls: PollInsight[],
): ContentTypeUsageInsight[] {
  const extra: ContentTypeUsageInsight[] = [];

  if (corners.length > 0) {
    extra.push({
      kind: 'corner',
      label: 'Le Singulier',
      totalFavorites: 0,
      totalClicks: corners.reduce((sum, corner) => sum + corner.clickCount, 0),
      totalRatingCount: 0,
      ratingAvg: 0,
      itemCount: corners.length,
    });
  }

  if (chroniques.length > 0) {
    extra.push({
      kind: 'chronique',
      label: 'Le Fragment',
      totalFavorites: 0,
      totalClicks: chroniques.reduce((sum, item) => sum + item.clickCount, 0),
      totalRatingCount: 0,
      ratingAvg: 0,
      itemCount: chroniques.length,
    });
  }

  if (polls.length > 0) {
    const pollVotes = polls.reduce((sum, poll) => sum + poll.responseCount, 0);
    const totalUsers = polls.find((poll) => poll.totalUsers > 0)?.totalUsers ?? 0;
    extra.push({
      kind: 'poll',
      label: 'Sondages',
      totalFavorites: pollVotes,
      totalClicks: 0,
      totalRatingCount: totalUsers,
      ratingAvg: totalUsers > 0 ? (pollVotes / totalUsers) * 100 : 0,
      itemCount: polls.length,
    });
  }

  if (!extra.length) return rows;

  return [...rows, ...extra].sort(
    (a, b) =>
      b.totalFavorites - a.totalFavorites
      || b.totalClicks - a.totalClicks
      || b.totalRatingCount - a.totalRatingCount
      || b.ratingAvg - a.ratingAvg,
  );
}

function buildEventCategoryLeaders(
  events: Event[],
  eventCounts: Record<string, number>,
  limit = 5,
): CategoryLeaderInsight[] {
  const buckets = new Map<string, Event[]>();
  for (const ev of events) {
    const keys = ev.categories?.length ? ev.categories : [ev.category];
    for (const key of keys) {
      const list = buckets.get(key) ?? [];
      list.push(ev);
      buckets.set(key, list);
    }
  }

  return [...buckets.entries()]
    .map(([categoryKey, list]) => {
      const top = [...list].sort(
        (a, b) =>
          (eventCounts[b.id] ?? 0) - (eventCounts[a.id] ?? 0)
          || (b.clickCount ?? 0) - (a.clickCount ?? 0),
      )[0];
      return {
        categoryKey,
        categoryLabel: getEventCategoryLabel(categoryKey as EventCategory),
        itemId: top.id,
        itemTitle: top.title,
        favoriteCount: eventCounts[top.id] ?? 0,
        clickCount: top.clickCount ?? 0,
        ratingAvg: 0,
        ratingCount: 0,
      };
    })
    .sort((a, b) => b.favoriteCount - a.favoriteCount || b.clickCount - a.clickCount)
    .slice(0, limit);
}

function buildLocationCategoryLeaders(
  spots: HomeLocation[],
  spotCounts: Record<string, number>,
  toolIds: Set<string>,
  includeTools: boolean,
  limit = 5,
): CategoryLeaderInsight[] {
  const buckets = new Map<string, HomeLocation[]>();
  for (const spot of spots) {
    const isTool = toolIds.has(spot.id) || spot.subCategory === 'tools';
    if (includeTools !== isTool) continue;
    const key = isTool ? (spot.toolCategory ?? 'tool') : (spot.categories?.[0] ?? spot.subCategory);
    const list = buckets.get(key) ?? [];
    list.push(spot);
    buckets.set(key, list);
  }

  return [...buckets.entries()]
    .map(([categoryKey, list]) => {
      const top = [...list].sort(
        (a, b) =>
          (spotCounts[b.id] ?? 0) - (spotCounts[a.id] ?? 0)
          || (b.clickCount ?? 0) - (a.clickCount ?? 0)
          || (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0)
          || (b.ratingCount ?? 0) - (a.ratingCount ?? 0),
      )[0];
      const isTool = toolIds.has(top.id) || top.subCategory === 'tools';
      const label = isTool
        ? getToolCategoryLabel(top.toolCategory ?? 'tool')
        : getSpotCategoryLabel(top.subCategory);
      return {
        categoryKey,
        categoryLabel: label,
        itemId: top.id,
        itemTitle: top.name,
        favoriteCount: spotCounts[top.id] ?? 0,
        clickCount: top.clickCount ?? 0,
        ratingAvg: top.ratingAvg ?? 0,
        ratingCount: top.ratingCount ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.favoriteCount - a.favoriteCount
        || b.clickCount - a.clickCount
        || b.ratingAvg - a.ratingAvg
        || b.ratingCount - a.ratingCount,
    )
    .slice(0, limit);
}

export async function getFullAdminInsights(
  events: Event[],
  spots: HomeLocation[],
  limit = 5,
  toolIds: Set<string> = new Set(spots.filter((s) => s.subCategory === 'tools').map((s) => s.id)),
  countryCode?: string,
  includePlatformInsights = false,
  options?: { force?: boolean },
): Promise<{
  eventsByFavorites: EventInsight[];
  eventsByClicks: EventInsight[];
  spotsByFavorites: SpotEngagementInsight[];
  spotsByClicks: SpotEngagementInsight[];
  spotsByStars: SpotEngagementInsight[];
  spotsByRatings: SpotEngagementInsight[];
  topEventCategories: CategoryInsight[];
  topSpotCategories: CategoryInsight[];
  topToolCategories: CategoryInsight[];
  eventCategoryLeaders: CategoryLeaderInsight[];
  spotCategoryLeaders: CategoryLeaderInsight[];
  toolCategoryLeaders: CategoryLeaderInsight[];
  contentTypeUsage: ContentTypeUsageInsight[];
  walksByFavorites: WalkEngagementInsight[];
  walksByClicks: WalkEngagementInsight[];
  walksByRatings: WalkEngagementInsight[];
  benefitKpis: BenefitOverviewKpis;
  benefitDetails: BenefitInsightsDetails;
  /** Catalogue actif + partenaire associé + validation partenaire si requise. */
  validatedCatalogActive: number;
  catalogBenefitStats: CatalogUsageStat[];
  platformCounts: {
    corners: number;
    chroniques: number;
    polls: number;
    walksPublished: number;
    logos: number;
  };
  cornersByClicks: CornerInsight[];
  chroniquesByClicks: ChroniqueInsight[];
  pollInsights: PollInsight[];
}> {
  const scope = insightsScope(countryCode, includePlatformInsights);
  const diskKey = scopedStorageKey(INSIGHTS_CACHE, scope);

  if (options?.force) {
    invalidateScope(scope, diskKey);
  } else {
    const cached = await peekFullAdminInsights(countryCode, includePlatformInsights);
    if (cached) {
      scheduleScopedRefresh(
        `insights_${scope}`,
        async () => buildFullAdminInsights(events, spots, limit, toolIds, countryCode, includePlatformInsights),
        undefined,
        async (fresh) => hydrateScoped(scope, diskKey, fresh),
      );
      return cached;
    }
  }

  const fresh = await buildFullAdminInsights(events, spots, limit, toolIds, countryCode, includePlatformInsights);
  await hydrateScoped(scope, diskKey, fresh);
  return fresh;
}

async function buildFullAdminInsights(
  events: Event[],
  spots: HomeLocation[],
  limit = 5,
  toolIds: Set<string> = new Set(spots.filter((s) => s.subCategory === 'tools').map((s) => s.id)),
  countryCode?: string,
  includePlatformInsights = false,
): Promise<{
  eventsByFavorites: EventInsight[];
  eventsByClicks: EventInsight[];
  spotsByFavorites: SpotEngagementInsight[];
  spotsByClicks: SpotEngagementInsight[];
  spotsByStars: SpotEngagementInsight[];
  spotsByRatings: SpotEngagementInsight[];
  topEventCategories: CategoryInsight[];
  topSpotCategories: CategoryInsight[];
  topToolCategories: CategoryInsight[];
  eventCategoryLeaders: CategoryLeaderInsight[];
  spotCategoryLeaders: CategoryLeaderInsight[];
  toolCategoryLeaders: CategoryLeaderInsight[];
  contentTypeUsage: ContentTypeUsageInsight[];
  walksByFavorites: WalkEngagementInsight[];
  walksByClicks: WalkEngagementInsight[];
  walksByRatings: WalkEngagementInsight[];
  benefitKpis: BenefitOverviewKpis;
  benefitDetails: BenefitInsightsDetails;
  /** Catalogue actif + partenaire associé + validation partenaire si requise. */
  validatedCatalogActive: number;
  catalogBenefitStats: CatalogUsageStat[];
  platformCounts: {
    corners: number;
    chroniques: number;
    polls: number;
    walksPublished: number;
    logos: number;
  };
  cornersByClicks: CornerInsight[];
  chroniquesByClicks: ChroniqueInsight[];
  pollInsights: PollInsight[];
}> {
  await refreshCategoryLabelsCache();
  const walks = await listAllLoopWalksForAdmin(countryCode);
  const walkIds = new Set(walks.map((w) => w.id));
  const [walkFavAll, walkClickAll, walkRatingAll, benefitDetails, catalogBenefitStats, dbEventClicks, accueilInsights] =
    await Promise.all([
    getAllWalkFavoriteCounts(),
    getAllWalkClickCounts(),
    getAllWalkRatingStats(),
    getBenefitInsightsDetails(countryCode),
    getCatalogUsageStats(countryCode),
    fetchEventClickCountsFromDb(events),
    includePlatformInsights
      ? getAccueilEngagementInsights(countryCode)
      : Promise.resolve({ corners: [], chroniques: [], polls: [], logoCount: 0 }),
  ]);
  const benefitKpis = benefitDetails.allGrants;
  const validatedCatalogActive = benefitDetails.catalogActiveAssociated;
  const walksPublished = walks.filter((w) => w.isPublished !== false).length;
  const platformCounts = {
    corners: accueilInsights.corners.length,
    chroniques: accueilInsights.chroniques.length,
    polls: accueilInsights.polls.length,
    walksPublished,
    logos: accueilInsights.logoCount,
  };
  const catalogStatsFiltered = await filterInsightsCatalogBenefitStats(
    catalogBenefitStats,
    countryCode,
  );
  const walkFavCounts = Object.fromEntries(
    Object.entries(walkFavAll).filter(([id]) => walkIds.has(id)),
  );
  const walkClickCounts = Object.fromEntries(
    Object.entries(walkClickAll).filter(([id]) => walkIds.has(id)),
  );
  const walkRatingStats = Object.fromEntries(
    Object.entries(walkRatingAll).filter(([id]) => walkIds.has(id)),
  );
  const eventsWithClicks = mergeEventClickCounts(events, dbEventClicks);
  const allWalkRows = walks.map((w) => buildWalkInsightRow(w, walkFavCounts, walkClickCounts, walkRatingStats));
  const fav = await getTopFavoriteInsights(eventsWithClicks, spots, limit);
  const eventMap = new Map(eventsWithClicks.map((e) => [e.id, e]));

  const eventsByFavorites: EventInsight[] = fav.events.map((item) => {
    const ev = eventMap.get(item.id);
    return {
      ...item,
      venueName: ev?.venueName ?? null,
      clickCount: ev?.clickCount ?? 0,
    };
  });

  const eventsByClicks: EventInsight[] = [...eventsWithClicks]
    .filter((e) => (e.clickCount ?? 0) > 0)
    .sort((a, b) => b.clickCount - a.clickCount)
    .slice(0, limit)
    .map((ev) => ({
      id: ev.id,
      kind: 'event' as const,
      title: ev.title,
      favoriteCount: fav.events.find((f) => f.id === ev.id)?.favoriteCount ?? 0,
      venueName: ev.venueName,
      clickCount: ev.clickCount,
    }));

  const { enrichLocationsWithEngagement } = await import('@/lib/spot-stars-store');
  const enriched = await enrichLocationsWithEngagement(spots);

  const toSpotInsight = (s: HomeLocation): SpotEngagementInsight => ({
    id: s.id,
    kind: 'spot',
    title: s.name,
    favoriteCount: s.favoriteCount,
    clickCount: s.clickCount,
    engagementScore: s.engagementScore ?? 0,
    starCount: s.starCount ?? 0,
    starsSource: s.starsSource ?? 'auto',
    ratingAvg: s.ratingAvg ?? 0,
    ratingCount: s.ratingCount ?? 0,
  });

  const spotsByFavorites = [...enriched]
    .sort(
      (a, b) =>
        b.favoriteCount - a.favoriteCount
        || b.clickCount - a.clickCount
        || (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0),
    )
    .slice(0, limit)
    .map(toSpotInsight);

  const spotsByClicks = [...enriched]
    .sort(
      (a, b) =>
        b.clickCount - a.clickCount
        || b.favoriteCount - a.favoriteCount
        || (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0),
    )
    .slice(0, limit)
    .map(toSpotInsight);

  const spotsByStars = [...enriched]
    .sort(
      (a, b) =>
        (b.starCount ?? 0) - (a.starCount ?? 0)
        || (b.engagementScore ?? 0) - (a.engagementScore ?? 0)
        || (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0),
    )
    .slice(0, limit)
    .map(toSpotInsight);

  const spotsByRatings = [...enriched]
    .filter((s) => (s.ratingCount ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0)
        || (b.ratingCount ?? 0) - (a.ratingCount ?? 0)
        || b.favoriteCount - a.favoriteCount,
    )
    .slice(0, limit)
    .map(toSpotInsight);

  const eventCounts = await countFavoriteEvents();
  const spotCounts = await countFavoriteSpotsAndTools();

  return {
    eventsByFavorites,
    eventsByClicks,
    spotsByFavorites,
    spotsByClicks,
    spotsByStars,
    spotsByRatings,
    topEventCategories: aggregateEventCategories(eventsWithClicks, eventCounts).slice(0, limit),
    topSpotCategories: aggregateSpotCategories(enriched, spotCounts, toolIds, false).slice(0, limit),
    topToolCategories: aggregateSpotCategories(enriched, spotCounts, toolIds, true).slice(0, limit),
    eventCategoryLeaders: buildEventCategoryLeaders(eventsWithClicks, eventCounts, limit),
    spotCategoryLeaders: buildLocationCategoryLeaders(enriched, spotCounts, toolIds, false, limit),
    toolCategoryLeaders: buildLocationCategoryLeaders(enriched, spotCounts, toolIds, true, limit),
    contentTypeUsage: includePlatformInsights
      ? appendAccueilPlatformRows(
          buildContentTypeUsage(
            eventsWithClicks,
            enriched,
            eventCounts,
            spotCounts,
            toolIds,
            walks,
            walkFavCounts,
            walkClickCounts,
            walkRatingStats,
          ),
          accueilInsights.corners,
          accueilInsights.chroniques,
          accueilInsights.polls,
        )
      : buildContentTypeUsage(
          eventsWithClicks,
          enriched,
          eventCounts,
          spotCounts,
          toolIds,
          walks,
          walkFavCounts,
          walkClickCounts,
          walkRatingStats,
        ),
    walksByFavorites: [...allWalkRows].sort(
      (a, b) => b.favoriteCount - a.favoriteCount || b.clickCount - a.clickCount || b.ratingCount - a.ratingCount,
    ),
    walksByClicks: [...allWalkRows].sort(
      (a, b) => b.clickCount - a.clickCount || b.favoriteCount - a.favoriteCount,
    ),
    walksByRatings: [...allWalkRows].sort(
      (a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount || b.clickCount - a.clickCount,
    ),
    benefitKpis,
    benefitDetails,
    validatedCatalogActive,
    catalogBenefitStats: catalogStatsFiltered,
    platformCounts,
    cornersByClicks: accueilInsights.corners.slice(0, ACCUEIL_INSIGHTS_TOP),
    chroniquesByClicks: accueilInsights.chroniques.slice(0, ACCUEIL_INSIGHTS_TOP),
    pollInsights: accueilInsights.polls.slice(0, ACCUEIL_INSIGHTS_TOP),
  };
}

function hasPlebiscitedEngagement(category: CategoryInsight | null | undefined): category is CategoryInsight {
  if (!category) return false;
  return category.favoriteCount > 0 || category.clickCount > 0 || category.ratingCount > 0;
}

export function extractPlebiscitedWinners(
  data: Pick<
    Awaited<ReturnType<typeof getFullAdminInsights>>,
    'topEventCategories' | 'topSpotCategories' | 'topToolCategories' | 'contentTypeUsage'
  >,
): PlebiscitedCategoryWinner[] {
  const itemCountByKind = new Map(data.contentTypeUsage.map((row) => [row.kind, row.itemCount]));

  return [
    { kind: 'event' as const, kindLabel: 'Événement', category: data.topEventCategories[0] ?? null },
    { kind: 'spot' as const, kindLabel: 'Spot', category: data.topSpotCategories[0] ?? null },
    { kind: 'tool' as const, kindLabel: 'Outil', category: data.topToolCategories[0] ?? null },
  ].filter((winner) => {
    if ((itemCountByKind.get(winner.kind) ?? 0) === 0) return false;
    return hasPlebiscitedEngagement(winner.category);
  });
}

export async function getPlebiscitedWinners(
  events: Event[],
  spots: HomeLocation[],
  toolIds?: Set<string>,
): Promise<PlebiscitedCategoryWinner[]> {
  const ids = toolIds ?? new Set(spots.filter((s) => s.subCategory === 'tools').map((s) => s.id));
  const data = await getFullAdminInsights(events, spots, 1, ids);
  return extractPlebiscitedWinners(data);
}

function hasItemEngagement(favoriteCount: number, clickCount: number, ratingCount = 0): boolean {
  return favoriteCount > 0 || clickCount > 0 || ratingCount > 0;
}

function toPlebiscitedItem(
  kind: PlebiscitedContentItem['kind'],
  kindLabel: string,
  id: string,
  title: string,
  favoriteCount: number,
  clickCount: number,
  ratingAvg = 0,
  ratingCount = 0,
): PlebiscitedContentItem {
  return { kind, kindLabel, id, title, favoriteCount, clickCount, ratingAvg, ratingCount };
}

export function extractTopPlebiscitedByKind(
  data: Awaited<ReturnType<typeof getFullAdminInsights>>,
  toolIds: Set<string>,
  limit = 5,
): PlebiscitedByKind {
  const events = data.eventsByFavorites
    .filter((item) => hasItemEngagement(item.favoriteCount, item.clickCount ?? 0))
    .slice(0, limit)
    .map((item) =>
      toPlebiscitedItem('event', 'Événement', item.id, item.title, item.favoriteCount, item.clickCount ?? 0),
    );

  const spots = data.spotsByFavorites
    .filter((item) => !toolIds.has(item.id) && hasItemEngagement(item.favoriteCount, item.clickCount, item.ratingCount))
    .slice(0, limit)
    .map((item) =>
      toPlebiscitedItem(
        'spot',
        'Spot',
        item.id,
        item.title,
        item.favoriteCount,
        item.clickCount,
        item.ratingAvg,
        item.ratingCount,
      ),
    );

  const tools = data.spotsByFavorites
    .filter((item) => toolIds.has(item.id) && hasItemEngagement(item.favoriteCount, item.clickCount, item.ratingCount))
    .slice(0, limit)
    .map((item) =>
      toPlebiscitedItem(
        'tool',
        'Outil',
        item.id,
        item.title,
        item.favoriteCount,
        item.clickCount,
        item.ratingAvg,
        item.ratingCount,
      ),
    );

  return { events, spots, tools };
}

export async function getTopPlebiscitedByKind(
  events: Event[],
  spots: HomeLocation[],
  limit = 5,
  toolIds?: Set<string>,
): Promise<PlebiscitedByKind> {
  const ids = toolIds ?? new Set(spots.filter((s) => s.subCategory === 'tools').map((s) => s.id));
  const data = await getFullAdminInsights(events, spots, limit, ids);
  return extractTopPlebiscitedByKind(data, ids, limit);
}
