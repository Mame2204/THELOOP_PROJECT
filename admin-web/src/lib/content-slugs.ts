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

export interface ResolvedCatalogTarget {
  targetType: MemberContentKind;
  targetId: string;
  targetSlug: string;
  title: string;
}

function isContentUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

type CatalogRow = { id: string; label: string };

async function loadPublishedCatalogRows(
  countryCode: string,
  targetType: MemberContentKind,
): Promise<CatalogRow[]> {
  const cc = countryCode.toUpperCase().slice(0, 2);

  if (targetType === 'event') {
    const { data } = await supabase
      .from('events')
      .select('id, title')
      .eq('country_code', cc)
      .eq('content_status', 'published')
      .eq('is_active', true);
    return (data ?? []).map((r) => ({ id: String(r.id), label: String(r.title ?? '') }));
  }
  if (targetType === 'spot') {
    const { data } = await supabase
      .from('establishments')
      .select('id, name, category_slugs')
      .eq('country_code', cc)
      .eq('content_status', 'published')
      .eq('is_active', true);
    return (data ?? [])
      .filter((r) => {
        const slugs = Array.isArray(r.category_slugs) ? r.category_slugs.map(String) : [];
        return !slugs.includes('tools');
      })
      .map((r) => ({ id: String(r.id), label: String(r.name ?? '') }));
  }
  const { data } = await supabase
    .from('tools')
    .select('id, name')
    .eq('country_code', cc)
    .eq('content_status', 'published')
    .eq('is_active', true);
  return (data ?? []).map((r) => ({ id: String(r.id), label: String(r.name ?? '') }));
}

/** UUID + slug catalogue à partir d’un id ou slug enregistré (édition Accueil). */
export async function resolveCatalogTargetRef(
  countryCode: string,
  targetType: MemberContentKind | null | undefined,
  targetId: string | null | undefined,
  targetSlug?: string | null,
): Promise<ResolvedCatalogTarget | null> {
  if (targetType !== 'event' && targetType !== 'spot' && targetType !== 'tool') return null;

  const idRaw = targetId?.trim() ?? '';
  const slugRaw = targetSlug?.trim() ?? '';
  if (!idRaw && !slugRaw) return null;

  const rows = await loadPublishedCatalogRows(countryCode, targetType);
  const slugMap = buildSlugMaps(rows);
  const slugToId = new Map<string, string>();
  for (const [id, slug] of slugMap.entries()) slugToId.set(slug, id);

  let resolvedId = '';
  if (idRaw && isContentUuid(idRaw)) {
    resolvedId = idRaw;
  } else if (idRaw && slugToId.has(idRaw)) {
    resolvedId = slugToId.get(idRaw)!;
  } else if (slugRaw && slugToId.has(slugRaw)) {
    resolvedId = slugToId.get(slugRaw)!;
  } else if (idRaw) {
    const byId = rows.find((r) => r.id === idRaw);
    if (byId) resolvedId = byId.id;
  }

  if (!resolvedId) return null;

  const row = rows.find((r) => r.id === resolvedId);
  const slug = slugMap.get(resolvedId) ?? slugRaw ?? idRaw;
  if (!row) return null;

  return {
    targetType,
    targetId: resolvedId,
    targetSlug: slug,
    title: row.label,
  };
}

export async function normalizeWalkStepInputs(
  countryCode: string,
  steps: Array<{ targetType: MemberContentKind; targetId: string; title: string }>,
): Promise<Array<{ targetType: MemberContentKind; targetId: string; title: string }>> {
  const out: Array<{ targetType: MemberContentKind; targetId: string; title: string }> = [];
  for (const step of steps) {
    const resolved = await resolveCatalogTargetRef(
      countryCode,
      step.targetType,
      step.targetId,
      step.targetId,
    );
    if (resolved) {
      out.push({
        targetType: resolved.targetType,
        targetId: resolved.targetId,
        title: resolved.title,
      });
    } else {
      out.push(step);
    }
  }
  return out;
}

/** Slug identique au catalogue membre (`content-store` + `buildSlugMaps`). */
export async function resolveMemberContentSlug(
  countryCode: string,
  targetType: MemberContentKind,
  targetId: string,
): Promise<{ slug: string; label: string } | null> {
  const cc = countryCode.toUpperCase().slice(0, 2);
  const id = targetId.trim();
  if (!id) return null;

  const rows = await loadPublishedCatalogRows(cc, targetType);
  const map = buildSlugMaps(rows);
  const slug = map.get(id);
  const row = rows.find((r) => r.id === id);
  if (!slug || !row) return null;
  return { slug, label: row.label };
}
