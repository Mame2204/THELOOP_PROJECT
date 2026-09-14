import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  normalizeIsoDate,
  validateAccueilPeriodRange,
  validateUniquePeriodStart,
} from '@/lib/accueil-scheduling';
import type {
  CreatorCornerFeature,
  CreatorUsefulLink,
  SinguliersRelatedType,
} from '@/lib/creator-corner-store';
import {
  CREATOR_CORNER_SELECT,
  mapCreatorCornerRow,
} from '@/lib/creator-corner-store';
import {
  defaultChroniqueCtaLabel,
  mapChroniqueRow,
  type ChroniqueFeature,
  type ChroniqueTargetType,
} from '@/lib/chronique-store';
import { emitHomeRefresh } from '@/lib/home-refresh';
import type { HomePoll, HomePollOption } from '@/lib/home-poll-store';
import type { LoopWalk, LoopWalkStep } from '@/lib/loop-walks-store';
import { invalidateLoopWalksCache } from '@/lib/loop-walks-store';
import { hydrateScoped, invalidateScope, peekScoped, scheduleScopedRefresh, scopedStorageKey } from '@/lib/swr-cache';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const DEMO_POLLS_ADMIN = 'loop_admin_home_polls_v1';
const DEMO_WALKS_ADMIN = 'loop_walks_demo_v5';
const DEMO_CORNER_ADMIN = 'loop_admin_creator_corner_v2';
const DEMO_CHRONIQUE_ADMIN = 'loop_admin_chronique_v1';
const DEMO_LOGOS_ADMIN = 'loop_admin_home_logos_v1';
const ADMIN_ACCUEIL_CACHE = 'loop_admin_accueil_v1';

function accueilScope(kind: string, countryCode: string): string {
  return `${kind}_${countryCode}`;
}

async function peekAccueilList<T>(kind: string, countryCode: string): Promise<T[] | null> {
  const scope = accueilScope(kind, countryCode);
  return peekScoped<T[]>(scope, scopedStorageKey(ADMIN_ACCUEIL_CACHE, scope));
}

async function hydrateAccueilList<T>(kind: string, countryCode: string, data: T[]): Promise<void> {
  const scope = accueilScope(kind, countryCode);
  await hydrateScoped(scope, scopedStorageKey(ADMIN_ACCUEIL_CACHE, scope), data);
}

async function loadAccueilCached<T>(
  kind: string,
  countryCode: string,
  fetcher: () => Promise<T[]>,
  options?: { force?: boolean },
): Promise<T[]> {
  if (options?.force) {
    const fresh = await fetcher();
    await hydrateAccueilList(kind, countryCode, fresh);
    return fresh;
  }

  const cached = await peekAccueilList<T>(kind, countryCode);
  if (cached) {
    scheduleScopedRefresh(
      `admin_accueil_${kind}_${countryCode}`,
      async () => {
        const fresh = await fetcher();
        await hydrateAccueilList(kind, countryCode, fresh);
        return fresh;
      },
      undefined,
      async (fresh) => hydrateAccueilList(kind, countryCode, fresh),
    );
    return cached;
  }

  const fresh = await fetcher();
  await hydrateAccueilList(kind, countryCode, fresh);
  return fresh;
}

/** Invalide le cache admin Accueil (walks, corner, logos, sondages). */
export function invalidateAdminAccueilCache(
  countryCode: string,
  kinds: Array<'walks' | 'corners' | 'chroniques' | 'logos' | 'polls'> = [
    'walks',
    'corners',
    'chroniques',
    'logos',
    'polls',
  ],
): void {
  for (const kind of kinds) {
    const scope = accueilScope(kind, countryCode);
    invalidateScope(scope, scopedStorageKey(ADMIN_ACCUEIL_CACHE, scope));
  }
}

function notifyHome(): void {
  invalidateLoopWalksCache();
  void import('@/lib/home-partners-store').then((m) => m.invalidateHomePartnerLogosCache());
  emitHomeRefresh('admin-accueil');
}

/** Refresh Accueil public + invalide uniquement le cache admin du kind touché. */
function notifyAccueilKind(
  countryCode: string,
  kind: 'walks' | 'corners' | 'chroniques' | 'logos' | 'polls',
): void {
  invalidateAdminAccueilCache(countryCode, [kind]);
  void import('@/lib/admin-insights-store').then((m) => m.invalidateAdminInsightsCache(countryCode));
  if (kind === 'walks') invalidateLoopWalksCache(countryCode);
  if (kind === 'logos') {
    void import('@/lib/home-partners-store').then((m) => m.invalidateHomePartnerLogosCache(countryCode));
  }
  if (kind === 'chroniques') {
    void import('@/lib/chronique-store').then((m) => m.invalidateActiveChroniqueCache(countryCode));
  }
  if (kind === 'corners') {
    void import('@/lib/creator-corner-store').then((m) => m.invalidateActiveCreatorCornerCache(countryCode));
  }
  emitHomeRefresh(`admin-accueil-${kind}`);
}

export interface AdminHomePoll extends HomePoll {
  isActive: boolean;
  countryCode: string;
  voteCounts: Record<string, number>;
  voteTotal: number;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string | null;
}

export interface AdminHomePartnerLogo {
  id: string;
  name: string;
  logoUrl: string;
  websiteUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  countryCode: string;
}

export interface AdminCreatorCorner extends CreatorCornerFeature {
  isActive: boolean;
  countryCode: string;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface AdminChronique extends ChroniqueFeature {
  isActive: boolean;
  countryCode: string;
  periodStart: string | null;
  periodEnd: string | null;
}

function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || `item-${Date.now()}`;
}

function parseOptions(raw: unknown): HomePollOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id : null;
      const label = typeof row.label === 'string' ? row.label : null;
      if (!id || !label) return null;
      return { id, label };
    })
    .filter((o): o is HomePollOption => o !== null)
    .slice(0, 4);
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

