import { supabase } from './supabase';

/** Aligné `content-mappers.ts` (mobile) — slugs navigation membre (Agenda / Spots). */

export function slugifyLabel(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildSlugMaps(items: { id: string; label: string }[]): Map<string, string> {
  const idToSlug = new Map<string, string>();
  const used = new Set<string>();

  for (const item of items) {
    let slug = slugifyLabel(item.label) || item.id.slice(0, 8);
    if (used.has(slug)) slug = `${slug}-${item.id.slice(0, 8)}`;
    used.add(slug);
    idToSlug.set(item.id, slug);
  }

  return idToSlug;
}

export type MemberContentKind = 'event' | 'spot' | 'tool';

/** Slug identique au catalogue membre (`content-store` + `buildSlugMaps`). */
export async function resolveMemberContentSlug(
  countryCode: string,
  targetType: MemberContentKind,
  targetId: string,
): Promise<{ slug: string; label: string } | null> {
  const cc = countryCode.toUpperCase().slice(0, 2);
  const id = targetId.trim();
  if (!id) return null;

  type Row = { id: string; label: string };
  let rows: Row[] = [];

  if (targetType === 'event') {
    const { data } = await supabase
      .from('events')
      .select('id, title')
      .eq('country_code', cc)
      .eq('content_status', 'published')
      .eq('is_active', true);
    rows = (data ?? []).map((r) => ({ id: String(r.id), label: String(r.title ?? '') }));
  } else if (targetType === 'spot') {
    const { data } = await supabase
      .from('establishments')
      .select('id, name, category_slugs')
      .eq('country_code', cc)
      .eq('content_status', 'published')
      .eq('is_active', true);
    rows = (data ?? [])
      .filter((r) => {
        const slugs = Array.isArray(r.category_slugs) ? r.category_slugs.map(String) : [];
        return !slugs.includes('tools');
      })
      .map((r) => ({ id: String(r.id), label: String(r.name ?? '') }));
  } else {
    const { data } = await supabase
      .from('tools')
      .select('id, name')
      .eq('country_code', cc)
      .eq('content_status', 'published')
      .eq('is_active', true);
    rows = (data ?? []).map((r) => ({ id: String(r.id), label: String(r.name ?? '') }));
  }

  const map = buildSlugMaps(rows);
  const slug = map.get(id);
  const row = rows.find((r) => r.id === id);
  if (!slug || !row) return null;
  return { slug, label: row.label };
}
