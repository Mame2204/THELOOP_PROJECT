import { deliverPushToUsers } from './api';
import { resolveIndividualUserIds } from './notification-individual-target';
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
  individual: 'E-mails ciblés',
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

/** Campagne modifiable / annulable tant qu’elle n’a pas été envoyée. */
export function isPushCampaignEditable(status: string): boolean {
  return status === 'draft' || status === 'scheduled';
}

/** Campagne supprimable : jamais si envoyée avec ≥1 dest. ; oui si envoyée à 0 dest. ou non envoyée. */
export function isPushCampaignDeletable(status: string, recipientCount = 0): boolean {
  if (status === 'sent') return recipientCount === 0;
  return true;
}

export function isPushCampaignCancellable(status: string): boolean {
  return status === 'draft' || status === 'scheduled';
}

export const CAMPAIGN_LIST_PAGE_SIZE = 12;
export const CAMPAIGN_RECIPIENTS_PAGE_SIZE = 20;

export interface CampaignRecipientRow {
  userId: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  userRole: string | null;
  recipientPhone: string | null;
  sentAt: string | null;
}

type PushCampaignRowDb = {
  id: string;
  title: string | null;
  message: string | null;
  audience: string | null;
  status: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  recipient_count: number | null;
  created_at: string | null;
  target_phone: string | null;
  favorite_event_categories: unknown;
  favorite_spot_categories: unknown;
  favorite_tool_categories: unknown;
};

function mapPushCampaignRow(r: PushCampaignRowDb): PushCampaign {
  return {
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
  };
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
  const { items } = await listPushCampaignsPage(countryCode, 0, 200);
  return items;
}

export async function listPushCampaignsPage(
  countryCode: string,
  page: number,
  pageSize = CAMPAIGN_LIST_PAGE_SIZE,
): Promise<{ items: PushCampaign[]; total: number }> {
  const from = Math.max(0, page) * pageSize;
  const to = from + pageSize - 1;

  let countQ = supabase.from('admin_push_campaigns').select('id', { count: 'exact', head: true });
  let dataQ = supabase
    .from('admin_push_campaigns')
    .select(
      'id, title, message, audience, status, scheduled_at, sent_at, recipient_count, created_at, target_phone, country_code, favorite_event_categories, favorite_spot_categories, favorite_tool_categories',
    )
    .order('created_at', { ascending: false })
    .range(from, to);
  if (countryCode) {
    countQ = countQ.eq('country_code', countryCode);
    dataQ = dataQ.eq('country_code', countryCode);
  }
  const [{ count, error: countErr }, { data, error }] = await Promise.all([countQ, dataQ]);
  if (countErr) throw new Error(countErr.message);
  if (error) throw new Error(error.message);
  return {
    items: (data ?? []).map((r) => mapPushCampaignRow(r as PushCampaignRowDb)),
    total: count ?? 0,
  };
}

export async function listCampaignRecipientsPage(
  campaignId: string,
  page: number,
  pageSize = CAMPAIGN_RECIPIENTS_PAGE_SIZE,
): Promise<{ items: CampaignRecipientRow[]; total: number }> {
  const offset = Math.max(0, page) * pageSize;

  const { data, error } = await supabase.rpc('admin_list_campaign_recipients', {
    p_campaign_id: campaignId,
    p_limit: pageSize,
    p_offset: offset,
  });

  if (error) {
    if (/function.*does not exist|schema cache/i.test(error.message)) {
      throw new Error(
        'Fonction admin_list_campaign_recipients absente — appliquez la migration 20260942 sur Supabase.',
      );
    }
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const total = rows.length ? Number(rows[0].total_count ?? 0) : 0;

  const items: CampaignRecipientRow[] = rows.map((row) => ({
    userId: row.user_id ? String(row.user_id) : null,
    email: row.email ? String(row.email) : null,
    firstName: row.first_name ? String(row.first_name) : null,
    lastName: row.last_name ? String(row.last_name) : null,
    userRole: row.user_role ? String(row.user_role) : null,
    recipientPhone: row.recipient_phone ? String(row.recipient_phone) : null,
    sentAt: row.sent_at ? String(row.sent_at) : null,
  }));

  return { items, total };
}

export async function cancelPushCampaign(id: string): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('admin_push_campaigns')
    .update({ status: 'cancelled', updated_at: now })
    .eq('id', id)
    .in('status', ['draft', 'scheduled'])
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Campagne introuvable ou déjà envoyée.' };
  return { ok: true };
}