/** Normalise les liens corner avant persistance (URL seule OK → label auto). */
export function normalizeCreatorUsefulLinks(
  links: CreatorUsefulLink[] | undefined,
  max = 3,
): CreatorUsefulLink[] {
  return (links ?? [])
    .map((l) => {
      const label = (l.label ?? '').trim();
      let url = (l.url ?? '').trim();
      if (!url) return null;
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      return {
        label: label || url.replace(/^https?:\/\//i, '').split('/')[0] || 'Lien',
        url,
      };
    })
    .filter((l): l is CreatorUsefulLink => l !== null)
    .slice(0, max);
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

function serializeWalkStepsForDb(steps: LoopWalkStep[]): Array<Record<string, unknown>> {
  return steps.map((s, i) => ({
    order: i + 1,
    target_type: s.targetType,
    target_id: s.targetId,
    title: s.title ?? null,
    description: s.description ?? null,
  }));
}

function mapLoopWalkRow(row: Record<string, unknown>, countryCode: string): LoopWalk {
  const steps = parseSteps(row.steps);
  const priceTypeRaw = String(row.price_type ?? 'free').toLowerCase();
  const priceType =
    priceTypeRaw === 'paid' || priceTypeRaw === 'theloop' ? priceTypeRaw : 'free';
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    coverImageUrl: String(row.cover_image_url ?? ''),
    durationMinutes: Number(row.duration_minutes ?? 0),
    stepsCount: Number(row.steps_count ?? steps.length),
    category: String(row.category ?? ''),
    categoryLabel: String(row.category_label ?? row.category ?? ''),
    summary: row.summary != null ? String(row.summary) : null,
    description: row.description != null ? String(row.description) : null,
    steps,
    partnerIds: Array.isArray(row.partner_ids) ? row.partner_ids.map(String) : [],
    priceType,
    priceLabel: row.price_label != null ? String(row.price_label) : null,
    contactPhone: row.contact_phone != null ? String(row.contact_phone) : null,
    contactUrl: row.contact_url != null ? String(row.contact_url) : null,
    isFeaturedWeek: Boolean(row.is_featured_week),
    isPublished: row.is_published !== false,
    sortOrder: Number(row.sort_order ?? 0),
    clickCount: Number(row.click_count ?? 0),
    favoriteCount: Number(row.favorite_count ?? 0),
    ratingAvg: Number(row.rating_avg ?? 0),
    ratingCount: Number(row.rating_count ?? 0),
    starCount: Number(row.star_count ?? 3),
    starsSource: row.stars_source === 'admin' ? 'admin' : 'auto',
    engagementScore: Number(row.engagement_score ?? 0),
    countryCode: String(row.country_code ?? countryCode),
  };
}

const LOOP_WALK_SELECT =
  'id, slug, title, cover_image_url, duration_minutes, steps_count, category, category_label, summary, description, steps, partner_ids, price_type, price_label, contact_phone, contact_url, is_featured_week, is_published, sort_order, click_count, favorite_count, rating_avg, rating_count, star_count, stars_source, engagement_score, country_code, created_at';

function validateScheduleInput<T extends { id?: string; periodStart?: string | null }>(
  existing: T[],
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined,
  excludeId?: string,
): string | null {
  const rangeErr = validateAccueilPeriodRange(periodStart, periodEnd);
  if (rangeErr) return rangeErr;
  return validateUniquePeriodStart(existing, periodStart, excludeId);
}

// ─── Sondages ───────────────────────────────────────────────────────────────

export async function listAdminHomePolls(
  countryCode: string,
  options?: { force?: boolean },
): Promise<AdminHomePoll[]> {
  return loadAccueilCached('polls', countryCode, () => fetchAdminHomePollsRemote(countryCode), options);
}

export async function peekAdminHomePolls(countryCode: string): Promise<AdminHomePoll[]> {
  return (await peekAccueilList<AdminHomePoll>('polls', countryCode)) ?? [];
}

async function fetchAdminHomePollsRemote(countryCode: string): Promise<AdminHomePoll[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('home_polls')
      .select('id, question, options, week_key, is_active, country_code, period_start, period_end, created_at')
      .eq('country_code', countryCode)
      .order('created_at', { ascending: false })
      .limit(15);

    if (!error && data) {
      const pollIds = data.map((row) => String(row.id));
      const voteCountsByPoll: Record<string, Record<string, number>> = {};
      for (const id of pollIds) voteCountsByPoll[id] = {};

      if (pollIds.length) {
        const { data: allVotes } = await supabase
          .from('home_poll_votes')
          .select('poll_id, option_id')
          .in('poll_id', pollIds)
          .limit(15);
        for (const v of allVotes ?? []) {
          const pid = String(v.poll_id);
          const oid = String(v.option_id);
          if (!voteCountsByPoll[pid]) voteCountsByPoll[pid] = {};
          voteCountsByPoll[pid][oid] = (voteCountsByPoll[pid][oid] ?? 0) + 1;
        }
      }

      const polls: AdminHomePoll[] = [];
      for (const row of data) {
        const options = parseOptions(row.options);
        const pid = String(row.id);
        const voteCounts: Record<string, number> = {};
        for (const opt of options) voteCounts[opt.id] = voteCountsByPoll[pid]?.[opt.id] ?? 0;
        const voteTotal = Object.values(voteCounts).reduce((a, b) => a + b, 0);
        polls.push({
          id: pid,
          question: String(row.question),
          options,
          weekKey: String(row.week_key ?? ''),
          isActive: Boolean(row.is_active),
          countryCode: String(row.country_code ?? countryCode),
          voteCounts,
          voteTotal,
          periodStart: row.period_start != null ? String(row.period_start) : null,
          periodEnd: row.period_end != null ? String(row.period_end) : null,
          createdAt: row.created_at != null ? String(row.created_at) : null,
        });
      }
      return polls;
    }
    if (error) console.warn('[AdminAccueil] polls:', error.message);
  }

  try {
    const raw = await AsyncStorage.getItem(DEMO_POLLS_ADMIN);
    if (raw) {
      const parsed = JSON.parse(raw) as AdminHomePoll[];
      return parsed
        .filter((p) => p.countryCode === countryCode)
        .map((p) => ({
          ...p,
          periodStart: p.periodStart ?? null,
          periodEnd: p.periodEnd ?? null,
          createdAt: p.createdAt ?? null,
        }));
    }
  } catch {
    /* seed */
  }
  return [];
}

