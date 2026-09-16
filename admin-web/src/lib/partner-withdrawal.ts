import { supabase } from './supabase';
import type { StagingKind } from './moderation';

export interface WithdrawalQueueItem {
  kind: StagingKind;
  localId: string;
  partnerUserId: string;
  partnerName: string;
  title: string;
  subtitle: string;
  countryCode: string;
  catalogId: string | null;
  updatedAt: string;
}

async function notifyWithdrawalDecision(params: {
  partnerUserId: string;
  kind: StagingKind;
  title: string;
  approved: boolean;
}): Promise<void> {
  if (!params.partnerUserId) return;
  const kindLabel =
    params.kind === 'event' ? 'Événement' : params.kind === 'tool' ? 'Outil' : 'Spot';
  const title = params.approved ? `${kindLabel} retiré` : 'Demande de retrait refusée';
  const message = params.approved
    ? `Votre demande de retrait pour « ${params.title} » a été acceptée. Le contenu n'est plus visible dans l'application.`
    : `Votre demande de retrait pour « ${params.title} » a été refusée. Le contenu reste publié.`;

  await supabase.from('user_notifications').insert({
    user_id: params.partnerUserId,
    title,
    message,
    audience: 'partner',
    sent_at: new Date().toISOString(),
  });
}

export async function listWithdrawalRequests(
  countryCode?: string,
): Promise<{ items: WithdrawalQueueItem[]; error?: string }> {
  const [eventsRes, spotsRes] = await Promise.all([
    supabase
      .from('partner_event_submissions')
      .select(
        'local_id, partner_user_id, partner_name, title, venue_name, country_code, published_event_id, updated_at',
      )
      .eq('status', 'withdrawal_requested')
      .order('updated_at', { ascending: false })
      .limit(50),
    supabase
      .from('partner_spot_submissions')
      .select(
        'local_id, partner_user_id, partner_name, name, address, sub_category, country_code, published_establishment_id, published_tool_id, updated_at',
      )
      .eq('status', 'withdrawal_requested')
      .order('updated_at', { ascending: false })
      .limit(50),
  ]);

  if (eventsRes.error && spotsRes.error) {
    return { items: [], error: eventsRes.error.message || spotsRes.error.message };
  }

  const events: WithdrawalQueueItem[] = (eventsRes.data ?? [])
    .filter((r) => !countryCode || String(r.country_code ?? 'GN') === countryCode)
    .map((r) => ({
      kind: 'event' as const,
      localId: String(r.local_id),
      partnerUserId: String(r.partner_user_id ?? ''),
      partnerName: String(r.partner_name ?? 'Partenaire'),
      title: String(r.title ?? 'Événement'),
      subtitle: r.venue_name ? String(r.venue_name) : 'Retrait demandé',
      countryCode: String(r.country_code ?? 'GN'),
      catalogId: r.published_event_id ? String(r.published_event_id) : null,
      updatedAt: String(r.updated_at),
    }));

  const spots: WithdrawalQueueItem[] = (spotsRes.data ?? [])
    .filter((r) => !countryCode || String(r.country_code ?? 'GN') === countryCode)
    .map((r) => {
      const isTool = String(r.sub_category ?? '') === 'tools';
      return {
        kind: (isTool ? 'tool' : 'spot') as StagingKind,
        localId: String(r.local_id),
        partnerUserId: String(r.partner_user_id ?? ''),
        partnerName: String(r.partner_name ?? 'Partenaire'),
        title: String(r.name ?? (isTool ? 'Outil' : 'Spot')),
        subtitle: r.address ? String(r.address) : 'Retrait demandé',
        countryCode: String(r.country_code ?? 'GN'),
        catalogId: isTool
          ? r.published_tool_id
            ? String(r.published_tool_id)
            : null
          : r.published_establishment_id
            ? String(r.published_establishment_id)
            : null,
        updatedAt: String(r.updated_at),
      };
    });

  const items = [...events, ...spots].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { items, error: eventsRes.error?.message || spotsRes.error?.message };
}

export async function countWithdrawalRequests(countryCode?: string): Promise<number> {
  const res = await listWithdrawalRequests(countryCode);
  return res.items.length;
}

async function deleteCatalogRow(
  kind: StagingKind,
  catalogId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (kind === 'event') {
    const { error } = await supabase.from('events').delete().eq('id', catalogId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }
  if (kind === 'tool') {
    const { error } = await supabase.from('tools').delete().eq('id', catalogId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }
  const { error } = await supabase.from('establishments').delete().eq('id', catalogId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function approveWithdrawalRequest(
  item: WithdrawalQueueItem,
): Promise<{ ok: boolean; error?: string }> {
  if (!item.catalogId) {
    return { ok: false, error: 'Aucune fiche publiée liée à cette demande.' };
  }

  const deleted = await deleteCatalogRow(item.kind, item.catalogId);
  if (!deleted.ok) return deleted;

  const rpcKind = item.kind === 'event' ? 'event' : item.kind === 'tool' ? 'tool' : 'spot';
  const { error: rpcError } = await supabase.rpc('admin_withdraw_partner_content', {
    p_kind: rpcKind,
    p_catalog_id: item.catalogId,
    p_local_id: item.localId,
  });
  if (rpcError) return { ok: false, error: rpcError.message };

  await notifyWithdrawalDecision({
    partnerUserId: item.partnerUserId,
    kind: item.kind,
    title: item.title,
    approved: true,
  });
  return { ok: true };
}

export async function rejectWithdrawalRequest(
  item: WithdrawalQueueItem,
): Promise<{ ok: boolean; error?: string }> {
  const table =
    item.kind === 'event' ? 'partner_event_submissions' : 'partner_spot_submissions';
  const { error } = await supabase
    .from(table)
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('local_id', item.localId)
    .eq('status', 'withdrawal_requested');

  if (error) return { ok: false, error: error.message };

  await notifyWithdrawalDecision({
    partnerUserId: item.partnerUserId,
    kind: item.kind,
    title: item.title,
    approved: false,
  });
  return { ok: true };
}
