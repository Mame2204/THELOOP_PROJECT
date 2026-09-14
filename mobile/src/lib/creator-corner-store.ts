import AsyncStorage from '@react-native-async-storage/async-storage';
import { pickCurrentAccueilItem } from '@/lib/accueil-scheduling';
import { hydrateScoped, invalidateScope, peekScoped, scopedStorageKey } from '@/lib/swr-cache';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const DEMO_KEY = 'loop_creator_corner_demo_v3';
const CORNER_CACHE = 'loop_creator_corner_active_v2';
const DEMO_ID = 'demo-creator-salimatou';
const DEMO_SLUG = 'salimatou-sako-impact-2026';

export type SinguliersRelatedType = 'spot' | 'event' | 'tool';

export interface CreatorUsefulLink {
  label: string;
  url: string;
}

/**
 * Les Singuliers — impact / œuvre / singularité.
 * Pas une biographie : on expose ce qui bouge les lignes à Conakry.
 */
export interface CreatorCornerFeature {
  id: string;
  slug: string;
  /** Sujet (personne, projet, collectif, lieu…). */
  subjectName: string;
  /** Titre de l’œuvre / de l’angle. */
  title: string;
  category: string | null;
  locationLabel: string | null;
  /** Badge court (essence de la démarche). */
  badgeTag: string | null;
  /** Citation en exergue. */
  coreQuote: string | null;
  /** Texte d’impact — ce que ça change concrètement. */
  impactDescription: string;
  /** Visuel de l’œuvre / de l’action. */
  mediaUrl: string | null;
  ctaLabel: string;
  relatedTargetType: SinguliersRelatedType | null;
  relatedTargetId: string | null;
  relatedTargetSlug: string | null;
  usefulLinks: CreatorUsefulLink[];
  periodLabel: string | null;
}

export const CREATOR_CORNER_SELECT =
  'id, slug, person_name, person_role, location_label, hook, title, cta_label, cover_image_url, portrait_url, story, journey, advice, favorite_pick, useful_links, period_label, period_start, period_end, country_code, click_count, created_at, category, badge_tag, core_quote, impact_description, media_url, related_target_type, related_target_id, related_target_slug';

function demoFeature(): CreatorCornerFeature {
  return {
    id: DEMO_ID,
    slug: DEMO_SLUG,
    subjectName: 'Salimatou Sako',
    title: 'Narration stratégique hors vernis',
    category: 'Stratégie & Impact',
    locationLabel: 'Conakry, Guinée',
    badgeTag: 'Rupture de narration',
    coreQuote: 'Sortir du vernis esthétique pour une vraie profondeur de fond.',
    impactDescription:
      'Structurer la communication stratégique et institutionnelle pour amener de la profondeur là où il y avait un déficit de narration professionnelle — une singularité qui change concrètement le paysage local.',
    mediaUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80',
    ctaLabel: 'Découvrir',
    relatedTargetType: null,
    relatedTargetId: null,
    relatedTargetSlug: null,
    usefulLinks: [],
    periodLabel: 'Août 2026',
  };
}

function parseLinks(raw: unknown): CreatorUsefulLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const label = typeof row.label === 'string' ? row.label.trim() : '';
      let url = typeof row.url === 'string' ? row.url.trim() : '';
      if (!url) return null;
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      return { label: label || url.replace(/^https?:\/\//i, '').split('/')[0] || 'Lien', url };
    })
    .filter((l): l is CreatorUsefulLink => l !== null);
}

function parseRelatedType(raw: unknown): SinguliersRelatedType | null {
  if (raw === 'spot' || raw === 'event' || raw === 'tool') return raw;
  return null;
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function mapCreatorCornerRow(row: Record<string, unknown>): CreatorCornerFeature {
  const subjectName = String(
    row.person_name ?? row.personName ?? row.subject_name ?? row.subjectName ?? '',
  ).trim();
  const title = String(row.title ?? '').trim();
  const badgeTag =
    strOrNull(row.badge_tag ?? row.badgeTag) ??
    strOrNull(row.person_role ?? row.personRole) ??
    strOrNull(row.hook);
  const impactDescription =
    strOrNull(row.impact_description ?? row.impactDescription) ??
    strOrNull(row.story) ??
    strOrNull(row.hook) ??
    title;
  const mediaUrl =
    strOrNull(row.media_url ?? row.mediaUrl) ??
    strOrNull(row.cover_image_url ?? row.coverImageUrl) ??
    strOrNull(row.portrait_url ?? row.portraitUrl);

  return {
    id: String(row.id),
    slug: String(row.slug),
    subjectName,
    title,
    category: strOrNull(row.category) ?? strOrNull(row.person_role ?? row.personRole),
    locationLabel: strOrNull(row.location_label ?? row.locationLabel),
    badgeTag,
    coreQuote: strOrNull(row.core_quote ?? row.coreQuote) ?? strOrNull(row.advice),
    impactDescription,
    mediaUrl,
    ctaLabel: String(row.cta_label ?? row.ctaLabel ?? 'Découvrir'),
    relatedTargetType: parseRelatedType(row.related_target_type ?? row.relatedTargetType),
    relatedTargetId: strOrNull(row.related_target_id ?? row.relatedTargetId),
    relatedTargetSlug: strOrNull(row.related_target_slug ?? row.relatedTargetSlug),
    usefulLinks: parseLinks(row.useful_links ?? row.usefulLinks),
    periodLabel: strOrNull(row.period_label ?? row.periodLabel),
  };
}

async function ensureDemo(): Promise<CreatorCornerFeature> {
  try {
    const raw = await AsyncStorage.getItem(DEMO_KEY);
    if (raw) {
      const parsed = mapCreatorCornerRow(JSON.parse(raw) as Record<string, unknown>);
      if (parsed?.id && parsed.slug && parsed.title && parsed.subjectName) return parsed;
    }
  } catch {
    /* seed */
  }
  const feature = demoFeature();
  await AsyncStorage.setItem(DEMO_KEY, JSON.stringify(feature));
  return feature;
}

function normalizeCachedFeature(raw: unknown): CreatorCornerFeature | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (!row.id && !row.slug) return null;
  const feature = mapCreatorCornerRow(row);
  if (!feature.id || !feature.slug || !feature.title.trim() || !feature.subjectName.trim()) return null;
  if (!feature.impactDescription.trim()) return null;
  return feature;
}