export async function upsertAdminHomePoll(input: {
  id?: string;
  question: string;
  options: HomePollOption[];
  countryCode: string;
  activate?: boolean;
  periodStart?: string | null;
  periodEnd?: string | null;
}): Promise<AdminHomePoll | null> {
  const options = input.options.filter((o) => o.id.trim() && o.label.trim()).slice(0, 4);
  if (options.length < 2 || !input.question.trim()) return null;

  const weekKey = isoWeekKey();
  const activate = input.activate !== false;
  const periodStart = normalizeIsoDate(input.periodStart ?? null);
  const periodEnd = normalizeIsoDate(input.periodEnd ?? null);

  const existing = await listAdminHomePolls(input.countryCode);
  const scheduleErr = validateScheduleInput(existing, periodStart, periodEnd, input.id);
  if (scheduleErr) {
    console.warn('[AdminAccueil] poll schedule:', scheduleErr);
    return null;
  }

  if (isSupabaseConfigured() && supabase) {
    const payload = {
      question: input.question.trim(),
      options,
      week_key: weekKey,
      is_active: activate,
      country_code: input.countryCode,
      period_start: periodStart,
      period_end: periodEnd,
      updated_at: new Date().toISOString(),
    };

    if (input.id) {
      const { data, error } = await supabase
        .from('home_polls')
        .update(payload)
        .eq('id', input.id)
        .select('id, question, options, week_key, is_active, country_code, period_start, period_end, created_at')
        .single();
      if (error || !data) {
        console.warn('[AdminAccueil] poll update:', error?.message);
        return null;
      }
      notifyHome();
      return {
        id: String(data.id),
        question: String(data.question),
        options: parseOptions(data.options),
        weekKey: String(data.week_key),
        isActive: Boolean(data.is_active),
        countryCode: String(data.country_code),
        voteCounts: {},
        voteTotal: 0,
        periodStart: data.period_start != null ? String(data.period_start) : null,
        periodEnd: data.period_end != null ? String(data.period_end) : null,
        createdAt: data.created_at != null ? String(data.created_at) : null,
      };
    }

    const { data, error } = await supabase
      .from('home_polls')
      .insert(payload)
      .select('id, question, options, week_key, is_active, country_code, period_start, period_end, created_at')
      .single();
    if (error || !data) {
      console.warn('[AdminAccueil] poll insert:', error?.message);
      return null;
    }
    notifyHome();
    return {
      id: String(data.id),
      question: String(data.question),
      options: parseOptions(data.options),
      weekKey: String(data.week_key),
      isActive: Boolean(data.is_active),
      countryCode: String(data.country_code),
      voteCounts: {},
      voteTotal: 0,
      periodStart: data.period_start != null ? String(data.period_start) : null,
      periodEnd: data.period_end != null ? String(data.period_end) : null,
      createdAt: data.created_at != null ? String(data.created_at) : null,
    };
  }

  const list = await listAdminHomePolls(input.countryCode);
  const next: AdminHomePoll = {
    id: input.id ?? `poll_${Date.now()}`,
    question: input.question.trim(),
    options,
    weekKey,
    isActive: activate,
    countryCode: input.countryCode,
    voteCounts: Object.fromEntries(options.map((o) => [o.id, 0])),
    voteTotal: 0,
    periodStart,
    periodEnd,
    createdAt: new Date().toISOString(),
  };
  const others = list.filter((p) => p.id !== next.id);
  await AsyncStorage.setItem(DEMO_POLLS_ADMIN, JSON.stringify([next, ...others]));
  notifyHome();
  return next;
}

export async function setAdminHomePollActive(
  pollId: string,
  countryCode: string,
  active: boolean,
): Promise<boolean> {
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase
      .from('home_polls')
      .update({ is_active: active, updated_at: new Date().toISOString() })
      .eq('id', pollId);
    if (error) {
      console.warn('[AdminAccueil] poll active:', error.message);
      return false;
    }
    notifyAccueilKind(countryCode, 'polls');
    return true;
  }
  const list = await listAdminHomePolls(countryCode);
  const next = list.map((p) => ({
    ...p,
    isActive: p.id === pollId ? active : p.isActive,
  }));
  await AsyncStorage.setItem(DEMO_POLLS_ADMIN, JSON.stringify(next));
  notifyAccueilKind(countryCode, 'polls');
  return true;
}

// ─── Walks ──────────────────────────────────────────────────────────────────

export async function listAdminLoopWalks(
  countryCode: string,
  options?: { force?: boolean },
): Promise<LoopWalk[]> {
  return loadAccueilCached('walks', countryCode, () => fetchAdminLoopWalksRemote(countryCode), options);
}

async function fetchAdminLoopWalksRemote(countryCode: string): Promise<LoopWalk[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('loop_walks')
      .select(LOOP_WALK_SELECT)
      .eq('country_code', countryCode)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error && data) {
      return data.map((row) => mapLoopWalkRow(row as Record<string, unknown>, countryCode));
    }
    if (error) console.warn('[AdminAccueil] walks:', error.message);
    return [];
  }

  if (isSupabaseConfigured()) return [];

  try {
    const raw = await AsyncStorage.getItem(DEMO_WALKS_ADMIN);
    if (raw) return JSON.parse(raw) as LoopWalk[];
  } catch {
    /* empty */
  }
  return [];
}

export async function setAdminWalkPublished(
  walkId: string,
  published: boolean,
  countryCode = 'GN',
): Promise<boolean> {
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase
      .from('loop_walks')
      .update({ is_published: published, updated_at: new Date().toISOString() })
      .eq('id', walkId);
    if (error) {
      console.warn('[AdminAccueil] walk publish:', error.message);
      return false;
    }
    notifyAccueilKind(countryCode, 'walks');
    return true;
  }
  const list = await listAdminLoopWalks(countryCode);
  const next = list.map((w) => (w.id === walkId ? { ...w, isPublished: published } : w));
  await AsyncStorage.setItem(DEMO_WALKS_ADMIN, JSON.stringify(next));
  notifyAccueilKind(countryCode, 'walks');
  return true;
}

