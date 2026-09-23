import { supabase } from './supabase';
import { getBenefitKpis, getCatalogUsageStats, type BenefitKpis, type CatalogUsageStat } from './privileges';

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
}

export interface InsightsBundle {
  counts: CatalogCounts;
  eventsByClicks: InsightRow[];
  spotsByClicks: InsightRow[];
  toolsByClicks: InsightRow[];
  /** Hub THE LOOP — tri composite (aligné AdminLoopStats mobile). */
  eventsByEngagement: InsightRow[];
  spotsByEngagement: InsightRow[];
  toolsByEngagement: InsightRow[];
  benefitKpis: BenefitKpis;
  catalogStats: CatalogUsageStat[];
  error?: string;
}

function engagementScore(row: {
  click_count?: number | null;
  favorite_count?: number | null;
  star_count?: number | null;
}): number {
  const clicks = Number(row.click_count ?? 0);
  const favorites = Number(row.favorite_count ?? 0);
  const stars = Number(row.star_count ?? 0);
  return favorites + clicks + stars * 5;
}

async function topByClicks(
  table: 'events' | 'establishments' | 'tools',
  countryCode: string,
  titleCol: 'title' | 'name',
  origins?: string[],
): Promise<InsightRow[]> {
  let q = supabase
    .from(table)
    .select(`id, ${titleCol}, click_count, favorite_count, star_count, content_origin, country_code, content_status`)
    .eq('country_code', countryCode)
    .order('click_count', { ascending: false })
    .limit(10);

  const { data, error } = await q;
  if (error) {
    // events/establishments : created_at en prod (pas updated_at)
    const orderCol = table === 'tools' ? 'updated_at' : 'created_at';
    const fallback = await supabase
      .from(table)
      .select(`id, ${titleCol}, content_origin, country_code, ${orderCol}`)
      .eq('country_code', countryCode)
      .order(orderCol, { ascending: false })
      .limit(10);
    return (fallback.data ?? [])
      .filter((r) => {
        if (!origins?.length) return true;
        return origins.includes(String(r.content_origin ?? '').toLowerCase());
      })
      .map((r) => ({
        id: String(r.id),
        title: String((r as Record<string, unknown>)[titleCol] ?? '—'),
        metric: 0,
      }));
  }

  return (data ?? [])
    .filter((r) => {
      if (!origins?.length) return true;
      return origins.includes(String(r.content_origin ?? '').toLowerCase());
    })
    .map((r) => ({
      id: String(r.id),
      title: String((r as Record<string, unknown>)[titleCol] ?? '—'),
      metric: Number(r.click_count ?? 0),
      subtitle: r.content_origin ? String(r.content_origin) : null,
    }));
}

async function topByEngagement(
  table: 'events' | 'establishments' | 'tools',
  countryCode: string,
  titleCol: 'title' | 'name',
  origins?: string[],
): Promise<InsightRow[]> {
  let q = supabase
    .from(table)
    .select(
      `id, ${titleCol}, click_count, favorite_count, star_count, rating_avg, rating_count, content_origin, country_code, content_status, category_slugs`,
    )
    .eq('country_code', countryCode)
    .eq('content_status', 'published')
    .limit(80);

  if (table === 'establishments') {
    q = q.not('category_slugs', 'cs', '{tools}');
  }

  const { data, error } = await q;
  if (error) {
    return topByClicks(table, countryCode, titleCol, origins);
  }

  const rows = (data ?? []).filter((r) => {
    if (!origins?.length) return true;
    return origins.includes(String(r.content_origin ?? '').toLowerCase());
  });

  rows.sort((a, b) => engagementScore(b) - engagementScore(a));

  return rows.slice(0, 10).map((r) => {
    const clicks = Number(r.click_count ?? 0);
    const favorites = Number(r.favorite_count ?? 0);
    const stars = Number(r.star_count ?? 0);
    const ratingCount = Number(r.rating_count ?? 0);
    const ratingAvg = Number(r.rating_avg ?? 0);
    const subtitleParts = [
      `${favorites} fav.`,
      `${clicks} clics`,
      stars > 0 ? `${stars} ★` : null,
      ratingCount > 0 ? `${ratingAvg.toFixed(1)}/5 (${ratingCount})` : null,
    ].filter(Boolean);
    return {
      id: String(r.id),
      title: String((r as Record<string, unknown>)[titleCol] ?? '—'),
      metric: engagementScore(r),
      subtitle: subtitleParts.join(' · '),
    };
  });
}

async function countTable(
  table: 'events' | 'establishments' | 'tools',
  countryCode: string,
  origins?: string[],
): Promise<number> {
  let q = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('country_code', countryCode)
    .eq('content_status', 'published');
  if (origins?.length) q = q.in('content_origin', origins);
  const { count } = await q;
  return count ?? 0;
}

export async function loadInsights(
  countryCode: string,
  options?: { teamOnly?: boolean },
): Promise<InsightsBundle> {
  const origins = options?.teamOnly ? ['admin', 'loop'] : undefined;
  const [
    events,
    spots,
    tools,
    eventsByClicks,
    spotsByClicks,
    toolsByClicks,
    eventsByEngagement,
    spotsByEngagement,
    toolsByEngagement,
    benefitKpis,
    catalogStats,
  ] = await Promise.all([
    countTable('events', countryCode, origins),
    countTable('establishments', countryCode, origins),
    countTable('tools', countryCode, origins),
    topByClicks('events', countryCode, 'title', origins),
    topByClicks('establishments', countryCode, 'name', origins),
    topByClicks('tools', countryCode, 'name', origins),
    topByEngagement('events', countryCode, 'title', origins),
    topByEngagement('establishments', countryCode, 'name', origins),
    topByEngagement('tools', countryCode, 'name', origins),
    getBenefitKpis(countryCode),
    getCatalogUsageStats(countryCode),
  ]);

  return {
    counts: { events, spots, tools },
    eventsByClicks,
    spotsByClicks,
    toolsByClicks,
    eventsByEngagement,
    spotsByEngagement,
    toolsByEngagement,
    benefitKpis,
    catalogStats: catalogStats.slice(0, 15),
  };
}
