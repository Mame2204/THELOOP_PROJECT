import { listUserNotifications, type UserNotification } from '@/lib/user-notifications-store';
import { partnerIdentityMatchesRecord, resolvePartnerIdentity } from '@/lib/partner-identity-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { getPartnerAuthUserIdFromSession, ensurePartnerSupabaseSession } from '@/lib/partner-spot-auth';
import type { PartnerBenefitOffer, PartnerBenefitOfferStatus } from '@/lib/partner-benefit-offers-store';

const OFFER_TAG = /\[\[loop-pbo:([^\]]+)\]\]/;
const LEGACY_OFFER_TITLE = /THE LOOP vous propose «([^»]+)»/;

export function parseRpcJsonArray(data: unknown): unknown[] {
  let parsed: unknown = data;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.rows)) return record.rows;
    if (Array.isArray(record.data)) return record.data;
  }
  return [];
}

function extractLegacyCatalogTitle(message: string): string | null {
  const match = message.match(LEGACY_OFFER_TITLE);
  return match?.[1]?.trim() || null;
}

function extractQuotedCatalogTitle(message: string): string | null {
  const fromLegacy = extractLegacyCatalogTitle(message);
  if (fromLegacy) return fromLegacy;
  const quoted = message.match(/«\s*([^»]+)\s*»/);
  return quoted?.[1]?.trim() || null;
}

function tryExtractPayloadFromMessage(message: string): OfferPayload | null {
  const tagMatch = message.match(OFFER_TAG);
  if (tagMatch) {
    const decoded = decodePayload(tagMatch[1]);
    if (decoded?.catalogTitle) return decoded;
  }

  const jsonLike = message.match(/\{[^}]*"catalogId"[^}]*\}/);
  if (jsonLike) {
    try {
      const parsed = JSON.parse(jsonLike[0]) as OfferPayload;
      if (parsed.catalogTitle) return parsed;
    } catch {
      /* ignore */
    }
  }

  const legacyTitle = extractQuotedCatalogTitle(message);
  if (!legacyTitle) return null;

  return {
    catalogId: '',
    catalogTitle: legacyTitle,
  };
}

type OfferPayload = {
  offerId?: string;
  catalogId: string;
  catalogTitle: string;
  catalogDescription?: string;
  countryCode?: string;
  city?: string | null;
  contentId?: string | null;
  contentType?: string | null;
  contentTitle?: string | null;
  defaultValidityDays?: number | null;
  benefitKind?: string | null;
  partnerName?: string;
};

type RemotePartnerBenefitOfferRow = {
  local_id: string;
  partner_user_id: string;
  partner_name: string;
  catalog_local_id: string;
  catalog_title: string;
  catalog_description: string;
  country_code: string;
  city: string | null;
  status: PartnerBenefitOfferStatus;
  admin_note: string | null;
  partner_response_note: string | null;
  content_id: string | null;
  content_type: string | null;
  content_title: string | null;
  default_validity_days: number | null;
  benefit_kind: string | null;
  created_at: string;
  responded_at: string | null;
  validation_deadline_at: string;
};

function decodePayload(raw: string): OfferPayload | null {
  try {
    return JSON.parse(decodeURIComponent(raw)) as OfferPayload;
  } catch {
    try {
      return JSON.parse(raw) as OfferPayload;
    } catch {
      return null;
    }
  }
}

