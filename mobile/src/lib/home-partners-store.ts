import { fetchLivePartnerCatalogIds } from '@/lib/partner-catalog-ids';
import { normalizePartnerName } from '@/lib/partner-name-utils';
import { asArray, hydrateScoped, invalidateScope, peekScoped, scopedStorageKey } from '@/lib/swr-cache';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Event } from '@/types';
import type { HomeLocation } from '@/lib/demo-data';

export interface HomePartnerLogo {
  id: string;
  partnerId: string;
  name: string;
  logoUrl: string;
  websiteUrl: string | null;
  sortOrder: number;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** THE LOOP = plateforme, pas un partenaire à afficher dans le ruban. */
export function isPlatformLoopPartnerName(name: string): boolean {
  const n = normalizePartnerName(name)
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (
    n === 'the loop' ||
    n === 'theloop' ||
    n.startsWith('the loop ') ||
    n.endsWith(' the loop') ||
    n === 'loop tools gn' ||
    n.startsWith('loop tools')
  );
}

/** Correspondance stricte par UUID partenaire (pas de fuzzy sur le nom seul). */
export function partnerMatchesContent(
  partnerId: string,
  _partnerName: string,
  item: { partnerId?: string | null; organizerName?: string | null; name?: string },
): boolean {
  if (!partnerId?.trim() || !item.partnerId?.trim()) return false;
  const pid = item.partnerId.trim();
  const want = partnerId.trim();
  if (pid === want) return true;
  if (isUuid(want) && isUuid(pid)) return pid === want;
  return false;
}

/**
 * Logos Accueil = uniquement curatés admin (Control Tower → Logos).
 * Pas de génération auto depuis avantages / contenus.
 * Cache v3 : plus de filtre `source` (cassait le fetch si colonne absente / PostgREST).
 */
const LOGOS_CACHE = 'loop_home_partner_logos_v4';

function logosScope(countryCode?: string): string {
  return `home_logos_${(countryCode ?? 'GN').toUpperCase()}`;
}

function withLogoCacheBuster(logoUrl: string, updatedAt: unknown): string {
  const base = logoUrl.trim();
  if (!base || base.startsWith('data:')) return base;
  const stamp = typeof updatedAt === 'string' ? updatedAt.trim() : '';
  if (!stamp) return base;
  const version = encodeURIComponent(stamp.slice(0, 19));
  return base.includes('?') ? `${base}&v=${version}` : `${base}?v=${version}`;
}

function mapCuratedRows(data: Array<Record<string, unknown>>): HomePartnerLogo[] {
  const seen = new Set<string>();
  return data
    .map((row) => ({
      id: String(row.id),
      partnerId: String(row.id),
      name: String(row.name),
      logoUrl: withLogoCacheBuster(String(row.logo_url), row.updated_at),
      websiteUrl: row.website_url ? String(row.website_url) : null,
      sortOrder: Number(row.sort_order ?? 0),
    }))
    .filter((l) => {
      if (isPlatformLoopPartnerName(l.name)) return false;
      if (!l.logoUrl.trim()) return false;
      if (seen.has(l.id)) return false;
      seen.add(l.id);
      return true;
    });
}

async function fetchCuratedLogos(countryCode?: string): Promise<HomePartnerLogo[] | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  async function fetchCurated(forCountry?: string) {
    // Actifs uniquement — les logos auto (source=benefit) sont désactivés en base (migration 75).
    // Ne pas filtrer/sélectionner `source` : colonne optionnelle selon migrations appliquées.
    let query = supabase!
      .from('home_partner_logos')
      .select('id, name, logo_url, website_url, sort_order, country_code, updated_at')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(40);
    if (forCountry) query = query.eq('country_code', forCountry);
    return query;
  }

  const { data, error } = await fetchCurated(countryCode);
  if (!error && data?.length) {
    const mapped = mapCuratedRows(data as Array<Record<string, unknown>>);
    if (mapped.length) return mapped;
  }
  if (error) console.warn('[HomePartners] logos curatés:', error.message);

  // Fallback sans filtre pays si le pays actif n'a aucun logo
  if (countryCode) {
    const { data: allData, error: allError } = await fetchCurated(undefined);
    if (!allError && allData?.length) {
      const mapped = mapCuratedRows(allData as Array<Record<string, unknown>>);
      if (mapped.length) return mapped;
    }
  }

  return null;
}

/** Logos partenaires Accueil — cache immédiat. */
export async function peekHomePartnerLogos(countryCode?: string): Promise<HomePartnerLogo[]> {
  const scope = logosScope(countryCode);
  const hit = await peekScoped<HomePartnerLogo[]>(scope, scopedStorageKey(LOGOS_CACHE, scope));
  return asArray<HomePartnerLogo>(hit).filter(
    (item) => Boolean(item?.id && item?.name && item?.logoUrl),
  );
}

export function invalidateHomePartnerLogosCache(countryCode?: string): void {
  invalidateScope(logosScope(countryCode), scopedStorageKey(LOGOS_CACHE, logosScope(countryCode)));
}

async function resolveAccueilPartnerLogos(countryCode?: string): Promise<HomePartnerLogo[]> {
  const curated = (await fetchCuratedLogos(countryCode)) ?? [];
  return curated.filter((l) => !isPlatformLoopPartnerName(l.name));
}

export async function listHomePartnerLogos(
  countryCode?: string,
  options?: { force?: boolean },
): Promise<HomePartnerLogo[]> {
  if (options?.force) invalidateHomePartnerLogosCache(countryCode);

  const scope = logosScope(countryCode);
  const diskKey = scopedStorageKey(LOGOS_CACHE, scope);
  const cached = await peekHomePartnerLogos(countryCode);
  if (cached.length && !options?.force) {
    return cached;
  }

  const resolved = await resolveAccueilPartnerLogos(countryCode);
  if (resolved.length) {
    await hydrateScoped(scope, diskKey, resolved);
  } else if (options?.force) {
    await hydrateScoped(scope, diskKey, []);
  }
  return resolved;
}

/** Contenu public lié à un partenaire — uniquement ce qui existe encore en base. */
export function filterPartnerPublicContent(
  _partnerId: string,
  _partnerName: string,
  events: Event[],
  spots: HomeLocation[],
  tools: HomeLocation[],
  allowedContentIds: Set<string>,
): { events: Event[]; spots: HomeLocation[]; tools: HomeLocation[] } {
  const isAllowed = (id: string) => allowedContentIds.has(id);

  return {
    events: events.filter((e) => isAllowed(e.id)),
    spots: spots.filter((s) => isAllowed(s.id)),
    tools: tools.filter((t) => isAllowed(t.id)),
  };
}

/** IDs catalogue publié actif du partenaire (source Supabase, sans dépendre du cache Accueil). */
export async function listPartnerLinkedContentIds(
  partnerId: string,
  partnerName: string,
  _liveCatalogIds?: Set<string>,
): Promise<Set<string>> {
  return fetchLivePartnerCatalogIds(partnerId, partnerName, 'public');
}
