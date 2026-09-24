import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveIndividualUserIds } from './notification-individual-target.js';
import { deliverPushToUserIds } from './push-delivery.js';

export interface CronRunResult {
  pushCampaignsProcessed: number;
  pushCampaignsSent: number;
  pushRecipients: number;
  errors: string[];
}

interface PushCampaignRow {
  id: string;
  title: string;
  message: string;
  audience: string;
  target_phone: string | null;
  scheduled_at: string | null;
  country_code: string | null;
  status: string;
  favorite_event_categories?: unknown;
  favorite_spot_categories?: unknown;
  favorite_tool_categories?: unknown;
}

const SERVER_AUDIENCES = new Set([
  'all',
  'everyone',
  'members',
  'prime',
  'prime_members',
  'partner',
  'admin',
]);

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter(Boolean);
}

async function filterUserIdsByCountry(
  supabase: SupabaseClient,
  userIds: string[],
  countryCode: string | null,
): Promise<string[]> {
  if (!userIds.length) return [];
  const { data, error } = await supabase
    .from('users')
    .select('id, country_code')
    .in('id', userIds)
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  if (!countryCode) return (data ?? []).map((u) => String(u.id));
  const cc = countryCode.toUpperCase();
  return (data ?? [])
    .filter((u) => !u.country_code || String(u.country_code).toUpperCase() === cc)
    .map((u) => String(u.id));
}

async function resolveFavoriteUserIds(
  supabase: SupabaseClient,
  campaign: PushCampaignRow,
): Promise<string[]> {
  const eventCategories = parseStringArray(campaign.favorite_event_categories);
  const spotCategories = parseStringArray(campaign.favorite_spot_categories);
  const toolCategories = parseStringArray(campaign.favorite_tool_categories);
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
  return filterUserIdsByCountry(supabase, rawIds, campaign.country_code);
}

async function resolveBirthdayUserIds(
  supabase: SupabaseClient,
  countryCode: string | null,
): Promise<string[]> {
  const month = new Date().getMonth() + 1;
  const { data, error } = await supabase
    .from('users')
    .select('id, birth_date, country_code, user_role')
    .eq('is_active', true)
    .not('birth_date', 'is', null)
    .not('user_role', 'in', '("admin","super_admin","partner","tool_partner")');
  if (error) throw new Error(error.message);
  const cc = countryCode?.toUpperCase() ?? null;
  return (data ?? [])
    .filter((u) => {
      if (cc && u.country_code && String(u.country_code).toUpperCase() !== cc) return false;
      const bd = new Date(String(u.birth_date));
      return !Number.isNaN(bd.getTime()) && bd.getMonth() + 1 === month;
    })
    .map((u) => String(u.id));
}

