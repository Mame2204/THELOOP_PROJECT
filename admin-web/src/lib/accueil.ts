import { resolveMemberContentSlug } from './content-slugs';
import { supabase } from './supabase';

export const ACCUEIL_PAGE_SIZE = 20;

export interface AccueilListResult<T> {
  items: T[];
  total: number;
  error?: string;
}

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || `item-${Date.now()}`;
}

function paginateRange(page: number, pageSize: number): { from: number; to: number } {
  const from = Math.max(0, page) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export interface AccueilBlocksConfig {
  hero: boolean;
  poll: boolean;
  corner: boolean;
  chronique: boolean;
  walks: boolean;
  logos: boolean;
}

export interface AppSectionsConfig {
  accueil: AccueilBlocksConfig;
  agenda: { hero: boolean; filters: boolean; tabVisible: boolean };
  spots: { hero: boolean; filters: boolean; tabVisible: boolean };
  outils: { hero: boolean; filters: boolean; tabVisible: boolean };
  partnerPro: {
    content: boolean;
    benefits: boolean;
    featured: boolean;
    rewards: boolean;
    stats: boolean;
    spaceVisible: boolean;
  };
}

export const DEFAULT_SECTIONS: AppSectionsConfig = {
  accueil: { hero: true, poll: true, corner: true, chronique: true, walks: true, logos: true },
  agenda: { hero: false, filters: true, tabVisible: true },
  spots: { hero: false, filters: true, tabVisible: true },
  outils: { hero: false, filters: true, tabVisible: true },
  partnerPro: {
    content: true,
    benefits: true,
    featured: true,
    rewards: true,
    stats: true,
    spaceVisible: true,
  },
};

export const ACCUEIL_BLOCK_LABELS: Record<keyof AccueilBlocksConfig, string> = {
  hero: 'À la une',
  poll: 'Sondage',
  corner: 'Le Singulier',
  chronique: 'Le Fragment',
  walks: 'Parcours',
  logos: 'Logos partenaires',
};

function remoteKey(countryCode: string) {
  return `app_sections_ui_${countryCode.toUpperCase().slice(0, 2)}`;
}

function mergeSections(raw: unknown): AppSectionsConfig {
  const base = structuredClone(DEFAULT_SECTIONS);
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Partial<AppSectionsConfig>;
  if (src.accueil) base.accueil = { ...base.accueil, ...src.accueil };
  if (src.agenda) base.agenda = { ...base.agenda, ...src.agenda };
  if (src.spots) base.spots = { ...base.spots, ...src.spots };
  if (src.outils) base.outils = { ...base.outils, ...src.outils };
  if (src.partnerPro) base.partnerPro = { ...base.partnerPro, ...src.partnerPro };
  return base;
}

export async function loadAppSections(countryCode: string): Promise<AppSectionsConfig> {
  const key = remoteKey(countryCode);
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (data?.value != null) return mergeSections(data.value);
  if (countryCode.toUpperCase() === 'GN') {
    const legacy = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'app_sections_ui')
      .maybeSingle();
    if (legacy.data?.value != null) return mergeSections(legacy.data.value);
  }
  return structuredClone(DEFAULT_SECTIONS);
}

