import {
  filterActiveAssociatedCatalogStats,
  getBenefitInsightsDetails,
  getCatalogUsageStats,
  listBenefitCatalog,
  type BenefitInsightsDetails,
  type BenefitKpis,
  type CatalogUsageStat,
} from './privileges';
import { sortLoopPerfRows, type LoopPerfMetricTab } from './loop-perf-sort';
import type { LoopPerfScoreWeights } from './loop-perf-score-weights';
import {
  loadCatalogPerformance,
  type TeamLoopPerfRow,
} from './team-loop-performance';
import { supabase } from './supabase';

export interface InsightRow {
  id: string;
  title: string;
  metric: number;
  subtitle?: string | null;
}

export interface CatalogCounts {
  events: number;
  spots: number;
  tools: number;
  walks: number;
}

export interface ContentStatusMacro {
  published: number;
  archived: number;
  deactivated: number;
  draft: number;
}

export interface ContentMacroCounts {
  events: ContentStatusMacro;
  spots: ContentStatusMacro;
  tools: ContentStatusMacro;
}

export interface PlatformCounts {
  corners: number;
  chroniques: number;
  polls: number;
  walksPublished: number;
  logos: number;
}

export type ContentTypeUsageKind =
  | 'event'
  | 'spot'
  | 'tool'
  | 'walk'
  | 'corner'
  | 'chronique'
  | 'poll';

export interface ContentTypeUsageRow {
  kind: ContentTypeUsageKind;
  label: string;
  totalFavorites: number;
  totalClicks: number;
  totalRatingCount: number;
  ratingAvg: number;
  itemCount: number;
}

export interface PlatformCornerRow {
  id: string;
  title: string;
  personName: string;
  clickCount: number;
  isActive: boolean;
}

export interface PlatformPollOptionRow {
  optionId: string;
  label: string;
  voteCount: number;
  voteRate: number;
}

export interface PlatformPollRow {
  id: string;
  question: string;
  isActive: boolean;
  viewCount: number;
  responseCount: number;
  responseRate: number;
  userParticipationRate: number;
  options: PlatformPollOptionRow[];
}

export interface WalkInsightRow {
  id: string;
  title: string;
  clicks: number;
  favorites: number;
  stars: number;
  ratingAvg: number;
  ratingCount: number;
  displayLine: string;
}

export interface InsightsBundle {
  counts: CatalogCounts;
  /** Top 10 clics (rétrocompat). */
  eventsByClicks: InsightRow[];
  spotsByClicks: InsightRow[];
  toolsByClicks: InsightRow[];
  eventsByEngagement: InsightRow[];
  spotsByEngagement: InsightRow[];
  toolsByEngagement: InsightRow[];
  perf: {
    events: TeamLoopPerfRow[];
    spots: TeamLoopPerfRow[];
    tools: TeamLoopPerfRow[];
    weights: LoopPerfScoreWeights;
  };
  contentTypeUsage: ContentTypeUsageRow[];
  contentMacro: ContentMacroCounts;
  validatedCatalogActive: number;
  benefitKpis: BenefitKpis;
  benefitDetails: BenefitInsightsDetails;
  catalogStats: CatalogUsageStat[];
  platformCounts: PlatformCounts;
  platform: {
    corners: PlatformCornerRow[];
    chroniques: PlatformCornerRow[];
    polls: PlatformPollRow[];
    walks: WalkInsightRow[];
  };
  error?: string;
}

const TEAM_ORIGINS = ['admin', 'loop'];
const TOP_LEGACY = 10;
const TOP_INSIGHTS = 5;

const EMPTY_STATUS_MACRO: ContentStatusMacro = {
  published: 0,
  archived: 0,
  deactivated: 0,
  draft: 0,
};

async function countContentStatusForTable(
  table: 'events' | 'establishments' | 'tools',
  countryCode: string,
  spotToolsOnly?: 'spots' | 'tools',
): Promise<ContentStatusMacro> {
  const cc = countryCode.toUpperCase().slice(0, 2);
  let q = supabase.from(table).select('content_status').eq('country_code', cc);
  if (table === 'establishments' && spotToolsOnly === 'spots') {
    q = q.not('category_slugs', 'cs', '{tools}');
  }
  if (table === 'establishments' && spotToolsOnly === 'tools') {
    q = q.contains('category_slugs', ['tools']);
  }
  const { data, error } = await q.limit(8000);
  if (error) return { ...EMPTY_STATUS_MACRO };
  const macro = { ...EMPTY_STATUS_MACRO };
  for (const row of data ?? []) {
    const status = String((row as { content_status?: string }).content_status ?? 'draft');
    if (status === 'published') macro.published += 1;
    else if (status === 'archived') macro.archived += 1;
    else if (status === 'deactivated') macro.deactivated += 1;
    else macro.draft += 1;
  }
  return macro;
}