export async function setAdminWalkFeaturedWeek(
  walkId: string,
  countryCode: string,
): Promise<boolean> {
  if (isSupabaseConfigured() && supabase) {
    await supabase
      .from('loop_walks')
      .update({ is_featured_week: false, updated_at: new Date().toISOString() })
      .eq('country_code', countryCode)
      .eq('is_featured_week', true);
    const { error } = await supabase
      .from('loop_walks')
      .update({ is_featured_week: true, is_published: true, updated_at: new Date().toISOString() })
      .eq('id', walkId);
    if (error) {
      console.warn('[AdminAccueil] walk featured:', error.message);
      return false;
    }
    notifyAccueilKind(countryCode, 'walks');
    return true;
  }
  const list = await listAdminLoopWalks(countryCode);
  const next = list.map((w) => ({
    ...w,
    isFeaturedWeek: w.id === walkId,
    isPublished: w.id === walkId ? true : w.isPublished,
  }));
  await AsyncStorage.setItem(DEMO_WALKS_ADMIN, JSON.stringify(next));
  notifyAccueilKind(countryCode, 'walks');
  return true;
}

/** Retirer le parcours de l’Accueil (plus de « parcours de la semaine »). */
export async function clearAdminWalkFeaturedWeek(countryCode: string): Promise<boolean> {
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase
      .from('loop_walks')
      .update({ is_featured_week: false, updated_at: new Date().toISOString() })
      .eq('country_code', countryCode)
      .eq('is_featured_week', true);
    if (error) {
      console.warn('[AdminAccueil] walk unfeature:', error.message);
      return false;
    }
    notifyAccueilKind(countryCode, 'walks');
    return true;
  }
  const list = await listAdminLoopWalks(countryCode);
  await AsyncStorage.setItem(
    DEMO_WALKS_ADMIN,
    JSON.stringify(list.map((w) => ({ ...w, isFeaturedWeek: false }))),
  );
  notifyAccueilKind(countryCode, 'walks');
  return true;
}

export type AdminLoopWalkUpsertResult =
  | { ok: true; walk: LoopWalk }
  | { ok: false; error: string };

export async function upsertAdminLoopWalk(input: {
  id?: string;
  title: string;
  summary?: string;
  description?: string;
  coverImageUrl?: string;
  /** Minutes ; 0 ou omis = non affichée. */
  durationMinutes?: number | null;
  category?: string;
  categoryLabel?: string;
  countryCode: string;
  steps?: LoopWalkStep[];
  priceType?: 'free' | 'paid' | 'theloop';
  priceLabel?: string | null;
  contactPhone?: string | null;
  contactUrl?: string | null;
  activateFeatured?: boolean;
}): Promise<AdminLoopWalkUpsertResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Titre requis.' };
  const slugBase = slugify(title);
  const steps = (input.steps ?? []).map((s, i) => ({ ...s, order: i + 1 }));
  if (steps.length < 1) return { ok: false, error: 'Au moins une étape requise.' };
  const cover =
    input.coverImageUrl?.trim() ||
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80';
  const rawDuration = Number(input.durationMinutes ?? 0);
  const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.round(rawDuration) : 0;
  const category = input.category?.trim() || 'parcours';
  const categoryLabel = input.categoryLabel?.trim() || 'Parcours';
  const priceType = input.priceType === 'paid' || input.priceType === 'theloop' ? input.priceType : 'free';
  const priceLabel = priceType === 'paid' ? (input.priceLabel?.trim() || null) : null;
  const contactPhone = input.contactPhone?.trim() || null;
  const contactUrl = input.contactUrl?.trim() || null;
  const stepsJson = serializeWalkStepsForDb(steps);

  if (isSupabaseConfigured() && supabase) {
    if (input.activateFeatured) {
      await supabase
        .from('loop_walks')
        .update({ is_featured_week: false, updated_at: new Date().toISOString() })
        .eq('country_code', input.countryCode)
        .eq('is_featured_week', true);
    }
    const payload = {
      title,
      cover_image_url: cover,
      duration_minutes: duration,
      steps_count: steps.length,
      category,
      category_label: categoryLabel,
      summary: input.summary?.trim() || null,
      description: input.description?.trim() || null,
      steps: stepsJson,
      price_type: priceType,
      price_label: priceLabel,
      contact_phone: contactPhone,
      contact_url: contactUrl,
      country_code: input.countryCode,
      updated_at: new Date().toISOString(),
      ...(input.activateFeatured
        ? { is_featured_week: true, is_published: true }
        : {}),
    };

    if (input.id) {
      const { data, error } = await supabase
        .from('loop_walks')
        .update(payload)
        .eq('id', input.id)
        .select(LOOP_WALK_SELECT)
        .single();
      if (error || !data) {
        console.warn('[AdminAccueil] walk update:', error?.message);
        return { ok: false, error: error?.message ?? 'Mise à jour impossible.' };
      }
      notifyAccueilKind(input.countryCode, 'walks');
      return { ok: true, walk: mapLoopWalkRow(data as Record<string, unknown>, input.countryCode) };
    }

    const { data, error } = await supabase
      .from('loop_walks')
      .insert({
        ...payload,
        slug: `${slugBase}-${Date.now().toString(36).slice(-4)}`,
        is_published: true,
        is_featured_week: Boolean(input.activateFeatured),
        sort_order: 99,
        partner_ids: [],
        star_count: 3,
      })
      .select(LOOP_WALK_SELECT)
      .single();
    if (error || !data) {
      console.warn('[AdminAccueil] walk insert:', error?.message);
      return {
        ok: false,
        error: error?.message ?? 'Création impossible (droits admin ou contrainte base).',
      };
    }
    notifyAccueilKind(input.countryCode, 'walks');
    return { ok: true, walk: mapLoopWalkRow(data as Record<string, unknown>, input.countryCode) };
  }

  const walk: LoopWalk = {
    id: input.id ?? `walk_${Date.now()}`,
    slug: slugBase,
    title,
    coverImageUrl: cover,
    durationMinutes: duration,
    stepsCount: steps.length,
    category,
    categoryLabel,
    summary: input.summary?.trim() || null,
    description: input.description?.trim() || null,
    steps,
    partnerIds: [],
    priceType,
    priceLabel,
    contactPhone,
    contactUrl,
    isFeaturedWeek: Boolean(input.activateFeatured),
    isPublished: true,
    sortOrder: 99,
    starCount: 3,
  };
  const list = await listAdminLoopWalks(input.countryCode, { force: true });
  let next = input.id ? list.map((w) => (w.id === input.id ? walk : w)) : [walk, ...list];
  if (input.activateFeatured) {
    next = next.map((w) => ({ ...w, isFeaturedWeek: w.id === walk.id }));
  }
  await AsyncStorage.setItem(DEMO_WALKS_ADMIN, JSON.stringify(next));
  notifyAccueilKind(input.countryCode, 'walks');
  return { ok: true, walk };
}

export type AdminLoopWalkDeleteResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteAdminLoopWalk(
  id: string,
  countryCode = 'GN',
): Promise<AdminLoopWalkDeleteResult> {
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('loop_walks').delete().eq('id', id);
    if (error) {
      console.warn('[AdminAccueil] walk delete:', error.message);
      return { ok: false, error: error.message || 'Suppression impossible.' };
    }
    notifyAccueilKind(countryCode, 'walks');
    return { ok: true };
  }
  const list = await listAdminLoopWalks(countryCode);
  await AsyncStorage.setItem(DEMO_WALKS_ADMIN, JSON.stringify(list.filter((w) => w.id !== id)));
  notifyAccueilKind(countryCode, 'walks');
  return { ok: true };
}

// ─── Corner créateur ────────────────────────────────────────────────────────

export async function listAdminCreatorCorners(
  countryCode: string,
  options?: { force?: boolean },
): Promise<AdminCreatorCorner[]> {
  return loadAccueilCached('corners', countryCode, () => fetchAdminCreatorCornersRemote(countryCode), options);
}

async function fetchAdminCreatorCornersRemote(countryCode: string): Promise<AdminCreatorCorner[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('creator_corner_features')
      .select(CREATOR_CORNER_SELECT + ', is_active, updated_at')
      .eq('country_code', countryCode)
      .order('period_start', { ascending: false })
      .limit(50);

    if (!error && data) {
      return data.map((row) => {
        const r = row as Record<string, unknown>;
        const base = mapCreatorCornerRow(r);
        return {
          ...base,
          isActive: Boolean(r.is_active),
          countryCode: String(r.country_code ?? countryCode),
          periodStart: r.period_start != null ? String(r.period_start) : null,
          periodEnd: r.period_end != null ? String(r.period_end) : null,
        };
      });
    }
    if (error) console.warn('[AdminAccueil] corner:', error.message);
    return [];
  }

  if (isSupabaseConfigured()) return [];

  try {
    const raw = await AsyncStorage.getItem(DEMO_CORNER_ADMIN);
    if (raw) {
      const parsed = JSON.parse(raw) as AdminCreatorCorner[];
      return parsed.filter((c) => c.countryCode === countryCode);
    }
  } catch {
    /* empty */
  }
  return [];
}

export async function setAdminCreatorCornerActive(
  id: string,
  countryCode: string,
  active = true,
): Promise<boolean> {
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase
      .from('creator_corner_features')
      .update({ is_active: active, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.warn('[AdminAccueil] corner active:', error.message);
      return false;
    }
    notifyAccueilKind(countryCode, 'corners');
    return true;
  }
  const list = await listAdminCreatorCorners(countryCode);
  const next = list.map((c) => ({
    ...c,
    isActive: c.id === id ? active : c.isActive,
  }));
  await AsyncStorage.setItem(DEMO_CORNER_ADMIN, JSON.stringify(next));
  notifyAccueilKind(countryCode, 'corners');
  return true;
}

export async function deleteAdminCreatorCorner(id: string, countryCode = 'GN'): Promise<boolean> {
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('creator_corner_features').delete().eq('id', id);
    if (error) {
      console.warn('[AdminAccueil] corner delete:', error.message);
      return false;
    }
    notifyAccueilKind(countryCode, 'corners');
    return true;
  }
  try {
    const raw = await AsyncStorage.getItem(DEMO_CORNER_ADMIN);
    const list = raw ? (JSON.parse(raw) as AdminCreatorCorner[]) : [];
    await AsyncStorage.setItem(DEMO_CORNER_ADMIN, JSON.stringify(list.filter((c) => c.id !== id)));
    notifyAccueilKind(countryCode, 'corners');
    return true;
  } catch {
    return false;
  }
}