export async function saveAppSections(
  countryCode: string,
  next: AppSectionsConfig,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('app_settings').upsert({
    key: remoteKey(countryCode),
    value: next,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setAccueilBlock(
  countryCode: string,
  key: keyof AccueilBlocksConfig,
  enabled: boolean,
): Promise<{ ok: boolean; sections?: AppSectionsConfig; error?: string }> {
  const current = await loadAppSections(countryCode);
  const next = {
    ...current,
    accueil: { ...current.accueil, [key]: enabled },
  };
  const res = await saveAppSections(countryCode, next);
  if (!res.ok) return res;
  return { ok: true, sections: next };
}

export interface WalkStepInput {
  targetType: 'event' | 'spot' | 'tool';
  targetId: string;
  title: string;
}

export interface AccueilPollRow {
  id: string;
  question: string;
  optionLabels: string[];
  isActive: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string | null;
}

export interface AccueilWalkRow {
  id: string;
  title: string;
  isPublished: boolean;
  isFeaturedWeek: boolean;
  durationMinutes: number | null;
  summary: string | null;
  coverImageUrl: string | null;
  steps: WalkStepInput[];
  updatedAt: string | null;
}

export interface AccueilCornerRow {
  id: string;
  title: string;
  subjectName: string;
  impactDescription: string;
  locationLabel: string | null;
  badgeTag: string | null;
  coreQuote: string | null;
  mediaUrl: string | null;
  relatedTargetType: 'event' | 'spot' | 'tool' | null;
  relatedTargetId: string | null;
  relatedTargetSlug: string | null;
  isActive: boolean;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface AccueilChroniqueRow {
  id: string;
  title: string;
  body: string;
  volumeLabel: string | null;
  footnote: string | null;
  ctaEnabled: boolean;
  contactPhone: string | null;
  contactEmail: string | null;
  targetType: 'event' | 'spot' | 'tool' | null;
  targetId: string | null;
  targetSlug: string | null;
  locationLabel: string | null;
  isActive: boolean;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface AccueilLogoRow {
  id: string;
  name: string;
  logoUrl: string;
  websiteUrl: string | null;
  isActive: boolean;
  sortOrder: number;
}

function parsePollOptionLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const row = item as { label?: string };
      return typeof row.label === 'string' ? row.label.trim() : '';
    })
    .filter(Boolean);
}

export async function listAccueilPolls(countryCode: string): Promise<AccueilPollRow[]> {
  const cc = countryCode.toUpperCase().slice(0, 2);
  const { data, error } = await supabase
    .from('home_polls')
    .select('id, question, options, is_active, period_start, period_end, created_at')
    .eq('country_code', cc)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) {
    console.warn('[accueil] polls', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    question: String(r.question ?? ''),
    optionLabels: parsePollOptionLabels(r.options),
    isActive: Boolean(r.is_active),
    periodStart: r.period_start ? String(r.period_start) : null,
    periodEnd: r.period_end ? String(r.period_end) : null,
    createdAt: r.created_at ? String(r.created_at) : null,
  }));
}

