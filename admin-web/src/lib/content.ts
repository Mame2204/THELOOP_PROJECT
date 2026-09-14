import { supabase } from './supabase';

export type ContentStatus = 'draft' | 'published' | 'deactivated' | 'archived';
export type CatalogKind = 'event' | 'spot' | 'tool';

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  deactivated: 'Désactivé',
  archived: 'Archivé',
};

export const CONTENT_STATUSES: ContentStatus[] = [
  'draft',
  'published',
  'deactivated',
  'archived',
];

export interface CatalogContentItem {
  id: string;
  kind: CatalogKind;
  title: string;
  subtitle: string | null;
  contentStatus: ContentStatus;
  isFeatured: boolean;
  featuredStartDate: string | null;
  featuredEndDate: string | null;
  contentOrigin: string | null;
  countryCode: string | null;
  startsAt: string | null;
  updatedAt: string | null;
  isActive: boolean;
}

export interface ContentActions {
  canPublish: boolean;
  canDeactivate: boolean;
  canMoveToDraft: boolean;
  canArchive: boolean;
}

export function adminContentActionsFor(status: ContentStatus): ContentActions {
  switch (status) {
    case 'draft':
      return { canPublish: true, canDeactivate: false, canMoveToDraft: false, canArchive: true };
    case 'published':
      return { canPublish: false, canDeactivate: true, canMoveToDraft: true, canArchive: true };
    case 'deactivated':
      return { canPublish: true, canDeactivate: false, canMoveToDraft: true, canArchive: true };
    case 'archived':
      return { canPublish: false, canDeactivate: false, canMoveToDraft: true, canArchive: false };
  }
}

function mapStatus(raw: string | null | undefined, isActive?: boolean | null): ContentStatus {
  if (raw === 'draft' || raw === 'deactivated' || raw === 'archived' || raw === 'published') {
    return raw;
  }
  return isActive === false ? 'deactivated' : 'published';
}

function normalizeFeaturedDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const dateOnly = trimmed.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? dateOnly : null;
}

export function isFeaturedWindowActive(
  isFeatured: boolean,
  featuredStartDate: string | null | undefined,
  featuredEndDate: string | null | undefined,
): boolean {
  if (!isFeatured) return false;
  const today = new Date().toISOString().slice(0, 10);
  const start = normalizeFeaturedDate(featuredStartDate);
  const end = normalizeFeaturedDate(featuredEndDate);
  if (start && start > today) return false;
  if (end && end < today) return false;
  return true;
}