function payloadToOffer(payload: OfferPayload, partnerUserId: string, createdAt: string): PartnerBenefitOffer | null {
  const catalogTitle = payload.catalogTitle?.trim();
  if (!catalogTitle) return null;

  const catalogId = payload.catalogId?.trim()
    || (catalogTitle ? `pending-title-${catalogTitle.toLowerCase().replace(/\s+/g, '-').slice(0, 48)}` : '');
  if (!catalogId) return null;

  return {
    id: payload.offerId?.trim() || `pending-${catalogId}`,
    partnerUserId,
    partnerName: payload.partnerName?.trim() || 'Partenaire',
    catalogId,
    catalogTitle,
    catalogDescription: payload.catalogDescription ?? '',
    countryCode: payload.countryCode ?? 'GN',
    city: payload.city ?? null,
    status: 'pending',
    adminNote: null,
    partnerResponseNote: null,
    createdAt,
    respondedAt: null,
    validationDeadlineAt: createdAt,
    contentId: payload.contentId ?? null,
    contentType: (payload.contentType as PartnerBenefitOffer['contentType']) ?? null,
    contentTitle: payload.contentTitle ?? null,
    defaultValidityDays: payload.defaultValidityDays ?? null,
    benefitKind: payload.benefitKind ?? null,
  };
}

function remoteRowToOffer(row: RemotePartnerBenefitOfferRow): PartnerBenefitOffer {
  const createdAt = row.created_at ?? new Date().toISOString();
  return {
    id: row.local_id,
    partnerUserId: row.partner_user_id,
    partnerName: row.partner_name,
    catalogId: row.catalog_local_id,
    catalogTitle: row.catalog_title,
    catalogDescription: row.catalog_description ?? '',
    countryCode: row.country_code ?? 'GN',
    city: row.city ?? null,
    status: row.status ?? 'pending',
    adminNote: row.admin_note,
    partnerResponseNote: row.partner_response_note,
    createdAt,
    respondedAt: row.responded_at,
    validationDeadlineAt: row.validation_deadline_at ?? createdAt,
    contentId: row.content_id,
    contentType: (row.content_type as PartnerBenefitOffer['contentType']) ?? null,
    contentTitle: row.content_title,
    defaultValidityDays: row.default_validity_days,
    benefitKind: row.benefit_kind,
  };
}

export function buildPartnerBenefitOfferNotificationMessage(offer: PartnerBenefitOffer): string {
  const payload = encodeURIComponent(
    JSON.stringify({
      offerId: offer.id,
      catalogId: offer.catalogId,
      catalogTitle: offer.catalogTitle,
      catalogDescription: offer.catalogDescription,
      countryCode: offer.countryCode,
      city: offer.city,
      contentId: offer.contentId,
      contentType: offer.contentType,
      contentTitle: offer.contentTitle,
      defaultValidityDays: offer.defaultValidityDays,
      benefitKind: offer.benefitKind,
      partnerName: offer.partnerName,
    } satisfies OfferPayload),
  );
  return (
    `THE LOOP vous propose « ${offer.catalogTitle} ». Consultez le détail puis acceptez ou refusez (avec motif).` +
    `\n[[loop-pbo:${payload}]]`
  );
}