export async function upsertAdminCreatorCorner(input: {
  id?: string;
  subjectName: string;
  title: string;
  impactDescription: string;
  category?: string | null;
  locationLabel?: string;
  badgeTag?: string | null;
  coreQuote?: string | null;
  mediaUrl?: string | null;
  relatedTargetType?: SinguliersRelatedType | null;
  relatedTargetId?: string | null;
  relatedTargetSlug?: string | null;
  periodLabel?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  usefulLinks?: CreatorUsefulLink[];
  countryCode: string;
  activate?: boolean;
}): Promise<AdminCreatorCorner | null> {
  const subjectName = input.subjectName.trim();
  const title = input.title.trim();
  const impactDescription = input.impactDescription.trim();
  if (!subjectName || !title || !impactDescription) return null;

  const badgeTag = input.badgeTag?.trim() || null;
  const category = input.category?.trim() || null;
  const coreQuote = input.coreQuote?.trim() || null;
  const mediaUrl = input.mediaUrl?.trim() || null;
  const relatedTargetType = input.relatedTargetType ?? null;
  const relatedTargetId = relatedTargetType ? input.relatedTargetId?.trim() || null : null;
  const relatedTargetSlug = relatedTargetType ? input.relatedTargetSlug?.trim() || null : null;
  const slug = slugify(`${subjectName}-${input.periodLabel ?? isoWeekKey()}`);
  const activate = input.activate === true;
  const usefulLinks = normalizeCreatorUsefulLinks(input.usefulLinks, 3);
  const periodStart = normalizeIsoDate(input.periodStart ?? null);
  const periodEnd = normalizeIsoDate(input.periodEnd ?? null);
  // Compat colonnes legacy NOT NULL / lectures anciennes
  const hookCompat = badgeTag || impactDescription.slice(0, 180);

  const existing = await listAdminCreatorCorners(input.countryCode);
  const scheduleErr = validateScheduleInput(existing, periodStart, periodEnd, input.id);
  if (scheduleErr) {
    console.warn('[AdminAccueil] corner schedule:', scheduleErr);
    return null;
  }

  if (isSupabaseConfigured() && supabase) {
    const payload = {
      slug,
      person_name: subjectName,
      person_role: category,
      location_label: input.locationLabel?.trim() || null,
      hook: hookCompat,
      title,
      cta_label: 'Découvrir',
      cover_image_url: mediaUrl,
      portrait_url: null,
      story: null,
      journey: null,
      advice: coreQuote,
      favorite_pick: null,
      useful_links: usefulLinks,
      period_label: input.periodLabel?.trim() || null,
      period_start: periodStart,
      period_end: periodEnd,
      is_active: activate,
      country_code: input.countryCode,
      category,
      badge_tag: badgeTag,
      core_quote: coreQuote,
      impact_description: impactDescription,
      media_url: mediaUrl,
      related_target_type: relatedTargetType,
      related_target_id: relatedTargetId,
      related_target_slug: relatedTargetSlug,
      updated_at: new Date().toISOString(),
    };

    if (input.id) {
      const { error } = await supabase.from('creator_corner_features').update(payload).eq('id', input.id);
      if (error) {
        console.warn('[AdminAccueil] corner update:', error.message);
        return null;
      }
    } else {
      const { error } = await supabase.from('creator_corner_features').insert(payload);
      if (error) {
        console.warn('[AdminAccueil] corner insert:', error.message);
        return null;
      }
    }
    const list = await listAdminCreatorCorners(input.countryCode, { force: true });
    notifyAccueilKind(input.countryCode, 'corners');
    return list.find((c) => c.subjectName === subjectName && c.title === title) ?? list[0] ?? null;
  }

  const item: AdminCreatorCorner = {
    id: input.id ?? `corner_${Date.now()}`,
    slug,
    subjectName,
    title,
    category,
    locationLabel: input.locationLabel?.trim() || null,
    badgeTag,
    coreQuote,
    impactDescription,
    mediaUrl,
    ctaLabel: 'Découvrir',
    relatedTargetType,
    relatedTargetId,
    relatedTargetSlug,
    usefulLinks,
    periodLabel: input.periodLabel?.trim() || null,
    isActive: activate,
    countryCode: input.countryCode,
    periodStart,
    periodEnd,
  };
  const list = await listAdminCreatorCorners(input.countryCode);
  const others = list.filter((c) => c.id !== item.id);
  await AsyncStorage.setItem(DEMO_CORNER_ADMIN, JSON.stringify([item, ...others]));
  notifyAccueilKind(input.countryCode, 'corners');
  return item;
}

// ─── Chronique Accueil ──────────────────────────────────────────────────────

const CHRONIQUE_ROW_SELECT =
  'id, slug, person_name, location_label, hook, title, cta_label, cta_enabled, contact_phone, contact_email, period_label, footnote, advice, target_type, target_id, target_slug, period_start, period_end, country_code, click_count, created_at, is_active';

const CHRONIQUE_ROW_SELECT_LEGACY =
  'id, slug, person_name, location_label, hook, title, cta_label, period_label, footnote, advice, target_type, target_id, target_slug, period_start, period_end, country_code, click_count, created_at, is_active';

function mapAdminChroniqueRow(row: Record<string, unknown>, countryCode: string): AdminChronique {
  const base = mapChroniqueRow(row);
  return {
    ...base,
    isActive: Boolean(row.is_active ?? row.isActive ?? true),
    countryCode: String(row.country_code ?? row.countryCode ?? countryCode),
    periodStart: row.period_start != null ? String(row.period_start) : row.periodStart != null ? String(row.periodStart) : null,
    periodEnd: row.period_end != null ? String(row.period_end) : row.periodEnd != null ? String(row.periodEnd) : null,
  };
}

export async function listAdminChroniques(
  countryCode: string,
  options?: { force?: boolean },
): Promise<AdminChronique[]> {
  return loadAccueilCached('chroniques', countryCode, () => fetchAdminChroniquesRemote(countryCode), options);
}

async function fetchAdminChroniquesRemote(countryCode: string): Promise<AdminChronique[]> {
  if (isSupabaseConfigured() && supabase) {
    for (const select of [CHRONIQUE_ROW_SELECT, CHRONIQUE_ROW_SELECT_LEGACY]) {
      const { data, error } = await supabase
        .from('chronique_features')
        .select(select)
        .eq('country_code', countryCode)
        .order('period_start', { ascending: false })
        .limit(50);

      if (!error && data) {
        return data.map((row) => mapAdminChroniqueRow(row as Record<string, unknown>, countryCode));
      }
      if (error) console.warn('[AdminAccueil] chronique:', error.message);
    }
    return [];
  }

  if (isSupabaseConfigured()) return [];

  try {
    const raw = await AsyncStorage.getItem(DEMO_CHRONIQUE_ADMIN);
    if (raw) {
      const parsed = JSON.parse(raw) as AdminChronique[];
      return parsed.filter((c) => c.countryCode === countryCode);
    }
  } catch {
    /* empty */
  }
  return [];
}