export async function listCatalogContent(
  countryCode: string,
  kinds?: CatalogKind[],
): Promise<{ items: CatalogContentItem[]; error?: string }> {
  const want = new Set(kinds?.length ? kinds : (['event', 'spot', 'tool'] as CatalogKind[]));
  const errors: string[] = [];
  const items: CatalogContentItem[] = [];

  if (want.has('event')) {
    let q = supabase
      .from('events')
      .select(
        'id, title, venue_name, content_status, is_active, is_featured, featured_end_date, content_origin, country_code, starts_at, updated_at',
      )
      .order('updated_at', { ascending: false })
      .limit(200);
    if (countryCode) q = q.eq('country_code', countryCode);
    const { data, error } = await q;
    if (error) errors.push(error.message);
    for (const row of data ?? []) {
      const end = row.featured_end_date ? String(row.featured_end_date) : null;
      const featured = Boolean(row.is_featured);
      items.push({
        id: String(row.id),
        kind: 'event',
        title: String(row.title ?? 'Événement'),
        subtitle: row.venue_name ? String(row.venue_name) : null,
        contentStatus: mapStatus(row.content_status as string | null, row.is_active as boolean | null),
        isFeatured: isFeaturedWindowActive(featured, null, end),
        featuredStartDate: null,
        featuredEndDate: normalizeFeaturedDate(end),
        contentOrigin: row.content_origin ? String(row.content_origin) : null,
        countryCode: row.country_code ? String(row.country_code) : null,
        startsAt: row.starts_at ? String(row.starts_at) : null,
        updatedAt: row.updated_at ? String(row.updated_at) : null,
        isActive: row.is_active !== false,
      });
    }
  }

  if (want.has('spot')) {
    let q = supabase
      .from('establishments')
      .select(
        'id, name, address, content_status, is_active, is_featured, featured_end_date, content_origin, country_code, updated_at',
      )
      .order('updated_at', { ascending: false })
      .limit(200);
    if (countryCode) q = q.eq('country_code', countryCode);
    const { data, error } = await q;
    if (error) errors.push(error.message);
    for (const row of data ?? []) {
      const end = row.featured_end_date ? String(row.featured_end_date) : null;
      const featured = Boolean(row.is_featured);
      items.push({
        id: String(row.id),
        kind: 'spot',
        title: String(row.name ?? 'Spot'),
        subtitle: row.address ? String(row.address) : null,
        contentStatus: mapStatus(row.content_status as string | null, row.is_active as boolean | null),
        isFeatured: isFeaturedWindowActive(featured, null, end),
        featuredStartDate: null,
        featuredEndDate: normalizeFeaturedDate(end),
        contentOrigin: row.content_origin ? String(row.content_origin) : null,
        countryCode: row.country_code ? String(row.country_code) : null,
        startsAt: null,
        updatedAt: row.updated_at ? String(row.updated_at) : null,
        isActive: row.is_active !== false,
      });
    }
  }

  if (want.has('tool')) {
    let q = supabase
      .from('tools')
      .select(
        'id, name, description, content_status, is_active, is_featured, featured_start_date, featured_end_date, content_origin, country_code, updated_at',
      )
      .order('updated_at', { ascending: false })
      .limit(200);
    if (countryCode) q = q.eq('country_code', countryCode);
    const { data, error } = await q;
    if (error) errors.push(error.message);
    for (const row of data ?? []) {
      const start = row.featured_start_date ? String(row.featured_start_date) : null;
      const end = row.featured_end_date ? String(row.featured_end_date) : null;
      const featured = Boolean(row.is_featured);
      items.push({
        id: String(row.id),
        kind: 'tool',
        title: String(row.name ?? 'Outil'),
        subtitle: row.description ? String(row.description).slice(0, 80) : null,
        contentStatus: mapStatus(row.content_status as string | null, row.is_active as boolean | null),
        isFeatured: isFeaturedWindowActive(featured, start, end),
        featuredStartDate: normalizeFeaturedDate(start),
        featuredEndDate: normalizeFeaturedDate(end),
        contentOrigin: row.content_origin ? String(row.content_origin) : null,
        countryCode: row.country_code ? String(row.country_code) : null,
        startsAt: null,
        updatedAt: row.updated_at ? String(row.updated_at) : null,
        isActive: row.is_active !== false,
      });
    }
  }

  items.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  return { items, error: errors[0] };
}

export async function setCatalogContentStatus(
  kind: CatalogKind,
  id: string,
  contentStatus: ContentStatus,
): Promise<{ ok: boolean; error?: string }> {
  const isActive = contentStatus === 'published';
  const patch = {
    content_status: contentStatus,
    is_active: isActive,
    updated_at: new Date().toISOString(),
  };

  if (kind === 'event') {
    const { error } = await supabase
      .from('events')
      .update({ content_status: contentStatus, is_active: isActive })
      .eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (kind === 'tool') {
    const { error } = await supabase.from('tools').update(patch).eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase
    .from('establishments')
    .update({ content_status: contentStatus, is_active: isActive })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setCatalogContentFeatured(
  kind: CatalogKind,
  id: string,
  isFeatured: boolean,
  featuredStartDate?: string | null,
  featuredEndDate?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const start = normalizeFeaturedDate(featuredStartDate);
  const end = normalizeFeaturedDate(featuredEndDate);
  const endIso = end ? `${end}T23:59:59.999Z` : null;
  const startIso = start ? `${start}T00:00:00.000Z` : null;

  if (kind === 'event') {
    const { data, error } = await supabase
      .from('events')
      .update({ is_featured: isFeatured, featured_end_date: endIso })
      .eq('id', id)
      .select('id');
    if (error) return { ok: false, error: error.message };
    if (!data?.length) return { ok: false, error: 'Événement introuvable.' };
    return { ok: true };
  }

  if (kind === 'tool') {
    const { data, error } = await supabase
      .from('tools')
      .update({
        is_featured: isFeatured,
        featured_start_date: startIso,
        featured_end_date: endIso,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id');
    if (error) return { ok: false, error: error.message };
    if (!data?.length) return { ok: false, error: 'Outil introuvable.' };
    return { ok: true };
  }

  const { data, error } = await supabase
    .from('establishments')
    .update({ is_featured: isFeatured, featured_end_date: endIso })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'Spot introuvable.' };
  return { ok: true };
}

export const KIND_LABELS: Record<CatalogKind, string> = {
  event: 'Événement',
  spot: 'Spot',
  tool: 'Outil',
};
