import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  formatWalkPriceLabel,
  type WalkPriceType,
} from '@/lib/accueil-copy';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { asArray, hydrateScoped, peekScoped, scheduleScopedRefresh, scopedStorageKey } from '@/lib/swr-cache';
import { normalizeWalkStepRef } from '@/lib/walk-step-resolve';
import { filterPublicWalks, isWalkPubliclyVisible } from '@/lib/walk-public-visibility';
import type { HomeLocation } from '@/lib/demo-data';
import type { Event } from '@/types';

export type { WalkPriceType };

const DEMO_KEY = 'loop_walks_demo_v5';
const WALKS_DISK = 'loop_walks_published_v1';

const WALKS_LIST_CACHE_MS = 90_000;
const walksListCache = new Map<string, { at: number; data: LoopWalk[] }>();

export function invalidateLoopWalksCache(countryCode?: string): void {
  if (countryCode) walksListCache.delete(countryCode.toUpperCase());
  else walksListCache.clear();
}

/** Étape = contenu THE LOOP déjà publié (événement, spot ou outil). */
export interface LoopWalkStep {
  order: number;
  targetType: 'event' | 'spot' | 'tool';
  targetId: string;
  /** Libellé de secours si le contenu n'est plus trouvé. */
  title?: string | null;
  description?: string | null;
}

export interface LoopWalk {
  id: string;
  slug: string;
  title: string;
  coverImageUrl: string;
  /** 0 = durée non renseignée (ne pas afficher). */
  durationMinutes: number;
  stepsCount: number;
  category: string;
  categoryLabel: string;
  summary: string | null;
  description: string | null;
  steps: LoopWalkStep[];
  partnerIds: string[];
  priceType: WalkPriceType;
  priceLabel: string | null;
  contactPhone: string | null;
  contactUrl: string | null;
  isFeaturedWeek: boolean;
  isPublished: boolean;
  sortOrder: number;
  clickCount?: number;
  favoriteCount?: number;
  ratingAvg?: number;
  ratingCount?: number;
  starCount?: number;
  starsSource?: 'auto' | 'admin';
  engagementScore?: number;
  countryCode?: string;
}

function parsePriceType(raw: unknown): WalkPriceType {
  const v = String(raw ?? 'free').toLowerCase();
  if (v === 'paid' || v === 'theloop') return v;
  return 'free';
}

