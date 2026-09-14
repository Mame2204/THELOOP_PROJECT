import { supabase } from './supabase';

export interface BenefitCatalogRow {
  id: string;
  localId: string;
  title: string;
  description: string;
  isActive: boolean;
  countryCode: string | null;
  partnerNames: string[];
  benefitKind: string;
  updatedAt: string | null;
}

export type OfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'auto_accepted'
  | 'disabled';

export interface PartnerOfferRow {
  id: string;
  partnerUserId: string;
  partnerName: string;
  catalogId: string;
  catalogTitle: string;
  status: OfferStatus;
  countryCode: string;
  adminNote: string | null;
  createdAt: string;
  respondedAt: string | null;
}

export interface GrantRow {
  localId: string;
  userId: string;
  catalogLocalId: string;
  title: string;
  status: string;
  countryCode: string | null;
  createdAt: string | null;
  expiresAt: string | null;
}

export interface CatalogUsageStat {
  catalogId: string;
  title: string;
  granted: number;
  used: number;
  unusedAssigned: number;
  isActive: boolean;
}

export interface BenefitKpis {
  granted: number;
  active: number;
  expired: number;
  consumed: number;
}

function parsePartners(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      if (!p || typeof p !== 'object') return '';
      const o = p as { displayName?: string; display_name?: string };
      return String(o.displayName ?? o.display_name ?? '').trim();
    })
    .filter(Boolean);
}

export function isTheLoopLinked(partners: string[]): boolean {
  return partners.some((n) => n.toUpperCase().includes('THE LOOP'));
}

export async function listBenefitCatalog(
  countryCode?: string,
): Promise<{ items: BenefitCatalogRow[]; error?: string }> {
  const { data, error } = await supabase
    .from('benefit_catalog')
    .select(
      'id, local_id, title, description, is_active, offering_partners, benefit_kind, country_code, updated_at',
    )
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) return { items: [], error: error.message };

  const items = (data ?? [])
    .map((row) => {
      const partners = parsePartners(row.offering_partners);
      return {
        id: String(row.id),
        localId: String(row.local_id ?? row.id),
        title: String(row.title ?? ''),
        description: String(row.description ?? ''),
        isActive: row.is_active !== false,
        countryCode: row.country_code ? String(row.country_code) : null,
        partnerNames: partners,
        benefitKind: String(row.benefit_kind ?? 'unlimited'),
        updatedAt: row.updated_at ? String(row.updated_at) : null,
      };
    })
    .filter((i) => !countryCode || !i.countryCode || i.countryCode === countryCode);

  return { items };
}

export async function setBenefitCatalogActive(
  localId: string,
  isActive: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('benefit_catalog')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('local_id', localId);
  if (error) {
    const byId = await supabase
      .from('benefit_catalog')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', localId);
    if (byId.error) return { ok: false, error: byId.error.message };
  }
  return { ok: true };
}

export async function listPartnerOffers(
  countryCode?: string,
): Promise<{ items: PartnerOfferRow[]; error?: string }> {
  const { data, error } = await supabase.rpc('list_admin_partner_benefit_offers', {
    p_country_code: countryCode ?? null,
  });

  if (error) {
    // Fallback table directe
    let q = supabase
      .from('partner_benefit_offers')
      .select(
        'local_id, partner_user_id, partner_name, catalog_local_id, catalog_title, status, country_code, admin_note, created_at, responded_at',
      )
      .order('created_at', { ascending: false })
      .limit(150);
    if (countryCode) q = q.eq('country_code', countryCode);
    const plain = await q;
    if (plain.error) return { items: [], error: error.message };
    return {
      items: (plain.data ?? []).map((r) => ({
        id: String(r.local_id),
        partnerUserId: String(r.partner_user_id ?? ''),
        partnerName: String(r.partner_name ?? 'Partenaire'),
        catalogId: String(r.catalog_local_id ?? ''),
        catalogTitle: String(r.catalog_title ?? ''),
        status: String(r.status ?? 'pending') as OfferStatus,
        countryCode: String(r.country_code ?? 'GN'),
        adminNote: r.admin_note ? String(r.admin_note) : null,
        createdAt: String(r.created_at ?? ''),
        respondedAt: r.responded_at ? String(r.responded_at) : null,
      })),
    };
  }

  const rows = Array.isArray(data) ? data : typeof data === 'string' ? JSON.parse(data) : [];
  const items: PartnerOfferRow[] = (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.local_id ?? r.id ?? ''),
    partnerUserId: String(r.partner_user_id ?? r.partnerUserId ?? ''),
    partnerName: String(r.partner_name ?? r.partnerName ?? 'Partenaire'),
    catalogId: String(r.catalog_local_id ?? r.catalogId ?? ''),
    catalogTitle: String(r.catalog_title ?? r.catalogTitle ?? ''),
    status: String(r.status ?? 'pending') as OfferStatus,
    countryCode: String(r.country_code ?? r.countryCode ?? 'GN'),
    adminNote: r.admin_note || r.adminNote ? String(r.admin_note ?? r.adminNote) : null,
    createdAt: String(r.created_at ?? r.createdAt ?? ''),
    respondedAt: r.responded_at || r.respondedAt ? String(r.responded_at ?? r.respondedAt) : null,
  }));

  return {
    items: countryCode ? items.filter((i) => i.countryCode === countryCode) : items,
  };
}