/** Notifications Supabase — canal qui fonctionne même si les RPC partenaire renvoient []. */
export async function fetchOffersFromNotifications(
  partnerUserId: string,
  partnerName?: string,
  partnerPhone?: string | null,
): Promise<PartnerBenefitOffer[]> {
  const notifications = await listUserNotifications(partnerUserId, partnerPhone);
  const offers: PartnerBenefitOffer[] = [];

  for (const notification of notifications) {
    const isPartnerBenefitNotif =
      notification.title === 'Privilège à valider' ||
      notification.title === 'Privilège à revalider' ||
      notification.title === 'Avantage à valider' ||
      notification.title === 'Avantage à revalider' ||
      OFFER_TAG.test(notification.message) ||
      LEGACY_OFFER_TITLE.test(notification.message);
    if (!isPartnerBenefitNotif) continue;
    if (notification.audience && notification.audience !== 'partner' && notification.audience !== 'individual') {
      continue;
    }

    const payload = tryExtractPayloadFromMessage(notification.message);
    if (!payload?.catalogTitle) continue;

    const offer = payloadToOffer(
      { ...payload, partnerName: payload.partnerName ?? partnerName },
      partnerUserId,
      notification.sentAt,
    );
    if (offer) offers.push(offer);
  }

  const byCatalog = new Map<string, PartnerBenefitOffer>();
  for (const offer of offers) {
    const key = offer.catalogId.startsWith('pending-title-')
      ? offer.catalogTitle.trim().toLowerCase()
      : offer.catalogId;
    const prev = byCatalog.get(key);
    if (!prev || offer.createdAt > prev.createdAt) {
      byCatalog.set(key, offer);
    }
  }
  return Array.from(byCatalog.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

type PartnerRpcCallResult =
  | { ok: true; offers: PartnerBenefitOffer[] }
  | { ok: false; offers: PartnerBenefitOffer[]; reason: 'no_session' | 'network' | 'rpc_error' };

function isTransientNetworkError(message: string): boolean {
  return /network request failed|failed to fetch|network error|timeout|aborted/i.test(message);
}

async function fetchOffersFromSupabaseRpc(): Promise<PartnerRpcCallResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, offers: [], reason: 'rpc_error' };
  }

  const authUserId = await getPartnerAuthUserIdFromSession();
  if (!authUserId) return { ok: false, offers: [], reason: 'no_session' };

  try {
    const { data, error } = await supabase.rpc('list_my_partner_benefit_offers');
    if (error) {
      if (/Non authentifié|not authenticated|JWT/i.test(error.message)) {
        return { ok: false, offers: [], reason: 'no_session' };
      }
      if (!/does not exist|could not find|schema cache|partner_benefit_offers/i.test(error.message)) {
        console.warn('[PartnerBenefitOffers] RPC list_my:', error.message);
      }
      return { ok: false, offers: [], reason: 'rpc_error' };
    }

    const rows = parseRpcJsonArray(data) as RemotePartnerBenefitOfferRow[];
    const offers = rows.map(remoteRowToOffer);
    if (__DEV__) {
      console.log('[PartnerBenefitOffers] RPC pending', { authUserId, count: offers.length });
    }
    return { ok: true, offers };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isTransientNetworkError(message)) {
      console.warn('[PartnerBenefitOffers] RPC list_my:', message);
    }
    return { ok: false, offers: [], reason: isTransientNetworkError(message) ? 'network' : 'rpc_error' };
  }
}

async function fetchActiveBenefitsFromSupabaseRpc(): Promise<PartnerRpcCallResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, offers: [], reason: 'rpc_error' };
  }

  const authUserId = await getPartnerAuthUserIdFromSession();
  if (!authUserId) return { ok: false, offers: [], reason: 'no_session' };

  try {
    const { data, error } = await supabase.rpc('list_my_partner_active_benefits');
    if (error) {
      if (/Non authentifié|not authenticated|JWT/i.test(error.message)) {
        return { ok: false, offers: [], reason: 'no_session' };
      }
      if (!/does not exist|could not find|schema cache/i.test(error.message)) {
        console.warn('[PartnerBenefitOffers] RPC active benefits:', error.message);
      }
      return { ok: false, offers: [], reason: 'rpc_error' };
    }

    const parsed = parseRpcJsonArray(data);
    const offers: PartnerBenefitOffer[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      const record = row as Record<string, unknown>;
      const catalogId = String(record.local_id ?? '').trim();
      if (!catalogId) continue;
      offers.push({
        id: `catalog-active-${catalogId}-${String(record.partner_name ?? 'partner')}`,
        partnerUserId: authUserId,
        partnerName: String(record.partner_name ?? 'Partenaire'),
        catalogId,
        catalogTitle: String(record.title ?? ''),
        catalogDescription: String(record.description ?? ''),
        countryCode: String(record.country_code ?? 'GN'),
        city: record.city ? String(record.city) : null,
        status: 'accepted',
        adminNote: null,
        partnerResponseNote: null,
        createdAt: String(record.updated_at ?? record.created_at ?? new Date().toISOString()),
        respondedAt: String(record.updated_at ?? record.created_at ?? new Date().toISOString()),
        validationDeadlineAt: String(record.updated_at ?? record.created_at ?? new Date().toISOString()),
        contentId: record.content_id ? String(record.content_id) : null,
        contentType: (record.content_type as PartnerBenefitOffer['contentType']) ?? null,
        contentTitle: record.content_title ? String(record.content_title) : null,
        defaultValidityDays:
          record.default_validity_days != null ? Number(record.default_validity_days) : null,
        benefitKind: record.benefit_kind ? String(record.benefit_kind) : null,
      });
    }
    if (__DEV__) {
      console.log('[PartnerBenefitOffers] RPC active', { authUserId, count: offers.length });
    }
    return { ok: true, offers };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isTransientNetworkError(message)) {
      console.warn('[PartnerBenefitOffers] RPC active benefits:', message);
    }
    return { ok: false, offers: [], reason: isTransientNetworkError(message) ? 'network' : 'rpc_error' };
  }
}

