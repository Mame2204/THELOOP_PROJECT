import type { PartnerBenefitOffer, PartnerBenefitOfferStatus } from '@/lib/partner-benefit-offers-store';
import {
  getLoopBackendApiUrl,
  isLoopBackendConfigured,
  loopBackendAuthHeaders,
  markLoopBackendUnreachable,
  shouldSkipLoopBackendFetch,
} from '@/lib/loop-backend-api';

type BackendBenefitOfferItem = {
  localId: string;
  partnerUserId: string;
  partnerName: string;
  catalogLocalId: string;
  catalogTitle: string;
  catalogDescription: string;
  countryCode: string;
  city: string | null;
  status: PartnerBenefitOfferStatus;
  contentId?: string | null;
  contentType?: string | null;
  contentTitle?: string | null;
  defaultValidityDays?: number | null;
  benefitKind?: string | null;
  createdAt: string;
  partnerResponseNote?: string | null;
  respondedAt?: string | null;
};

function mapBackendOffer(row: BackendBenefitOfferItem): PartnerBenefitOffer {
  const createdAt = row.createdAt ?? new Date().toISOString();
  return {
    id: row.localId,
    partnerUserId: row.partnerUserId,
    partnerName: row.partnerName,
    catalogId: row.catalogLocalId,
    catalogTitle: row.catalogTitle,
    catalogDescription: row.catalogDescription,
    countryCode: row.countryCode ?? 'GN',
    city: row.city ?? null,
    status: row.status ?? 'pending',
    adminNote: null,
    partnerResponseNote: row.partnerResponseNote ?? null,
    createdAt,
    respondedAt: row.respondedAt ?? null,
    validationDeadlineAt: createdAt,
    contentId: row.contentId ?? null,
    contentType: (row.contentType as PartnerBenefitOffer['contentType']) ?? null,
    contentTitle: row.contentTitle ?? null,
    defaultValidityDays: row.defaultValidityDays ?? null,
    benefitKind: row.benefitKind ?? null,
  };
}

/** Liste des demandes en validation via serveur THE LOOP (service role). */
export async function fetchPartnerBenefitOffersViaBackend(
  partnerUserId: string,
): Promise<PartnerBenefitOffer[] | null> {
  if (!isLoopBackendConfigured() || shouldSkipLoopBackendFetch()) return null;

  const headers = await loopBackendAuthHeaders();

  let response: Response;
  try {
    response = await fetch(`${getLoopBackendApiUrl()}/api/partner/benefit-offers/list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ partnerUserId }),
    });
  } catch {
    markLoopBackendUnreachable();
    if (__DEV__) {
      console.warn('[PartnerBenefitOffers] backend unreachable —', getLoopBackendApiUrl());
    }
    return null;
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    console.warn('[PartnerBenefitOffers] backend list:', body.error ?? response.status);
    return null;
  }

  const body = (await response.json()) as { items?: BackendBenefitOfferItem[] };
  return (body.items ?? []).map(mapBackendOffer);
}

export async function fetchAdminPartnerBenefitOffersViaBackend(
  countryCode?: string,
): Promise<PartnerBenefitOffer[] | null> {
  if (!isLoopBackendConfigured()) return null;

  const headers = await loopBackendAuthHeaders();

  let response: Response;
  try {
    response = await fetch(`${getLoopBackendApiUrl()}/api/admin/partner-benefit-offers/list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ countryCode: countryCode ?? null }),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const body = (await response.json()) as { items?: BackendBenefitOfferItem[] };
  return (body.items ?? []).map(mapBackendOffer);
}

export async function respondPartnerBenefitOfferViaBackend(
  partnerUserId: string,
  offer: Pick<PartnerBenefitOffer, 'id' | 'catalogId'>,
  accept: boolean,
  note?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!isLoopBackendConfigured()) {
    return { ok: false, error: 'backend_not_configured' };
  }

  const headers = await loopBackendAuthHeaders();

  let response: Response;
  try {
    response = await fetch(`${getLoopBackendApiUrl()}/api/partner/benefit-offers/respond`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        partnerUserId,
        localId: offer.id,
        catalogLocalId: offer.catalogId,
        accept,
        note: note ?? '',
      }),
    });
  } catch {
    return { ok: false, error: 'backend_unreachable' };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error ?? 'backend_respond_failed' };
  }

  return { ok: true };
}
