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

/** Colonnes retournées après UPDATE — events.title · spots/outils.name (pas de colonne croisée). */
function withdrawalNotifySelect(kind: PartnerContentKind): string {
  if (kind === 'event') {
    return 'local_id, title, partner_name, country_code';
  }
  return 'local_id, name, partner_name, country_code';
}

function labelFromWithdrawalRow(
  kind: PartnerContentKind,
  row: { title?: string | null; name?: string | null },
): string {
  if (kind === 'event') {
    return String(row.title ?? 'Événement');
  }
  const fallback = kind === 'tool' ? 'Outil' : 'Spot';
  return String(row.name ?? fallback);
}

function contentTitle(kind: PartnerContentKind, item: StagingEvent | StagingSpot): string {
  return kind === 'event' ? (item as StagingEvent).title : (item as StagingSpot).name;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function catalogIdFromSyntheticLocalId(localId: string, kind: PartnerContentKind): string | null {
  const prefix =
    kind === 'event' ? 'catalog-event-' : kind === 'tool' ? 'catalog-tool-' : 'catalog-spot-';
  if (localId.startsWith(prefix)) {
    const id = localId.slice(prefix.length);
    return UUID_RE.test(id) ? id : null;
  }
  return null;
}

function resolveWithdrawalCatalogId(
  kind: PartnerContentKind,
  item: StagingEvent | StagingSpot,
): string | null {
  if (kind === 'event') {
    const event = item as StagingEvent;
    const published = event.publishedEventId?.trim();
    if (published) return published;
    return catalogIdFromSyntheticLocalId(item.id, 'event');
  }

  const spot = item as StagingSpot;
  if (kind === 'tool') {
    const published = spot.publishedToolId?.trim();
    if (published) return published;
    return catalogIdFromSyntheticLocalId(item.id, 'tool');
  }

  const published = spot.publishedEstablishmentId?.trim();
  if (published) return published;
  return catalogIdFromSyntheticLocalId(item.id, 'spot');
}

async function purgeWithdrawalSubmissionLocal(
  kind: PartnerContentKind,
  localIds: string[],
): Promise<void> {
  const unique = [...new Set(localIds.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return;

  const { removeStagingEvent, removeStagingSpot } = await import('@/lib/partner-staging-store');
  if (kind === 'event') {
    for (const id of unique) await removeStagingEvent(id);
    return;
  }
  for (const id of unique) await removeStagingSpot(id);
}

/** Résout l’id de soumission réel (catalog-event-* → local_id en base). */
async function resolveSubmissionLocalId(
  kind: PartnerContentKind,
  localId: string,
): Promise<string> {
  if (!localId.startsWith('catalog-') || !isSupabaseConfigured() || !supabase) {
    return localId;
  }

  const catalogId = catalogIdFromSyntheticLocalId(localId, kind);
  if (!catalogId) return localId;

  const table = remoteTable(kind);
  const pubCol =
    kind === 'event'
      ? 'published_event_id'
      : kind === 'tool'
        ? 'published_tool_id'
        : 'published_establishment_id';

  const { data, error } = await supabase
    .from(table)
    .select('local_id')
    .eq(pubCol, catalogId)
    .in('status', ['approved', 'withdrawal_requested'])
    .maybeSingle();

  if (error || !data?.local_id) return localId;
  return String(data.local_id);
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
  const resolvedId = await resolveSubmissionLocalId(kind, localId);
  const { data, error } = await supabase
    .from(table)
    .update({ status: 'withdrawal_requested', updated_at: new Date().toISOString() })
    .eq('local_id', resolvedId)
    .eq('status', 'approved')
    .select(withdrawalNotifySelect(kind))
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: 'Contenu introuvable ou déjà en cours de retrait.' };
  }

  const title = labelFromWithdrawalRow(
    kind,
    data as { title?: string | null; name?: string | null },
  );
  await notifyAdminWithdrawalRequest({
    kind,
    title,
    partnerName: String((data as { partner_name?: string }).partner_name ?? 'Partenaire'),
    countryCode: (data as { country_code?: string }).country_code ?? null,
  }).catch(() => undefined);

  const { patchStagingSubmissionStatus } = await import('@/lib/partner-staging-store');
  await patchStagingSubmissionStatus(kind, resolvedId, 'withdrawal_requested');
  if (resolvedId !== localId.trim()) {
    await patchStagingSubmissionStatus(kind, localId.trim(), 'withdrawal_requested');
  }

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
  const resolvedId = await resolveSubmissionLocalId(kind, localId);
  const { data, error } = await supabase
    .from(table)
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('local_id', resolvedId)
    .eq('status', 'withdrawal_requested')
    .select('local_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Demande introuvable ou déjà traitée.' };

  const { patchStagingSubmissionStatus } = await import('@/lib/partner-staging-store');
  await patchStagingSubmissionStatus(kind, resolvedId, 'approved');
  if (resolvedId !== localId.trim()) {
    await patchStagingSubmissionStatus(kind, localId.trim(), 'approved');
  }

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
  const catalogId = resolveWithdrawalCatalogId(kind, item);
  const resolvedLocalId = await resolveSubmissionLocalId(kind, item.id);
  const localIds = [...new Set([item.id.trim(), resolvedLocalId].filter(Boolean))];

  if (isSupabaseConfigured() && supabase) {
    const rpcKind = kind === 'event' ? 'event' : isTool ? 'tool' : 'spot';
    if (catalogId) {
      await supabase.rpc('admin_withdraw_partner_content', {
        p_kind: rpcKind,
        p_catalog_id: catalogId,
        p_local_id: resolvedLocalId,
      });
    }

    // Orphelins : catalogue déjà supprimé (FK published_* → NULL).
    const table = remoteTable(kind);
    for (const localId of localIds) {
      await supabase
        .from(table)
        .delete()
        .eq('local_id', localId)
        .eq('status', 'withdrawal_requested');
    }
  }

  if (!catalogId) {
    await purgeWithdrawalSubmissionLocal(kind, localIds);
    invalidateContentCache();
    const partnerUserId = await resolvePartnerNotifyUserId(kind, item);
    if (partnerUserId) {
      await notifyPartnerWithdrawalDecision({
        partnerUserId,
        partnerName: item.partnerName,
        localId: resolvedLocalId,
        kind,
        title: contentTitle(kind, item),
        approved: true,
      }).catch(() => undefined);
    }
    return { ok: true };
  }

  const deleted = await deleteAdminContent(kind === 'event' ? 'event' : 'spot', catalogId, { isTool });
  if (deleted.ok) {
    await purgeWithdrawalSubmissionLocal(kind, localIds);
    invalidateContentCache();
    const partnerUserId = await resolvePartnerNotifyUserId(kind, item);
    if (partnerUserId) {
      await notifyPartnerWithdrawalDecision({
        partnerUserId,
        partnerName: item.partnerName,
        localId: resolvedLocalId,
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
  const resolvedId = await resolveSubmissionLocalId(kind, item.id);
  const { error } = await supabase
    .from(table)
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('local_id', resolvedId)
    .eq('status', 'withdrawal_requested');

  if (error) return { ok: false, error: error.message };

  const { patchStagingSubmissionStatus } = await import('@/lib/partner-staging-store');
  await patchStagingSubmissionStatus(kind, resolvedId, 'approved');
  if (resolvedId !== item.id.trim()) {
    await patchStagingSubmissionStatus(kind, item.id.trim(), 'approved');
  }

  const partnerUserId = await resolvePartnerNotifyUserId(kind, item);
  if (partnerUserId) {
    await notifyPartnerWithdrawalDecision({
      partnerUserId,
      partnerName: item.partnerName,
      localId: resolvedId,
      kind,
      title: contentTitle(kind, item),
      approved: false,
    }).catch(() => undefined);
  }
  return { ok: true };
}
