import { Router } from 'express';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { requireSupabaseAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/require-admin.js';
import { ownsPartnerAccount, requirePartner } from '../middleware/require-partner.js';

export const partnerBenefitOffersRouter = Router();

partnerBenefitOffersRouter.use('/partner/benefit-offers', requireSupabaseAuth, requirePartner);
partnerBenefitOffersRouter.use('/admin/partner-benefit-offers', requireSupabaseAuth, requireAdmin);

type OfferingPartner = {
  partnerId?: string;
  displayName?: string;
  contentId?: string | null;
  contentType?: string | null;
  contentTitle?: string | null;
};

type CatalogRow = {
  local_id: string;
  title: string;
  description: string;
  is_active: boolean;
  offering_partners: OfferingPartner[] | null;
  country_code: string | null;
  city: string | null;
  default_validity_days: number;
  benefit_kind: string | null;
  updated_at: string;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function partnerIdMatches(rawPartnerId: string, partnerUserId: string): boolean {
  const pid = rawPartnerId.trim();
  const uid = partnerUserId.trim();
  if (!pid || !uid) return false;
  if (pid === uid) return true;
  if (pid === `user:${uid}`) return true;
  if (pid.startsWith('user:') && pid.slice(5) === uid) return true;
  return false;
}

async function partnerIdMatchesExtended(rawPartnerId: string, partnerUserId: string): Promise<boolean> {
  if (partnerIdMatches(rawPartnerId, partnerUserId)) return true;
  if (!isUuid(rawPartnerId) || !isUuid(partnerUserId)) return false;

  const supabase = getSupabaseAdmin();

  const { data: establishment } = await supabase
    .from('establishments')
    .select('master_id')
    .eq('id', rawPartnerId)
    .maybeSingle();
  if (establishment?.master_id) {
    const { data: staff } = await supabase
      .from('partner_staff')
      .select('user_id')
      .eq('id', establishment.master_id)
      .maybeSingle();
    if (staff?.user_id && String(staff.user_id) === partnerUserId) return true;
  }

  const { data: staffRow } = await supabase
    .from('partner_staff')
    .select('user_id')
    .eq('id', rawPartnerId)
    .maybeSingle();
  if (staffRow?.user_id && String(staffRow.user_id) === partnerUserId) return true;

  return false;
}

async function catalogRowsToPendingOffers(catalog: CatalogRow[], partnerUserId: string) {
  const items: Record<string, unknown>[] = [];

  for (const row of catalog) {
    if (row.is_active || !row.local_id) continue;
    const partners = Array.isArray(row.offering_partners) ? row.offering_partners : [];
    for (const partner of partners) {
      const partnerId = String(partner.partnerId ?? '');
      if (!(await partnerIdMatchesExtended(partnerId, partnerUserId))) continue;

      items.push({
        localId: `pending-${row.local_id}`,
        partnerUserId,
        partnerName: partner.displayName?.trim() || 'Partenaire',
        catalogLocalId: row.local_id,
        catalogTitle: row.title,
        catalogDescription: row.description ?? '',
        countryCode: row.country_code ?? 'GN',
        city: row.city,
        status: 'pending',
        contentId: partner.contentId ?? null,
        contentType: partner.contentType ?? null,
        contentTitle: partner.contentTitle ?? null,
        defaultValidityDays: row.default_validity_days,
        benefitKind: row.benefit_kind,
        createdAt: row.updated_at,
      });
    }
  }

  return items.sort((a, b) =>
    String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
  );
}

async function loadInactiveCatalog(): Promise<CatalogRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('benefit_catalog')
    .select(
      'local_id, title, description, is_active, offering_partners, country_code, city, default_validity_days, benefit_kind, updated_at',
    )
    .eq('is_active', false)
    .not('local_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(15);

  if (error) throw new Error(error.message);
  return (data ?? []) as CatalogRow[];
}

async function loadCatalogByLocalId(localId: string): Promise<CatalogRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('benefit_catalog')
    .select(
      'local_id, title, description, is_active, offering_partners, country_code, city, default_validity_days, benefit_kind, updated_at',
    )
    .eq('local_id', localId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as CatalogRow | null) ?? null;
}

async function partnerListedInCatalog(row: CatalogRow, partnerUserId: string): Promise<boolean> {
  const partners = Array.isArray(row.offering_partners) ? row.offering_partners : [];
  for (const partner of partners) {
    if (await partnerIdMatchesExtended(String(partner.partnerId ?? ''), partnerUserId)) return true;
  }
  return false;
}

/**
 * POST /api/partner/benefit-offers/list
 * Body: { partnerUserId }
 * Service role — remplace RPC Supabase si migration SQL impossible (42501).
 */
partnerBenefitOffersRouter.post('/partner/benefit-offers/list', async (req, res) => {
  try {
    const partnerUserId = String(req.body?.partnerUserId ?? '').trim();
    if (!isUuid(partnerUserId)) {
      res.status(400).json({ error: 'invalid_params' });
      return;
    }

    if (!ownsPartnerAccount(req, partnerUserId)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    const catalog = await loadInactiveCatalog();
    res.json({ items: await catalogRowsToPendingOffers(catalog, partnerUserId) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'server_error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/partner/benefit-offers/respond
 * Body: { partnerUserId, localId, catalogLocalId, accept, note? }
 */
partnerBenefitOffersRouter.post('/partner/benefit-offers/respond', async (req, res) => {
  try {
    const partnerUserId = String(req.body?.partnerUserId ?? '').trim();
    const localId = String(req.body?.localId ?? '').trim();
    let catalogLocalId = String(req.body?.catalogLocalId ?? '').trim();
    const accept = req.body?.accept !== false && req.body?.accept !== 'false';
    const note = String(req.body?.note ?? '').trim();

    if (!isUuid(partnerUserId)) {
      res.status(400).json({ error: 'invalid_params' });
      return;
    }

    if (!ownsPartnerAccount(req, partnerUserId)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    if (!catalogLocalId && localId.startsWith('pending-')) {
      catalogLocalId = localId.slice('pending-'.length);
    }

    if (!catalogLocalId) {
      res.status(400).json({ error: 'catalog_local_id_required' });
      return;
    }

    if (!accept && !note) {
      res.status(400).json({ error: 'note_required' });
      return;
    }

    const row = await loadCatalogByLocalId(catalogLocalId);
    if (!row || !(await partnerListedInCatalog(row, partnerUserId))) {
      res.status(404).json({ error: 'offer_not_found' });
      return;
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    if (accept) {
      const { error } = await supabase
        .from('benefit_catalog')
        .update({ is_active: true, updated_at: now })
        .eq('local_id', catalogLocalId);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
    } else {
      const partners = Array.isArray(row.offering_partners) ? row.offering_partners : [];
      const filtered: OfferingPartner[] = [];
      for (const partner of partners) {
        if (!(await partnerIdMatchesExtended(String(partner.partnerId ?? ''), partnerUserId))) {
          filtered.push(partner);
        }
      }

      const { error } = await supabase
        .from('benefit_catalog')
        .update({
          offering_partners: filtered,
          is_active: false,
          updated_at: now,
        })
        .eq('local_id', catalogLocalId);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
    }

    await supabase
      .from('partner_benefit_offers')
      .update({
        status: accept ? 'accepted' : 'declined',
        partner_response_note: accept ? null : note,
        responded_at: now,
        updated_at: now,
      })
      .eq('catalog_local_id', catalogLocalId)
      .eq('partner_user_id', partnerUserId)
      .eq('status', 'pending');

    res.json({
      localId: localId || `pending-${catalogLocalId}`,
      catalogLocalId,
      status: accept ? 'accepted' : 'declined',
      partnerResponseNote: accept ? null : note,
      respondedAt: now,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'server_error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/admin/partner-benefit-offers/list
 * Body: { countryCode? }
 */
partnerBenefitOffersRouter.post('/admin/partner-benefit-offers/list', async (req, res) => {
  try {
    const countryCode = String(req.body?.countryCode ?? '').trim().toUpperCase() || null;
    const catalog = await loadInactiveCatalog();
    const items: Record<string, unknown>[] = [];

    for (const row of catalog) {
      if (countryCode && row.country_code && row.country_code !== countryCode) continue;
      const partners = Array.isArray(row.offering_partners) ? row.offering_partners : [];
      for (const partner of partners) {
        const partnerId = String(partner.partnerId ?? '');
        items.push({
          localId: `pending-${row.local_id}-${partnerId}`,
          partnerUserId: partnerId.startsWith('user:') ? partnerId.slice(5) : partnerId,
          partnerName: partner.displayName?.trim() || 'Partenaire',
          catalogLocalId: row.local_id,
          catalogTitle: row.title,
          catalogDescription: row.description ?? '',
          countryCode: row.country_code ?? 'GN',
          city: row.city,
          status: 'pending',
          contentId: partner.contentId ?? null,
          contentType: partner.contentType ?? null,
          contentTitle: partner.contentTitle ?? null,
          defaultValidityDays: row.default_validity_days,
          benefitKind: row.benefit_kind,
          createdAt: row.updated_at,
        });
      }
    }

    items.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    res.json({ items });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'server_error';
    res.status(500).json({ error: message });
  }
});