function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export async function upsertAccueilPoll(
  countryCode: string,
  input: {
    id?: string;
    question: string;
    optionLabels: string[];
    activate?: boolean;
    periodStart?: string | null;
    periodEnd?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const q = input.question.trim();
  const options = input.optionLabels
    .map((label, i) => ({ id: `opt${i + 1}`, label: label.trim() }))
    .filter((o) => o.label)
    .slice(0, 4);
  if (!q) return { ok: false, error: 'Question requise.' };
  if (options.length < 2) return { ok: false, error: 'Au moins 2 choix de réponse requis.' };

  const payload = {
    question: q,
    options,
    week_key: isoWeekKey(),
    is_active: input.activate !== false,
    country_code: countryCode.toUpperCase().slice(0, 2),
    period_start: input.periodStart?.trim() || null,
    period_end: input.periodEnd?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await supabase.from('home_polls').update(payload).eq('id', input.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase.from('home_polls').insert({
    id: crypto.randomUUID(),
    ...payload,
    created_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** @deprecated Préférer `upsertAccueilPoll` avec choix de réponses. */
export async function createPoll(
  countryCode: string,
  question: string,
  optionLabels?: string[],
): Promise<{ ok: boolean; error?: string }> {
  return upsertAccueilPoll(countryCode, {
    question,
    optionLabels: optionLabels ?? [],
    activate: true,
  });
}

export async function upsertAccueilWalk(
  countryCode: string,
  input: {
    id?: string;
    title: string;
    summary?: string;
    description?: string;
    coverImageUrl?: string;
    durationMinutes?: number | null;
    steps: WalkStepInput[];
    activateFeatured?: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Titre requis.' };
  if (input.steps.length < 2) {
    return { ok: false, error: 'Sélectionnez au moins 2 étapes (événement, spot ou outil).' };
  }

  const stepsJson = input.steps.map((s, i) => ({
    order: i + 1,
    target_type: s.targetType,
    target_id: s.targetId,
    title: s.title,
    description: null,
  }));
  const cover =
    input.coverImageUrl?.trim() ||
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80';
  const rawDuration = Number(input.durationMinutes ?? 0);
  const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.round(rawDuration) : 0;
  const now = new Date().toISOString();

  if (input.activateFeatured) {
    await supabase
      .from('loop_walks')
      .update({ is_featured_week: false, updated_at: now })
      .eq('country_code', countryCode)
      .eq('is_featured_week', true);
  }

  const payload = {
    title,
    cover_image_url: cover,
    duration_minutes: duration,
    steps_count: stepsJson.length,
    category: 'parcours',
    category_label: 'Parcours',
    summary: input.summary?.trim() || null,
    description: input.description?.trim() || null,
    steps: stepsJson,
    price_type: 'free',
    price_label: null,
    contact_phone: null,
    contact_url: null,
    country_code: countryCode,
    updated_at: now,
    ...(input.activateFeatured ? { is_featured_week: true, is_published: true } : {}),
  };

  if (input.id) {
    const { error } = await supabase.from('loop_walks').update(payload).eq('id', input.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase.from('loop_walks').insert({
    id: crypto.randomUUID(),
    slug: `${slugify(title)}-${Date.now().toString(36).slice(-4)}`,
    is_published: true,
    is_featured_week: Boolean(input.activateFeatured),
    sort_order: 99,
    partner_ids: [],
    star_count: 3,
    created_at: now,
    ...payload,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function upsertAccueilCorner(
  countryCode: string,
  input: {
    id?: string;
    subjectName: string;
    title: string;
    impactDescription: string;
    locationLabel?: string;
    badgeTag?: string;
    coreQuote?: string;
    mediaUrl?: string;
    relatedTargetType?: 'event' | 'spot' | 'tool' | null;
    relatedTargetId?: string | null;
    relatedTargetSlug?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    activate?: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
  const subjectName = input.subjectName.trim();
  const title = input.title.trim();
  const impactDescription = input.impactDescription.trim();
  if (!subjectName || !title || !impactDescription) {
    return { ok: false, error: 'Sujet, titre de l’œuvre et impact requis.' };
  }
  const slug = slugify(`${subjectName}-${title}`);
  const now = new Date().toISOString();
  const mediaUrl = input.mediaUrl?.trim() || null;
  const relatedTargetType = input.relatedTargetType ?? null;
  let relatedTargetSlug = relatedTargetType ? input.relatedTargetSlug?.trim() || null : null;
  if (relatedTargetType && input.relatedTargetId?.trim()) {
    const resolved = await resolveMemberContentSlug(
      countryCode,
      relatedTargetType,
      input.relatedTargetId.trim(),
    );
    if (resolved) relatedTargetSlug = resolved.slug;
  }
  const payload = {
    slug,
    person_name: subjectName,
    person_role: null,
    location_label: input.locationLabel?.trim() || null,
    hook: (input.badgeTag?.trim() || impactDescription).slice(0, 180),
    title,
    cta_label: 'Découvrir',
    cover_image_url: mediaUrl,
    portrait_url: null,
    story: null,
    journey: null,
    advice: input.coreQuote?.trim() || null,
    favorite_pick: null,
    useful_links: [],
    period_label: null,
    period_start: input.periodStart?.trim() || null,
    period_end: input.periodEnd?.trim() || null,
    is_active: input.activate === true,
    country_code: countryCode,
    category: null,
    badge_tag: input.badgeTag?.trim() || null,
    core_quote: input.coreQuote?.trim() || null,
    impact_description: impactDescription,
    media_url: mediaUrl,
    related_target_type: relatedTargetType,
    related_target_id: relatedTargetType ? input.relatedTargetId?.trim() || null : null,
    related_target_slug: relatedTargetSlug,
    updated_at: now,
  };

  if (input.id) {
    const { error } = await supabase.from('creator_corner_features').update(payload).eq('id', input.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase.from('creator_corner_features').insert({
    ...payload,
    created_at: now,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function upsertAccueilChronique(
  countryCode: string,
  input: {
    id?: string;
    title: string;
    body: string;
    volumeLabel?: string;
    footnote?: string;
    ctaEnabled?: boolean;
    contactPhone?: string;
    contactEmail?: string;
    targetType?: 'event' | 'spot' | 'tool' | null;
    targetId?: string | null;
    targetSlug?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    activate?: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) return { ok: false, error: 'Titre et texte requis.' };

  const ctaEnabled = input.ctaEnabled !== false;
  const targetType = input.targetType ?? null;
  if (ctaEnabled) {
    if (!targetType || !input.targetId?.trim()) {
      return { ok: false, error: 'Sélectionnez un contenu pour le bouton Découvrir.' };
    }
  } else if (!input.contactPhone?.trim() && !input.contactEmail?.trim()) {
    return {
      ok: false,
      error: 'Sans bouton Découvrir, renseignez un téléphone ou un e-mail de contact.',
    };
  }

  const slug = slugify(`${title}-${input.volumeLabel ?? isoWeekKey()}`);
  const now = new Date().toISOString();
  let targetSlug = input.targetSlug?.trim() || null;
  let locationLabel: string | null = null;
  if (ctaEnabled && targetType && input.targetId?.trim()) {
    const resolved = await resolveMemberContentSlug(countryCode, targetType, input.targetId.trim());
    if (resolved) {
      targetSlug = resolved.slug;
      locationLabel = resolved.label;
    }
  }
  const payload = {
    slug,
    person_name: title,
    person_role: null,
    location_label: locationLabel,
    hook: body,
    title,
    cta_label: 'Découvrir',
    cta_enabled: ctaEnabled,
    contact_phone: input.contactPhone?.trim() || null,
    contact_email: input.contactEmail?.trim() || null,
    cover_image_url: null,
    portrait_url: null,
    story: null,
    journey: null,
    advice: input.footnote?.trim() || null,
    favorite_pick: null,
    useful_links: [],
    footnote: input.footnote?.trim() || null,
    target_type: ctaEnabled ? targetType : targetType,
    target_id: input.targetId?.trim() || null,
    target_slug: targetSlug,
    period_label: input.volumeLabel?.trim() || null,
    period_start: input.periodStart?.trim() || null,
    period_end: input.periodEnd?.trim() || null,
    is_active: input.activate === true,
    country_code: countryCode,
    updated_at: now,
  };

  if (input.id) {
    const { error } = await supabase.from('chronique_features').update(payload).eq('id', input.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase.from('chronique_features').insert({
    ...payload,
    created_at: now,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setPollActive(
  id: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('home_polls')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deletePoll(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('home_polls').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function parseWalkSteps(raw: unknown): WalkStepInput[] {
  if (!Array.isArray(raw)) return [];
  const steps: WalkStepInput[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const targetType = o.target_type ?? o.targetType;
    const targetId = o.target_id ?? o.targetId;
    if (targetType !== 'event' && targetType !== 'spot' && targetType !== 'tool') continue;
    if (typeof targetId !== 'string' || !targetId.trim()) continue;
    steps.push({
      targetType,
      targetId: targetId.trim(),
      title: typeof o.title === 'string' ? o.title : 'Étape',
    });
  }
  return steps;
}

export async function listAccueilWalks(countryCode: string): Promise<AccueilWalkRow[]> {
  const cc = countryCode.toUpperCase().slice(0, 2);
  const { data, error } = await supabase
    .from('loop_walks')
    .select(
      'id, title, is_published, is_featured_week, duration_minutes, summary, cover_image_url, steps, created_at',
    )
    .eq('country_code', cc)
    .order('sort_order', { ascending: true })
    .limit(100);
  if (error) {
    console.warn('[accueil] walks', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? 'Parcours'),
    isPublished: Boolean(r.is_published),
    isFeaturedWeek: Boolean(r.is_featured_week),
    durationMinutes: r.duration_minutes != null ? Number(r.duration_minutes) : null,
    summary: r.summary != null ? String(r.summary) : null,
    coverImageUrl: r.cover_image_url != null ? String(r.cover_image_url) : null,
    steps: parseWalkSteps(r.steps),
    updatedAt: r.created_at ? String(r.created_at) : null,
  }));
}

export async function setWalkPublished(
  id: string,
  published: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('loop_walks')
    .update({ is_published: published, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setWalkFeaturedWeek(
  walkId: string,
  countryCode: string,
): Promise<{ ok: boolean; error?: string }> {
  await supabase
    .from('loop_walks')
    .update({ is_featured_week: false, updated_at: new Date().toISOString() })
    .eq('country_code', countryCode)
    .eq('is_featured_week', true);
  const { error } = await supabase
    .from('loop_walks')
    .update({
      is_featured_week: true,
      is_published: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', walkId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function clearWalkFeaturedWeek(
  countryCode: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('loop_walks')
    .update({ is_featured_week: false, updated_at: new Date().toISOString() })
    .eq('country_code', countryCode)
    .eq('is_featured_week', true);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteWalk(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('loop_walks').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const CORNER_LIST_SELECT =
  'id, title, person_name, impact_description, location_label, badge_tag, core_quote, media_url, related_target_type, related_target_id, related_target_slug, is_active, period_start, period_end';

export async function listAccueilCorners(
  countryCode: string,
  options?: { page?: number; pageSize?: number; withTotal?: boolean },
): Promise<AccueilListResult<AccueilCornerRow>> {
  const page = Math.max(0, options?.page ?? 0);
  const pageSize = Math.min(50, Math.max(1, options?.pageSize ?? ACCUEIL_PAGE_SIZE));
  const withTotal = options?.withTotal === true;
  const { from, to } = paginateRange(page, pageSize);

  const { data, error, count } = await supabase
    .from('creator_corner_features')
    .select(CORNER_LIST_SELECT, withTotal ? { count: 'exact' } : undefined)
    .eq('country_code', countryCode)
    .order('period_start', { ascending: false })
    .range(from, to);

  if (error) {
    console.warn('[accueil] corner', error.message);
    return { items: [], total: 0, error: error.message };
  }

  return {
    items: (data ?? []).map((r) => ({
      id: String(r.id),
      title: String(r.title ?? ''),
      subjectName: String(r.person_name ?? ''),
      impactDescription: String(r.impact_description ?? ''),
      locationLabel: r.location_label ? String(r.location_label) : null,
      badgeTag: r.badge_tag ? String(r.badge_tag) : null,
      coreQuote: r.core_quote ? String(r.core_quote) : null,
      mediaUrl: r.media_url ? String(r.media_url) : null,
      relatedTargetType:
        r.related_target_type === 'event' || r.related_target_type === 'spot' || r.related_target_type === 'tool'
          ? r.related_target_type
          : null,
      relatedTargetId: r.related_target_id ? String(r.related_target_id) : null,
      relatedTargetSlug: r.related_target_slug ? String(r.related_target_slug) : null,
      isActive: Boolean(r.is_active),
      periodStart: r.period_start ? String(r.period_start) : null,
      periodEnd: r.period_end ? String(r.period_end) : null,
    })),
    total: withTotal && count != null ? count : (data ?? []).length,
  };
}

export async function setCornerActive(
  id: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('creator_corner_features')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteCorner(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('creator_corner_features').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const CHRONIQUE_LIST_SELECT =
  'id, title, hook, period_label, footnote, advice, cta_enabled, contact_phone, contact_email, target_type, target_id, target_slug, location_label, is_active, period_start, period_end';

export async function listAccueilChroniques(
  countryCode: string,
  options?: { page?: number; pageSize?: number; withTotal?: boolean },
): Promise<AccueilListResult<AccueilChroniqueRow>> {
  const page = Math.max(0, options?.page ?? 0);
  const pageSize = Math.min(50, Math.max(1, options?.pageSize ?? ACCUEIL_PAGE_SIZE));
  const withTotal = options?.withTotal === true;
  const { from, to } = paginateRange(page, pageSize);

  const { data, error, count } = await supabase
    .from('chronique_features')
    .select(CHRONIQUE_LIST_SELECT, withTotal ? { count: 'exact' } : undefined)
    .eq('country_code', countryCode)
    .order('period_start', { ascending: false })
    .range(from, to);

  if (error) {
    console.warn('[accueil] chronique', error.message);
    return { items: [], total: 0, error: error.message };
  }

  return {
    items: (data ?? []).map((r) => ({
      id: String(r.id),
      title: String(r.title ?? ''),
      body: String(r.hook ?? ''),
      volumeLabel: r.period_label ? String(r.period_label) : null,
      footnote: r.footnote ? String(r.footnote) : r.advice ? String(r.advice) : null,
      ctaEnabled: r.cta_enabled !== false,
      contactPhone: r.contact_phone ? String(r.contact_phone) : null,
      contactEmail: r.contact_email ? String(r.contact_email) : null,
      targetType:
        r.target_type === 'event' || r.target_type === 'spot' || r.target_type === 'tool'
          ? r.target_type
          : null,
      targetId: r.target_id ? String(r.target_id) : null,
      targetSlug: r.target_slug ? String(r.target_slug) : null,
      locationLabel: r.location_label ? String(r.location_label) : null,
      isActive: Boolean(r.is_active),
      periodStart: r.period_start ? String(r.period_start) : null,
      periodEnd: r.period_end ? String(r.period_end) : null,
    })),
    total: withTotal && count != null ? count : (data ?? []).length,
  };
}

export async function setChroniqueActive(
  id: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('chronique_features')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteChronique(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('chronique_features').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listAccueilLogos(countryCode: string): Promise<AccueilLogoRow[]> {
  const { data, error } = await supabase
    .from('home_partner_logos')
    .select('id, name, logo_url, website_url, sort_order, is_active')
    .eq('country_code', countryCode)
    .order('sort_order', { ascending: true })
    .limit(50);
  if (error) {
    console.warn('[accueil] logos', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    logoUrl: String(r.logo_url ?? ''),
    websiteUrl: r.website_url ? String(r.website_url) : null,
    isActive: r.is_active !== false,
    sortOrder: Number(r.sort_order ?? 0),
  }));
}

export async function setLogoActive(
  id: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('home_partner_logos')
    .update({ is_active: active })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteLogo(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('home_partner_logos').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Création rapide parcours (brouillon — édition complète sur mobile). */
export async function createWalkSimple(
  countryCode: string,
  title: string,
  durationMinutes?: number,
): Promise<{ ok: boolean; error?: string }> {
  const t = title.trim();
  if (!t) return { ok: false, error: 'Titre requis.' };
  const now = new Date().toISOString();
  const { error } = await supabase.from('loop_walks').insert({
    id: crypto.randomUUID(),
    title: t,
    summary: '',
    description: '',
    country_code: countryCode,
    is_published: false,
    is_featured_week: false,
    duration_minutes: durationMinutes && durationMinutes > 0 ? durationMinutes : null,
    steps: [],
    sort_order: 999,
    created_at: now,
    updated_at: now,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function createCornerSimple(
  countryCode: string,
  input: { subjectName: string; title: string; impactDescription: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!input.subjectName.trim() || !input.title.trim() || !input.impactDescription.trim()) {
    return { ok: false, error: 'Sujet, titre et impact requis.' };
  }
  const subjectName = input.subjectName.trim();
  const title = input.title.trim();
  const impactDescription = input.impactDescription.trim();
  const slug = slugify(`${subjectName}-${title}`);
  const now = new Date().toISOString();
  const { error } = await supabase.from('creator_corner_features').insert({
    slug,
    person_name: subjectName,
    hook: impactDescription.slice(0, 180),
    title,
    cta_label: 'Découvrir',
    impact_description: impactDescription,
    useful_links: [],
    country_code: countryCode,
    is_active: false,
    created_at: now,
    updated_at: now,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function createChroniqueSimple(
  countryCode: string,
  input: { title: string; body: string; volumeLabel?: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!input.title.trim() || !input.body.trim()) {
    return { ok: false, error: 'Titre et texte requis.' };
  }
  const title = input.title.trim();
  const body = input.body.trim();
  const volumeLabel = input.volumeLabel?.trim() || null;
  const slug = slugify(`${title}-${volumeLabel ?? 'fragment'}`);
  const now = new Date().toISOString();
  const { error } = await supabase.from('chronique_features').insert({
    slug,
    person_name: title,
    hook: body,
    title,
    cta_label: 'Découvrir',
    period_label: volumeLabel,
    useful_links: [],
    country_code: countryCode,
    is_active: false,
    created_at: now,
    updated_at: now,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function upsertAccueilLogo(
  countryCode: string,
  input: {
    id?: string;
    name: string;
    logoUrl: string;
    websiteUrl?: string;
    isActive?: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
  const name = input.name.trim();
  const logoUrl = input.logoUrl.trim();
  if (!name || !logoUrl) return { ok: false, error: 'Nom et image requis.' };

  const cc = countryCode.toUpperCase().slice(0, 2);
  const payload: Record<string, unknown> = {
    name,
    logo_url: logoUrl,
    website_url: input.websiteUrl?.trim() || null,
    is_active: input.isActive !== false,
    country_code: cc,
    updated_at: new Date().toISOString(),
    source: 'manual',
  };

  async function writeInsert(extra: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const { error } = await supabase.from('home_partner_logos').insert(extra);
    if (!error) return { ok: true };
    if (/source/i.test(error.message)) {
      const { source: _s, ...withoutSource } = extra;
      const retry = await supabase.from('home_partner_logos').insert(withoutSource);
      if (!retry.error) return { ok: true };
      return { ok: false, error: retry.error.message };
    }
    return { ok: false, error: error.message };
  }

  if (input.id) {
    const { error } = await supabase.from('home_partner_logos').update(payload).eq('id', input.id);
    if (error) {
      if (/source/i.test(error.message)) {
        const { source: _s, ...withoutSource } = payload;
        const retry = await supabase.from('home_partner_logos').update(withoutSource).eq('id', input.id);
        if (retry.error) return { ok: false, error: retry.error.message };
      } else {
        return { ok: false, error: error.message };
      }
    }
    return { ok: true };
  }

  const { count } = await supabase
    .from('home_partner_logos')
    .select('id', { count: 'exact', head: true })
    .eq('country_code', cc);
  const sortOrder = (count ?? 0) + 1;
  return writeInsert({
    id: crypto.randomUUID(),
    ...payload,
    sort_order: sortOrder,
  });
}

export async function createLogo(
  countryCode: string,
  input: { name: string; logoUrl: string; websiteUrl?: string },
): Promise<{ ok: boolean; error?: string }> {
  return upsertAccueilLogo(countryCode, { ...input, isActive: true });
}