/** Repli admin / démo uniquement — ne pas utiliser pour la vue partenaire (contourne auth.uid()). */
export async function fetchActiveBenefitsFromCatalogDirect(
  partnerUserId: string,
  partnerName?: string,
): Promise<PartnerBenefitOffer[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  const { data: authData } = await supabase.auth.getUser();
  const authUid = authData.user?.id ?? partnerUserId;

  const identity = await resolvePartnerIdentity(partnerUserId, partnerName);
  const { data, error } = await supabase
    .from('benefit_catalog')
    .select(
      'local_id, title, description, country_code, city, offering_partners, default_validity_days, benefit_kind, updated_at, created_at',
    )
    .eq('is_active', true)
    .not('local_id', 'is', null)
    .limit(15);

  if (error || !data?.length) return [];

  const offers: PartnerBenefitOffer[] = [];
  for (const row of data) {
    const partners = Array.isArray(row.offering_partners)
      ? (row.offering_partners as Array<{
          partnerId?: string;
          displayName?: string;
          contentId?: string;
          contentType?: string;
          contentTitle?: string;
        }>)
      : [];

    for (const partner of partners) {
      const partnerId = String(partner.partnerId ?? '');
      const displayName = String(partner.displayName ?? 'Partenaire');
      if (!partnerIdentityMatchesRecord(identity, partnerId, displayName)) continue;

      const catalogId = String(row.local_id);
      offers.push({
        id: `catalog-active-${catalogId}-${partnerId || authUid}`,
        partnerUserId: authUid,
        partnerName: displayName,
        catalogId,
        catalogTitle: String(row.title ?? ''),
        catalogDescription: String(row.description ?? ''),
        countryCode: String(row.country_code ?? 'GN'),
        city: row.city ? String(row.city) : null,
        status: 'accepted',
        adminNote: null,
        partnerResponseNote: null,
        createdAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
        respondedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
        validationDeadlineAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
        contentId: partner.contentId ? String(partner.contentId) : null,
        contentType: (partner.contentType as PartnerBenefitOffer['contentType']) ?? null,
        contentTitle: partner.contentTitle ? String(partner.contentTitle) : null,
        defaultValidityDays:
          row.default_validity_days != null ? Number(row.default_validity_days) : null,
        benefitKind: row.benefit_kind ? String(row.benefit_kind) : null,
      });
      break;
    }
  }
  return offers;
}

function mergeOfferIntoCatalogMap(
  byCatalog: Map<string, PartnerBenefitOffer>,
  offer: PartnerBenefitOffer,
): void {
  const prev = byCatalog.get(offer.catalogId);
  if (!prev) {
    byCatalog.set(offer.catalogId, offer);
    return;
  }
  if (offer.status === 'pending' && prev.status !== 'pending') {
    byCatalog.set(offer.catalogId, offer);
    return;
  }
  if (prev.status === 'pending' && offer.status !== 'pending') {
    return;
  }
  const prevActive = prev.status === 'accepted' || prev.status === 'auto_accepted';
  const nextActive = offer.status === 'accepted' || offer.status === 'auto_accepted';
  if (nextActive && !prevActive) {
    byCatalog.set(offer.catalogId, offer);
    return;
  }
  if (prevActive && !nextActive) return;
  if (offer.createdAt >= prev.createdAt) {
    byCatalog.set(offer.catalogId, offer);
  }
}

