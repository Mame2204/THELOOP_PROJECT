import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { isLoopBackendConfigured } from '@/lib/loop-backend-api';
import { ensurePartnerSupabaseSession } from '@/lib/partner-spot-auth';
import { distributeNotification } from '@/lib/user-notifications-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { NotificationAudience } from '@/lib/notification-audience';
import type { EventCategory, LocationSubCategory } from '@/types';

export type { NotificationAudience };
export { AUDIENCE_LABELS } from '@/lib/notification-audience';

export type PushCampaignStatus = 'draft' | 'scheduled' | 'sent' | 'cancelled' | 'failed';

export interface AdminNotification {
  id: string;
  title: string;
  message: string;
  audience: NotificationAudience;
  targetPhone: string | null;
  favoriteEventCategories: EventCategory[];
  favoriteSpotCategories: LocationSubCategory[];
  favoriteToolCategories: string[];
  countryCode: string;
  scheduledAt: string | null;
  sentAt: string | null;
  status: PushCampaignStatus;
  recipientCount: number;
  createdAt: string;
}

const KEY = 'loop_admin_notifications_v3';

function isUuid(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value);
}

function newCampaignId(): string {
  return Crypto.randomUUID();
}

async function resolveCreatedBy(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  return id && isUuid(id) ? id : null;
}

type PushCampaignRow = {
  id: string;
  title: string;
  message: string;
  audience: string;
  target_phone: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  status: PushCampaignStatus;
  recipient_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  country_code?: string;
  favorite_event_categories?: EventCategory[];
  favorite_spot_categories?: LocationSubCategory[];
  favorite_tool_categories?: string[];
};

function campaignToRow(entry: AdminNotification, createdBy: string | null): PushCampaignRow {
  return {
    id: entry.id,
    title: entry.title,
    message: entry.message,
    audience: entry.audience,
    target_phone: entry.targetPhone,
    scheduled_at: entry.scheduledAt,
    sent_at: entry.sentAt,
    status: entry.status,
    recipient_count: entry.recipientCount,
    created_by: createdBy,
    created_at: entry.createdAt,
    updated_at: new Date().toISOString(),
    country_code: entry.countryCode,
    favorite_event_categories: entry.favoriteEventCategories,
    favorite_spot_categories: entry.favoriteSpotCategories,
    favorite_tool_categories: entry.favoriteToolCategories,
  };
}

async function persistPushCampaignRemote(entry: AdminNotification): Promise<void> {
  if (!isSupabaseConfigured() || !supabase || !isUuid(entry.id)) return;

  await ensurePartnerSupabaseSession();

  const createdBy = await resolveCreatedBy();
  const row = campaignToRow(entry, createdBy);

  const { error } = await supabase.from('admin_push_campaigns').upsert(row);
  if (!error) return;

  if (/country_code|favorite_event_categories|favorite_spot_categories|favorite_tool_categories/i.test(error.message)) {
    const {
      country_code: _country,
      favorite_event_categories: _events,
      favorite_spot_categories: _spots,
      favorite_tool_categories: _tools,
      ...core
    } = row;
    const { error: coreError } = await supabase.from('admin_push_campaigns').upsert(core);
    if (!coreError) return;
    console.warn('[PushCampaigns] upsert (core):', coreError.message);
    return;
  }

  console.warn('[PushCampaigns] upsert:', error.message);
}

function rowToCampaign(row: PushCampaignRow): AdminNotification {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    audience: row.audience as NotificationAudience,
    targetPhone: row.target_phone,
    favoriteEventCategories: row.favorite_event_categories ?? [],
    favoriteSpotCategories: row.favorite_spot_categories ?? [],
    favoriteToolCategories: row.favorite_tool_categories ?? [],
    countryCode: row.country_code ?? 'GN',
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    status: row.status,
    recipientCount: row.recipient_count ?? 0,
    createdAt: row.created_at,
  };
}

function sortCampaigns(list: AdminNotification[]): AdminNotification[] {
  return [...list].sort((a, b) =>
    (b.sentAt ?? b.scheduledAt ?? b.createdAt).localeCompare(a.sentAt ?? a.scheduledAt ?? a.createdAt),
  );
}

async function fetchRemotePushCampaigns(): Promise<AdminNotification[] | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  try {
    await ensurePartnerSupabaseSession();
    const { data, error } = await supabase
      .from('admin_push_campaigns')
      .select('id, title, message, audience, target_phone, scheduled_at, sent_at, status, recipient_count, created_by, created_at, updated_at, country_code, favorite_event_categories, favorite_spot_categories, favorite_tool_categories')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.warn('[PushCampaigns] list:', error.message);
      return null;
    }
    return (data ?? []).map((row) => rowToCampaign(row as PushCampaignRow));
  } catch {
    return null;
  }
}