export async function setAdminChroniqueActive(
  id: string,
  countryCode: string,
  active = true,
): Promise<boolean> {
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase
      .from('chronique_features')
      .update({ is_active: active, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.warn('[AdminAccueil] chronique active:', error.message);
      return false;
    }
    notifyAccueilKind(countryCode, 'chroniques');
    return true;
  }
  const list = await listAdminChroniques(countryCode);
  const next = list.map((c) => ({
    ...c,
    isActive: c.id === id ? active : c.isActive,
  }));
  await AsyncStorage.setItem(DEMO_CHRONIQUE_ADMIN, JSON.stringify(next));
  return true;
}

export async function deleteAdminChronique(id: string, countryCode = 'GN'): Promise<boolean> {
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('chronique_features').delete().eq('id', id);
    if (error) {
      console.warn('[AdminAccueil] chronique delete:', error.message);
      return false;
    }
    notifyAccueilKind(countryCode, 'chroniques');
    return true;
  }
  try {
    const raw = await AsyncStorage.getItem(DEMO_CHRONIQUE_ADMIN);
    const list = raw ? (JSON.parse(raw) as AdminChronique[]) : [];
    await AsyncStorage.setItem(DEMO_CHRONIQUE_ADMIN, JSON.stringify(list.filter((c) => c.id !== id)));
    notifyAccueilKind(countryCode, 'chroniques');
    return true;
  } catch {
    return false;
  }
}

export async function upsertAdminChronique(input: {
  id?: string;
  title: string;
  body: string;
  volumeLabel?: string;
  locationLabel?: string;
  footnote?: string;
  ctaLabel?: string;
  ctaEnabled?: boolean;
  contactPhone?: string | null;
  contactEmail?: string | null;
  targetType?: ChroniqueTargetType | null;
  targetId?: string | null;
  targetSlug?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  countryCode: string;
  activate?: boolean;
}): Promise<AdminChronique | null> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) return null;

  const volumeLabel = input.volumeLabel?.trim() || null;
  const targetType = input.targetType ?? null;
  const ctaEnabled = input.ctaEnabled !== false;
  const contactPhone = input.contactPhone?.trim() || null;
  const contactEmail = input.contactEmail?.trim() || null;
  const ctaLabel = input.ctaLabel?.trim() || defaultChroniqueCtaLabel(targetType);
  const slug = slugify(`${title}-${volumeLabel ?? isoWeekKey()}`);
  const activate = input.activate === true;
  const periodStart = normalizeIsoDate(input.periodStart ?? null);
  const periodEnd = normalizeIsoDate(input.periodEnd ?? null);
  const locationLabel = input.locationLabel?.trim() || null;

  const existing = await listAdminChroniques(input.countryCode);
  const scheduleErr = validateScheduleInput(existing, periodStart, periodEnd, input.id);
  if (scheduleErr) {
    console.warn('[AdminAccueil] chronique schedule:', scheduleErr);
    return null;
  }

  if (isSupabaseConfigured() && supabase) {
    const payload = {
      slug,
      person_name: title,
      person_role: null,
      location_label: locationLabel,
      hook: body,
      title,
      cta_label: ctaLabel,
      cta_enabled: ctaEnabled,
      contact_phone: contactPhone,
      contact_email: contactEmail,
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
      target_slug: input.targetSlug?.trim() || null,
      period_label: volumeLabel,
      period_start: periodStart,
      period_end: periodEnd,
      is_active: activate,
      country_code: input.countryCode,
      updated_at: new Date().toISOString(),
    };

    const tryWrite = async (
      mode: 'update' | 'insert',
      fullPayload: typeof payload,
    ): Promise<AdminChronique | null> => {
      const selects = [CHRONIQUE_ROW_SELECT, CHRONIQUE_ROW_SELECT_LEGACY];
      for (const select of selects) {
        const lean =
          select === CHRONIQUE_ROW_SELECT_LEGACY
            ? (() => {
                const {
                  cta_enabled: _e,
                  contact_phone: _p,
                  contact_email: _m,
                  ...rest
                } = fullPayload;
                return rest;
              })()
            : fullPayload;

        if (mode === 'update' && input.id) {
          const { data, error } = await supabase
            .from('chronique_features')
            .update(lean)
            .eq('id', input.id)
            .select(select)
            .single();
          if (!error && data) {
            notifyAccueilKind(input.countryCode, 'chroniques');
            return mapAdminChroniqueRow(data as Record<string, unknown>, input.countryCode);
          }
          if (error) console.warn('[AdminAccueil] chronique update:', error.message);
        } else if (mode === 'insert') {
          const { data, error } = await supabase
            .from('chronique_features')
            .insert(lean)
            .select(select)
            .single();
          if (!error && data) {
            notifyAccueilKind(input.countryCode, 'chroniques');
            return mapAdminChroniqueRow(data as Record<string, unknown>, input.countryCode);
          }
          if (error) console.warn('[AdminAccueil] chronique insert:', error.message);
        }
      }
      return null;
    };

    if (input.id) {
      const updated = await tryWrite('update', payload);
      if (updated) return updated;
      return null;
    }
    const created = await tryWrite('insert', payload);
    if (created) return created;
    return null;
  }

  const item: AdminChronique = {
    id: input.id ?? `chronique_${Date.now()}`,
    slug,
    volumeLabel,
    title,
    locationLabel,
    body,
    footnote: input.footnote?.trim() || null,
    ctaLabel,
    ctaEnabled,
    contactPhone,
    contactEmail,
    targetType,
    targetId: input.targetId?.trim() || null,
    targetSlug: input.targetSlug?.trim() || null,
    isActive: activate,
    countryCode: input.countryCode,
    periodStart,
    periodEnd,
  };
  const list = await listAdminChroniques(input.countryCode);
  const others = list.filter((c) => c.id !== item.id);
  await AsyncStorage.setItem(DEMO_CHRONIQUE_ADMIN, JSON.stringify([item, ...others]));
  notifyAccueilKind(input.countryCode, 'chroniques');
  return item;
}

