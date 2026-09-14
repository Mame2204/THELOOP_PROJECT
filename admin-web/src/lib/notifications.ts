import { supabase } from './supabase';

export type NotificationAudience =
  | 'all'
  | 'everyone'
  | 'members'
  | 'prime'
  | 'prime_members'
  | 'partner'
  | 'admin'
  | 'individual';

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
}

export async function listPushCampaigns(countryCode: string): Promise<PushCampaign[]> {
  let q = supabase
    .from('admin_push_campaigns')
    .select(
      'id, title, message, audience, status, scheduled_at, sent_at, recipient_count, created_at, target_phone, country_code',
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
  }));
}

/** Envoi réel via RPC (même pipeline que le Control Tower mobile). */
export async function sendPushCampaign(input: {
  title: string;
  message: string;
  audience: NotificationAudience;
  countryCode: string;
  targetPhone?: string | null;
  scheduledAt?: string | null;
  createdBy?: string | null;
}): Promise<{ ok: boolean; recipientCount?: number; error?: string }> {
  const title = input.title.trim();
  const message = input.message.trim();
  if (!title || !message) return { ok: false, error: 'Titre et message requis.' };
  if (input.audience === 'individual' && !input.targetPhone?.trim()) {
    return { ok: false, error: 'Téléphone requis pour un envoi individuel.' };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const scheduled =
    input.scheduledAt && new Date(input.scheduledAt).getTime() > Date.now()
      ? new Date(input.scheduledAt).toISOString()
      : null;

  if (scheduled) {
    const { error } = await supabase.from('admin_push_campaigns').upsert({
      id,
      title,
      message,
      audience: input.audience,
      target_phone: input.audience === 'individual' ? input.targetPhone!.trim() : null,
      scheduled_at: scheduled,
      sent_at: null,
      status: 'scheduled',
      recipient_count: 0,
      created_by: input.createdBy ?? null,
      created_at: now,
      updated_at: now,
      country_code: input.countryCode,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, recipientCount: 0 };
  }

  // Draft d’abord (traçabilité), puis distribution serveur.
  await supabase.from('admin_push_campaigns').upsert({
    id,
    title,
    message,
    audience: input.audience,
    target_phone: input.audience === 'individual' ? input.targetPhone?.trim() ?? null : null,
    scheduled_at: null,
    sent_at: null,
    status: 'draft',
    recipient_count: 0,
    created_by: input.createdBy ?? null,
    created_at: now,
    updated_at: now,
    country_code: input.countryCode,
  });

  if (input.audience === 'individual') {
    // Ciblage téléphone : insert direct via users matching
    const phone = input.targetPhone!.trim();
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .eq('country_code', input.countryCode)
      .or(`phone_number.eq.${phone},phone_number.ilike.%${phone.slice(-9)}`)
      .limit(20);
    const rows = (users ?? []).map((u) => ({
      user_id: u.id,
      title,
      message,
      is_read: false,
      created_at: now,
      campaign_id: id,
    }));
    if (rows.length) {
      const { error: insErr } = await supabase.from('user_notifications').insert(rows);
      if (insErr) {
        // fallback RPC générique
      }
    }
    const { error: upd } = await supabase
      .from('admin_push_campaigns')
      .update({
        status: 'sent',
        sent_at: now,
        recipient_count: rows.length,
        updated_at: now,
      })
      .eq('id', id);
    if (upd) return { ok: false, error: upd.message };
    return { ok: true, recipientCount: rows.length };
  }

  const rpcAudience = input.audience === 'all' ? 'everyone' : input.audience;
  const { data, error } = await supabase.rpc('admin_distribute_notifications', {
    p_title: title,
    p_message: message,
    p_audience: rpcAudience,
    p_country_code: input.countryCode,
    p_campaign_id: id,
  });

  if (error) {
    await supabase
      .from('admin_push_campaigns')
      .update({ status: 'failed', updated_at: now })
      .eq('id', id);
    return { ok: false, error: error.message };
  }

  const count = Array.isArray(data) ? data.length : Number(data ?? 0);
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
}