function demoWalks(): LoopWalk[] {
  return [
    {
      id: 'walk-kaloum',
      slug: 'kaloum-golden-hour',
      title: 'Kaloum au golden hour',
      coverImageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80',
      durationMinutes: 90,
      stepsCount: 4,
      category: 'heritage',
      categoryLabel: 'Patrimoine',
      summary: 'Une balade douce entre spots et moments du centre.',
      description:
        'Parcours composé d’adresses et d’événements déjà présents dans THE LOOP.',
      steps: [
        {
          order: 1,
          targetType: 'spot',
          targetId: 'loc-2',
          title: 'Hôtel Noom',
          description: 'Départ à Kaloum, face à la baie.',
        },
        {
          order: 2,
          targetType: 'spot',
          targetId: 'loc-1',
          title: "L'Avenue",
          description: 'Pause business au cœur du quartier.',
        },
        {
          order: 3,
          targetType: 'event',
          targetId: 'evt-1',
          title: 'Forum Leaders & Finance',
          description: 'Escalier networking — Hôtel Noom.',
        },
        {
          order: 4,
          targetType: 'spot',
          targetId: 'loc-3',
          title: 'Sky Lounge Kaloum',
          description: 'Fin de parcours en rooftop.',
        },
      ],
      partnerIds: [],
      priceType: 'free' as const,
      priceLabel: null,
      contactPhone: null,
      contactUrl: null,
      isFeaturedWeek: true,
      isPublished: true,
      sortOrder: 1,
    },
    {
      id: 'walk-dixinn',
      slug: 'dixinn-street-food',
      title: 'Street food Dixinn',
      coverImageUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1200&q=80',
      durationMinutes: 60,
      stepsCount: 3,
      category: 'food',
      categoryLabel: 'Food',
      summary: 'Trois étapes gourmandes sélectionnées dans le guide.',
      description: 'Un parcours court branché sur des spots THE LOOP.',
      steps: [
        {
          order: 1,
          targetType: 'spot',
          targetId: 'loc-1',
          title: "L'Avenue",
          description: 'Café business, Kaloum centre.',
        },
        {
          order: 2,
          targetType: 'spot',
          targetId: 'loc-4',
          title: 'Le Petit Bateau',
          description: 'Terrasse face à la mer.',
        },
        {
          order: 3,
          targetType: 'event',
          targetId: 'evt-4',
          title: "Brunch d'Affaires",
          description: 'Rendez-vous networking du dimanche.',
        },
      ],
      partnerIds: [],
      priceType: 'free' as const,
      priceLabel: null,
      contactPhone: null,
      contactUrl: null,
      isFeaturedWeek: false,
      isPublished: true,
      sortOrder: 2,
    },
    {
      id: 'walk-camayenne',
      slug: 'camayenne-sunset',
      title: 'Camayenne sunset walk',
      coverImageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80',
      durationMinutes: 75,
      stepsCount: 3,
      category: 'nature',
      categoryLabel: 'Nature',
      summary: 'Bord de mer via les adresses Camayenne du guide.',
      description: 'Boucle légère entre spots publiés.',
      steps: [
        {
          order: 1,
          targetType: 'spot',
          targetId: 'loc-5',
          title: 'Palm Camayenne',
          description: 'Départ sous les palmiers de Camayenne.',
        },
        {
          order: 2,
          targetType: 'spot',
          targetId: 'loc-4',
          title: 'Le Petit Bateau',
          description: 'Halte bord de mer.',
        },
        {
          order: 3,
          targetType: 'event',
          targetId: 'evt-5',
          title: 'Nuit Étoilée',
          description: 'Coucher de soleil en musique.',
        },
      ],
      partnerIds: [],
      priceType: 'free' as const,
      priceLabel: null,
      contactPhone: null,
      contactUrl: null,
      isFeaturedWeek: false,
      isPublished: true,
      sortOrder: 3,
    },
    {
      id: 'walk-pulse',
      slug: 'nightlife-kaloum-pulse',
      title: 'Pulse nocturne Kaloum',
      coverImageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200&q=80',
      durationMinutes: 120,
      stepsCount: 3,
      category: 'nightlife',
      categoryLabel: 'Nightlife',
      summary: 'Soirée branchée sur nightlife & rooftops du catalogue.',
      description: 'Étapes tirées des spots et events THE LOOP.',
      steps: [
        {
          order: 1,
          targetType: 'spot',
          targetId: 'loc-3',
          title: 'Sky Lounge Kaloum',
          description: 'Rooftop aperitif, vue Kaloum.',
        },
        {
          order: 2,
          targetType: 'spot',
          targetId: 'loc-6',
          title: 'The Roof',
          description: 'Deuxième étape nightlife.',
        },
        {
          order: 3,
          targetType: 'event',
          targetId: 'evt-5',
          title: 'Nuit Étoilée',
          description: 'Clôture sous les étoiles.',
        },
      ],
      partnerIds: [],
      priceType: 'paid' as const,
      priceLabel: 'Sur réservation',
      contactPhone: null,
      contactUrl: null,
      isFeaturedWeek: false,
      isPublished: true,
      sortOrder: 4,
    },
  ];
}

function parseSteps(raw: unknown): LoopWalkStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: LoopWalkStep[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    let targetType: LoopWalkStep['targetType'] | null = null;
    if (row.targetType === 'event' || row.target_type === 'event') targetType = 'event';
    else if (row.targetType === 'tool' || row.target_type === 'tool') targetType = 'tool';
    else if (row.targetType === 'spot' || row.target_type === 'spot') targetType = 'spot';
    const targetId = String(row.targetId ?? row.target_id ?? '').trim();
    if (!targetType || !targetId) return;
    steps.push({
      order: typeof row.order === 'number' ? row.order : index + 1,
      targetType,
      targetId,
      title: typeof row.title === 'string' ? row.title : null,
      description: typeof row.description === 'string' ? row.description : null,
    });
  });
  return steps.sort((a, b) => a.order - b.order);
}

function parsePartnerIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v).trim()).filter(Boolean);
}