async function loadContentMacroCounts(countryCode: string): Promise<ContentMacroCounts> {
  const [events, spots, tools] = await Promise.all([
    countContentStatusForTable('events', countryCode),
    countContentStatusForTable('establishments', countryCode, 'spots'),
    countContentStatusForTable('tools', countryCode),
  ]);
  return { events, spots, tools };
}

function toInsightRows(
  rows: TeamLoopPerfRow[],
  metric: 'clicks' | 'engagement',
  weights: LoopPerfScoreWeights,
): InsightRow[] {
  const sorted =
    metric === 'clicks' ? sortLoopPerfRows(rows, 'clicks', weights) : sortLoopPerfRows(rows, 'all', weights);
  return sorted.slice(0, TOP_LEGACY).map((r) => ({
    id: r.id,
    title: r.title,
    metric: metric === 'clicks' ? r.clicks : r.sortScore,
    subtitle: r.displayLine,
  }));
}

function buildContentTypeUsage(
  events: TeamLoopPerfRow[],
  spots: TeamLoopPerfRow[],
  tools: TeamLoopPerfRow[],
  walks: WalkInsightRow[],
  platform: InsightsBundle['platform'],
): ContentTypeUsageRow[] {
  const sum = (rows: TeamLoopPerfRow[]) => ({
    fav: rows.reduce((s, r) => s + r.favorites, 0),
    clicks: rows.reduce((s, r) => s + r.clicks, 0),
    ratingCount: rows.reduce((s, r) => s + r.ratingCount, 0),
    ratingSum: rows.reduce((s, r) => s + r.ratingAvg * r.ratingCount, 0),
  });

  const ev = sum(events);
  const sp = sum(spots);
  const tl = sum(tools);
  const wk = {
    fav: walks.reduce((s, r) => s + r.favorites, 0),
    clicks: walks.reduce((s, r) => s + r.clicks, 0),
    ratingCount: walks.reduce((s, r) => s + r.ratingCount, 0),
    ratingSum: walks.reduce((s, r) => s + r.ratingAvg * r.ratingCount, 0),
  };

  const base: ContentTypeUsageRow[] = [
    {
      kind: 'event',
      label: 'Événements',
      totalFavorites: ev.fav,
      totalClicks: ev.clicks,
      totalRatingCount: 0,
      ratingAvg: 0,
      itemCount: events.length,
    },
    {
      kind: 'spot',
      label: 'Spots',
      totalFavorites: sp.fav,
      totalClicks: sp.clicks,
      totalRatingCount: sp.ratingCount,
      ratingAvg: sp.ratingCount > 0 ? sp.ratingSum / sp.ratingCount : 0,
      itemCount: spots.length,
    },
    {
      kind: 'tool',
      label: 'Outils',
      totalFavorites: tl.fav,
      totalClicks: tl.clicks,
      totalRatingCount: tl.ratingCount,
      ratingAvg: tl.ratingCount > 0 ? tl.ratingSum / tl.ratingCount : 0,
      itemCount: tools.length,
    },
    {
      kind: 'walk',
      label: 'Parcours',
      totalFavorites: wk.fav,
      totalClicks: wk.clicks,
      totalRatingCount: wk.ratingCount,
      ratingAvg: wk.ratingCount > 0 ? wk.ratingSum / wk.ratingCount : 0,
      itemCount: walks.length,
    },
  ];

  const extra: ContentTypeUsageRow[] = [];
  if (platform.corners.length) {
    extra.push({
      kind: 'corner',
      label: 'Le Singulier',
      totalFavorites: 0,
      totalClicks: platform.corners.reduce((s, c) => s + c.clickCount, 0),
      totalRatingCount: 0,
      ratingAvg: 0,
      itemCount: platform.corners.length,
    });
  }
  if (platform.chroniques.length) {
    extra.push({
      kind: 'chronique',
      label: 'Le Fragment',
      totalFavorites: 0,
      totalClicks: platform.chroniques.reduce((s, c) => s + c.clickCount, 0),
      totalRatingCount: 0,
      ratingAvg: 0,
      itemCount: platform.chroniques.length,
    });
  }
  if (platform.polls.length) {
    const votes = platform.polls.reduce((s, p) => s + p.responseCount, 0);
    const users = platform.polls.find((p) => p.viewCount > 0)?.viewCount ?? 0;
    extra.push({
      kind: 'poll',
      label: 'Sondages',
      totalFavorites: votes,
      totalClicks: 0,
      totalRatingCount: users,
      ratingAvg: users > 0 ? (votes / users) * 100 : 0,
      itemCount: platform.polls.length,
    });
  }

  return [...base, ...extra].sort(
    (a, b) =>
      b.totalFavorites - a.totalFavorites
      || b.totalClicks - a.totalClicks
      || b.totalRatingCount - a.totalRatingCount
      || b.ratingAvg - a.ratingAvg,
  );
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

async function loadPlatformInsights(countryCode: string): Promise<{
  platform: InsightsBundle['platform'];
  platformCounts: PlatformCounts;
}> {
  const cc = countryCode.toUpperCase().slice(0, 2);

  const [cornersRes, chroniquesRes, pollsRes, walksRes, logosRes, usersRes] = await Promise.all([
    supabase
      .from('creator_corner_features')
      .select('id, title, person_name, click_count, is_active')
      .eq('country_code', cc)
      .order('click_count', { ascending: false })
      .limit(100),
    supabase
      .from('chronique_features')
      .select('id, title, person_name, click_count, is_active')
      .eq('country_code', cc)
      .order('click_count', { ascending: false })
      .limit(100),
    supabase
      .from('home_polls')
      .select('id, question, options, is_active, view_count')
      .eq('country_code', cc)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('loop_walks')
      .select(
        'id, title, click_count, favorite_count, star_count, rating_avg, rating_count, is_published',
      )
      .eq('country_code', cc)
      .eq('is_published', true)
      .limit(200),
    supabase
      .from('home_partner_logos')
      .select('id', { count: 'exact', head: true })
      .eq('country_code', cc),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('country_code', cc),
  ]);

  const corners: PlatformCornerRow[] = (cornersRes.data ?? []).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    personName: String(r.person_name ?? ''),
    clickCount: Number(r.click_count ?? 0),
    isActive: Boolean(r.is_active),
  }));

  const chroniques: PlatformCornerRow[] = (chroniquesRes.data ?? []).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    personName: String(r.person_name ?? ''),
    clickCount: Number(r.click_count ?? 0),
    isActive: Boolean(r.is_active),
  }));

  const pollRows = pollsRes.data ?? [];
  const pollIds = pollRows.map((r) => String(r.id));
  const votesByPoll: Record<string, Record<string, number>> = {};
  if (pollIds.length) {
    const { data: voteRows } = await supabase
      .from('home_poll_votes')
      .select('poll_id, option_id')
      .in('poll_id', pollIds);
    for (const vote of voteRows ?? []) {
      const pollId = String(vote.poll_id);
      const opt = String(vote.option_id);
      if (!votesByPoll[pollId]) votesByPoll[pollId] = {};
      votesByPoll[pollId][opt] = (votesByPoll[pollId][opt] ?? 0) + 1;
    }
  }

  const totalUsers = usersRes.count ?? 0;
  const polls: PlatformPollRow[] = pollRows.map((pollRow) => {
    const pollId = String(pollRow.id);
    const options = parsePollOptions(pollRow.options);
    const counts = votesByPoll[pollId] ?? {};
    const responseCount = Object.values(counts).reduce((sum, c) => sum + c, 0);
    const viewCount = Number(pollRow.view_count ?? 0);
    return {
      id: pollId,
      question: String(pollRow.question ?? ''),
      isActive: Boolean(pollRow.is_active),
      viewCount,
      responseCount,
      responseRate: viewCount > 0 ? (responseCount / viewCount) * 100 : 0,
      userParticipationRate: totalUsers > 0 ? (responseCount / totalUsers) * 100 : 0,
      options: options.map((opt) => ({
        optionId: opt.id,
        label: opt.label,
        voteCount: counts[opt.id] ?? 0,
        voteRate: responseCount > 0 ? ((counts[opt.id] ?? 0) / responseCount) * 100 : 0,
      })),
    };
  });

  const walks: WalkInsightRow[] = (walksRes.data ?? []).map((w) => {
    const clicks = Number(w.click_count ?? 0);
    const favorites = Number(w.favorite_count ?? 0);
    const ratingAvg = Number(w.rating_avg ?? 0);
    const ratingCount = Number(w.rating_count ?? 0);
    const stars = Number(w.star_count ?? 0);
    const ratingMeta =
      ratingCount > 0
        ? `${ratingAvg.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/5 · ${ratingCount} avis`
        : '0 avis';
    return {
      id: String(w.id),
      title: String(w.title ?? 'Parcours'),
      clicks,
      favorites,
      stars,
      ratingAvg,
      ratingCount,
      displayLine: `${favorites} favori${favorites > 1 ? 's' : ''} · ${clicks} clic${clicks > 1 ? 's' : ''} · ${stars}★ · ${ratingMeta}`,
    };
  });

  if (cornersRes.error || chroniquesRes.error || pollsRes.error || walksRes.error) {
    console.warn('[insights] platform', [
      cornersRes.error?.message,
      chroniquesRes.error?.message,
      pollsRes.error?.message,
      walksRes.error?.message,
    ].filter(Boolean).join(' · '));
  }

  const platformCounts: PlatformCounts = {
    corners: corners.length,
    chroniques: chroniques.length,
    polls: polls.length,
    walksPublished: walks.length,
    logos: logosRes.count ?? 0,
  };

  return {
    platform: { corners, chroniques, polls, walks },
    platformCounts,
  };
}