async function readLocalNotifications(): Promise<AdminNotification[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) {
    const legacy = await AsyncStorage.getItem('loop_admin_notifications_v2');
    if (!legacy) return [];
    try {
      const parsed = JSON.parse(legacy) as Array<Record<string, unknown>>;
      return parsed.map((row) => ({
        id: String(row.id),
        title: String(row.title),
        message: String(row.message),
        audience: row.audience as NotificationAudience,
        targetPhone: (row.targetPhone as string) ?? (row.targetEmail as string) ?? null,
        favoriteEventCategories: row.favoriteEventCategory
          ? [row.favoriteEventCategory as EventCategory]
          : [],
        favoriteSpotCategories: row.favoriteSpotCategory
          ? [row.favoriteSpotCategory as LocationSubCategory]
          : [],
        favoriteToolCategories: [],
        scheduledAt: (row.scheduledAt as string) ?? null,
        sentAt: (row.sentAt as string) ?? null,
        status: row.status as PushCampaignStatus,
        recipientCount: Number(row.recipientCount ?? 0),
        countryCode: (row as Record<string, unknown>).countryCode
          ? String((row as Record<string, unknown>).countryCode)
          : 'GN',
        createdAt: String(row.createdAt),
      }));
    } catch {
      return [];
    }
  }
  try {
    const parsed = JSON.parse(raw) as AdminNotification[];
    return Array.isArray(parsed)
      ? parsed.map((n) => ({
          ...n,
          favoriteToolCategories: n.favoriteToolCategories ?? [],
        }))
      : [];
  } catch {
    return [];
  }
}

async function saveAll(entries: AdminNotification[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(entries));
}

export async function listAdminNotifications(
  countryCode?: string,
  options?: { forceRemote?: boolean },
): Promise<AdminNotification[]> {
  if (isSupabaseConfigured() && (options?.forceRemote !== false)) {
    const remote = await fetchRemotePushCampaigns();
    if (remote !== null) {
      await saveAll(remote);
      const list = sortCampaigns(remote);
      return countryCode ? list.filter((n) => n.countryCode === countryCode) : list;
    }
  }

  const list = sortCampaigns(await readLocalNotifications());
  return countryCode ? list.filter((n) => n.countryCode === countryCode) : list;
}

async function appendPushCampaignEntry(entry: AdminNotification): Promise<void> {
  const existing = await listAdminNotifications();
  await saveAll([entry, ...existing]);
  await persistPushCampaignRemote(entry);
}

/** Crée la ligne campagne côté Supabase avant diffusion (FK campaign_id). */
export async function ensurePushCampaignDraft(entry: AdminNotification): Promise<void> {
  await persistPushCampaignRemote({
    ...entry,
    sentAt: null,
    status: entry.status === 'scheduled' ? 'scheduled' : 'draft',
    recipientCount: 0,
  });
}

/** Trace une campagne déjà diffusée (ex. job automatisation push). */
export async function recordSentPushCampaign(input: {
  id?: string;
  title: string;
  message: string;
  audience: NotificationAudience;
  countryCode: string;
  city?: string | null;
  targetPhone?: string | null;
  favoriteEventCategories?: EventCategory[];
  favoriteSpotCategories?: LocationSubCategory[];
  favoriteToolCategories?: string[];
  recipientCount: number;
}): Promise<string> {
  const now = new Date().toISOString();
  const id = input.id && isUuid(input.id) ? input.id : newCampaignId();
  await appendPushCampaignEntry({
    id,
    title: input.title.trim(),
    message: input.message.trim(),
    audience: input.audience,
    targetPhone: input.targetPhone?.trim() || null,
    favoriteEventCategories: input.favoriteEventCategories ?? [],
    favoriteSpotCategories: input.favoriteSpotCategories ?? [],
    favoriteToolCategories: input.favoriteToolCategories ?? [],
    countryCode: input.countryCode,
    scheduledAt: null,
    sentAt: now,
    status: 'sent',
    recipientCount: input.recipientCount,
    createdAt: now,
  });
  return id;
}

