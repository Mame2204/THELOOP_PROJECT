import { supabase } from './supabase';

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

export interface AccueilPollRow {
  id: string;
  question: string;
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
  updatedAt: string | null;
}

export interface AccueilCornerRow {
  id: string;
  title: string;
  subjectName: string;
  isActive: boolean;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface AccueilChroniqueRow {
  id: string;
  title: string;
  volumeLabel: string | null;
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

export async function listAccueilPolls(countryCode: string): Promise<AccueilPollRow[]> {
  const { data, error } = await supabase
    .from('home_polls')
    .select('id, question, is_active, period_start, period_end, created_at')
    .eq('country_code', countryCode)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) {
    console.warn('[accueil] polls', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    question: String(r.question ?? ''),
    isActive: Boolean(r.is_active),
    periodStart: r.period_start ? String(r.period_start) : null,
    periodEnd: r.period_end ? String(r.period_end) : null,
    createdAt: r.created_at ? String(r.created_at) : null,
  }));
}

export async function createPoll(
  countryCode: string,
  question: string,
): Promise<{ ok: boolean; error?: string }> {
  const q = question.trim();
  if (!q) return { ok: false, error: 'Question requise.' };
  const { error } = await supabase.from('home_polls').insert({
    id: crypto.randomUUID(),
    question: q,
    is_active: true,
    country_code: countryCode,
    period_start: null,
    period_end: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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

export async function listAccueilWalks(countryCode: string): Promise<AccueilWalkRow[]> {
  const { data, error } = await supabase
    .from('loop_walks')
    .select('id, title, is_published, is_featured_week, duration_minutes, created_at')
    .eq('country_code', countryCode)
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

export async function listAccueilCorners(countryCode: string): Promise<AccueilCornerRow[]> {
  const { data, error } = await supabase
    .from('creator_corner_features')
    .select('id, title, subject_name, is_active, period_start, period_end')
    .eq('country_code', countryCode)
    .order('period_start', { ascending: false })
    .limit(50);
  if (error) {
    console.warn('[accueil] corner', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    subjectName: String(r.subject_name ?? ''),
    isActive: Boolean(r.is_active),
    periodStart: r.period_start ? String(r.period_start) : null,
    periodEnd: r.period_end ? String(r.period_end) : null,
  }));
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

export async function listAccueilChroniques(countryCode: string): Promise<AccueilChroniqueRow[]> {
  const { data, error } = await supabase
    .from('chronique_features')
    .select('id, title, volume_label, is_active, period_start, period_end')
    .eq('country_code', countryCode)
    .order('period_start', { ascending: false })
    .limit(50);
  if (error) {
    console.warn('[accueil] chronique', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    volumeLabel: r.volume_label ? String(r.volume_label) : null,
    isActive: Boolean(r.is_active),
    periodStart: r.period_start ? String(r.period_start) : null,
    periodEnd: r.period_end ? String(r.period_end) : null,
  }));
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
