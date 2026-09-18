import { supabase } from './supabase';

export type StagingKind = 'event' | 'spot' | 'tool';

export interface StagingQueueItem {
  kind: StagingKind;
  localId: string;
  partnerUserId: string;
  partnerName: string;
  title: string;
  subtitle: string;
  countryCode: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  coverImageUrl: string | null;
  description: string;
  /** Champs bruts utiles pour l’aperçu */
  venueName?: string | null;
  startsAt?: string | null;
  address?: string | null;
  subCategory?: string | null;
}

async function notifyPartner(params: {
  partnerUserId: string;
  kind: StagingKind;
  title: string;
  approve: boolean;
  reason?: string | null;
}): Promise<void> {
  if (!params.partnerUserId) return;
  const kindLabel =
    params.kind === 'event' ? 'Événement' : params.kind === 'tool' ? 'Outil' : 'Spot';
  const title = params.approve ? `${kindLabel} validé` : `${kindLabel} refusé`;
  const message = params.approve
    ? `Votre soumission « ${params.title} » a été approuvée par THE LOOP et est maintenant visible dans l'application.`
    : `Votre soumission « ${params.title} » n'a pas été retenue.${
        params.reason?.trim()
          ? `\n\nMotif : ${params.reason.trim()}`
          : '\n\nVous pouvez modifier et resoumettre votre contenu depuis Mon contenu.'
      }`;

  const { error } = await supabase.from('user_notifications').insert({
    user_id: params.partnerUserId,
    title,
    message,
    audience: 'partner',
    sent_at: new Date().toISOString(),
  });
  if (error) {
    // Best-effort — ne bloque pas la modération
    console.warn('[moderation] notify:', error.message);
  }
}

export async function listPendingStaging(
  countryCode?: string,
): Promise<{ items: StagingQueueItem[]; error?: string }> {
  const [eventsRes, spotsRes] = await Promise.all([
    supabase
      .from('partner_event_submissions')
      .select(
        'local_id, partner_user_id, partner_name, title, description, venue_name, starts_at, country_code, cover_image_url, status, created_at, updated_at',
      )
      .eq('status', 'pending')
      .is('published_event_id', null)
      .order('updated_at', { ascending: false })
      .limit(100),
    supabase
      .from('partner_spot_submissions')
      .select(
        'local_id, partner_user_id, partner_name, name, description, address, sub_category, country_code, cover_image_url, status, created_at, updated_at',
      )
      .eq('status', 'pending')
      .is('published_establishment_id', null)
      .is('published_tool_id', null)
      .order('updated_at', { ascending: false })
      .limit(100),
  ]);

  if (eventsRes.error && spotsRes.error) {
    return { items: [], error: eventsRes.error.message || spotsRes.error.message };
  }

  const events: StagingQueueItem[] = (eventsRes.data ?? [])
    .filter((r) => !countryCode || String(r.country_code ?? 'GN') === countryCode)
    .map((r) => ({
      kind: 'event' as const,
      localId: String(r.local_id),
      partnerUserId: String(r.partner_user_id ?? ''),
      partnerName: String(r.partner_name ?? 'Partenaire'),
      title: String(r.title ?? 'Événement'),
      subtitle: [r.venue_name, r.starts_at].filter(Boolean).join(' · '),
      countryCode: String(r.country_code ?? 'GN'),
      status: String(r.status ?? 'pending'),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at ?? r.created_at),
      coverImageUrl: r.cover_image_url ? String(r.cover_image_url) : null,
      description: String(r.description ?? ''),
      venueName: r.venue_name ? String(r.venue_name) : null,
      startsAt: r.starts_at ? String(r.starts_at) : null,
    }));

  const spots: StagingQueueItem[] = (spotsRes.data ?? [])
    .filter((r) => !countryCode || String(r.country_code ?? 'GN') === countryCode)
    .map((r) => {
      const isTool = String(r.sub_category ?? '') === 'tools';
      return {
        kind: (isTool ? 'tool' : 'spot') as StagingKind,
        localId: String(r.local_id),
        partnerUserId: String(r.partner_user_id ?? ''),
        partnerName: String(r.partner_name ?? 'Partenaire'),
        title: String(r.name ?? (isTool ? 'Outil' : 'Spot')),
        subtitle: [r.address, isTool ? 'Outil' : 'Spot'].filter(Boolean).join(' · '),
        countryCode: String(r.country_code ?? 'GN'),
        status: String(r.status ?? 'pending'),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at ?? r.created_at),
        coverImageUrl: r.cover_image_url ? String(r.cover_image_url) : null,
        description: String(r.description ?? ''),
        address: r.address ? String(r.address) : null,
        subCategory: r.sub_category ? String(r.sub_category) : null,
      };
    });

  const items = [...events, ...spots].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    items,
    error: eventsRes.error?.message || spotsRes.error?.message,
  };
}

export async function approveStagingItem(
  item: StagingQueueItem,
): Promise<{ ok: boolean; error?: string }> {
  if (item.kind === 'event') {
    const { error } = await supabase.rpc('publish_partner_event_submission', {
      p_local_id: item.localId,
    });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.rpc('publish_partner_spot_submission', {
      p_local_id: item.localId,
    });
    if (error) return { ok: false, error: error.message };
  }

  await notifyPartner({
    partnerUserId: item.partnerUserId,
    kind: item.kind,
    title: item.title,
    approve: true,
  });
  return { ok: true };
}

export async function rejectStagingItem(
  item: StagingQueueItem,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const motif = reason.trim() || 'Refusé par l’admin';
  const rpcName =
    item.kind === 'event'
      ? 'reject_partner_event_submission'
      : 'reject_partner_spot_submission';
  const { error } = await supabase.rpc(rpcName, {
    p_local_id: item.localId,
    p_reason: motif,
  });

  if (error) return { ok: false, error: error.message };

  await notifyPartner({
    partnerUserId: item.partnerUserId,
    kind: item.kind,
    title: item.title,
    approve: false,
    reason: motif,
  });
  return { ok: true };
}
