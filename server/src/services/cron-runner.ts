import type { SupabaseClient } from '@supabase/supabase-js';
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

async function distributeIndividualCampaign(
  supabase: SupabaseClient,
  campaign: PushCampaignRow,
): Promise<{ userIds: string[]; count: number; error?: string }> {
  const phone = campaign.target_phone?.trim();
  if (!phone) return { userIds: [], count: 0, error: 'Téléphone manquant.' };

  let query = supabase.from('users').select('id').limit(20);
  if (campaign.country_code) {
    query = query.eq('country_code', campaign.country_code.toUpperCase());
  }
  const suffix = phone.slice(-9);
  const { data: users, error } = await query.or(
    `phone_number.eq.${phone},phone_number.ilike.%${suffix}`,
  );
  if (error) return { userIds: [], count: 0, error: error.message };

  const userIds = (users ?? []).map((u) => String(u.id)).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!userIds.length) return { userIds: [], count: 0 };

  const now = new Date().toISOString();
  const rows = userIds.map((userId) => ({
    user_id: userId,
    title: campaign.title,
    message: campaign.message,
    audience: 'individual',
    sent_at: now,
    campaign_id: campaign.id,
  }));

  const { error: insErr } = await supabase.from('user_notifications').insert(rows);
  if (insErr) return { userIds: [], count: 0, error: insErr.message };
  return { userIds, count: userIds.length };
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
    .select('id, title, message, audience, target_phone, scheduled_at, country_code, status')
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
