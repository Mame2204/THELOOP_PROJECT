import { markContentPermanentlyRemoved } from '@/lib/admin-content-store';
import { syncPartnerViewsAfterAdminContentChange } from '@/lib/admin-content-partner-sync';
import { invalidateContentCache } from '@/lib/content-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

function isLocalStagingId(id: string): boolean {
  return id.startsWith('evt-') || id.startsWith('spot-') || id.startsWith('tool-');
}

async function deleteSupabaseContent(
  kind: 'event' | 'spot',
  id: string,
  isTool = false,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: true };
  if (isLocalStagingId(id)) return { ok: true };

  if (kind === 'event') {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (isTool) {
    const { error } = await supabase.from('tools').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const toolDel = await supabase.from('tools').delete().eq('id', id);
  if (!toolDel.error) return { ok: true };

  const { error } = await supabase.from('establishments').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function markAllIdsRemoved(kind: 'event' | 'spot', ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  await Promise.all(unique.map((id) => markContentPermanentlyRemoved(kind, id)));
}

/** Suppression définitive : catalogue + soumissions partenaire + avantages liés. */
export async function deleteAdminContent(
  kind: 'event' | 'spot',
  id: string,
  options?: { isTool?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const cascadeKind = options?.isTool ? 'tool' : kind;

  const resolved = await import('@/lib/partner-content-withdraw').then((m) =>
    m.findPartnerSubmissionLocalIds(cascadeKind, id),
  );
  const allContentIds = [...new Set([...resolved.catalogIds, ...resolved.localIds, id])];

  const remote = await deleteSupabaseContent(kind, id, options?.isTool);
  if (!remote.ok) return remote;

  await syncPartnerViewsAfterAdminContentChange(cascadeKind, id, 'removed');
  await markAllIdsRemoved(kind, allContentIds);
  invalidateContentCache();

  return { ok: true };
}
