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

export const CATALOG_PAGE_SIZE = 20;
/** Plafond pour les pickers Accueil / Loop — évite de tirer 200×3 tables (egress). */
export const CATALOG_PICKER_LIMIT = 40;

export async function listCatalogContent(
  countryCode: string,
  kinds?: CatalogKind[],
  options?: {
    origins?: string[];
    page?: number;
    pageSize?: number;
    status?: ContentStatus | 'all';
    /** Compteur exact (1 round-trip count) — uniquement pour pager Contenu. */
    withTotal?: boolean;
  },
): Promise<{ items: CatalogContentItem[]; total: number; error?: string }> {
  const want = (kinds?.length ? kinds : (['event', 'spot', 'tool'] as CatalogKind[])).filter(
    (k, i, arr) => arr.indexOf(k) === i,
  );
  const origins = options?.origins?.map((o) => o.toLowerCase());
  const page = Math.max(0, options?.page ?? 0);
  const pageSize = Math.min(
    50,
    Math.max(1, options?.pageSize ?? (want.length > 1 ? CATALOG_PICKER_LIMIT : CATALOG_PAGE_SIZE)),
  );
  const status = options?.status && options.status !== 'all' ? options.status : null;
  const withTotal = options?.withTotal === true && want.length === 1;
  const errors: string[] = [];
  const items: CatalogContentItem[] = [];
  let total = 0;

  const matchesOrigin = (origin: string | null) => {
    if (!origins?.length) return true;
    return origins.includes((origin ?? '').toLowerCase());
  };

  // Une seule table à la fois = pagination réelle + egress maîtrisé.
  // Multi-types (pickers) : petit plafond partagé, sans count.
  const perKindLimit =
    want.length === 1 ? pageSize : Math.max(8, Math.floor(pageSize / want.length));
  const from = want.length === 1 ? page * pageSize : 0;
  const to = from + perKindLimit - 1;

  async function fetchKind(kind: CatalogKind): Promise<void> {
    if (kind === 'event') {
      let q = supabase
        .from('events')
        .select(
          'id, title, custom_location_name, content_status, is_active, is_featured, featured_end_date, content_origin, country_code, start_date, created_at',
          withTotal ? { count: 'exact' } : undefined,
        )
        .order('created_at', { ascending: false })
        .range(from, to);
      if (countryCode) q = q.eq('country_code', countryCode);
      if (status) q = q.eq('content_status', status);
      if (origins?.length) q = q.in('content_origin', origins);
      const { data, error, count } = await q;
      if (error) {
        errors.push(`events: ${error.message}`);
        return;
      }
      if (withTotal && count != null) total = count;
      for (const row of data ?? []) {
        const end = row.featured_end_date ? String(row.featured_end_date) : null;
        const featured = Boolean(row.is_featured);
        const origin = row.content_origin ? String(row.content_origin) : null;
        if (!matchesOrigin(origin)) continue;
        items.push({
          id: String(row.id),
          kind: 'event',
          title: String(row.title ?? 'Événement'),
          subtitle: row.custom_location_name ? String(row.custom_location_name) : null,
          contentStatus: mapStatus(
            row.content_status as string | null,
            row.is_active as boolean | null,
          ),
          isFeatured: isFeaturedWindowActive(featured, null, end),
          featuredStartDate: null,
          featuredEndDate: normalizeFeaturedDate(end),
          contentOrigin: origin,
          countryCode: row.country_code ? String(row.country_code) : null,
          startsAt: row.start_date ? String(row.start_date) : null,
          updatedAt: row.created_at ? String(row.created_at) : null,
          isActive: row.is_active !== false,
        });
      }
      return;
    }

    if (kind === 'spot') {
      let q = supabase
        .from('establishments')
        .select(
          'id, name, opening_hours_label, content_status, is_active, is_featured, featured_end_date, content_origin, country_code, created_at, category_slugs',
          withTotal ? { count: 'exact' } : undefined,
        )
        .order('created_at', { ascending: false })
        .range(from, to);
      // Exclure outils legacy stockés dans establishments (filtre SQL = moins d’egress client).
      q = q.not('category_slugs', 'cs', '{tools}');
      if (countryCode) q = q.eq('country_code', countryCode);
      if (status) q = q.eq('content_status', status);
      if (origins?.length) q = q.in('content_origin', origins);
      const { data, error, count } = await q;
      if (error) {
        // Fallback si l’opérateur cs n’est pas dispo / colonne absente
        let q2 = supabase
          .from('establishments')
          .select(
            'id, name, opening_hours_label, content_status, is_active, is_featured, featured_end_date, content_origin, country_code, created_at, category_slugs',
            withTotal ? { count: 'exact' } : undefined,
          )
          .order('created_at', { ascending: false })
          .range(from, to);
        if (countryCode) q2 = q2.eq('country_code', countryCode);
        if (status) q2 = q2.eq('content_status', status);
        if (origins?.length) q2 = q2.in('content_origin', origins);
        const res2 = await q2;
        if (res2.error) {
          errors.push(`spots: ${error.message}`);
          return;
        }
        if (withTotal && res2.count != null) total = res2.count;
        for (const row of res2.data ?? []) {
          const slugs = Array.isArray(row.category_slugs)
            ? (row.category_slugs as unknown[]).map(String)
            : [];
          if (slugs.includes('tools')) continue;
          const end = row.featured_end_date ? String(row.featured_end_date) : null;
          const featured = Boolean(row.is_featured);
          const origin = row.content_origin ? String(row.content_origin) : null;
          if (!matchesOrigin(origin)) continue;
          items.push({
            id: String(row.id),
            kind: 'spot',
            title: String(row.name ?? 'Spot'),
            subtitle: row.opening_hours_label ? String(row.opening_hours_label) : null,
            contentStatus: mapStatus(
              row.content_status as string | null,
              row.is_active as boolean | null,
            ),
            isFeatured: isFeaturedWindowActive(featured, null, end),
            featuredStartDate: null,
            featuredEndDate: normalizeFeaturedDate(end),
            contentOrigin: origin,
            countryCode: row.country_code ? String(row.country_code) : null,
            startsAt: null,
            updatedAt: row.created_at ? String(row.created_at) : null,
            isActive: row.is_active !== false,
          });
        }
        return;
      }
      if (withTotal && count != null) total = count;
      for (const row of data ?? []) {
        const end = row.featured_end_date ? String(row.featured_end_date) : null;
        const featured = Boolean(row.is_featured);
        const origin = row.content_origin ? String(row.content_origin) : null;
        if (!matchesOrigin(origin)) continue;
        items.push({
          id: String(row.id),
          kind: 'spot',
          title: String(row.name ?? 'Spot'),
          subtitle: row.opening_hours_label ? String(row.opening_hours_label) : null,
          contentStatus: mapStatus(
            row.content_status as string | null,
            row.is_active as boolean | null,
          ),
          isFeatured: isFeaturedWindowActive(featured, null, end),
          featuredStartDate: null,
          featuredEndDate: normalizeFeaturedDate(end),
          contentOrigin: origin,
          countryCode: row.country_code ? String(row.country_code) : null,
          startsAt: null,
          updatedAt: row.created_at ? String(row.created_at) : null,
          isActive: row.is_active !== false,
        });
      }
      return;
    }

    // tool
    let q = supabase
      .from('tools')
      .select(
        'id, name, description, content_status, is_active, is_featured, featured_start_date, featured_end_date, content_origin, country_code, updated_at, created_at',
        withTotal ? { count: 'exact' } : undefined,
      )
      .order('updated_at', { ascending: false })
      .range(from, to);
    if (countryCode) q = q.eq('country_code', countryCode);
    if (status) q = q.eq('content_status', status);
    if (origins?.length) q = q.in('content_origin', origins);
    const { data, error, count } = await q;
    if (error) {
      errors.push(`tools: ${error.message}`);
      return;
    }
    if (withTotal && count != null) total = count;
    for (const row of data ?? []) {
      const start = row.featured_start_date ? String(row.featured_start_date) : null;
      const end = row.featured_end_date ? String(row.featured_end_date) : null;
      const featured = Boolean(row.is_featured);
      const origin = row.content_origin ? String(row.content_origin) : null;
      if (!matchesOrigin(origin)) continue;
      items.push({
        id: String(row.id),
        kind: 'tool',
        title: String(row.name ?? 'Outil'),
        subtitle: row.description ? String(row.description).slice(0, 80) : null,
        contentStatus: mapStatus(
          row.content_status as string | null,
          row.is_active as boolean | null,
        ),
        isFeatured: isFeaturedWindowActive(featured, start, end),
        featuredStartDate: normalizeFeaturedDate(start),
        featuredEndDate: normalizeFeaturedDate(end),
        contentOrigin: origin,
        countryCode: row.country_code ? String(row.country_code) : null,
        startsAt: null,
        updatedAt: row.updated_at
          ? String(row.updated_at)
          : row.created_at
            ? String(row.created_at)
            : null,
        isActive: row.is_active !== false,
      });
    }
  }

  for (const kind of want) {
    await fetchKind(kind);
  }

  if (!withTotal) total = items.length;
  items.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  return { items, total, error: errors.length ? errors.join(' · ') : undefined };
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
