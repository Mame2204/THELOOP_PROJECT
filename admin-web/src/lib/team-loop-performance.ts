import { loopPerfCompositeScore } from './loop-perf-sort';
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
  /** Tri onglet « Tous » uniquement — ne pas afficher comme métrique principale. */
  sortScore: number;
  displayLine: string;
}

const TEAM_ORIGINS = ['admin', 'loop'];

function isTeamOrigin(origin: string | null | undefined): boolean {
  return TEAM_ORIGINS.includes(String(origin ?? '').toLowerCase());
}

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

function finalizeRows(rows: Omit<TeamLoopPerfRow, 'displayLine' | 'sortScore'>[]): TeamLoopPerfRow[] {
  const withMeta = rows.map((r) => ({
    ...r,
    sortScore: loopPerfCompositeScore(r),
    displayLine: formatDisplayLine(r),
  }));
  return withMeta;
}

export async function loadTeamLoopPerformance(countryCode: string): Promise<{
  events: TeamLoopPerfRow[];
  spots: TeamLoopPerfRow[];
  tools: TeamLoopPerfRow[];
  error?: string;
}> {
  const cc = countryCode.toUpperCase().slice(0, 2);
  const errors: string[] = [];

  const eventsRes = await supabase
    .from('events')
    .select('id, title, click_count, favorite_count, content_origin, country_code, is_active, content_status')
    .eq('country_code', cc)
    .eq('content_status', 'published')
    .eq('is_active', true)
    .in('content_origin', TEAM_ORIGINS);

  const spotsRes = await supabase
    .from('establishments')
    .select(
      'id, name, click_count, favorite_count, star_count, admin_star_override, rating_avg, rating_count, content_origin, country_code, is_active, content_status, category_slugs',
    )
    .eq('country_code', cc)
    .eq('content_status', 'published')
    .eq('is_active', true)
    .in('content_origin', TEAM_ORIGINS)
    .not('category_slugs', 'cs', '{tools}');

  const toolsRes = await supabase
    .from('tools')
    .select(
      'id, name, click_count, favorite_count, star_count, admin_star_override, rating_avg, rating_count, content_origin, country_code, is_active, content_status',
    )
    .eq('country_code', cc)
    .eq('content_status', 'published')
    .eq('is_active', true)
    .in('content_origin', TEAM_ORIGINS);

  if (eventsRes.error) errors.push(eventsRes.error.message);
  if (spotsRes.error) errors.push(spotsRes.error.message);
  if (toolsRes.error) errors.push(toolsRes.error.message);

  const eventRows: Omit<TeamLoopPerfRow, 'displayLine' | 'sortScore'>[] = (eventsRes.data ?? [])
    .filter((r) => isTeamOrigin(r.content_origin))
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
    .filter((r) => isTeamOrigin(r.content_origin))
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
    .filter((r) => isTeamOrigin(r.content_origin))
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
    events: finalizeRows(eventRows),
    spots: finalizeRows(spotRows),
    tools: finalizeRows(toolRows),
    error: errors.length ? errors.join(' · ') : undefined,
  };
}
