import { deliverPushToUsers } from './api';
import { supabase } from './supabase';

export type PushCampaignStatus = 'draft' | 'scheduled' | 'sent' | 'cancelled' | 'failed';

export type NotificationAudience =
  | 'all'
  | 'everyone'
  | 'members'
  | 'prime'
  | 'prime_members'
  | 'partner'
  | 'admin'
  | 'favorites'
  | 'birthday'
  | 'individual';

export const AUDIENCE_LABELS: Record<NotificationAudience, string> = {
  all: 'Comptes (tous rôles)',
  everyone: 'Tous les comptes',
  members: 'Membres',
  prime: 'Prime',
  prime_members: 'Prime + Membres',
  partner: 'Partenaires',
  admin: 'Administrateurs',
  favorites: 'Favoris par catégorie',
  birthday: 'Anniversaires du mois',
  individual: 'Numéros ciblés',
};

const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  scheduled: 'Planifiée',
  sent: 'Envoyée',
  cancelled: 'Annulée',
  failed: 'Échec',
};

export function campaignStatusLabel(status: string): string {
  return CAMPAIGN_STATUS_LABELS[status] ?? status;
}

export function audienceLabel(audience: string): string {
  return AUDIENCE_LABELS[audience as NotificationAudience] ?? audience;
}

export interface PushCampaign {
  id: string;
  title: string;
  message: string;
  audience: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  recipientCount: number;
  createdAt: string | null;
  targetPhone: string | null;
  favoriteEventCategories: string[];
  favoriteSpotCategories: string[];
  favoriteToolCategories: string[];
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter(Boolean);
}

async function pushOsAfterInbox(
  userIds: string[],
  title: string,
  message: string,
  meta?: Record<string, string>,
): Promise<void> {
  if (!userIds.length) return;
  await deliverPushToUsers({
    userIds,
    title,
    body: message,
    data: meta,
  });
}

async function filterUserIdsByCountry(userIds: string[], countryCode: string): Promise<string[]> {
  if (!userIds.length) return [];
  const { data, error } = await supabase
    .from('users')
    .select('id, country_code')
    .in('id', userIds)
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  const cc = countryCode.toUpperCase();
  return (data ?? [])
    .filter((u) => !u.country_code || String(u.country_code).toUpperCase() === cc)
    .map((u) => String(u.id));
}

async function resolveFavoriteUserIds(
  eventCategories: string[],
  spotCategories: string[],
  toolCategories: string[],
  countryCode: string,
): Promise<string[]> {
  const { data, error } = await supabase.rpc('admin_users_with_favorite_categories', {
    p_event_categories: eventCategories,
    p_spot_categories: spotCategories,
    p_tool_categories: toolCategories,
  });
  if (error) throw new Error(error.message);
  const rawIds: string[] = [];
  for (const row of data ?? []) {
    const id =
      typeof row === 'string'
        ? row
        : row && typeof row === 'object' && 'user_id' in row
          ? String((row as Record<string, unknown>).user_id)
          : '';
    if (/^[0-9a-f-]{36}$/i.test(id)) rawIds.push(id);
  }
  return filterUserIdsByCountry(rawIds, countryCode);
}

async function resolveBirthdayUserIds(countryCode: string): Promise<string[]> {
  const month = new Date().getMonth() + 1;
  const { data, error } = await supabase
    .from('users')
    .select('id, birth_date, country_code, user_role')
    .eq('is_active', true)
    .not('birth_date', 'is', null)
    .not('user_role', 'in', '("admin","super_admin","partner","tool_partner")');
  if (error) throw new Error(error.message);
  const cc = countryCode.toUpperCase();
  return (data ?? [])
    .filter((u) => {
      if (u.country_code && String(u.country_code).toUpperCase() !== cc) return false;
      const bd = new Date(String(u.birth_date));
      return !Number.isNaN(bd.getTime()) && bd.getMonth() + 1 === month;
    })
    .map((u) => String(u.id));
}