async function insertInboxForUsers(
  supabase: SupabaseClient,
  userIds: string[],
  campaign: PushCampaignRow,
  audience: string,
): Promise<{ userIds: string[]; count: number; error?: string }> {
  const uniqueIds = [...new Set(userIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (!uniqueIds.length) return { userIds: [], count: 0 };

  const now = new Date().toISOString();
  const rows = uniqueIds.map((userId) => ({
    user_id: userId,
    title: campaign.title,
    message: campaign.message,
    audience,
    sent_at: now,
    campaign_id: campaign.id,
  }));
  const { error: insErr } = await supabase.from('user_notifications').insert(rows);
  if (insErr) return { userIds: [], count: 0, error: insErr.message };
  return { userIds: uniqueIds, count: uniqueIds.length };
}

async function distributeIndividualCampaign(
  supabase: SupabaseClient,
  campaign: PushCampaignRow,
): Promise<{ userIds: string[]; count: number; error?: string }> {
  const raw = campaign.target_phone?.trim();
  if (!raw) return { userIds: [], count: 0, error: 'E-mail ou cible manquante.' };

  try {
    const userIds = await resolveIndividualUserIds(supabase, raw, campaign.country_code);
    if (!userIds.length) return { userIds: [], count: 0 };
    return insertInboxForUsers(supabase, userIds, campaign, 'individual');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { userIds: [], count: 0, error: message };
  }
}

async function processPushCampaign(
  supabase: SupabaseClient,
  campaign: PushCampaignRow,
): Promise<{ ok: boolean; recipientCount: number; userIds: string[]; error?: string }> {
  const now = new Date().toISOString();
  const audience = campaign.audience?.trim().toLowerCase() ?? 'everyone';
  let userIds: string[] = [];
  let recipientCount = 0;
  let error: string | undefined;

  if (audience === 'individual') {
    const individual = await distributeIndividualCampaign(supabase, campaign);
    userIds = individual.userIds;
    recipientCount = individual.count;
    error = individual.error;
  } else if (audience === 'favorites') {
    try {
      userIds = await resolveFavoriteUserIds(supabase, campaign);
      const inserted = await insertInboxForUsers(supabase, userIds, campaign, audience);
      userIds = inserted.userIds;
      recipientCount = inserted.count;
      error = inserted.error;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  } else if (audience === 'birthday') {
    try {
      userIds = await resolveBirthdayUserIds(supabase, campaign.country_code);
      const inserted = await insertInboxForUsers(supabase, userIds, campaign, audience);
      userIds = inserted.userIds;
      recipientCount = inserted.count;
      error = inserted.error;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  } else if (SERVER_AUDIENCES.has(audience)) {
    const rpcAudience = audience === 'all' ? 'everyone' : audience;
    const { data, error: rpcErr } = await supabase.rpc('admin_distribute_notifications', {
      p_title: campaign.title,
      p_message: campaign.message,
      p_audience: rpcAudience,
      p_country_code: campaign.country_code?.toUpperCase() ?? null,
      p_campaign_id: campaign.id,
    });
    if (rpcErr) {
      error = rpcErr.message;
    } else if (Array.isArray(data)) {
      userIds = data.map((id) => String(id)).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
      recipientCount = userIds.length;
    }
  } else {
    error = `Audience non supportée côté cron : ${audience}`;
  }

  if (error) {
    await supabase
      .from('admin_push_campaigns')
      .update({ status: 'failed', updated_at: now })
      .eq('id', campaign.id)
      .eq('status', 'scheduled');
    return { ok: false, recipientCount: 0, userIds: [], error };
  }

  if (userIds.length && campaign.title && campaign.message) {
    await deliverPushToUserIds(supabase, userIds, campaign.title, campaign.message, {
      audience,
      campaignId: campaign.id,
      source: 'theloop-cron',
    }).catch(() => undefined);
  }

  const { error: updErr } = await supabase
    .from('admin_push_campaigns')
    .update({
      status: 'sent',
      sent_at: now,
      recipient_count: recipientCount,
      updated_at: now,
    })
    .eq('id', campaign.id)
    .eq('status', 'scheduled');

  if (updErr) return { ok: false, recipientCount, userIds, error: updErr.message };
  return { ok: true, recipientCount, userIds };
}

/** Traite les campagnes push planifiées dont l’échéance est dépassée. */
export async function runScheduledPushCampaigns(supabase: SupabaseClient): Promise<CronRunResult> {
  const result: CronRunResult = {
    pushCampaignsProcessed: 0,
    pushCampaignsSent: 0,
    pushRecipients: 0,
    errors: [],
  };

  const nowIso = new Date().toISOString();
  const { data: due, error } = await supabase
    .from('admin_push_campaigns')
    .select(
      'id, title, message, audience, target_phone, scheduled_at, country_code, status, favorite_event_categories, favorite_spot_categories, favorite_tool_categories',
    )
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(20);

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  for (const row of (due ?? []) as PushCampaignRow[]) {
    result.pushCampaignsProcessed += 1;
    const outcome = await processPushCampaign(supabase, row);
    if (outcome.ok) {
      result.pushCampaignsSent += 1;
      result.pushRecipients += outcome.recipientCount;
    } else if (outcome.error) {
      result.errors.push(`${row.id}: ${outcome.error}`);
    }
  }

  return result;
}