export function pickTopPerfRows(
  rows: TeamLoopPerfRow[],
  metric: LoopPerfMetricTab,
  weights: LoopPerfScoreWeights,
  limit = TOP_INSIGHTS,
): TeamLoopPerfRow[] {
  return sortLoopPerfRows(rows, metric, weights).slice(0, limit);
}

export async function loadInsights(
  countryCode: string,
  options?: { teamOnly?: boolean; includePlatform?: boolean },
): Promise<InsightsBundle> {
  const origins = options?.teamOnly ? TEAM_ORIGINS : undefined;
  const includePlatform = options?.includePlatform !== false;

  const [perf, benefitDetails, catalogStatsRaw, catalogList, contentMacro, platformBundle] =
    await Promise.all([
      loadCatalogPerformance(countryCode, origins ? { origins } : undefined),
      getBenefitInsightsDetails(countryCode),
      getCatalogUsageStats(countryCode),
      listBenefitCatalog(countryCode),
      loadContentMacroCounts(countryCode),
      includePlatform
        ? loadPlatformInsights(countryCode)
        : Promise.resolve({
            platform: {
              corners: [],
              chroniques: [],
              polls: [],
              walks: [] as WalkInsightRow[],
            },
            platformCounts: {
              corners: 0,
              chroniques: 0,
              polls: 0,
              walksPublished: 0,
              logos: 0,
            },
          }),
    ]);

  const platform = platformBundle.platform;
  const platformCounts = platformBundle.platformCounts;
  const benefitKpis = benefitDetails.allGrants;
  const validatedCatalogActive = benefitDetails.catalogActiveAssociated;

  const catalogStats = filterActiveAssociatedCatalogStats(catalogStatsRaw, catalogList.items).filter(
    (s) => s.granted > 0,
  );

  const contentTypeUsage = buildContentTypeUsage(
    perf.events,
    perf.spots,
    perf.tools,
    platform.walks,
    platform,
  );

  const errors = perf.error ? [perf.error] : [];

  return {
    counts: {
      events: perf.events.length,
      spots: perf.spots.length,
      tools: perf.tools.length,
      walks: platform.walks.length,
    },
    eventsByClicks: toInsightRows(perf.events, 'clicks', perf.weights),
    spotsByClicks: toInsightRows(perf.spots, 'clicks', perf.weights),
    toolsByClicks: toInsightRows(perf.tools, 'clicks', perf.weights),
    eventsByEngagement: toInsightRows(perf.events, 'engagement', perf.weights),
    spotsByEngagement: toInsightRows(perf.spots, 'engagement', perf.weights),
    toolsByEngagement: toInsightRows(perf.tools, 'engagement', perf.weights),
    perf: {
      events: perf.events,
      spots: perf.spots,
      tools: perf.tools,
      weights: perf.weights,
    },
    contentTypeUsage,
    contentMacro,
    validatedCatalogActive,
    benefitKpis,
    benefitDetails,
    catalogStats,
    platformCounts,
    platform,
    error: errors.length ? errors.join(' · ') : undefined,
  };
}