export async function deletePushCampaign(id: string): Promise<{ ok: boolean; error?: string }> {
  const { data: existing, error: fetchErr } = await supabase
    .from('admin_push_campaigns')
    .select('id, status, recipient_count')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!existing) return { ok: false, error: 'Campagne introuvable.' };

  const status = String(existing.status ?? '');
  const recipientCount = Number(existing.recipient_count ?? 0);
  if (status === 'sent' && recipientCount > 0) {
    return { ok: false, error: 'Campagne déjà diffusée — suppression impossible.' };
  }

  const { data, error } = await supabase.from('admin_push_campaigns').delete().eq('id', id).select('id').maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Suppression impossible.' };
  return { ok: true };
}

async function distributePushCampaignNow(input: {
  id: string;
  title: string;
  message: string;
  audience: NotificationAudience;
  countryCode: string;
  targetPhone?: string | null;
  favoriteEventCategories?: string[];
  favoriteSpotCategories?: string[];
  favoriteToolCategories?: string[];
}): Promise<number> {
  const { title, message, audience, countryCode, id } = input;
  const favEvents = input.favoriteEventCategories ?? [];
  const favSpots = input.favoriteSpotCategories ?? [];
  const favTools = input.favoriteToolCategories ?? [];

  if (audience === 'individual') {
    const userIds = await resolveIndividualUserIds(supabase, input.targetPhone!.trim(), countryCode);
    return distributeInboxAndPush({ userIds, title, message, audience, campaignId: id });
  }
  if (audience === 'favorites') {
    const userIds = await resolveFavoriteUserIds(favEvents, favSpots, favTools, countryCode);
    return distributeInboxAndPush({ userIds, title, message, audience, campaignId: id });
  }
  if (audience === 'birthday') {
    const userIds = await resolveBirthdayUserIds(countryCode);
    return distributeInboxAndPush({ userIds, title, message, audience, campaignId: id });
  }
  const rpcAudience = audience === 'all' ? 'everyone' : audience;
  const { data, error } = await supabase.rpc('admin_distribute_notifications', {
    p_title: title,
    p_message: message,
    p_audience: rpcAudience,
    p_country_code: countryCode,
    p_campaign_id: id,
  });
  if (error) throw new Error(error.message);
  const userIds = Array.isArray(data)
    ? data.map((uid) => String(uid)).filter((uid) => /^[0-9a-f-]{36}$/i.test(uid))
    : [];
  void pushOsAfterInbox(userIds, title, message, { audience: rpcAudience, campaignId: id });
  return userIds.length;
}