function mapRow(row: Record<string, unknown>): LoopWalk {
  const steps = parseSteps(row.steps).map(normalizeWalkStepRef);
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    coverImageUrl: String(row.cover_image_url ?? row.coverImageUrl ?? ''),
    durationMinutes: Number(row.duration_minutes ?? row.durationMinutes ?? 0),
    stepsCount: Number(row.steps_count ?? row.stepsCount ?? steps.length),
    category: String(row.category ?? ''),
    categoryLabel: String(row.category_label ?? row.categoryLabel ?? row.category ?? ''),
    summary: row.summary != null ? String(row.summary) : null,
    description: row.description != null ? String(row.description) : null,
    steps,
    partnerIds: parsePartnerIds(row.partner_ids ?? row.partnerIds),
    priceType: parsePriceType(row.price_type ?? row.priceType),
    priceLabel: row.price_label != null || row.priceLabel != null
      ? String(row.price_label ?? row.priceLabel)
      : null,
    contactPhone: row.contact_phone != null || row.contactPhone != null
      ? String(row.contact_phone ?? row.contactPhone)
      : null,
    contactUrl: row.contact_url != null || row.contactUrl != null
      ? String(row.contact_url ?? row.contactUrl)
      : null,
    isFeaturedWeek: Boolean(row.is_featured_week ?? row.isFeaturedWeek),
    isPublished: row.is_published === false || row.isPublished === false ? false : true,
    sortOrder: Number(row.sort_order ?? row.sortOrder ?? 0),
    clickCount: Number(row.click_count ?? 0),
    favoriteCount: Number(row.favorite_count ?? 0),
    ratingAvg: Number(row.rating_avg ?? 0),
    ratingCount: Number(row.rating_count ?? 0),
    starCount: Number(row.star_count ?? 3),
    starsSource: row.stars_source === 'admin' ? 'admin' : 'auto',
    engagementScore: Number(row.engagement_score ?? 0),
    countryCode: row.country_code ? String(row.country_code) : 'GN',
  };
}

async function ensureDemo(): Promise<LoopWalk[]> {
  try {
    const raw = await AsyncStorage.getItem(DEMO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LoopWalk[];
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.steps?.[0]?.targetType) {
        return parsed.map((w) => ({
          ...w,
          partnerIds: Array.isArray(w.partnerIds) ? w.partnerIds : [],
          priceType: parsePriceType(w.priceType),
          priceLabel: w.priceLabel ?? null,
          contactPhone: w.contactPhone ?? null,
          contactUrl: w.contactUrl ?? null,
          isPublished: w.isPublished !== false,
        }));
      }
    }
  } catch {
    /* seed */
  }
  const walks = demoWalks();
  await AsyncStorage.setItem(DEMO_KEY, JSON.stringify(walks));
  return walks;
}

/** null si durée non renseignée (0 ou invalide). */
export function formatWalkDuration(minutes: number | null | undefined): string | null {
  const n = Number(minutes ?? 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 60) return `${Math.round(n)} min`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  if (m === 0) return `${h} h`;
  return `${h} h ${m}`;
}

export function formatWalkMetaLine(
  walk: Pick<LoopWalk, 'durationMinutes' | 'stepsCount' | 'priceType' | 'priceLabel'>,
): string {
  const parts: string[] = [];
  const duration = formatWalkDuration(walk.durationMinutes);
  if (duration) parts.push(duration);
  parts.push(`${walk.stepsCount} étape${walk.stepsCount > 1 ? 's' : ''}`);
  parts.push(formatWalkPriceLabel(walk.priceType, walk.priceLabel));
  return parts.join(' · ');
}

function filterWalksByCountry(walks: LoopWalk[], countryCode?: string): LoopWalk[] {
  if (!countryCode) return walks;
  return walks.filter((w) => (w.countryCode ?? 'GN') === countryCode);
}

function walksScope(countryCode?: string): string {
  return (countryCode ?? '__ALL__').toUpperCase();
}

/** Parcours publiés immédiats — cache mémoire / disque. */
export async function peekLoopWalks(countryCode?: string): Promise<LoopWalk[]> {
  const cacheKey = walksScope(countryCode);
  const cached = walksListCache.get(cacheKey);
  if (cached && Date.now() - cached.at < WALKS_LIST_CACHE_MS) {
    return cached.data;
  }
  const disk = asArray<LoopWalk>(
    await peekScoped<LoopWalk[]>(cacheKey, scopedStorageKey(WALKS_DISK, cacheKey)),
  );
  if (disk.length) {
    walksListCache.set(cacheKey, { at: Date.now(), data: disk });
    return disk;
  }
  return [];
}

async function fetchPublishedWalksRemote(countryCode?: string): Promise<LoopWalk[] | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  async function fetchPublished(forCountry?: string) {
    let query = supabase!
      .from('loop_walks')
      .select('id, slug, title, cover_image_url, duration_minutes, steps_count, category, category_label, summary, description, steps, partner_ids, price_type, price_label, contact_phone, contact_url, is_featured_week, is_published, sort_order, click_count, favorite_count, rating_avg, rating_count, star_count, stars_source, engagement_score, country_code, created_at')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(200);
    if (forCountry) query = query.eq('country_code', forCountry);
    return query;
  }

  const { data, error } = await fetchPublished(countryCode);
  if (!error && data) {
    return data.map((row) => mapRow(row as Record<string, unknown>)).filter((w) => w.isPublished);
  }
  if (error) console.warn('[LoopWalks] liste:', error.message);
  return null;
}

