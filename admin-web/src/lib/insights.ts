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
  benefitKpis: BenefitKpis;
  catalogStats: CatalogUsageStat[];
  error?: string;
}

async function topByClicks(
  table: 'events' | 'establishments' | 'tools',
  countryCode: string,
  titleCol: 'title' | 'name',
  origins?: string[],
): Promise<InsightRow[]> {
  let q = supabase
    .from(table)
    .select(`id, ${titleCol}, click_count, content_origin, country_code, content_status`)
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
  const [events, spots, tools, eventsByClicks, spotsByClicks, toolsByClicks, benefitKpis, catalogStats] =
    await Promise.all([
      countTable('events', countryCode, origins),
      countTable('establishments', countryCode, origins),
      countTable('tools', countryCode, origins),
      topByClicks('events', countryCode, 'title', origins),
      topByClicks('establishments', countryCode, 'name', origins),
      topByClicks('tools', countryCode, 'name', origins),
      getBenefitKpis(countryCode),
      getCatalogUsageStats(countryCode),
    ]);

  return {
    counts: { events, spots, tools },
    eventsByClicks,
    spotsByClicks,
    toolsByClicks,
    benefitKpis,
    catalogStats: catalogStats.slice(0, 15),
  };
}