/** Met à jour une campagne non envoyée (brouillon ou planifiée). Envoi immédiat si sendNow. */
export async function updatePushCampaign(
  id: string,
  input: {
    title: string;
    message: string;
    audience: NotificationAudience;
    countryCode: string;
    targetPhone?: string | null;
    favoriteEventCategories?: string[];
    favoriteSpotCategories?: string[];
    favoriteToolCategories?: string[];
    scheduledAt?: string | null;
    sendNow: boolean;
  },
): Promise<{ ok: boolean; recipientCount?: number; error?: string }> {
  const title = input.title.trim();
  const message = input.message.trim();
  if (!title || !message) return { ok: false, error: 'Titre et message requis.' };
  if (input.audience === 'individual' && !input.targetPhone?.trim()) {
    return { ok: false, error: 'E-mail requis pour un envoi individuel (séparateur ;).' };
  }
  if (
    input.audience === 'favorites' &&
    !input.favoriteEventCategories?.length &&
    !input.favoriteSpotCategories?.length &&
    !input.favoriteToolCategories?.length
  ) {
    return { ok: false, error: 'Sélectionnez au moins une catégorie favori.' };
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('admin_push_campaigns')
    .select('id, status, created_at, created_by')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!existing || !isPushCampaignEditable(String(existing.status))) {
    return { ok: false, error: 'Campagne introuvable ou déjà envoyée.' };
  }

  const now = new Date().toISOString();
  const favEvents = input.favoriteEventCategories ?? [];
  const favSpots = input.favoriteSpotCategories ?? [];
  const favTools = input.favoriteToolCategories ?? [];
  const when = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const scheduled =
    when && !Number.isNaN(when.getTime()) && when.getTime() > Date.now() ? when.toISOString() : null;

  if (!input.sendNow) {
    if (!scheduled) {
      return { ok: false, error: 'Indiquez une date et une heure dans le futur.' };
    }
    const { error } = await supabase
      .from('admin_push_campaigns')
      .update(
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
          createdBy: existing.created_by ? String(existing.created_by) : null,
          createdAt: String(existing.created_at ?? now),
        }),
      )
      .eq('id', id)
      .in('status', ['draft', 'scheduled']);
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
      scheduledAt: null,
      status: 'draft',
      recipientCount: 0,
      createdBy: existing.created_by ? String(existing.created_by) : null,
      createdAt: String(existing.created_at ?? now),
    }),
  );

  try {
    const count = await distributePushCampaignNow({
      id,
      title,
      message,
      audience: input.audience,
      countryCode: input.countryCode,
      targetPhone: input.targetPhone,
      favoriteEventCategories: favEvents,
      favoriteSpotCategories: favSpots,
      favoriteToolCategories: favTools,
    });
    const { error: upd } = await supabase
      .from('admin_push_campaigns')
      .update({ status: 'sent', sent_at: now, recipient_count: count, updated_at: now })
      .eq('id', id);
    if (upd) return { ok: false, error: upd.message };
    return { ok: true, recipientCount: count };
  } catch (err) {
    await supabase.from('admin_push_campaigns').update({ status: 'failed', updated_at: now }).eq('id', id);
    const msg = err instanceof Error ? err.message : 'Échec de diffusion';
    return { ok: false, error: msg };
  }
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
  /** true = planification uniquement, jamais d'envoi immédiat (aligné mobile). */
  scheduleOnly?: boolean;
  createdBy?: string | null;
}): Promise<{ ok: boolean; recipientCount?: number; error?: string }> {
  const title = input.title.trim();
  const message = input.message.trim();
  if (!title || !message) return { ok: false, error: 'Titre et message requis.' };
  if (input.audience === 'individual' && !input.targetPhone?.trim()) {
    return { ok: false, error: 'E-mail requis pour un envoi individuel (séparateur ;).' };
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
  const favEvents = input.favoriteEventCategories ?? [];
  const favSpots = input.favoriteSpotCategories ?? [];
  const favTools = input.favoriteToolCategories ?? [];

  const scheduleOnly = input.scheduleOnly === true;
  const when = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const scheduled =
    when && !Number.isNaN(when.getTime()) && when.getTime() > Date.now() ? when.toISOString() : null;

  if (scheduleOnly) {
    if (!scheduled) {
      return { ok: false, error: 'Indiquez une date et une heure dans le futur.' };
    }
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
    const count = await distributePushCampaignNow({
      id,
      title,
      message,
      audience: input.audience,
      countryCode: input.countryCode,
      targetPhone: input.targetPhone,
      favoriteEventCategories: favEvents,
      favoriteSpotCategories: favSpots,
      favoriteToolCategories: favTools,
    });

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