export async function listLoopWalks(
  countryCode?: string,
  options?: { force?: boolean },
): Promise<LoopWalk[]> {
  const cacheKey = walksScope(countryCode);

  if (!options?.force) {
    const peeked = await peekLoopWalks(countryCode);
    if (peeked.length) {
      scheduleScopedRefresh(
        `loop_walks_${cacheKey}`,
        () => fetchPublishedWalksRemote(countryCode),
        undefined,
        async (fresh) => {
          if (fresh === null) return;
          walksListCache.set(cacheKey, { at: Date.now(), data: fresh });
          await hydrateScoped(cacheKey, scopedStorageKey(WALKS_DISK, cacheKey), fresh);
        },
      );
      return peeked;
    }
  }

  if (isSupabaseConfigured() && supabase) {
    const result = await fetchPublishedWalksRemote(countryCode);
    if (result !== null) {
      walksListCache.set(cacheKey, { at: Date.now(), data: result });
      await hydrateScoped(cacheKey, scopedStorageKey(WALKS_DISK, cacheKey), result);
      return result;
    }
    const cached = walksListCache.get(cacheKey);
    return cached?.data ?? [];
  }

  const demo = await ensureDemo();
  const result = filterWalksByCountry(demo.filter((w) => w.isPublished !== false), countryCode);
  walksListCache.set(cacheKey, { at: Date.now(), data: result });
  return result;
}

/** Tous les parcours (admin / insights) — inclut brouillons et engagement base. */
export async function listAllLoopWalksForAdmin(countryCode?: string): Promise<LoopWalk[]> {
  if (isSupabaseConfigured() && supabase) {
    const selectFull =
      'id, slug, title, cover_image_url, duration_minutes, steps_count, category, category_label, summary, description, steps, partner_ids, price_type, price_label, contact_phone, contact_url, is_featured_week, is_published, sort_order, click_count, favorite_count, rating_avg, rating_count, star_count, stars_source, engagement_score, country_code, created_at';
    const selectLegacy =
      'id, slug, title, cover_image_url, duration_minutes, steps_count, category, category_label, summary, description, steps, partner_ids, is_featured_week, is_published, sort_order, click_count, favorite_count, rating_avg, rating_count, star_count, stars_source, engagement_score, country_code, created_at';

    for (const select of [selectFull, selectLegacy]) {
      let query = supabase
        .from('loop_walks')
        .select(select)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(200);
      if (countryCode) query = query.eq('country_code', countryCode);

      const { data, error } = await query;
      if (!error && data) {
        return data.map((row) => mapRow(row as unknown as Record<string, unknown>));
      }
      if (error) console.warn('[LoopWalks] liste admin:', error.message);
    }
  }
  return listLoopWalks(countryCode);
}

export async function getFeaturedWeekWalk(countryCode?: string): Promise<LoopWalk | null> {
  const walks = await listLoopWalks(countryCode);
  return walks.find((w) => w.isFeaturedWeek) ?? walks[0] ?? null;
}

export async function listVisibleLoopWalks(
  events: Event[],
  spots: HomeLocation[],
  countryCode?: string,
): Promise<LoopWalk[]> {
  const walks = await listLoopWalks(countryCode);
  return filterPublicWalks(walks, events, spots);
}

export async function getVisibleFeaturedWeekWalk(
  events: Event[],
  spots: HomeLocation[],
  countryCode?: string,
): Promise<LoopWalk | null> {
  const walks = await listVisibleLoopWalks(events, spots, countryCode);
  return walks.find((w) => w.isFeaturedWeek) ?? walks[0] ?? null;
}

export function isLoopWalkVisible(
  walk: LoopWalk,
  events: Event[],
  spots: HomeLocation[],
): boolean {
  return isWalkPubliclyVisible(walk, events, spots);
}

export async function getLoopWalkBySlug(slug: string): Promise<LoopWalk | null> {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('loop_walks')
      .select('id, slug, title, cover_image_url, duration_minutes, steps_count, category, category_label, summary, description, steps, partner_ids, price_type, price_label, contact_phone, contact_url, is_featured_week, is_published, sort_order, click_count, favorite_count, rating_avg, rating_count, star_count, stars_source, engagement_score, country_code, created_at')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();

    if (!error && data) {
      const mapped = mapRow(data as Record<string, unknown>);
      if (mapped.steps.length > 0 && mapped.steps[0].targetType) return mapped;
    }
    if (error) console.warn('[LoopWalks] détail:', error.message);
  }

  const walks = await ensureDemo();
  return walks.find((w) => w.slug === slug) ?? null;
}