async function distributeInboxAndPush(input: {
  userIds: string[];
  title: string;
  message: string;
  audience: string;
  campaignId: string;
}): Promise<number> {
  const now = new Date().toISOString();
  const uniqueIds = [...new Set(input.userIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (!uniqueIds.length) return 0;

  const rows = uniqueIds.map((userId) => ({
    user_id: userId,
    title: input.title,
    message: input.message,
    audience: input.audience,
    sent_at: now,
    campaign_id: input.campaignId,
  }));
  const { error: insErr } = await supabase.from('user_notifications').insert(rows);
  if (insErr) throw new Error(insErr.message);

  void pushOsAfterInbox(uniqueIds, input.title, input.message, {
    audience: input.audience,
    campaignId: input.campaignId,
  });
  return uniqueIds.length;
}

function campaignBaseRow(input: {
  id: string;
  title: string;
  message: string;
  audience: NotificationAudience;
  countryCode: string;
  targetPhone?: string | null;
  favoriteEventCategories?: string[];
  favoriteSpotCategories?: string[];
  favoriteToolCategories?: string[];
  scheduledAt?: string | null;
  sentAt?: string | null;
  status: PushCampaignStatus;
  recipientCount: number;
  createdBy?: string | null;
  createdAt: string;
}) {
  return {
    id: input.id,
    title: input.title,
    message: input.message,
    audience: input.audience,
    target_phone: input.audience === 'individual' ? input.targetPhone?.trim() ?? null : null,
    scheduled_at: input.scheduledAt ?? null,
    sent_at: input.sentAt ?? null,
    status: input.status,
    recipient_count: input.recipientCount,
    created_by: input.createdBy ?? null,
    created_at: input.createdAt,
    updated_at: new Date().toISOString(),
    country_code: input.countryCode,
    favorite_event_categories: input.favoriteEventCategories ?? [],
    favorite_spot_categories: input.favoriteSpotCategories ?? [],
    favorite_tool_categories: input.favoriteToolCategories ?? [],
  };
}

export async function listPushCampaigns(countryCode: string): Promise<PushCampaign[]> {
  let q = supabase
    .from('admin_push_campaigns')
    .select(
      'id, title, message, audience, status, scheduled_at, sent_at, recipient_count, created_at, target_phone, country_code, favorite_event_categories, favorite_spot_categories, favorite_tool_categories',
    )
    .order('created_at', { ascending: false })
    .limit(80);
  if (countryCode) q = q.eq('country_code', countryCode);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    message: String(r.message ?? ''),
    audience: String(r.audience ?? ''),
    status: String(r.status ?? ''),
    scheduledAt: r.scheduled_at ? String(r.scheduled_at) : null,
    sentAt: r.sent_at ? String(r.sent_at) : null,
    recipientCount: Number(r.recipient_count ?? 0),
    createdAt: r.created_at ? String(r.created_at) : null,
    targetPhone: r.target_phone ? String(r.target_phone) : null,
    favoriteEventCategories: parseStringArray(r.favorite_event_categories),
    favoriteSpotCategories: parseStringArray(r.favorite_spot_categories),
    favoriteToolCategories: parseStringArray(r.favorite_tool_categories),
  }));
}

export async function cancelPushCampaign(id: string): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('admin_push_campaigns')
    .update({ status: 'cancelled', updated_at: now })
    .eq('id', id)
    .eq('status', 'scheduled')
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Campagne introuvable ou déjà traitée.' };
  return { ok: true };
}