/** Privilèges actifs partenaire — RPC sécurisée auth.uid() uniquement (pas de lecture directe catalogue). */
export async function listPartnerActiveBenefitsViaSupabase(): Promise<
  Array<{ catalogId: string; title: string; description: string; contentId: string | null }>
> {
  const fromRpc = await fetchActiveBenefitsFromSupabaseRpc();
  if (!fromRpc.ok) return [];
  return fromRpc.offers.map((o) => ({
    catalogId: o.catalogId,
    title: o.catalogTitle,
    description: o.catalogDescription,
    contentId: o.contentId ?? null,
  }));
}

export type PartnerBenefitRemoteLoad = {
  offers: PartnerBenefitOffer[];
  /** Au moins une RPC a répondu — source de vérité en ligne (même si liste vide). */
  rpcOk: boolean;
  authUserId: string | null;
};

let partnerOffersInflight: Promise<PartnerBenefitRemoteLoad> | null = null;
let partnerOffersMemoryCache: { authUserId: string; at: number; load: PartnerBenefitRemoteLoad } | null = null;
const PARTNER_OFFERS_MEMORY_MS = 12_000;

function mergePartnerRpcOffers(pending: PartnerBenefitOffer[], active: PartnerBenefitOffer[]): PartnerBenefitOffer[] {
  const byCatalog = new Map<string, PartnerBenefitOffer>();
  for (const offer of [...pending, ...active]) {
    mergeOfferIntoCatalogMap(byCatalog, offer);
  }
  return Array.from(byCatalog.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Charge les privilèges partenaire via 2 RPC PostgreSQL scopées auth.uid().
 * Pas de lecture directe benefit_catalog ni de merge notifications (sécurité + simplicité).
 */
export async function fetchPartnerBenefitOffersViaSupabase(
  _partnerUserId?: string,
  _partnerName?: string,
  _partnerPhone?: string | null,
  _sessionUserId?: string | null,
): Promise<PartnerBenefitRemoteLoad> {
  const authUserId = await getPartnerAuthUserIdFromSession();
  if (!authUserId) {
    return { offers: [], rpcOk: false, authUserId: null };
  }

  const now = Date.now();
  if (
    partnerOffersMemoryCache
    && partnerOffersMemoryCache.authUserId === authUserId
    && now - partnerOffersMemoryCache.at < PARTNER_OFFERS_MEMORY_MS
  ) {
    return partnerOffersMemoryCache.load;
  }

  if (partnerOffersInflight) {
    return partnerOffersInflight;
  }

  partnerOffersInflight = (async (): Promise<PartnerBenefitRemoteLoad> => {
    const [pendingResult, activeResult] = await Promise.all([
      fetchOffersFromSupabaseRpc(),
      fetchActiveBenefitsFromSupabaseRpc(),
    ]);

    const rpcOk = pendingResult.ok || activeResult.ok;
    const offers = mergePartnerRpcOffers(pendingResult.offers, activeResult.offers);
    const load: PartnerBenefitRemoteLoad = { offers, rpcOk, authUserId };

    if (__DEV__) {
      console.log('[PartnerBenefitOffers] RPC load', {
        authUserId,
        rpcOk,
        pending: pendingResult.offers.length,
        active: activeResult.offers.length,
        merged: offers.length,
      });
    }

    if (rpcOk) {
      partnerOffersMemoryCache = { authUserId, at: Date.now(), load };
    }
    return load;
  })();

  try {
    return await partnerOffersInflight;
  } finally {
    partnerOffersInflight = null;
  }
}

/** Id catalogue brut (sans préfixe pending-) pour les RPC d'acceptation. */
export function resolvePartnerOfferCatalogLocalId(
  offer: Pick<PartnerBenefitOffer, 'id' | 'catalogId'>,
): string {
  let catalogId = offer.catalogId?.trim() ?? '';
  if (catalogId.startsWith('pending-') && !catalogId.startsWith('pending-title-')) {
    catalogId = catalogId.slice('pending-'.length);
  }
  if ((!catalogId || catalogId.startsWith('pending-title-')) && offer.id.startsWith('pending-')) {
    const fromId = offer.id.slice('pending-'.length);
    if (fromId && !fromId.startsWith('pending-title-')) {
      catalogId = fromId;
    }
  }
  return catalogId;
}

export function invalidatePartnerBenefitOffersRemoteCache(): void {
  partnerOffersMemoryCache = null;
  partnerOffersInflight = null;
}

export async function acceptPartnerCatalogOfferViaSupabase(
  catalogLocalId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'supabase_not_configured' };
  }

  await ensurePartnerSupabaseSession();
  const localId = catalogLocalId.trim();
  if (!localId || localId.startsWith('pending-title-')) {
    return { ok: false, error: 'catalog_id_invalid' };
  }

  const { data, error } = await supabase.rpc('partner_set_benefit_catalog_active', {
    p_local_id: localId,
    p_is_active: true,
  });

  if (!error) {
    if (data === false) {
      return { ok: false, error: 'Activation refusée — vérifiez que vous êtes bien le partenaire de ce privilège.' };
    }
    return { ok: true };
  }

  if (/does not exist|could not find|schema cache/i.test(error.message)) {
    return { ok: false, error: 'rpc_partner_set_benefit_catalog_active_missing' };
  }

  return { ok: false, error: error.message };
}

