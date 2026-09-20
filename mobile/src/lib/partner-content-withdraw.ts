import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  adminDeletePartnerEvent,
  adminDeletePartnerSpot,
  removeStagingEvent,
  removeStagingSpot,
} from '@/lib/partner-staging-store';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isLocalStagingId(id: string): boolean {
  return id.startsWith('evt-') || id.startsWith('spot-') || id.startsWith('tool-');
}

export interface PartnerContentWithdrawResult {
  localIds: string[];
  catalogIds: string[];
}

/** Résout les local_id de soumissions liées à un id staging ou publié. */
export async function findPartnerSubmissionLocalIds(
  kind: 'event' | 'spot' | 'tool',
  id: string,
): Promise<PartnerContentWithdrawResult> {
  const localIds = new Set<string>();
  const catalogIds = new Set<string>();

  if (isLocalStagingId(id)) localIds.add(id);
  if (isUuid(id)) catalogIds.add(id);

  if (!isSupabaseConfigured() || !supabase) {
    return { localIds: [...localIds], catalogIds: [...catalogIds] };
  }

  if (kind === 'event') {
    const { data: byLocal } = await supabase
      .from('partner_event_submissions')
      .select('local_id, published_event_id')
      .eq('local_id', id)
      .limit(15);
    for (const row of byLocal ?? []) {
      localIds.add(String(row.local_id));
      if (row.published_event_id) catalogIds.add(String(row.published_event_id));
    }

    if (isUuid(id)) {
      const { data: byPublished } = await supabase
        .from('partner_event_submissions')
        .select('local_id, published_event_id')
        .eq('published_event_id', id)
        .limit(15);
      for (const row of byPublished ?? []) {
        localIds.add(String(row.local_id));
        catalogIds.add(id);
      }
    }
  } else {
    const { data: byLocal } = await supabase
      .from('partner_spot_submissions')
      .select('local_id, published_establishment_id, published_tool_id')
      .eq('local_id', id)
      .limit(15);
    for (const row of byLocal ?? []) {
      localIds.add(String(row.local_id));
      if (row.published_establishment_id) catalogIds.add(String(row.published_establishment_id));
      if (row.published_tool_id) catalogIds.add(String(row.published_tool_id));
    }

    if (isUuid(id)) {
      const pubCol = kind === 'tool' ? 'published_tool_id' : 'published_establishment_id';
      const { data: byPublished } = await supabase
        .from('partner_spot_submissions')
        .select('local_id, published_establishment_id, published_tool_id')
        .eq(pubCol, id)
        .limit(15);
      for (const row of byPublished ?? []) {
        localIds.add(String(row.local_id));
        catalogIds.add(id);
      }

      if (kind === 'spot') {
        const { data: asTool } = await supabase
          .from('partner_spot_submissions')
          .select('local_id, published_tool_id')
          .eq('published_tool_id', id)
          .limit(15);
        for (const row of asTool ?? []) {
          localIds.add(String(row.local_id));
          catalogIds.add(id);
        }
      }
    }
  }

  return { localIds: [...localIds], catalogIds: [...catalogIds] };
}

function uuidFromIds(ids: string[]): string | null {
  const match = ids.find((id) => isUuid(id));
  return match ?? null;
}

async function withdrawRemoteSubmissions(
  kind: 'event' | 'spot' | 'tool',
  catalogId: string | null,
  localIds: string[],
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  const rpcKind = kind === 'tool' ? 'tool' : kind;
  const catalogUuid = catalogId && isUuid(catalogId) ? catalogId : uuidFromIds(localIds);

  if (catalogUuid) {
    const { error } = await supabase.rpc('admin_withdraw_partner_content', {
      p_kind: rpcKind,
      p_catalog_id: catalogUuid,
      p_local_id: undefined,
    });
    if (!error) return;
    if (!/does not exist|could not find|schema cache/i.test(error.message)) {
      console.warn('[PartnerWithdraw] RPC catalog:', error.message);
    }
  }

  for (const localId of localIds) {
    const { error } = await supabase.rpc('admin_withdraw_partner_content', {
      p_kind: rpcKind,
      p_catalog_id: undefined,
      p_local_id: localId,
    });
    if (error && !/does not exist|could not find|schema cache/i.test(error.message)) {
      console.warn('[PartnerWithdraw] RPC local:', error.message);
    }
  }

  // Fallback si migrations pas encore appliquées
  if (kind === 'event' && localIds.length) {
    await supabase.from('partner_event_submissions').delete().in('local_id', localIds);
  } else if (localIds.length) {
    await supabase.from('partner_spot_submissions').delete().in('local_id', localIds);
  }
}

/** Retire soumissions Supabase + staging local après suppression admin du catalogue. */
export async function withdrawPartnerContentAfterAdminDelete(
  kind: 'event' | 'spot' | 'tool',
  id: string,
): Promise<PartnerContentWithdrawResult> {
  const resolved = await findPartnerSubmissionLocalIds(kind, id);
  const localIds = resolved.localIds.length ? resolved.localIds : (isLocalStagingId(id) ? [id] : []);

  const catalogId =
    resolved.catalogIds[0]
    ?? (isUuid(id) ? id : null);

  if (kind === 'event') {
    await withdrawRemoteSubmissions('event', catalogId, localIds);
    for (const localId of localIds) {
      await adminDeletePartnerEvent(localId);
      await removeStagingEvent(localId);
    }
  } else {
    await withdrawRemoteSubmissions(kind === 'tool' ? 'tool' : 'spot', catalogId, localIds);
    for (const localId of localIds) {
      await adminDeletePartnerSpot(localId);
      await removeStagingSpot(localId);
    }
  }

  return {
    localIds,
    catalogIds: resolved.catalogIds.length
      ? resolved.catalogIds
      : isUuid(id)
        ? [id]
        : [],
  };
}