export async function sendAdminNotification(input: {
  title: string;
  message: string;
  audience: NotificationAudience;
  targetPhone?: string | null;
  favoriteEventCategories?: EventCategory[];
  favoriteSpotCategories?: LocationSubCategory[];
  favoriteToolCategories?: string[];
  scheduledAt?: string | null;
  countryCode: string;
}): Promise<AdminNotification> {
  const now = new Date().toISOString();
  const isScheduled = Boolean(input.scheduledAt && new Date(input.scheduledAt) > new Date());

  const entry: AdminNotification = {
    id: newCampaignId(),
    title: input.title.trim(),
    message: input.message.trim(),
    audience: input.audience,
    targetPhone: input.targetPhone?.trim() || null,
    favoriteEventCategories: input.favoriteEventCategories ?? [],
    favoriteSpotCategories: input.favoriteSpotCategories ?? [],
    favoriteToolCategories: input.favoriteToolCategories ?? [],
    countryCode: input.countryCode,
    scheduledAt: input.scheduledAt ?? null,
    sentAt: null,
    status: isScheduled ? 'scheduled' : 'draft',
    recipientCount: 0,
    createdAt: now,
  };

  if (!isScheduled) {
    await ensurePushCampaignDraft(entry);
    entry.recipientCount = await distributeNotification({
      title: entry.title,
      message: entry.message,
      audience: entry.audience,
      targetPhone: entry.targetPhone,
      favoriteEventCategories: entry.favoriteEventCategories,
      favoriteSpotCategories: entry.favoriteSpotCategories,
      favoriteToolCategories: entry.favoriteToolCategories,
      countryCode: entry.countryCode,
      campaignId: entry.id,
    });
    entry.sentAt = now;
    entry.status = 'sent';
  }

  await appendPushCampaignEntry(entry);
  return entry;
}

const SERVER_CRON_AUDIENCES = new Set<NotificationAudience>([
  'all',
  'everyone',
  'members',
  'prime',
  'prime_members',
  'partner',
  'admin',
  'individual',
]);

/** Campagnes basiques déjà traitées par le cron serveur (api.theloop-app.com). */
function isHandledByServerCron(entry: AdminNotification): boolean {
  if (!isLoopBackendConfigured()) return false;
  if (!SERVER_CRON_AUDIENCES.has(entry.audience)) return false;
  const hasFavoriteFilters =
    entry.favoriteEventCategories.length > 0 ||
    entry.favoriteSpotCategories.length > 0 ||
    entry.favoriteToolCategories.length > 0;
  return !hasFavoriteFilters;
}

/** Campagnes déjà diffusées par ce process — le runner tourne toutes les 45 s. */
const claimedCampaignIds = new Set<string>();

export async function processDueScheduledNotifications(): Promise<number> {
  const all = await listAdminNotifications();
  const now = Date.now();

  const due = all.filter(
    (entry) =>
      entry.status === 'scheduled' &&
      entry.scheduledAt != null &&
      new Date(entry.scheduledAt).getTime() <= now &&
      !isHandledByServerCron(entry) &&
      !claimedCampaignIds.has(entry.id),
  );
  if (!due.length) return 0;

  // Marquer « envoyée » avant la diffusion : sinon une persistance qui échoue fait
  // rediffuser la campagne à chaque passage du runner, et inonde les destinataires.
  const sentAt = new Date().toISOString();
  const dueIds = new Set(due.map((entry) => entry.id));
  for (const id of dueIds) claimedCampaignIds.add(id);
  await saveAll(
    all.map((entry) =>
      dueIds.has(entry.id) ? { ...entry, status: 'sent' as const, sentAt } : entry,
    ),
  );

  const sentEntries: AdminNotification[] = [];
  for (const entry of due) {
    const recipientCount = await distributeNotification({
      title: entry.title,
      message: entry.message,
      audience: entry.audience,
      targetPhone: entry.targetPhone,
      favoriteEventCategories: entry.favoriteEventCategories,
      favoriteSpotCategories: entry.favoriteSpotCategories,
      favoriteToolCategories: entry.favoriteToolCategories,
      countryCode: entry.countryCode ?? 'GN',
      campaignId: entry.id,
    });
    sentEntries.push({ ...entry, status: 'sent', sentAt, recipientCount });
  }

  const latest = await listAdminNotifications();
  const byId = new Map(sentEntries.map((entry) => [entry.id, entry]));
  await saveAll(latest.map((entry) => byId.get(entry.id) ?? entry));
  await Promise.all(sentEntries.map((entry) => persistPushCampaignRemote(entry)));
  return sentEntries.length;
}

export function isPushCampaignEditable(status: PushCampaignStatus): boolean {
  return status === 'draft' || status === 'scheduled';
}

export function isPushCampaignDeletable(status: PushCampaignStatus): boolean {
  return status !== 'sent';
}

export async function cancelPushCampaign(id: string): Promise<boolean> {
  const all = await listAdminNotifications();
  const idx = all.findIndex((n) => n.id === id && isPushCampaignEditable(n.status));
  if (idx < 0) return false;

  if (isSupabaseConfigured() && supabase) {
    await ensurePartnerSupabaseSession();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('admin_push_campaigns')
      .update({ status: 'cancelled', updated_at: now })
      .eq('id', id)
      .in('status', ['draft', 'scheduled'])
      .select('id')
      .maybeSingle();
    if (error || !data) return false;
  }

  const cancelled = { ...all[idx], status: 'cancelled' as const };
  all[idx] = cancelled;
  await saveAll(all);
  return true;
}

