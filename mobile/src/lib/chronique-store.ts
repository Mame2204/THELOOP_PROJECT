import AsyncStorage from '@react-native-async-storage/async-storage';
import { pickCurrentAccueilItem } from '@/lib/accueil-scheduling';
import { hydrateScoped, invalidateScope, peekScoped, scopedStorageKey } from '@/lib/swr-cache';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const DEMO_KEY = 'loop_chronique_demo_v5';
const CHRONIQUE_CACHE = 'loop_chronique_active_v5';
const DEMO_ID = 'demo-chronique-conakry';
const DEMO_SLUG = 'chronique-conakry-aout-2026';

export type ChroniqueTargetType = 'event' | 'spot' | 'tool';

/** Carte Chronique Accueil — édito court, sans lien avec le Corner. */
export interface ChroniqueFeature {
  id: string;
  slug: string;
  /** Volume optionnel (ex. VOLUME 01) — affiché à droite. */
  volumeLabel: string | null;
  title: string;
  /** Nom du spot / event / outil lié. */
  locationLabel: string | null;
  /** Texte d’ambiance. */
  body: string;
  footnote: string | null;
  ctaLabel: string;
  /** Bouton Découvrir vers le contenu lié. */
  ctaEnabled: boolean;
  contactPhone: string | null;
  contactEmail: string | null;
  targetType: ChroniqueTargetType | null;
  targetId: string | null;
  targetSlug: string | null;
}

const CHRONIQUE_SELECT =
  'id, slug, person_name, location_label, hook, title, cta_label, cta_enabled, contact_phone, contact_email, period_label, footnote, advice, target_type, target_id, target_slug, period_start, period_end, country_code, click_count, created_at, is_active';

export function defaultChroniqueCtaLabel(type: ChroniqueTargetType | null | undefined): string {
  switch (type) {
    case 'event':
      return 'Découvrir l’événement';
    case 'tool':
      return 'Découvrir l’outil';
    case 'spot':
      return 'Découvrir le refuge';
    default:
      return 'Découvrir';
  }
}

function demoFeature(): ChroniqueFeature {
  return {
    id: DEMO_ID,
    slug: DEMO_SLUG,
    volumeLabel: null,
    title: 'FACE À L’ATLANTIQUE',
    locationLabel: 'Palm Camayenne',
    body:
      'Ici, le temps s’étire au rythme des vagues qui viennent frapper la Corniche. Loin de l’agitation urbaine, la terrasse se transforme en un poste d’observation privilégié pour assister au coucher du soleil.\n\nOn vient chercher ce silence suspendu, un verre à la main, entre deux rendez-vous d’importance. Le luxe, ici, c’est de souffler.',
    footnote: '¹ Accédez à l’avantage exclusif du Palm Camayenne via le cercle.',
    ctaLabel: 'Découvrir le refuge',
    ctaEnabled: true,
    contactPhone: null,
    contactEmail: null,
    targetType: 'spot',
    targetId: 'loc-5',
    targetSlug: 'palm-camayenne',
  };
}

function asTargetType(raw: unknown): ChroniqueTargetType | null {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (v === 'event' || v === 'spot' || v === 'tool') return v;
  return null;
}

function asOptionalString(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
}

export function mapChroniqueRow(row: Record<string, unknown>): ChroniqueFeature {
  const targetType = asTargetType(row.target_type ?? row.targetType);
  const body = String(row.hook ?? row.body ?? '').trim();
  const footnoteRaw =
    row.footnote != null
      ? String(row.footnote)
      : row.advice != null
        ? String(row.advice)
        : null;
  const ctaRaw = String(row.cta_label ?? row.ctaLabel ?? '').trim();
  const ctaEnabledRaw = row.cta_enabled ?? row.ctaEnabled;
  const ctaEnabled = ctaEnabledRaw === false || ctaEnabledRaw === 'false' ? false : true;

  return {
    id: String(row.id),
    slug: String(row.slug),
    volumeLabel:
      row.period_label != null
        ? String(row.period_label)
        : row.periodLabel != null
          ? String(row.periodLabel)
          : row.volumeLabel != null
            ? String(row.volumeLabel)
            : null,
    title: String(row.title ?? ''),
    locationLabel:
      row.location_label != null
        ? String(row.location_label)
        : row.locationLabel != null
          ? String(row.locationLabel)
          : null,
    body,
    footnote: footnoteRaw?.trim() ? footnoteRaw.trim() : null,
    ctaLabel: ctaRaw || defaultChroniqueCtaLabel(targetType),
    ctaEnabled,
    contactPhone: asOptionalString(row.contact_phone ?? row.contactPhone),
    contactEmail: asOptionalString(row.contact_email ?? row.contactEmail),
    targetType,
    targetId:
      row.target_id != null
        ? String(row.target_id)
        : row.targetId != null
          ? String(row.targetId)
          : null,
    targetSlug:
      row.target_slug != null
        ? String(row.target_slug)
        : row.targetSlug != null
          ? String(row.targetSlug)
          : null,
  };
}

