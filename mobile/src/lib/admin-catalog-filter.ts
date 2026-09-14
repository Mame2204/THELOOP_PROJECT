import { loadContentOverrides } from '@/lib/admin-content-store';
import type { HomeLocation } from '@/lib/demo-data';
import type { Event } from '@/types';

function overrideKey(kind: 'event' | 'spot', id: string): string {
  return `${kind}:${id}`;
}

/** Exclut contenu supprimé définitivement ou retiré du catalogue public (archivé / désactivé). */
export async function filterLiveCatalogContent(
  events: Event[],
  spots: HomeLocation[],
): Promise<{ events: Event[]; spots: HomeLocation[] }> {
  const overrides = await loadContentOverrides();

  const keep = (kind: 'event' | 'spot', id: string): boolean => {
    const ov = overrides[overrideKey(kind, id)];
    if (ov?.deleted) return false;
    if (ov?.contentStatus === 'archived' || ov?.contentStatus === 'deactivated') return false;
    return true;
  };

  return {
    events: events.filter((e) => keep('event', e.id)),
    spots: spots.filter((s) => keep('spot', s.id)),
  };
}

export async function loadPermanentlyRemovedContentIds(): Promise<Set<string>> {
  const overrides = await loadContentOverrides();
  const ids = new Set<string>();
  for (const [key, ov] of Object.entries(overrides)) {
    if (!ov?.deleted) continue;
    const id = key.split(':').slice(1).join(':');
    if (id) ids.add(id);
  }
  return ids;
}

/** Contenu masqué admin (supprimé, archivé, désactivé) — même si la ligne Supabase traîne encore. */
export async function loadAdminHiddenContentIds(): Promise<Set<string>> {
  const overrides = await loadContentOverrides();
  const ids = new Set<string>();
  for (const [key, ov] of Object.entries(overrides)) {
    const id = key.split(':').slice(1).join(':');
    if (!id) continue;
    if (ov?.deleted || ov?.contentStatus === 'archived' || ov?.contentStatus === 'deactivated') {
      ids.add(id);
    }
  }
  return ids;
}
