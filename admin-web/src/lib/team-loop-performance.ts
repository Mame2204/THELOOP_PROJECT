import { loopPerfEngagementScore } from './loop-perf-sort';
import { loadLoopPerfScoreWeights, type LoopPerfScoreWeights } from './loop-perf-score-weights';
import { supabase } from './supabase';

/** Aligné `AdminLoopStatsScreen` + `content-mappers.ts` (mobile). */
export type TeamLoopPerfKind = 'event' | 'spot' | 'tool';

export interface TeamLoopPerfRow {
  id: string;
  kind: TeamLoopPerfKind;
  title: string;
  clicks: number;
  favorites: number;
  stars: number;
  ratingAvg: number;
  ratingCount: number;
  /** Score engagement (clics×wC + favoris×wF + moyenne×wN) — tri « Tous ». */
  sortScore: number;
  displayLine: string;
}

const TEAM_ORIGINS = ['admin', 'loop'];

/** Identique `content-mappers.ts` (mobile) : `admin_star_override ?? star_count ?? 3`. */
function resolveStarCount(row: {
  admin_star_override?: number | null;
  star_count?: number | null;
}): number {
  return row.admin_star_override ?? row.star_count ?? 3;
}

function formatRatingMeta(avg: number, count: number): string {
  if (count <= 0) return '0 avis';
  return `${avg.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/5 · ${count} avis`;
}

function formatDisplayLine(row: Omit<TeamLoopPerfRow, 'displayLine' | 'sortScore'>): string {
  if (row.kind === 'event') {
    const favLabel = row.favorites > 1 ? 'favoris' : 'favori';
    const clickLabel = row.clicks > 1 ? 'clics' : 'clic';
    return `${row.favorites} ${favLabel} · ${row.clicks} ${clickLabel}`;
  }
  const favLabel = row.favorites > 1 ? 'favoris' : 'favori';
  const clickLabel = row.clicks > 1 ? 'clics' : 'clic';
  return `${row.favorites} ${favLabel} · ${row.clicks} ${clickLabel} · ${row.stars}★ · ${formatRatingMeta(row.ratingAvg, row.ratingCount)}`;
}

function finalizeRows(
  rows: Omit<TeamLoopPerfRow, 'displayLine' | 'sortScore'>[],
  weights: LoopPerfScoreWeights,
): TeamLoopPerfRow[] {
  return rows.map((r) => ({
    ...r,
    sortScore: loopPerfEngagementScore(r, weights),
    displayLine: formatDisplayLine(r),
  }));
}

export async function loadCatalogPerformance(
  countryCode: string,
  options?: { origins?: string[] },
): Promise<{
  events: TeamLoopPerfRow[];
  spots: TeamLoopPerfRow[];
  tools: TeamLoopPerfRow[];
  weights: LoopPerfScoreWeights;
  error?: string;
}> {
  const cc = countryCode.toUpperCase().slice(0, 2);
  const errors: string[] = [];
  const weights = await loadLoopPerfScoreWeights(cc);
  const originFilter = options?.origins?.map((o) => o.toLowerCase());

  let eventsQ = supabase
    .from('events')
    .select('id, title, click_count, favorite_count, content_origin, country_code, is_active, content_status')
    .eq('country_code', cc)
    .eq('content_status', 'published')
    .eq('is_active', true);
  if (originFilter?.length) eventsQ = eventsQ.in('content_origin', originFilter);

  let spotsQ = supabase
    .from('establishments')
    .select(
      'id, name, click_count, favorite_count, star_count, admin_star_override, rating_avg, rating_count, content_origin, country_code, is_active, content_status, category_slugs',
    )
    .eq('country_code', cc)
    .eq('content_status', 'published')
    .eq('is_active', true)
    .not('category_slugs', 'cs', '{tools}');
  if (originFilter?.length) spotsQ = spotsQ.in('content_origin', originFilter);

  let toolsQ = supabase
    .from('tools')
    .select(
      'id, name, click_count, favorite_count, star_count, admin_star_override, rating_avg, rating_count, content_origin, country_code, is_active, content_status',
    )
    .eq('country_code', cc)
    .eq('content_status', 'published')
    .eq('is_active', true);
  if (originFilter?.length) toolsQ = toolsQ.in('content_origin', originFilter);

  const [eventsRes, spotsRes, toolsRes] = await Promise.all([eventsQ, spotsQ, toolsQ]);

  if (eventsRes.error) errors.push(eventsRes.error.message);
  if (spotsRes.error) errors.push(spotsRes.error.message);
  if (toolsRes.error) errors.push(toolsRes.error.message);

  const matchesOrigin = (origin: string | null | undefined): boolean => {
    if (!originFilter?.length) return true;
    return originFilter.includes(String(origin ?? '').toLowerCase());
  };

  const eventRows: Omit<TeamLoopPerfRow, 'displayLine' | 'sortScore'>[] = (eventsRes.data ?? [])
    .filter((r) => matchesOrigin(r.content_origin))
    .map((r) => ({
      id: String(r.id),
      kind: 'event' as const,
      title: String(r.title ?? '—'),
      clicks: Number(r.click_count ?? 0),
      favorites: Number(r.favorite_count ?? 0),
      stars: 0,
      ratingAvg: 0,
      ratingCount: 0,
    }));

  const spotRows: Omit<TeamLoopPerfRow, 'displayLine' | 'sortScore'>[] = (spotsRes.data ?? [])
    .filter((r) => matchesOrigin(r.content_origin))
    .map((r) => {
      const stars = resolveStarCount(r);
      return {
        id: String(r.id),
        kind: 'spot' as const,
        title: String(r.name ?? '—'),
        clicks: Number(r.click_count ?? 0),
        favorites: Number(r.favorite_count ?? 0),
        stars,
        ratingAvg: Number(r.rating_avg ?? 0),
        ratingCount: Number(r.rating_count ?? 0),
      };
    });

  const toolRows: Omit<TeamLoopPerfRow, 'displayLine' | 'sortScore'>[] = (toolsRes.data ?? [])
    .filter((r) => matchesOrigin(r.content_origin))
    .map((r) => {
      const stars = resolveStarCount(r);
      return {
        id: String(r.id),
        kind: 'tool' as const,
        title: String(r.name ?? '—'),
        clicks: Number(r.click_count ?? 0),
        favorites: Number(r.favorite_count ?? 0),
        stars,
        ratingAvg: Number(r.rating_avg ?? 0),
        ratingCount: Number(r.rating_count ?? 0),
      };
    });

  return {
    events: finalizeRows(eventRows, weights),
    spots: finalizeRows(spotRows, weights),
    tools: finalizeRows(toolRows, weights),
    weights,
    error: errors.length ? errors.join(' · ') : undefined,
  };
}

/** Contenus THE LOOP (origines admin + loop) — onglet Performances du hub. */
export async function loadTeamLoopPerformance(countryCode: string): Promise<{
  events: TeamLoopPerfRow[];
  spots: TeamLoopPerfRow[];
  tools: TeamLoopPerfRow[];
  weights: LoopPerfScoreWeights;
  error?: string;
}> {
  return loadCatalogPerformance(countryCode, { origins: TEAM_ORIGINS });
}