export async function peekActiveCreatorCorner(countryCode?: string): Promise<CreatorCornerFeature | null> {
  const country = countryCode ?? 'GN';
  const scope = `creator_corner_${country}`;
  const hit = await peekScoped<CreatorCornerFeature>(scope, scopedStorageKey(CORNER_CACHE, country));
  return normalizeCachedFeature(hit);
}

async function fetchActiveCreatorCornerRemote(countryCode?: string): Promise<CreatorCornerFeature | null> {
  if (!isSupabaseConfigured() || !supabase || !countryCode) return null;

  const { data, error } = await supabase
    .from('creator_corner_features')
    .select(CREATOR_CORNER_SELECT)
    .eq('country_code', countryCode)
    .eq('is_active', true)
    .order('period_start', { ascending: false })
    .limit(10);

  if (error) {
    console.warn('[CreatorCorner] lecture:', error.message);
    return null;
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const picked = pickCurrentAccueilItem(
    rows.map((row) => ({
      id: String(row.id),
      periodStart: row.period_start != null ? String(row.period_start) : null,
      periodEnd: row.period_end != null ? String(row.period_end) : null,
      isActive: true,
      createdAt: row.created_at != null ? String(row.created_at) : null,
    })),
  );
  if (!picked?.id) return null;

  const match = rows.find((row) => String(row.id) === picked.id);
  return match ? mapCreatorCornerRow(match) : null;
}

export function invalidateActiveCreatorCornerCache(countryCode?: string): void {
  const country = countryCode ?? 'GN';
  invalidateScope(`creator_corner_${country}`, scopedStorageKey(CORNER_CACHE, country));
}

export async function loadActiveCreatorCorner(
  countryCode?: string,
  options?: { force?: boolean },
): Promise<CreatorCornerFeature | null> {
  if (isSupabaseConfigured() && supabase) {
    if (!countryCode) return null;

    if (options?.force) {
      invalidateActiveCreatorCornerCache(countryCode);
    }

    const scope = `creator_corner_${countryCode}`;
    const cached = options?.force ? null : await peekActiveCreatorCorner(countryCode);
    if (cached) {
      return cached;
    }

    const fresh = await fetchActiveCreatorCornerRemote(countryCode);
    if (fresh) {
      await hydrateScoped(scope, scopedStorageKey(CORNER_CACHE, countryCode), fresh);
      return fresh;
    }
    return null;
  }

  if (countryCode && countryCode !== 'GN') return null;
  return ensureDemo();
}

export async function getCreatorCornerBySlug(slug: string): Promise<CreatorCornerFeature | null> {
  if (isSupabaseConfigured() && supabase && slug !== DEMO_SLUG) {
    const { data, error } = await supabase
      .from('creator_corner_features')
      .select(CREATOR_CORNER_SELECT)
      .eq('slug', slug)
      .maybeSingle();

    if (!error && data) {
      return mapCreatorCornerRow(data as Record<string, unknown>);
    }
    if (error) console.warn('[CreatorCorner] détail:', error.message);
  }

  const demo = await ensureDemo();
  return demo.slug === slug || demo.id === slug ? demo : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Enregistre une ouverture Singuliers (fiche détail uniquement). */
export async function recordCreatorCornerClick(cornerId: string): Promise<number> {
  if (!isSupabaseConfigured() || !supabase || !UUID_RE.test(cornerId)) {
    return 0;
  }

  const { error } = await supabase.rpc('increment_creator_corner_click', { p_corner_id: cornerId });
  if (error) {
    console.warn('[CreatorCorner] increment click:', error.message);
    return 0;
  }

  const { data } = await supabase
    .from('creator_corner_features')
    .select('click_count')
    .eq('id', cornerId)
    .maybeSingle();

  return Number(data?.click_count ?? 0);
}