/** Envoi réel via RPC (même pipeline que le Control Tower mobile). */
export async function sendPushCampaign(input: {
  title: string;
  message: string;
  audience: NotificationAudience;
  countryCode: string;
  targetPhone?: string | null;
  favoriteEventCategories?: string[];
  favoriteSpotCategories?: string[];
  favoriteToolCategories?: string[];
  scheduledAt?: string | null;
  createdBy?: string | null;
}): Promise<{ ok: boolean; recipientCount?: number; error?: string }> {
  const title = input.title.trim();
  const message = input.message.trim();
  if (!title || !message) return { ok: false, error: 'Titre et message requis.' };
  if (input.audience === 'individual' && !input.targetPhone?.trim()) {
    return { ok: false, error: 'Téléphone requis pour un envoi individuel.' };
  }
  if (
    input.audience === 'favorites' &&
    !input.favoriteEventCategories?.length &&
    !input.favoriteSpotCategories?.length &&
    !input.favoriteToolCategories?.length
  ) {
    return { ok: false, error: 'Sélectionnez au moins une catégorie favori.' };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const scheduled =
    input.scheduledAt && new Date(input.scheduledAt).getTime() > Date.now()
      ? new Date(input.scheduledAt).toISOString()
      : null;

  const favEvents = input.favoriteEventCategories ?? [];
  const favSpots = input.favoriteSpotCategories ?? [];
  const favTools = input.favoriteToolCategories ?? [];

  if (scheduled) {
    const { error } = await supabase.from('admin_push_campaigns').upsert(
      campaignBaseRow({
        id,
        title,
        message,
        audience: input.audience,
        countryCode: input.countryCode,
        targetPhone: input.targetPhone,
        favoriteEventCategories: favEvents,
        favoriteSpotCategories: favSpots,
        favoriteToolCategories: favTools,
        scheduledAt: scheduled,
        status: 'scheduled',
        recipientCount: 0,
        createdBy: input.createdBy,
        createdAt: now,
      }),
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true, recipientCount: 0 };
  }

  await supabase.from('admin_push_campaigns').upsert(
    campaignBaseRow({
      id,
      title,
      message,
      audience: input.audience,
      countryCode: input.countryCode,
      targetPhone: input.targetPhone,
      favoriteEventCategories: favEvents,
      favoriteSpotCategories: favSpots,
      favoriteToolCategories: favTools,
      status: 'draft',
      recipientCount: 0,
      createdBy: input.createdBy,
      createdAt: now,
    }),
  );

  try {
    let count = 0;

    if (input.audience === 'individual') {
      const phone = input.targetPhone!.trim();
      const { data: users } = await supabase
        .from('users')
        .select('id')
        .eq('country_code', input.countryCode)
        .or(`phone_number.eq.${phone},phone_number.ilike.%${phone.slice(-9)}`)
        .limit(20);
      const userIds = (users ?? []).map((u) => String(u.id));
      count = await distributeInboxAndPush({
        userIds,
        title,
        message,
        audience: input.audience,
        campaignId: id,
      });
    } else if (input.audience === 'favorites') {
      const userIds = await resolveFavoriteUserIds(favEvents, favSpots, favTools, input.countryCode);
      count = await distributeInboxAndPush({
        userIds,
        title,
        message,
        audience: input.audience,
        campaignId: id,
      });
    } else if (input.audience === 'birthday') {
      const userIds = await resolveBirthdayUserIds(input.countryCode);
      count = await distributeInboxAndPush({
        userIds,
        title,
        message,
        audience: input.audience,
        campaignId: id,
      });
    } else {
      const rpcAudience = input.audience === 'all' ? 'everyone' : input.audience;
      const { data, error } = await supabase.rpc('admin_distribute_notifications', {
        p_title: title,
        p_message: message,
        p_audience: rpcAudience,
        p_country_code: input.countryCode,
        p_campaign_id: id,
      });
      if (error) throw new Error(error.message);
      const userIds = Array.isArray(data)
        ? data.map((uid) => String(uid)).filter((uid) => /^[0-9a-f-]{36}$/i.test(uid))
        : [];
      count = userIds.length;
      void pushOsAfterInbox(userIds, title, message, {
        audience: rpcAudience,
        campaignId: id,
      });
    }

    const { error: upd } = await supabase
      .from('admin_push_campaigns')
      .update({
        status: 'sent',
        sent_at: now,
        recipient_count: count,
        updated_at: now,
      })
      .eq('id', id);
    if (upd) return { ok: false, error: upd.message };
    return { ok: true, recipientCount: count };
  } catch (err) {
    await supabase
      .from('admin_push_campaigns')
      .update({ status: 'failed', updated_at: now })
      .eq('id', id);
    const msg = err instanceof Error ? err.message : 'Échec de diffusion';
    return { ok: false, error: msg };
  }
}