// ─── Logos partenaires Accueil ──────────────────────────────────────────────

export async function listAdminHomePartnerLogos(
  countryCode: string,
  options?: { force?: boolean },
): Promise<AdminHomePartnerLogo[]> {
  return loadAccueilCached('logos', countryCode, () => fetchAdminHomePartnerLogosRemote(countryCode), options);
}

async function fetchAdminHomePartnerLogosRemote(countryCode: string): Promise<AdminHomePartnerLogo[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('home_partner_logos')
      .select('id, name, logo_url, website_url, sort_order, is_active, country_code')
      .eq('country_code', countryCode)
      .order('sort_order', { ascending: true })
      .limit(50);

    if (!error && data) {
      return data.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        logoUrl: String(row.logo_url),
        websiteUrl: row.website_url ? String(row.website_url) : null,
        sortOrder: Number(row.sort_order ?? 0),
        isActive: row.is_active !== false,
        countryCode: String(row.country_code ?? countryCode),
      }));
    }
    if (error) console.warn('[AdminAccueil] logos:', error.message);
    return [];
  }

  if (isSupabaseConfigured()) return [];

  try {
    const raw = await AsyncStorage.getItem(DEMO_LOGOS_ADMIN);
    if (raw) {
      const parsed = JSON.parse(raw) as AdminHomePartnerLogo[];
      return parsed.filter((l) => l.countryCode === countryCode);
    }
  } catch {
    /* empty */
  }
  return [];
}

export async function upsertAdminHomePartnerLogo(input: {
  id?: string;
  name: string;
  logoUrl: string;
  websiteUrl?: string | null;
  countryCode: string;
  isActive?: boolean;
}): Promise<AdminHomePartnerLogo | null> {
  const name = input.name.trim();
  const logoUrl = input.logoUrl.trim();
  if (!name || !logoUrl) return null;

  if (isSupabaseConfigured() && supabase) {
    const payload: Record<string, unknown> = {
      name,
      logo_url: logoUrl,
      website_url: input.websiteUrl?.trim() || null,
      is_active: input.isActive !== false,
      country_code: input.countryCode,
      updated_at: new Date().toISOString(),
      // Curaté admin — requis pour rester visible après désactivation des logos auto
      source: 'manual',
    };
    if (input.id) {
      const { error } = await supabase.from('home_partner_logos').update(payload).eq('id', input.id);
      if (error) {
        // Colonne `source` absente sur anciens schémas
        if (/source/i.test(error.message)) {
          const { source: _s, ...withoutSource } = payload;
          const { error: retryError } = await supabase
            .from('home_partner_logos')
            .update(withoutSource)
            .eq('id', input.id);
          if (retryError) {
            console.warn('[AdminAccueil] logo update:', retryError.message);
            return null;
          }
        } else {
          console.warn('[AdminAccueil] logo update:', error.message);
          return null;
        }
      }
    } else {
      const list = await listAdminHomePartnerLogos(input.countryCode, { force: true });
      const insertPayload = { ...payload, sort_order: list.length + 1 };
      const { error } = await supabase.from('home_partner_logos').insert(insertPayload);
      if (error) {
        if (/source/i.test(error.message)) {
          const { source: _s, ...withoutSource } = insertPayload;
          const { error: retryError } = await supabase.from('home_partner_logos').insert(withoutSource);
          if (retryError) {
            console.warn('[AdminAccueil] logo insert:', retryError.message);
            return null;
          }
        } else {
          console.warn('[AdminAccueil] logo insert:', error.message);
          return null;
        }
      }
    }
    const list = await listAdminHomePartnerLogos(input.countryCode, { force: true });
    notifyAccueilKind(input.countryCode, 'logos');
    return list.find((l) => l.name === name) ?? list[0] ?? null;
  }

  const list = await listAdminHomePartnerLogos(input.countryCode);
  const item: AdminHomePartnerLogo = {
    id: input.id ?? `logo_${Date.now()}`,
    name,
    logoUrl,
    websiteUrl: input.websiteUrl?.trim() || null,
    sortOrder: list.length + 1,
    isActive: input.isActive !== false,
    countryCode: input.countryCode,
  };
  const next = input.id ? list.map((l) => (l.id === input.id ? item : l)) : [...list, item];
  await AsyncStorage.setItem(DEMO_LOGOS_ADMIN, JSON.stringify(next));
  return item;
}

export async function setAdminHomePartnerLogoActive(
  id: string,
  active: boolean,
  countryCode = 'GN',
): Promise<boolean> {
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase
      .from('home_partner_logos')
      .update({ is_active: active, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.warn('[AdminAccueil] logo active:', error.message);
      return false;
    }
    notifyAccueilKind(countryCode, 'logos');
    return true;
  }
  try {
    const raw = await AsyncStorage.getItem(DEMO_LOGOS_ADMIN);
    const list = raw ? (JSON.parse(raw) as AdminHomePartnerLogo[]) : [];
    await AsyncStorage.setItem(
      DEMO_LOGOS_ADMIN,
      JSON.stringify(list.map((l) => (l.id === id ? { ...l, isActive: active } : l))),
    );
    notifyAccueilKind(countryCode, 'logos');
    return true;
  } catch {
    return false;
  }
}

export async function deleteAdminHomePartnerLogo(id: string, countryCode = 'GN'): Promise<boolean> {
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('home_partner_logos').delete().eq('id', id);
    if (error) {
      console.warn('[AdminAccueil] logo delete:', error.message);
      return false;
    }
    notifyAccueilKind(countryCode, 'logos');
    return true;
  }
  try {
    const raw = await AsyncStorage.getItem(DEMO_LOGOS_ADMIN);
    const list = raw ? (JSON.parse(raw) as AdminHomePartnerLogo[]) : [];
    await AsyncStorage.setItem(DEMO_LOGOS_ADMIN, JSON.stringify(list.filter((l) => l.id !== id)));
    notifyAccueilKind(countryCode, 'logos');
    return true;
  } catch {
    return false;
  }
}