export async function respondPartnerBenefitOfferViaSupabase(
  offer: Pick<PartnerBenefitOffer, 'id' | 'catalogId'>,
  accept: boolean,
  note?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'supabase_not_configured' };
  }

  await ensurePartnerSupabaseSession();
  const catalogLocalId = resolvePartnerOfferCatalogLocalId(offer);

  if (accept && catalogLocalId && !catalogLocalId.startsWith('pending-title-')) {
    const direct = await acceptPartnerCatalogOfferViaSupabase(catalogLocalId);
    if (direct.ok) return direct;
    if (__DEV__) {
      console.warn('[PartnerBenefitOffers] accept direct:', direct.error);
    }
  }

  const { error } = await supabase.rpc('partner_respond_benefit_offer', {
    p_local_id: offer.id,
    p_accept: accept,
    p_note: note ?? '',
    p_catalog_local_id: catalogLocalId || offer.catalogId,
  });

  if (!error) {
    if (accept && catalogLocalId && !catalogLocalId.startsWith('pending-title-')) {
      const activation = await acceptPartnerCatalogOfferViaSupabase(catalogLocalId);
      if (!activation.ok) return activation;
    }
    return { ok: true };
  }

  if (/does not exist|could not find|schema cache/i.test(error.message)) {
    if (accept && catalogLocalId) {
      return acceptPartnerCatalogOfferViaSupabase(catalogLocalId);
    }
    return { ok: false, error: 'rpc_partner_respond_missing' };
  }

  if (__DEV__) {
    console.warn('[PartnerBenefitOffers] respond RPC:', error.message);
  }
  return { ok: false, error: error.message };
}

export function parsePartnerBenefitOfferFromNotification(
  notification: UserNotification,
  partnerUserId: string,
): PartnerBenefitOffer | null {
  const payload = tryExtractPayloadFromMessage(notification.message);
  if (!payload?.catalogTitle) return null;
  return payloadToOffer(payload, partnerUserId, notification.sentAt);
}