export async function deletePushCampaign(id: string): Promise<{ ok: boolean; error?: string }> {
  const all = await listAdminNotifications();
  const idx = all.findIndex((n) => n.id === id && isPushCampaignDeletable(n.status));
  if (idx < 0) {
    return { ok: false, error: 'Campagne introuvable ou déjà envoyée.' };
  }

  if (isSupabaseConfigured() && supabase) {
    await ensurePartnerSupabaseSession();
    const { data, error } = await supabase
      .from('admin_push_campaigns')
      .delete()
      .eq('id', id)
      .neq('status', 'sent')
      .select('id')
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: 'Campagne introuvable ou déjà envoyée.' };
  }

  all.splice(idx, 1);
  await saveAll(all);
  return { ok: true };
}

/** @deprecated Utiliser cancelPushCampaign */
export async function cancelScheduledNotification(id: string): Promise<boolean> {
  return cancelPushCampaign(id);
}

export async function updateAdminNotification(
  id: string,
  input: {
    title: string;
    message: string;
    audience: NotificationAudience;
    targetPhone?: string | null;
    favoriteEventCategories?: EventCategory[];
    favoriteSpotCategories?: LocationSubCategory[];
    favoriteToolCategories?: string[];
    scheduledAt?: string | null;
    countryCode: string;
    sendNow: boolean;
  },
): Promise<{ ok: boolean; entry?: AdminNotification; error?: string }> {
  const all = await listAdminNotifications();
  const idx = all.findIndex((n) => n.id === id);
  if (idx < 0) return { ok: false, error: 'Campagne introuvable.' };
  const existing = all[idx];
  if (!isPushCampaignEditable(existing.status)) {
    return { ok: false, error: 'Campagne déjà envoyée.' };
  }

  const title = input.title.trim();
  const message = input.message.trim();
  if (!title || !message) return { ok: false, error: 'Titre et message requis.' };

  const now = new Date().toISOString();
  const isScheduled =
    !input.sendNow &&
    Boolean(input.scheduledAt && new Date(input.scheduledAt).getTime() > Date.now());

  if (!input.sendNow && !isScheduled) {
    return { ok: false, error: 'Indiquez une date et une heure dans le futur.' };
  }

  const base: AdminNotification = {
    ...existing,
    title,
    message,
    audience: input.audience,
    targetPhone: input.targetPhone?.trim() || null,
    favoriteEventCategories: input.favoriteEventCategories ?? [],
    favoriteSpotCategories: input.favoriteSpotCategories ?? [],
    favoriteToolCategories: input.favoriteToolCategories ?? [],
    countryCode: input.countryCode,
    scheduledAt: isScheduled ? (input.scheduledAt ?? null) : null,
    sentAt: null,
    status: isScheduled ? 'scheduled' : 'draft',
    recipientCount: 0,
  };

  if (isScheduled) {
    all[idx] = base;
    await saveAll(all);
    await persistPushCampaignRemote(base);
    return { ok: true, entry: base };
  }

  await ensurePushCampaignDraft(base);
  try {
    const recipientCount = await distributeNotification({
      title: base.title,
      message: base.message,
      audience: base.audience,
      targetPhone: base.targetPhone,
      favoriteEventCategories: base.favoriteEventCategories,
      favoriteSpotCategories: base.favoriteSpotCategories,
      favoriteToolCategories: base.favoriteToolCategories,
      countryCode: base.countryCode,
      campaignId: base.id,
    });
    const sent: AdminNotification = {
      ...base,
      status: 'sent',
      sentAt: now,
      recipientCount,
    };
    all[idx] = sent;
    await saveAll(all);
    await persistPushCampaignRemote(sent);
    return { ok: true, entry: sent };
  } catch (err) {
    const failed: AdminNotification = { ...base, status: 'failed' };
    all[idx] = failed;
    await saveAll(all);
    await persistPushCampaignRemote(failed);
    const msg = err instanceof Error ? err.message : 'Échec de diffusion';
    return { ok: false, error: msg };
  }
}

/** Vide l'historique des campagnes push admin (AsyncStorage local). */
export async function clearAdminNotificationHistory(): Promise<void> {
  await saveAll([]);
  await AsyncStorage.removeItem('loop_admin_notifications_v2');
}

export const STATUS_LABELS: Record<PushCampaignStatus, string> = {
  draft: 'Brouillon',
  scheduled: 'Planifié',
  sent: 'Envoyé',
  cancelled: 'Annulé',
  failed: 'Échec',
};
