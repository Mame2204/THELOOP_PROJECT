import { deleteAdminContent } from '@/lib/admin-content-delete';
import { invalidateContentCache } from '@/lib/content-store';
import {
  notifyAdminWithdrawalRequest,
  notifyPartnerWithdrawalDecision,
} from '@/lib/partner-moderation-notify';
import { resolvePartnerQueryUserId } from '@/lib/partner-catalog-ids';
import type { StagingEvent, StagingSpot } from '@/lib/partner-staging-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type PartnerContentKind = 'event' | 'spot' | 'tool';

function remoteTable(kind: PartnerContentKind): 'partner_event_submissions' | 'partner_spot_submissions' {
  return kind === 'event' ? 'partner_event_submissions' : 'partner_spot_submissions';
}

function contentTitle(kind: PartnerContentKind, item: StagingEvent | StagingSpot): string {
  return kind === 'event' ? (item as StagingEvent).title : (item as StagingSpot).name;
}

async function resolvePartnerNotifyUserId(
  kind: PartnerContentKind,
  item: StagingEvent | StagingSpot,
): Promise<string | null> {
  const raw =
    kind === 'event'
      ? (item as StagingEvent).masterId || item.partnerId
      : item.partnerId;
  const resolved = await resolvePartnerQueryUserId(raw, item.partnerName);
  return resolved ?? raw;
}

/** Partenaire : demande le retrait d'un contenu déjà publié. */
export async function requestPartnerContentWithdrawal(
  kind: PartnerContentKind,
  localId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'Connexion requise pour demander un retrait.' };
  }

  const table = remoteTable(kind);
  const { data, error } = await supabase
    .from(table)
    .update({ status: 'withdrawal_requested', updated_at: new Date().toISOString() })
    .eq('local_id', localId)
    .eq('status', 'approved')
    .select('local_id, title, name, partner_name, country_code')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: 'Contenu introuvable ou déjà en cours de retrait.' };
  }

  const title =
    kind === 'event'
      ? String((data as { title?: string }).title ?? 'Événement')
      : String((data as { name?: string }).name ?? 'Contenu');
  await notifyAdminWithdrawalRequest({
    kind,
    title,
    partnerName: String((data as { partner_name?: string }).partner_name ?? 'Partenaire'),
    countryCode: (data as { country_code?: string }).country_code ?? null,
  }).catch(() => undefined);

  return { ok: true };
}

/** Partenaire : annule une demande de retrait en cours. */
export async function cancelPartnerContentWithdrawal(
  kind: PartnerContentKind,
  localId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'Connexion requise.' };
  }

  const table = remoteTable(kind);
  const { data, error } = await supabase
    .from(table)
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('local_id', localId)
    .eq('status', 'withdrawal_requested')
    .select('local_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Demande introuvable ou déjà traitée.' };
  return { ok: true };
}

export async function countWithdrawalRequests(countryCode?: string): Promise<number> {
  const [ev, sp] = await Promise.all([
    listWithdrawalRequestedEvents(countryCode),
    listWithdrawalRequestedSpots(countryCode),
  ]);
  return ev.length + sp.length;
}

export async function listWithdrawalRequestedEvents(countryCode?: string): Promise<StagingEvent[]> {
  const { fetchRemotePartnerEventSubmissions } = await import('@/lib/partner-content-sync');
  const all = await fetchRemotePartnerEventSubmissions({ statuses: ['withdrawal_requested'] });
  if (!countryCode) return all;
  const cc = countryCode.toUpperCase();
  return all.filter((e) => (e.countryCode ?? 'GN').toUpperCase() === cc);
}

export async function listWithdrawalRequestedSpots(countryCode?: string): Promise<StagingSpot[]> {
  const { fetchRemotePartnerSpotSubmissions } = await import('@/lib/partner-content-sync');
  const all = await fetchRemotePartnerSpotSubmissions({ statuses: ['withdrawal_requested'] });
  if (!countryCode) return all;
  const cc = countryCode.toUpperCase();
  return all.filter((s) => (s.countryCode ?? 'GN').toUpperCase() === cc);
}

/** Admin : valide la demande — dépublication + purge soumissions. */
export async function approvePartnerWithdrawalRequest(
  kind: PartnerContentKind,
  item: StagingEvent | StagingSpot,
): Promise<{ ok: boolean; error?: string }> {
  const isTool = kind === 'tool';
  const catalogId =
    kind === 'event'
      ? (item as StagingEvent).publishedEventId
      : isTool
        ? (item as StagingSpot).publishedToolId
        : (item as StagingSpot).publishedEstablishmentId;

  if (!catalogId) {
    return { ok: false, error: 'Aucune fiche publiée liée à cette demande.' };
  }

  const deleted = await deleteAdminContent(kind === 'event' ? 'event' : 'spot', catalogId, { isTool });
  if (deleted.ok) {
    invalidateContentCache();
    const partnerUserId = await resolvePartnerNotifyUserId(kind, item);
    if (partnerUserId) {
      await notifyPartnerWithdrawalDecision({
        partnerUserId,
        kind,
        title: contentTitle(kind, item),
        approved: true,
      }).catch(() => undefined);
    }
  }
  return deleted;
}

/** Admin : refuse la demande — le contenu reste publié. */
export async function rejectPartnerWithdrawalRequest(
  kind: PartnerContentKind,
  item: StagingEvent | StagingSpot,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'Supabase requis.' };
  }

  const table = remoteTable(kind);
  const { error } = await supabase
    .from(table)
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('local_id', item.id)
    .eq('status', 'withdrawal_requested');

  if (error) return { ok: false, error: error.message };

  const partnerUserId = await resolvePartnerNotifyUserId(kind, item);
  if (partnerUserId) {
    await notifyPartnerWithdrawalDecision({
      partnerUserId,
      kind,
      title: contentTitle(kind, item),
      approved: false,
    }).catch(() => undefined);
  }
  return { ok: true };
}