export async function setOfferStatus(
  offer: PartnerOfferRow,
  status: OfferStatus,
): Promise<{ ok: boolean; error?: string }> {
  const row = {
    local_id: offer.id,
    partner_user_id: offer.partnerUserId,
    partner_name: offer.partnerName,
    catalog_local_id: offer.catalogId,
    catalog_title: offer.catalogTitle,
    catalog_description: '',
    country_code: offer.countryCode,
    status,
    admin_note: offer.adminNote,
    responded_at: status === 'pending' ? null : new Date().toISOString(),
    created_at: status === 'pending' ? new Date().toISOString() : offer.createdAt,
    validation_deadline_at: new Date().toISOString(),
  };

  const { error } = await supabase.rpc('admin_upsert_partner_benefit_offer', { p_row: row });
  if (error) {
    const upd = await supabase
      .from('partner_benefit_offers')
      .update({
        status,
        responded_at: status === 'pending' ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('local_id', offer.id);
    if (upd.error) return { ok: false, error: upd.error.message };
  }
  return { ok: true };
}

export async function deleteOffer(offerId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('partner_benefit_offers').delete().eq('local_id', offerId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listRecentGrants(
  countryCode?: string,
): Promise<{ items: GrantRow[]; error?: string }> {
  let q = supabase
    .from('prime_benefit_grants')
    .select(
      'local_id, user_id, catalog_local_id, title, status, grant_country_code, created_at, expires_at',
    )
    .order('created_at', { ascending: false })
    .limit(150);
  if (countryCode) q = q.eq('grant_country_code', countryCode);

  const { data, error } = await q;
  if (error) {
    // colonnes alternatives
    const plain = await supabase
      .from('prime_benefit_grants')
      .select('local_id, user_id, catalog_local_id, title, status, created_at, expires_at')
      .order('created_at', { ascending: false })
      .limit(150);
    if (plain.error) return { items: [], error: error.message };
    return {
      items: (plain.data ?? []).map((r) => ({
        localId: String(r.local_id),
        userId: String(r.user_id),
        catalogLocalId: String(r.catalog_local_id ?? ''),
        title: String(r.title ?? 'Privilège'),
        status: String(r.status ?? ''),
        countryCode: null,
        createdAt: r.created_at ? String(r.created_at) : null,
        expiresAt: r.expires_at ? String(r.expires_at) : null,
      })),
    };
  }

  return {
    items: (data ?? []).map((r) => ({
      localId: String(r.local_id),
      userId: String(r.user_id),
      catalogLocalId: String(r.catalog_local_id ?? ''),
      title: String(r.title ?? 'Privilège'),
      status: String(r.status ?? ''),
      countryCode: r.grant_country_code ? String(r.grant_country_code) : null,
      createdAt: r.created_at ? String(r.created_at) : null,
      expiresAt: r.expires_at ? String(r.expires_at) : null,
    })),
  };
}

export async function revokeGrant(localId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('prime_benefit_grants')
    .update({
      status: 'expired_unused',
      expires_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('local_id', localId)
    .neq('status', 'used');
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getBenefitKpis(countryCode?: string): Promise<BenefitKpis> {
  const grantedQ = supabase.from('prime_benefit_grants').select('id', { count: 'exact', head: true });
  const activeQ = supabase
    .from('prime_benefit_grants')
    .select('id', { count: 'exact', head: true })
    .in('status', ['active', 'pending_validation']);
  const expiredQ = supabase
    .from('prime_benefit_grants')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'expired_unused');
  const usedQ = supabase
    .from('prime_benefit_grants')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'used');

  const [grantedRes, activeRes, expiredRes, usedRes] = await Promise.all([
    countryCode ? grantedQ.eq('grant_country_code', countryCode) : grantedQ,
    countryCode ? activeQ.eq('grant_country_code', countryCode) : activeQ,
    countryCode ? expiredQ.eq('grant_country_code', countryCode) : expiredQ,
    countryCode ? usedQ.eq('grant_country_code', countryCode) : usedQ,
  ]);

  if (grantedRes.error && activeRes.error) {
    const { items } = await listRecentGrants(countryCode);
    return {
      granted: items.length,
      active: items.filter((i) => i.status === 'active' || i.status === 'pending_validation').length,
      expired: items.filter((i) => i.status === 'expired_unused').length,
      consumed: items.filter((i) => i.status === 'used').length,
    };
  }

  return {
    granted: grantedRes.count ?? 0,
    active: activeRes.count ?? 0,
    expired: expiredRes.count ?? 0,
    consumed: usedRes.count ?? 0,
  };
}

export async function getCatalogUsageStats(
  countryCode?: string,
): Promise<CatalogUsageStat[]> {
  const [{ items: catalog }, { items: grants }] = await Promise.all([
    listBenefitCatalog(countryCode),
    listRecentGrants(countryCode),
  ]);

  return catalog
    .map((c) => {
      const related = grants.filter((g) => g.catalogLocalId === c.localId || g.catalogLocalId === c.id);
      const used = related.filter((g) => g.status === 'used').length;
      const unusedAssigned = related.filter(
        (g) => g.status === 'active' || g.status === 'pending_validation',
      ).length;
      return {
        catalogId: c.localId,
        title: c.title,
        granted: related.length,
        used,
        unusedAssigned,
        isActive: c.isActive,
      };
    })
    .sort((a, b) => b.used - a.used || b.granted - a.granted);
}

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  pending: 'En attente',
  accepted: 'Accepté',
  declined: 'Refusé',
  auto_accepted: 'Auto',
  disabled: 'Archivé',
};