/** @deprecated Prefer mapChroniqueRow */
function mapRow(row: Record<string, unknown>): ChroniqueFeature {
  return mapChroniqueRow(row);
}

async function ensureDemo(): Promise<ChroniqueFeature> {
  try {
    const raw = await AsyncStorage.getItem(DEMO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const feature = normalizeCachedFeature(parsed);
      if (feature) return feature;
    }
  } catch {
    /* seed */
  }
  const feature = demoFeature();
  await AsyncStorage.setItem(DEMO_KEY, JSON.stringify(feature));
  return feature;
}

function normalizeCachedFeature(raw: unknown): ChroniqueFeature | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (!row.id && !row.slug) return null;
  // Rejette un objet Singuliers (subjectName / personName) sans body Chronique.
  if (('subjectName' in row || 'personName' in row) && !('body' in row)) return null;
  const feature = mapRow(row);
  if (!feature.id || !feature.slug || !feature.title.trim() || !feature.body.trim()) return null;
  return feature;
}

export async function peekActiveChronique(countryCode?: string): Promise<ChroniqueFeature | null> {
  const country = countryCode ?? 'GN';
  const scope = `chronique_${country}`;
  const hit = await peekScoped<ChroniqueFeature>(scope, scopedStorageKey(CHRONIQUE_CACHE, country));
  return normalizeCachedFeature(hit);
}

async function fetchActiveChroniqueRemote(countryCode?: string): Promise<ChroniqueFeature | null> {
  if (!isSupabaseConfigured() || !supabase || !countryCode) return null;

  const selectFull = CHRONIQUE_SELECT;
  const selectLegacy =
    'id, slug, person_name, location_label, hook, title, cta_label, period_label, footnote, advice, target_type, target_id, target_slug, period_start, period_end, country_code, click_count, created_at, is_active';

  let rows: Record<string, unknown>[] = [];
  for (const select of [selectFull, selectLegacy]) {
    const { data, error } = await supabase
      .from('chronique_features')
      .select(select)
      .eq('country_code', countryCode)
      .eq('is_active', true)
      .order('period_start', { ascending: false })
      .limit(10);

    if (!error && data) {
      rows = data as unknown as Record<string, unknown>[];
      break;
    }
    if (error) console.warn('[Chronique] lecture:', error.message);
  }

  if (!rows.length) return null;

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
  return match ? mapChroniqueRow(match) : null;
}

export function invalidateActiveChroniqueCache(countryCode?: string): void {
  const country = countryCode ?? 'GN';
  invalidateScope(`chronique_${country}`, scopedStorageKey(CHRONIQUE_CACHE, country));
}

export async function loadActiveChronique(
  countryCode?: string,
  options?: { force?: boolean },
): Promise<ChroniqueFeature | null> {
  if (isSupabaseConfigured() && supabase) {
    if (!countryCode) return null;

    if (options?.force) {
      invalidateActiveChroniqueCache(countryCode);
    }

    const scope = `chronique_${countryCode}`;
    const cached = options?.force ? null : await peekActiveChronique(countryCode);
    if (cached) {
      return cached;
    }

    const fresh = await fetchActiveChroniqueRemote(countryCode);
    if (fresh) {
      await hydrateScoped(scope, scopedStorageKey(CHRONIQUE_CACHE, countryCode), fresh);
      return fresh;
    }
    return null;
  }

  if (countryCode && countryCode !== 'GN') return null;
  return ensureDemo();
}

/** @deprecated Plus de page article — conservé pour compat cache / admin. */
export async function getChroniqueBySlug(slug: string): Promise<ChroniqueFeature | null> {
  if (isSupabaseConfigured() && supabase && slug !== DEMO_SLUG) {
    const { data, error } = await supabase
      .from('chronique_features')
      .select(CHRONIQUE_SELECT)
      .eq('slug', slug)
      .maybeSingle();

    if (!error && data) {
      return mapRow(data as Record<string, unknown>);
    }
    if (error) console.warn('[Chronique] détail:', error.message);
  }

  const demo = await ensureDemo();
  return demo.slug === slug || demo.id === slug ? demo : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Enregistre un clic CTA Chronique (redirection fiche contenu). */
export async function recordChroniqueClick(chroniqueId: string): Promise<number> {
  if (!isSupabaseConfigured() || !supabase || !UUID_RE.test(chroniqueId)) {
    return 0;
  }

  const { error } = await supabase.rpc('increment_chronique_click', { p_chronique_id: chroniqueId });
  if (error) {
    console.warn('[Chronique] increment click:', error.message);
    return 0;
  }

  const { data } = await supabase
    .from('chronique_features')
    .select('click_count')
    .eq('id', chroniqueId)
    .maybeSingle();

  return Number(data?.click_count ?? 0);
}
