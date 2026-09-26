import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  deleteBenefitCatalogItem,
  forceDeleteBenefitCatalogRemote,
  getBenefitCatalogItem,
  invalidateBenefitCatalogCache,
  listBenefitCatalog,
  peekBenefitCatalog,
  removePartnerFromCatalogItem,
  updateBenefitCatalogItem,
  type BenefitCatalogItem,
  type BenefitOfferingPartner,
} from '@/lib/benefit-catalog-store';
import { partnerKeyMatches, partnerNameMatches, resolvePartnerIdentity, partnerIdentityMatchesRecord } from '@/lib/partner-identity-store';
import { buildPartnerValidContentIdSet } from '@/lib/partner-content-visibility';
import { resolvePartnerUserIdForSync } from '@/lib/partner-user-resolve';
import { resolveStablePartnerKey } from '@/lib/partner-validation-code-store';
import { appendUserNotification, notifyAdminUsers } from '@/lib/user-notifications-store';
import { listRegistryUsers } from '@/lib/user-registry-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { asJson, undefinedIfNull } from '@/lib/supabase-types';
import {
  fetchAdminPartnerBenefitOffersViaBackend,
  respondPartnerBenefitOfferViaBackend,
} from '@/lib/partner-benefit-offers-backend-api';
import { isLoopBackendConfigured } from '@/lib/loop-backend-api';
import {
  acceptPartnerCatalogOfferViaSupabase,
  buildPartnerBenefitOfferNotificationMessage,
  fetchPartnerBenefitOffersViaSupabase,
  invalidatePartnerBenefitOffersRemoteCache,
  resolvePartnerOfferCatalogLocalId,
  respondPartnerBenefitOfferViaSupabase,
  parseRpcJsonArray,
} from '@/lib/partner-benefit-offers-supabase-fallback';
import { ensurePartnerSupabaseSession, getPartnerAuthUserIdFromSession, requirePartnerAuthUserId } from '@/lib/partner-spot-auth';
import { resolveEffectivePartnerUserId } from '@/lib/partner-session-user-id';

export { invalidatePartnerBenefitOffersRemoteCache } from '@/lib/partner-benefit-offers-supabase-fallback';

export type PartnerBenefitOfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'auto_accepted'
  | 'disabled';

export interface PartnerBenefitOffer {
  id: string;
  partnerUserId: string;
  partnerName: string;
  catalogId: string;
  catalogTitle: string;
  catalogDescription: string;
  countryCode: string;
  city: string | null;
  status: PartnerBenefitOfferStatus;
  adminNote: string | null;
  partnerResponseNote: string | null;
  createdAt: string;
  respondedAt: string | null;
  /**
   * Conservé pour compatibilité des données locales.
   * Plus de validation automatique : l'offre reste `pending` jusqu'à réponse partenaire.
   */
  validationDeadlineAt: string;
  /** Snapshot lieu / type au moment de la proposition */
  contentId?: string | null;
  contentType?: 'event' | 'spot' | 'tool' | null;
  contentTitle?: string | null;
  defaultValidityDays?: number | null;
  benefitKind?: string | null;
}

const KEY = 'loop_partner_benefit_offers_v1';
const RPC_OFFLINE_CACHE_KEY = 'loop_partner_benefit_offers_rpc_v2';
const DISMISSED_PENDING_CATALOG_KEY = 'loop_partner_dismissed_pending_catalog_v1';

/** Évite double tap / double requête → plusieurs notifyAdminUsers pour une même offre. */
const inFlightPartnerOfferResponses = new Set<string>();

function partnerOfferResponseLockKey(offerId: string, partnerUserId: string): string {
  return `${partnerUserId.trim()}:${offerId.trim()}`;
}

interface PartnerOffersRpcCache {
  authUserId: string;
  savedAt: string;
  offers: PartnerBenefitOffer[];
}

async function loadPartnerOffersRpcCache(authUserId: string): Promise<PartnerBenefitOffer[] | null> {
  try {
    const raw = await AsyncStorage.getItem(RPC_OFFLINE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PartnerOffersRpcCache;
    if (parsed.authUserId !== authUserId) return null;
    if (!Array.isArray(parsed.offers)) return null;
    return parsed.offers.map((o) => normalizeOffer(o));
  } catch {
    return null;
  }
}

async function savePartnerOffersRpcCache(authUserId: string, offers: PartnerBenefitOffer[]): Promise<void> {
  const payload: PartnerOffersRpcCache = {
    authUserId,
    savedAt: new Date().toISOString(),
    offers,
  };
  await AsyncStorage.setItem(RPC_OFFLINE_CACHE_KEY, JSON.stringify(payload));
}

/** Variantes d'un id catalogue (pending-*, id brut) pour dismissed / dédoublonnage. */
function catalogIdKeyVariants(catalogId: string): string[] {
  const trimmed = catalogId.trim();
  if (!trimmed) return [];
  const base = trimmed.replace(/^pending-/, '');
  const variants = new Set<string>([trimmed, base, `pending-${base}`]);
  return [...variants];
}

function isDismissedPendingCatalogId(catalogId: string, dismissed: Set<string>): boolean {
  return catalogIdKeyVariants(catalogId).some((key) => dismissed.has(key));
}

async function resolvePartnerAuthUserId(hint?: string | null): Promise<string | null> {
  const sessionAuthUserId =
    (await getPartnerAuthUserIdFromSession()) ?? (await requirePartnerAuthUserId(800));
  const hinted = hint?.trim();
  // Session Supabase prime : les RPC partenaire sont scopées auth.uid().
  return sessionAuthUserId ?? hinted ?? null;
}

async function loadDismissedPendingCatalogIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_PENDING_CATALOG_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

async function dismissPendingCatalogId(catalogId: string): Promise<void> {
  const id = catalogId.trim();
  if (!id) return;
  const set = await loadDismissedPendingCatalogIds();
  set.add(id);
  await AsyncStorage.setItem(DISMISSED_PENDING_CATALOG_KEY, JSON.stringify([...set]));
}

async function clearDismissedPendingCatalogIds(catalogIds: Iterable<string>): Promise<void> {
  const toClear = new Set<string>();
  for (const raw of catalogIds) {
    for (const variant of catalogIdKeyVariants(raw)) {
      toClear.add(variant);
    }
  }
  if (!toClear.size) return;
  const set = await loadDismissedPendingCatalogIds();
  let changed = false;
  for (const id of toClear) {
    if (set.delete(id)) changed = true;
  }
  if (changed) {
    await AsyncStorage.setItem(DISMISSED_PENDING_CATALOG_KEY, JSON.stringify([...set]));
  }
}

async function purgeBenefitOfferNotifications(offer: PartnerBenefitOffer): Promise<void> {
  try {
    const { listUserNotifications, deleteUserNotifications } = await import('@/lib/user-notifications-store');
    const notifications = await listUserNotifications(offer.partnerUserId);
    const titleNeedle = offer.catalogTitle.trim();
    const toDelete = notifications
      .filter((n) => {
        if (
          n.title !== 'Privilège à valider' &&
          n.title !== 'Privilège à revalider' &&
          n.title !== 'Avantage à valider' &&
          n.title !== 'Avantage à revalider'
        ) {
          return false;
        }
        if (offer.catalogId && n.message.includes(offer.catalogId)) return true;
        if (titleNeedle && n.message.includes(`« ${titleNeedle} »`)) return true;
        return false;
      })
      .map((n) => n.id);
    if (toDelete.length) {
      await deleteUserNotifications(toDelete, offer.partnerUserId);
    }
  } catch {
    /* non bloquant */
  }
}

export const PARTNER_OFFER_STATUS_LABELS: Record<PartnerBenefitOfferStatus, string> = {
  pending: 'En cours de validation',
  accepted: 'Actif',
  declined: 'Refusé par le partenaire',
  auto_accepted: 'Validé automatiquement (historique)',
  disabled: 'Archivé',
};

function normalizeOffer(raw: Partial<PartnerBenefitOffer> & Pick<PartnerBenefitOffer, 'id' | 'partnerUserId' | 'catalogId'>): PartnerBenefitOffer {
  const createdAt = raw.createdAt ?? new Date().toISOString();
  return {
    id: raw.id,
    partnerUserId: raw.partnerUserId,
    partnerName: raw.partnerName ?? 'Partenaire',
    catalogId: raw.catalogId,
    catalogTitle: raw.catalogTitle ?? '',
    catalogDescription: raw.catalogDescription ?? '',
    countryCode: raw.countryCode ?? 'GN',
    city: raw.city ?? null,
    status: raw.status ?? 'pending',
    adminNote: raw.adminNote ?? null,
    partnerResponseNote: raw.partnerResponseNote ?? null,
    createdAt,
    respondedAt: raw.respondedAt ?? null,
    validationDeadlineAt: raw.validationDeadlineAt ?? createdAt,
    contentId: raw.contentId ?? null,
    contentType: raw.contentType ?? null,
    contentTitle: raw.contentTitle ?? null,
    defaultValidityDays: raw.defaultValidityDays ?? null,
    benefitKind: raw.benefitKind ?? null,
  };
}

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
  updated_at?: string;
};

function remoteRowToOffer(row: RemotePartnerBenefitOfferRow): PartnerBenefitOffer {
  return normalizeOffer({
    id: row.local_id,
    partnerUserId: row.partner_user_id,
    partnerName: row.partner_name,
    catalogId: row.catalog_local_id,
    catalogTitle: row.catalog_title,
    catalogDescription: row.catalog_description,
    countryCode: row.country_code,
    city: row.city,
    status: row.status,
    adminNote: row.admin_note,
    partnerResponseNote: row.partner_response_note,
    contentId: row.content_id,
    contentType: (row.content_type as PartnerBenefitOffer['contentType']) ?? null,
    contentTitle: row.content_title,
    defaultValidityDays: row.default_validity_days,
    benefitKind: row.benefit_kind,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    validationDeadlineAt: row.validation_deadline_at,
  });
}

function offerToRemoteRow(offer: PartnerBenefitOffer): Record<string, unknown> {
  return {
    local_id: offer.id,
    partner_user_id: offer.partnerUserId,
    partner_name: offer.partnerName,
    catalog_local_id: offer.catalogId,
    catalog_title: offer.catalogTitle,
    catalog_description: offer.catalogDescription,
    country_code: offer.countryCode,
    city: offer.city,
    status: offer.status,
    admin_note: offer.adminNote,
    partner_response_note: offer.partnerResponseNote,
    content_id: offer.contentId,
    content_type: offer.contentType,
    content_title: offer.contentTitle,
    default_validity_days: offer.defaultValidityDays,
    benefit_kind: offer.benefitKind,
    created_at: offer.createdAt,
    responded_at: offer.respondedAt,
    validation_deadline_at: offer.validationDeadlineAt,
  };
}

function offerRemoteTimestamp(offer: PartnerBenefitOffer): string {
  return offer.respondedAt ?? offer.createdAt;
}

async function canRemoteWritePartnerOffers(): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user?.id) return false;
  const { data } = await supabase
    .from('users')
    .select('user_role, is_active')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (!data?.is_active) return false;
  const role = String(data.user_role ?? '').toLowerCase();
  return role === 'admin' || role === 'super_admin';
}

async function mergeRemoteOffersIntoLocal(remote: PartnerBenefitOffer[]): Promise<void> {
  if (!remote.length) return;
  const all = await loadAll();
  const byKey = new Map<string, PartnerBenefitOffer>();
  for (const offer of all) {
    byKey.set(validationOfferDedupeKey(offer), offer);
  }
  for (const incoming of remote) {
    const key = validationOfferDedupeKey(incoming);
    const prev = byKey.get(key);
    if (!prev || offerRemoteTimestamp(incoming) >= offerRemoteTimestamp(prev)) {
      byKey.set(key, incoming);
    }
  }
  const merged = Array.from(byKey.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  await saveAll(merged);
}

function validationOfferDedupeKey(offer: PartnerBenefitOffer): string {
  const partnerKey =
    offer.partnerUserId?.trim()
    || offer.partnerName.trim().toLowerCase();
  return `${offer.catalogId}::${partnerKey}`;
}

function dedupeValidationOffers(offers: PartnerBenefitOffer[]): PartnerBenefitOffer[] {
  const byKey = new Map<string, PartnerBenefitOffer>();
  for (const offer of offers) {
    const key = validationOfferDedupeKey(offer);
    const prev = byKey.get(key);
    if (!prev || offerRemoteTimestamp(offer) >= offerRemoteTimestamp(prev)) {
      byKey.set(key, offer);
    }
  }
  return Array.from(byKey.values());
}

/** Retire du cache local les pending absents du serveur (admin). */
async function reconcileAdminOffersWithRemote(remote: PartnerBenefitOffer[]): Promise<void> {
  const remotePendingKeys = new Set(
    remote.filter((o) => o.status === 'pending').map(validationOfferDedupeKey),
  );
  const all = await loadAll();
  const next = all.filter((offer) => {
    if (offer.status !== 'pending') return true;
    return remotePendingKeys.has(validationOfferDedupeKey(offer));
  });
  if (next.length !== all.length) await saveAll(next);
}

/** Quand la RPC répond, retirer du cache local les pending supprimés côté serveur. */
async function reconcileLocalOffersWithRemote(
  remote: PartnerBenefitOffer[],
  effectiveUserId: string,
  identity: Awaited<ReturnType<typeof resolvePartnerIdentity>> | null,
  authUserId?: string | null,
): Promise<void> {
  const remotePendingCatalogIds = new Set(
    remote.filter((o) => o.status === 'pending').map((o) => o.catalogId),
  );
  const all = await loadAll();
  const next = all.filter((offer) => {
    if (!offerMatchesPartner(offer, effectiveUserId, identity, authUserId)) return true;
    if (offer.status !== 'pending') return true;
    if (remotePendingCatalogIds.has(offer.catalogId)) return true;
    // Pending local absent du serveur → suppression admin / serveur
    return false;
  });
  if (next.length !== all.length) await saveAll(next);
}

async function syncPartnerOffersSideEffects(
  result: PartnerBenefitOffer[],
  effectiveUserId: string,
  label: string,
  authUserId: string,
): Promise<void> {
  const pendingKeys = result
    .filter((o) => o.status === 'pending')
    .flatMap((o) => catalogIdKeyVariants(o.catalogId));
  if (pendingKeys.length) {
    await clearDismissedPendingCatalogIds(pendingKeys);
  }
  await savePartnerOffersRpcCache(authUserId, result);
  const identity = await resolvePartnerIdentity(effectiveUserId, label || undefined);
  await reconcileLocalOffersWithRemote(result, effectiveUserId, identity, authUserId);
  await mergeRemoteOffersIntoLocal(result);
}

async function fetchRemoteOffersForPartner(
  authUserIdHint?: string | null,
): Promise<Awaited<ReturnType<typeof fetchPartnerBenefitOffersViaSupabase>>> {
  await ensurePartnerSupabaseSession();
  await resolvePartnerAuthUserId(authUserIdHint);
  return fetchPartnerBenefitOffersViaSupabase();
}

async function fetchRemoteOffersForAdmin(countryCode?: string): Promise<PartnerBenefitOffer[] | null> {
  if (isLoopBackendConfigured()) {
    const backend = await fetchAdminPartnerBenefitOffersViaBackend(countryCode);
    if (backend !== null) return backend;
  }

  if (!isSupabaseConfigured() || !supabase) return null;
  if (!(await canRemoteWritePartnerOffers())) return null;

  const { data, error } = await supabase.rpc('list_admin_partner_benefit_offers', {
    p_country_code: undefinedIfNull(countryCode ?? null),
  });
  if (error) {
    if (!/does not exist|could not find|schema cache/i.test(error.message)) {
      console.warn('[PartnerBenefitOffers] list_admin RPC:', error.message);
    }
    return isLoopBackendConfigured() ? [] : null;
  }

  const rows = parseRpcJsonArray(data) as RemotePartnerBenefitOfferRow[];
  return rows.map(remoteRowToOffer);
}

async function upsertRemotePartnerOffer(offer: PartnerBenefitOffer): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: true };
  if (!(await canRemoteWritePartnerOffers())) return { ok: true };

  const { error } = await supabase.rpc('admin_upsert_partner_benefit_offer', {
    p_row: asJson(offerToRemoteRow(offer)),
  });
  if (!error) return { ok: true };
  if (/does not exist|could not find|schema cache/i.test(error.message)) {
    return { ok: true };
  }
  console.warn('[PartnerBenefitOffers] upsert RPC:', error.message);
  return { ok: false, error: error.message };
}

async function respondRemotePartnerOffer(
  offer: PartnerBenefitOffer,
  accept: boolean,
  note?: string | null,
  partnerUserId?: string,
): Promise<{ ok: boolean; error?: string }> {
  await ensurePartnerSupabaseSession();

  if (isLoopBackendConfigured() && partnerUserId) {
    const backendRes = await respondPartnerBenefitOfferViaBackend(partnerUserId, offer, accept, note);
    if (backendRes.ok) return backendRes;
    if (
      backendRes.error &&
      backendRes.error !== 'backend_not_configured' &&
      backendRes.error !== 'backend_unreachable'
    ) {
      return backendRes;
    }
  }

  const supabaseRes = await respondPartnerBenefitOfferViaSupabase(offer, accept, note);
  if (supabaseRes.ok) return supabaseRes;

  if (__DEV__) {
    console.warn('[PartnerBenefitOffers] respond RPC:', supabaseRes.error);
  }

  if (accept && supabaseRes.error?.includes('rpc_partner_respond_missing')) {
    let catalogLocalId = offer.catalogId;
    if (catalogLocalId.startsWith('pending-') && !catalogLocalId.startsWith('pending-title-')) {
      catalogLocalId = catalogLocalId.slice('pending-'.length);
    }
    if (catalogLocalId && !catalogLocalId.startsWith('pending-title-')) {
      return acceptPartnerCatalogOfferViaSupabase(catalogLocalId);
    }
  }

  if (supabaseRes.error?.includes('rpc_partner_respond_missing')) {
    return {
      ok: false,
      error: accept
        ? 'Validation impossible — service partenaire indisponible. Réessayez ou contactez THE LOOP.'
        : 'Refus impossible — service partenaire indisponible. Réessayez ou contactez THE LOOP.',
    };
  }

  return supabaseRes.error
    ? supabaseRes
    : {
        ok: false,
        error: accept
          ? 'Validation impossible — vérifiez votre connexion.'
          : 'Refus impossible — vérifiez votre connexion.',
      };
}

function findOfferIndexForPartner(
  offers: PartnerBenefitOffer[],
  offerId: string,
  partnerUserId: string,
  identity: Awaited<ReturnType<typeof resolvePartnerIdentity>> | null,
): number {
  return offers.findIndex(
    (offer) => offer.id === offerId && offerMatchesPartner(offer, partnerUserId, identity),
  );
}

async function loadAll(): Promise<PartnerBenefitOffer[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PartnerBenefitOffer[];
    return Array.isArray(parsed) ? parsed.map((o) => normalizeOffer(o)) : [];
  } catch {
    return [];
  }
}

/** Offres partenaires en cache local — sans synchronisation catalogue. */
export async function peekPartnerBenefitOffers(): Promise<PartnerBenefitOffer[]> {
  return loadAll();
}

async function saveAll(items: PartnerBenefitOffer[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

function offerMatchesPartner(
  offer: PartnerBenefitOffer,
  partnerUserId: string,
  identity: Awaited<ReturnType<typeof resolvePartnerIdentity>> | null,
  authUserId?: string | null,
): boolean {
  if (offer.partnerUserId === partnerUserId) return true;
  if (authUserId && offer.partnerUserId === authUserId) return true;
  if (identity?.userId && offer.partnerUserId === identity.userId) return true;
  if (!identity) return false;
  return (
    partnerIdentityMatchesRecord(identity, offer.partnerUserId, offer.partnerName)
    || partnerKeyMatches(identity, offer.partnerUserId)
    || partnerNameMatches(identity, offer.partnerName)
  );
}

/** Offres renvoyées par les RPC partenaire (déjà filtrées auth.uid() côté serveur). */
function isAuthScopedRemoteOffer(offer: PartnerBenefitOffer, authUserId: string | null): boolean {
  if (!authUserId) return false;
  return offer.partnerUserId === authUserId;
}

export function isPartnerOfferActive(status: PartnerBenefitOfferStatus): boolean {
  return status === 'accepted' || status === 'auto_accepted';
}

/**
 * Un catalogue avec au moins une offre encore `pending` et aucune acceptée
 * ne doit jamais rester actif (catalogue / octrois / matching).
 * Réservé à l'admin — ne jamais exécuter en lecture partenaire (risque de désactiver Supabase).
 */
async function enforceInactiveWhilePending(): Promise<void> {
  if (!(await canRemoteWritePartnerOffers())) return;

  const all = await loadAll();
  const byCatalog = new Map<string, PartnerBenefitOffer[]>();
  for (const offer of all) {
    const list = byCatalog.get(offer.catalogId) ?? [];
    list.push(offer);
    byCatalog.set(offer.catalogId, list);
  }

  for (const [catalogId, offers] of byCatalog) {
    const hasAccepted = offers.some((o) => isPartnerOfferActive(o.status));
    const hasPending = offers.some((o) => o.status === 'pending');
    if (!hasPending || hasAccepted) continue;
    const item = await getBenefitCatalogItem(catalogId);
    if (item?.isActive) {
      await updateBenefitCatalogItem(catalogId, { isActive: false });
    }
  }
}

function dedupePartnerOffers(offers: PartnerBenefitOffer[]): PartnerBenefitOffer[] {
  const byCatalog = new Map<string, PartnerBenefitOffer>();
  for (const offer of offers) {
    const prev = byCatalog.get(offer.catalogId);
    if (!prev) {
      byCatalog.set(offer.catalogId, offer);
      continue;
    }
    // En validation : le pending prime toujours sur un active stale (même catalogue)
    if (offer.status === 'pending' && prev.status !== 'pending') {
      byCatalog.set(offer.catalogId, offer);
      continue;
    }
    if (prev.status === 'pending' && offer.status !== 'pending') {
      continue;
    }
    const prevActive = isPartnerOfferActive(prev.status);
    const nextActive = isPartnerOfferActive(offer.status);
    if (nextActive && !prevActive) {
      byCatalog.set(offer.catalogId, offer);
      continue;
    }
    if (offer.createdAt >= prev.createdAt) {
      byCatalog.set(offer.catalogId, offer);
    }
  }
  return Array.from(byCatalog.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function filterOffersForPartnerView(
  offers: PartnerBenefitOffer[],
  effectiveUserId: string,
  identity: Awaited<ReturnType<typeof resolvePartnerIdentity>> | null,
  dismissedPending?: Set<string>,
  authUserId?: string | null,
): PartnerBenefitOffer[] {
  return dedupePartnerOffers(
    offers.filter((o) => {
      if (isAuthScopedRemoteOffer(o, authUserId ?? null)) return true;
      if (o.status === 'pending') {
        if (dismissedPending && isDismissedPendingCatalogId(o.catalogId, dismissedPending)) return false;
        return offerMatchesPartner(o, effectiveUserId, identity, authUserId);
      }
      if (!offerMatchesPartner(o, effectiveUserId, identity, authUserId)) return false;
      return true;
    }),
  );
}

/** Charge les offres et force l'inactivité des privilèges encore en validation (admin uniquement). */
export async function synchronizePartnerBenefitOffers(): Promise<PartnerBenefitOffer[]> {
  await enforceInactiveWhilePending();
  await purgeOrphanPartnerBenefitOffers();
  return loadAll();
}

/** Retire les demandes de validation liées à un catalogue supprimé. */
export async function purgeOrphanPartnerBenefitOffers(): Promise<number> {
  const catalogIds = new Set((await listBenefitCatalog()).map((c) => c.id));
  const all = await loadAll();
  const next = all.filter((o) => {
    // Catalogue inactif (en validation) absent du cache partenaire — ne jamais purger
    if (o.status === 'pending') return true;
    return catalogIds.has(o.catalogId);
  });
  const removed = all.length - next.length;
  if (removed > 0) await saveAll(next);
  return removed;
}

export async function listPartnerBenefitOffers(
  partnerUserId: string,
  partnerName?: string,
  _validContentIds?: Set<string>,
  _partnerPhone?: string | null,
  authUserIdHint?: string | null,
): Promise<PartnerBenefitOffer[]> {
  await ensurePartnerSupabaseSession();
  const authUserId = await resolvePartnerAuthUserId(authUserIdHint);

  const effectiveUserId =
    authUserId
    ?? (await resolveEffectivePartnerUserId(partnerUserId, partnerName))
    ?? partnerUserId;

  const label = partnerName?.trim() ?? '';

  if (isSupabaseConfigured()) {
    if (!authUserId) {
      if (__DEV__) {
        console.warn('[PartnerBenefitOffers] list: session partenaire absente — aucune offre exposée');
      }
      return [];
    }

    const load = await fetchRemoteOffersForPartner(authUserIdHint);

    if (load.rpcOk) {
      const result = dedupePartnerOffers(load.offers);
      if (__DEV__) {
        console.log('[PartnerBenefitOffers] list', {
          authUserId,
          source: 'rpc',
          pending: result.filter((o) => o.status === 'pending').length,
          active: result.filter((o) => isPartnerOfferActive(o.status)).length,
          total: result.length,
        });
      }
      void syncPartnerOffersSideEffects(result, effectiveUserId, label, authUserId).catch((err) => {
        console.warn(
          '[PartnerBenefitOffers] sync cache:',
          err instanceof Error ? err.message : err,
        );
      });
      return result;
    }

    const cached = await loadPartnerOffersRpcCache(authUserId);
    if (cached?.length) {
      if (__DEV__) {
        console.log('[PartnerBenefitOffers] list', {
          authUserId,
          source: 'offline_cache',
          total: cached.length,
        });
      }
      return dedupePartnerOffers(cached);
    }

    return [];
  }

  const identity = await resolvePartnerIdentity(effectiveUserId, label || undefined);
  if (authUserId) {
    identity.keys.add(authUserId);
    identity.keys.add(`user:${authUserId}`);
  }
  const dismissedPending = await loadDismissedPendingCatalogIds();
  const all = await loadAll();
  return filterOffersForPartnerView(all, effectiveUserId, identity, dismissedPending, authUserId);
}

export async function listAllPartnerBenefitOffersForAdmin(countryCode?: string): Promise<PartnerBenefitOffer[]> {
  const remote = await fetchRemoteOffersForAdmin(countryCode);

  if (remote !== null) {
    await reconcileAdminOffersWithRemote(remote);
    await mergeRemoteOffersIntoLocal(remote);

    const [all, catalogItems] = await Promise.all([loadAll(), peekBenefitCatalog()]);
    const catalogIds = new Set(catalogItems.map((c) => c.id));

    const remoteValidations = remote.filter(
      (o) => o.status === 'pending' || o.status === 'declined',
    );
    const remoteKeys = new Set(remoteValidations.map(validationOfferDedupeKey));

    const localHistory = all.filter(
      (o) =>
        (o.status === 'declined' || o.status === 'disabled')
        && catalogIds.has(o.catalogId)
        && (!countryCode || o.countryCode === countryCode)
        && !remoteKeys.has(validationOfferDedupeKey(o)),
    );

    return dedupeValidationOffers([...remoteValidations, ...localHistory])
      .filter((o) => catalogIds.has(o.catalogId) || o.status === 'declined' || o.status === 'pending')
      .filter((o) => !countryCode || o.countryCode === countryCode)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  void (async () => {
    if (!(await canRemoteWritePartnerOffers())) return;
    const local = await loadAll();
    for (const offer of local.filter((entry) => entry.status === 'pending')) {
      await upsertRemotePartnerOffer(offer);
    }
  })();

  const [all, catalogItems] = await Promise.all([loadAll(), peekBenefitCatalog()]);
  const catalogIds = new Set(catalogItems.map((c) => c.id));
  const filtered = dedupeValidationOffers(all)
    .filter((o) => catalogIds.has(o.catalogId))
    .filter((o) => !countryCode || o.countryCode === countryCode)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  void synchronizePartnerBenefitOffers();
  return filtered;
}

export async function listPendingPartnerBenefitOffersForAdmin(countryCode?: string): Promise<PartnerBenefitOffer[]> {
  const all = await synchronizePartnerBenefitOffers();
  return all.filter((o) => o.status === 'pending' && (!countryCode || o.countryCode === countryCode));
}

/** True si une demande de validation est encore en attente pour ce catalogue. */
export async function catalogHasPendingPartnerOffers(catalogId: string): Promise<boolean> {
  const all = await loadAll();
  return all.some((o) => o.catalogId === catalogId && o.status === 'pending');
}

async function findExistingOffer(
  catalogId: string,
  partnerUserId: string,
  partnerName: string,
): Promise<PartnerBenefitOffer | undefined> {
  const all = await loadAll();
  const nameNorm = partnerName.trim().toLowerCase();
  return all.find(
    (o) =>
      o.catalogId === catalogId &&
      (o.partnerUserId === partnerUserId || o.partnerName.trim().toLowerCase() === nameNorm),
  );
}

/** Le partenaire peut-il valider des privilèges membres (scan QR) ? */
export async function partnerHasValidationBenefits(
  partnerId: string,
  partnerName: string,
): Promise<boolean> {
  const offers = await listPartnerBenefitOffers(partnerId, partnerName);
  if (offers.some((o) => isPartnerOfferActive(o.status))) return true;

  const resolvedUserId = await resolvePartnerUserIdForSync(partnerId, partnerName);
  const stableKey = await resolveStablePartnerKey(partnerId, partnerName);
  const partnerKeys = new Set([partnerId, stableKey]);
  if (resolvedUserId) partnerKeys.add(resolvedUserId);

  const catalog = await listBenefitCatalog(true);
  for (const item of catalog) {
    if (!item.isActive) continue;
    const linked = item.offeringPartners?.some(
      (p) => partnerKeys.has(p.partnerId) || p.displayName.trim().toLowerCase() === partnerName.trim().toLowerCase(),
    );
    if (!linked) continue;
    if (await isPartnerOfferingValidated(item.id, partnerId, partnerName)) {
      return true;
    }
  }
  return false;
}

export async function getPartnerOfferingValidation(
  catalogId: string,
  partnerId: string,
  partnerName: string,
): Promise<PartnerBenefitOfferStatus | 'legacy'> {
  const identity = await resolvePartnerIdentity(partnerId, partnerName);
  const all = await peekPartnerBenefitOffers();
  const match = all.find(
    (o) => o.catalogId === catalogId && offerMatchesPartner(o, partnerId, identity),
  );
  if (match) return match.status;

  const catalogOffers = all.filter((o) => o.catalogId === catalogId);
  if (catalogOffers.length > 0) {
    const fuzzy = catalogOffers.find((o) => offerMatchesPartner(o, partnerId, identity));
    if (fuzzy) return fuzzy.status;
    return 'pending';
  }

  const item = await getBenefitCatalogItem(catalogId);
  if (item?.isActive) {
    const linked = (item.offeringPartners ?? []).some((p) =>
      partnerIdentityMatchesRecord(identity, p.partnerId, p.displayName?.trim() || partnerName),
    );
    if (linked) return 'accepted';
  }

  return 'legacy';
}

/**
 * Validé si le partenaire a accepté, ou si le catalogue est déjà actif en base pour ce partenaire.
 */
export async function isPartnerOfferingValidated(
  catalogId: string,
  partnerId: string,
  partnerName: string,
): Promise<boolean> {
  const item = await getBenefitCatalogItem(catalogId);
  const identity = await resolvePartnerIdentity(partnerId, partnerName);
  const linked = (item?.offeringPartners ?? []).some((p) =>
    partnerIdentityMatchesRecord(identity, p.partnerId, p.displayName?.trim() || partnerName),
  );
  if (!linked) return false;

  // is_active=true côté serveur = validation partenaire déjà faite (ou THE LOOP sans étape)
  if (item?.isActive) return true;

  const status = await getPartnerOfferingValidation(catalogId, partnerId, partnerName);
  if (status === 'pending' || status === 'declined' || status === 'disabled') return false;
  return isPartnerOfferActive(status as PartnerBenefitOfferStatus);
}

async function isSuperAdminPartnerUser(userId: string): Promise<boolean> {
  const users = await listRegistryUsers();
  const local = users.find((u) => u.id === userId);
  if ((local?.userRole ?? '').toLowerCase() === 'super_admin') return true;

  if (!isSupabaseConfigured() || !supabase || !isUuidLike(userId)) return false;
  const { data } = await supabase.from('users').select('user_role').eq('id', userId).maybeSingle();
  return String(data?.user_role ?? '').toLowerCase() === 'super_admin';
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function createPartnerBenefitOffer(
  input: Omit<
    PartnerBenefitOffer,
    'id' | 'status' | 'partnerResponseNote' | 'respondedAt' | 'createdAt' | 'validationDeadlineAt'
  > & { status?: PartnerBenefitOfferStatus },
): Promise<PartnerBenefitOffer> {
  const createdAt = new Date().toISOString();
  const status = input.status ?? 'pending';
  const offer = normalizeOffer({
    ...input,
    id: `pbo-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    status,
    partnerResponseNote: null,
    respondedAt: status === 'accepted' ? createdAt : null,
    createdAt,
    validationDeadlineAt: createdAt,
  });
  const all = await loadAll();
  all.unshift(offer);
  await saveAll(all);
  void upsertRemotePartnerOffer(offer).catch((err) => {
    console.warn('[PartnerBenefitOffer] sync distante:', err);
  });
  if (status === 'pending') {
    let recipientPhone: string | null = null;
    if (isSupabaseConfigured() && supabase && /^[0-9a-f-]{36}$/i.test(offer.partnerUserId)) {
      const { data } = await supabase
        .from('users')
        .select('phone_number')
        .eq('id', offer.partnerUserId)
        .maybeSingle();
      recipientPhone = data?.phone_number ? String(data.phone_number).trim() : null;
    }
    void appendUserNotification(offer.partnerUserId, {
      title: 'Privilège à valider',
      message: buildPartnerBenefitOfferNotificationMessage(offer),
      audience: 'partner',
    }, { recipientPhone }).catch((err) => {
      console.warn('[PartnerBenefitOffer] notification partenaire:', err);
    });
  }
  return offer;
}

/** Envoie une demande de validation pour chaque partenaire associé à un privilège catalogue. */
export async function proposeCatalogBenefitsToPartners(
  catalogItem: Pick<BenefitCatalogItem, 'id' | 'title' | 'description' | 'countryCode' | 'city' | 'defaultValidityDays' | 'benefitKind'>,
  partners: BenefitOfferingPartner[],
): Promise<PartnerBenefitOffer[]> {
  const created: PartnerBenefitOffer[] = [];

  for (const partner of partners) {
    const partnerUserId =
      (await resolvePartnerUserIdForSync(partner.partnerId, partner.displayName)) ?? partner.partnerId;
    const selfAssign = await isSuperAdminPartnerUser(partnerUserId);
    const existing = await findExistingOffer(catalogItem.id, partnerUserId, partner.displayName);
    if (existing && (existing.status === 'pending' || isPartnerOfferActive(existing.status))) {
      continue;
    }

    // THE LOOP (super admin) : offre acceptée + catalogue activé dès que toutes les offres sont réglées
    const offer = await createPartnerBenefitOffer({
      partnerUserId,
      partnerName: partner.displayName,
      catalogId: catalogItem.id,
      catalogTitle: catalogItem.title,
      catalogDescription: catalogItem.description,
      countryCode: catalogItem.countryCode ?? 'GN',
      city: catalogItem.city ?? null,
      adminNote: selfAssign ? 'Affectation THE LOOP (super admin)' : null,
      contentId: partner.contentId ?? null,
      contentType: partner.contentType ?? null,
      contentTitle: partner.contentTitle ?? null,
      defaultValidityDays: catalogItem.defaultValidityDays ?? null,
      benefitKind: catalogItem.benefitKind ?? null,
      status: selfAssign ? 'accepted' : 'pending',
    });
    created.push(offer);
  }

  const catalogOffers = (await loadAll()).filter((o) => o.catalogId === catalogItem.id);
  const hasPending = catalogOffers.some((o) => o.status === 'pending');
  const hasAccepted = catalogOffers.some((o) => isPartnerOfferActive(o.status));

  if (hasAccepted && !hasPending) {
    await updateBenefitCatalogItem(catalogItem.id, { isActive: true });
  } else if (hasPending) {
    const item = await getBenefitCatalogItem(catalogItem.id);
    if (item?.isActive) {
      await updateBenefitCatalogItem(catalogItem.id, { isActive: false });
    }
  }
  return created;
}

/** Met à jour le snapshot des offres (pending / refusé / archivé) après édition catalogue. */
export async function syncPendingOffersFromCatalog(catalogItem: BenefitCatalogItem): Promise<void> {
  const all = await loadAll();
  let changed = false;
  const next = all.map((offer) => {
    if (offer.catalogId !== catalogItem.id) return offer;
    // Les offres déjà acceptées gardent leur snapshot historique sauf si on force le refresh titre
    if (offer.status === 'accepted' || offer.status === 'auto_accepted') {
      // Mettre à jour titre/description pour cohérence admin Validations / partenaire
      changed = true;
      return {
        ...offer,
        catalogTitle: catalogItem.title,
        catalogDescription: catalogItem.description,
        countryCode: catalogItem.countryCode ?? offer.countryCode,
        city: catalogItem.city ?? null,
        defaultValidityDays: catalogItem.defaultValidityDays,
        benefitKind: catalogItem.benefitKind,
      };
    }
    changed = true;
    const partnerSnapshot = catalogItem.offeringPartners.find(
      (p) => p.partnerId === offer.partnerUserId || p.displayName === offer.partnerName,
    );
    return {
      ...offer,
      catalogTitle: catalogItem.title,
      catalogDescription: catalogItem.description,
      countryCode: catalogItem.countryCode ?? offer.countryCode,
      city: catalogItem.city ?? null,
      defaultValidityDays: catalogItem.defaultValidityDays,
      benefitKind: catalogItem.benefitKind,
      contentId: partnerSnapshot?.contentId ?? offer.contentId,
      contentType: partnerSnapshot?.contentType ?? offer.contentType,
      contentTitle: partnerSnapshot?.contentTitle ?? offer.contentTitle,
    };
  });
  if (changed) await saveAll(next);
}

async function deactivateCatalogIfNoActiveOffers(catalogId: string): Promise<void> {
  const all = await loadAll();
  const stillActive = all.some((o) => o.catalogId === catalogId && isPartnerOfferActive(o.status));
  if (stillActive) return;
  const item = await getBenefitCatalogItem(catalogId);
  if (item?.isActive) {
    await updateBenefitCatalogItem(catalogId, { isActive: false }, { syncMode: 'partner' });
  }
}

export async function acceptPartnerBenefitOffer(offer: PartnerBenefitOffer): Promise<PartnerBenefitOffer> {
  const current = normalizeOffer(offer);
  if (current.status !== 'pending') {
    throw new Error('Cette demande n\'est plus en attente de validation.');
  }

  const lockKey = partnerOfferResponseLockKey(current.id, current.partnerUserId);
  if (inFlightPartnerOfferResponses.has(lockKey)) {
    throw new Error('Validation déjà en cours — patientez quelques secondes.');
  }
  inFlightPartnerOfferResponses.add(lockKey);

  await ensurePartnerSupabaseSession();
  if (__DEV__) {
    console.log('[PartnerBenefitOffers] accept start', {
      id: current.id,
      catalogId: current.catalogId,
    });
  }

  try {
    const remoteRes = await respondPartnerBenefitOfferViaSupabase(current, true);
    if (!remoteRes.ok) {
      if (__DEV__) {
        console.warn('[PartnerBenefitOffers] accept failed', remoteRes.error);
      }
      throw new Error(remoteRes.error ?? 'Activation impossible — vérifiez votre connexion.');
    }

    invalidatePartnerBenefitOffersRemoteCache();

    const next: PartnerBenefitOffer = {
      ...current,
      status: 'accepted',
      partnerResponseNote: null,
      respondedAt: new Date().toISOString(),
    };

    void (async () => {
      try {
        const all = await loadAll();
        const idx = all.findIndex((o) => o.id === next.id);
        if (idx >= 0) all[idx] = next;
        else all.push(next);
        await saveAll(all);
      } catch (err) {
        console.warn('[PartnerBenefitOffers] save accept:', err instanceof Error ? err.message : err);
      }
    })();

    void runPartnerOfferRespondSideEffects(current, next, true, null).catch((err) => {
      console.warn('[PartnerBenefitOffers] post-accept:', err instanceof Error ? err.message : err);
    });

    if (__DEV__) {
      console.log('[PartnerBenefitOffers] accept ok', { catalogId: next.catalogId });
    }
    return next;
  } finally {
    inFlightPartnerOfferResponses.delete(lockKey);
  }
}

export async function respondPartnerBenefitOffer(
  offerId: string,
  partnerUserId: string,
  accept: boolean,
  note?: string,
  offerHint?: PartnerBenefitOffer | null,
): Promise<PartnerBenefitOffer | null> {
  await ensurePartnerSupabaseSession();

  const trimmedNote = note?.trim() || null;
  if (!accept && !trimmedNote) {
    return null;
  }

  let current: PartnerBenefitOffer | null = offerHint ? normalizeOffer(offerHint) : null;
  if (current && offerId && current.id !== offerId) {
    current = null;
  }

  const all = await loadAll();
  if (!current) {
    const identity = await resolvePartnerIdentity(partnerUserId, '');
    const idx = findOfferIndexForPartner(all, offerId, partnerUserId, identity);
    if (idx >= 0) current = all[idx];
  }

  if (!current && isSupabaseConfigured()) {
    const authUserId = await resolvePartnerAuthUserId(null);
    if (authUserId) {
      const cached = await loadPartnerOffersRpcCache(authUserId);
      current = cached?.find((o) => o.id === offerId) ?? null;
      if (!current) {
        invalidatePartnerBenefitOffersRemoteCache();
        const load = await fetchPartnerBenefitOffersViaSupabase();
        if (load.rpcOk) {
          current = load.offers.find((o) => o.id === offerId) ?? null;
        }
      }
    }
  }

  if (!current || current.status !== 'pending') {
    if (__DEV__) {
      console.warn('[PartnerBenefitOffers] respond: offre introuvable ou déjà traitée', { offerId });
    }
    return null;
  }

  const lockKey = partnerOfferResponseLockKey(offerId, partnerUserId);
  if (inFlightPartnerOfferResponses.has(lockKey)) {
    return null;
  }
  inFlightPartnerOfferResponses.add(lockKey);

  try {
    const remoteRes = await respondRemotePartnerOffer(current, accept, trimmedNote, partnerUserId);
    if (!remoteRes.ok) {
      throw new Error(remoteRes.error ?? 'Réponse serveur impossible');
    }
    invalidatePartnerBenefitOffersRemoteCache();

    const next: PartnerBenefitOffer = {
      ...current,
      status: accept ? 'accepted' : 'declined',
      partnerResponseNote: trimmedNote,
      respondedAt: new Date().toISOString(),
    };

    const identity = await resolvePartnerIdentity(partnerUserId, current.partnerName ?? '');
    const idx = findOfferIndexForPartner(all, offerId, partnerUserId, identity);
    if (idx >= 0) {
      all[idx] = next;
    } else if (all.some((o) => o.id === offerId)) {
      const byId = all.findIndex((o) => o.id === offerId);
      if (byId >= 0) all[byId] = next;
      else all.push(next);
    } else {
      all.push(next);
    }
    void saveAll(all).catch((err) => {
      console.warn('[PartnerBenefitOffers] save local:', err instanceof Error ? err.message : err);
    });
    void upsertRemotePartnerOffer(next).catch((err) => {
      console.warn('[PartnerBenefitOffer] sync réponse:', err);
    });

    void runPartnerOfferRespondSideEffects(current, next, accept, trimmedNote).catch((err) => {
      console.warn('[PartnerBenefitOffers] post-respond:', err instanceof Error ? err.message : err);
    });

    return next;
  } finally {
    inFlightPartnerOfferResponses.delete(lockKey);
  }
}

async function runPartnerOfferRespondSideEffects(
  current: PartnerBenefitOffer,
  next: PartnerBenefitOffer,
  accept: boolean,
  trimmedNote: string | null,
): Promise<void> {
  if (!accept) {
    await removePartnerFromCatalogItem(current.catalogId, current.partnerUserId, current.partnerName);
    await deactivateCatalogIfNoActiveOffers(current.catalogId);
    await notifyAdminUsers({
      title: 'Partenaire a refusé un privilège',
      message: `${next.partnerName} a refusé « ${next.catalogTitle} ». Motif : ${trimmedNote}`,
    });
    return;
  }

  const catalogLocalId = resolvePartnerOfferCatalogLocalId(current);
  await updateBenefitCatalogItem(catalogLocalId || current.catalogId, { isActive: true }, { syncMode: 'partner' });
  if (isSupabaseConfigured() && catalogLocalId) {
    const activation = await acceptPartnerCatalogOfferViaSupabase(catalogLocalId);
    if (!activation.ok && __DEV__) {
      console.warn('[PartnerBenefitOffers] activation catalogue:', activation.error);
    }
  }
  invalidateBenefitCatalogCache();
  await notifyAdminUsers({
    title: 'Privilège validé par le partenaire',
    message: `${next.partnerName} a accepté « ${next.catalogTitle} ». Le privilège est maintenant actif.`,
  });
}

/** Remet une demande refusée / archivée en « en cours de validation ». */
export async function resendPartnerBenefitOffer(offerId: string): Promise<PartnerBenefitOffer | null> {
  const all = await loadAll();
  const idx = all.findIndex((o) => o.id === offerId);
  if (idx < 0) return null;
  const prev = all[idx];
  if (prev.status !== 'declined' && prev.status !== 'disabled') return null;

  const createdAt = new Date().toISOString();
  const catalog = await listBenefitCatalog(false);
  const item = catalog.find((c) => c.id === prev.catalogId);
  const partnerSnapshot = item?.offeringPartners.find(
    (p) => p.partnerId === prev.partnerUserId || p.displayName === prev.partnerName,
  );

  const next: PartnerBenefitOffer = {
    ...prev,
    status: 'pending',
    partnerResponseNote: null,
    respondedAt: null,
    createdAt,
    validationDeadlineAt: createdAt,
    catalogTitle: item?.title ?? prev.catalogTitle,
    catalogDescription: item?.description ?? prev.catalogDescription,
    countryCode: item?.countryCode ?? prev.countryCode,
    city: item?.city ?? prev.city,
    defaultValidityDays: item?.defaultValidityDays ?? prev.defaultValidityDays,
    benefitKind: item?.benefitKind ?? prev.benefitKind,
    contentId: partnerSnapshot?.contentId ?? prev.contentId,
    contentType: partnerSnapshot?.contentType ?? prev.contentType,
    contentTitle: partnerSnapshot?.contentTitle ?? prev.contentTitle,
  };
  all[idx] = next;
  await saveAll(all);
  void upsertRemotePartnerOffer(next).catch((err) => {
    console.warn('[PartnerBenefitOffer] sync renvoi:', err);
  });

  void appendUserNotification(prev.partnerUserId, {
    title: 'Privilège à revalider',
    message: buildPartnerBenefitOfferNotificationMessage(next),
    audience: 'partner',
  }).catch((err) => {
    console.warn('[PartnerBenefitOffer] notification renvoi:', err);
  });

  if (item) {
    const exists = item.offeringPartners.some(
      (p) => p.partnerId === prev.partnerUserId || p.displayName === prev.partnerName,
    );
    if (!exists) {
      const { addPartnerToCatalogItem } = await import('@/lib/benefit-catalog-store');
      await addPartnerToCatalogItem(prev.catalogId, {
        partnerId: prev.partnerUserId,
        displayName: prev.partnerName,
        contentId: next.contentId,
        contentType: next.contentType,
        contentTitle: next.contentTitle,
      });
    }
    if (item.isActive) {
      await updateBenefitCatalogItem(prev.catalogId, { isActive: false });
    }
  }

  return next;
}

/** Archive (désactive) une offre — ne valide pas le partenaire. */
export async function disablePartnerBenefitOffer(offerId: string): Promise<PartnerBenefitOffer | null> {
  const all = await loadAll();
  const idx = all.findIndex((o) => o.id === offerId);
  if (idx < 0) return null;
  const prev = all[idx];
  const next: PartnerBenefitOffer = { ...prev, status: 'disabled', respondedAt: new Date().toISOString() };
  all[idx] = next;
  await saveAll(all);
  await removePartnerFromCatalogItem(prev.catalogId, prev.partnerUserId, prev.partnerName);
  await deactivateCatalogIfNoActiveOffers(prev.catalogId);
  await appendUserNotification(prev.partnerUserId, {
    title: 'Privilège archivé',
    message: `« ${prev.catalogTitle} » a été retiré par THE LOOP.`,
    audience: 'partner',
  });
  return next;
}

/** Le partenaire désactive lui-même un privilège qu'il offrait. */
export async function partnerDisableOwnBenefitOffer(
  offerId: string,
  partnerUserId: string,
): Promise<PartnerBenefitOffer | null> {
  const all = await loadAll();
  const identity = await resolvePartnerIdentity(partnerUserId, '');
  const idx = findOfferIndexForPartner(all, offerId, partnerUserId, identity);
  if (idx < 0) return null;
  const prev = all[idx];
  if (prev.status !== 'accepted' && prev.status !== 'auto_accepted') return null;
  const next: PartnerBenefitOffer = {
    ...prev,
    status: 'disabled',
    partnerResponseNote: prev.partnerResponseNote ?? 'Désactivé par le partenaire',
    respondedAt: new Date().toISOString(),
  };
  all[idx] = next;
  await saveAll(all);
  await removePartnerFromCatalogItem(prev.catalogId, prev.partnerUserId, prev.partnerName);
  await deactivateCatalogIfNoActiveOffers(prev.catalogId);
  await notifyAdminUsers({
    title: 'Partenaire a désactivé un privilège',
    message: `${prev.partnerName} a désactivé « ${prev.catalogTitle} ».`,
  });
  return next;
}

export const archivePartnerBenefitOffer = disablePartnerBenefitOffer;

/** Supprime définitivement une demande de validation (catalogue inactif Supabase + cache local). */
export async function deletePartnerBenefitOffer(offerId: string): Promise<boolean> {
  let all = await loadAll();
  let offer = all.find((o) => o.id === offerId);

  if (!offer) {
    const remote = await fetchRemoteOffersForAdmin();
    offer = remote?.find((o) => o.id === offerId);
    if (!offer) return false;
  }

  const catalogId = offer.catalogId;
  const item = await getBenefitCatalogItem(catalogId);
  let remoteDeleted = false;

  if (item && !item.isActive) {
    remoteDeleted = await forceDeleteBenefitCatalogRemote(catalogId);
    await deleteBenefitCatalogItem(catalogId);
  } else if (item) {
    const updated = await removePartnerFromCatalogItem(
      catalogId,
      offer.partnerUserId,
      offer.partnerName,
    );
    if (updated) {
      await updateBenefitCatalogItem(
        catalogId,
        { offeringPartners: updated.offeringPartners, isActive: updated.isActive },
        { syncMode: 'admin' },
      );
      remoteDeleted = true;
    }
  } else {
    remoteDeleted = await forceDeleteBenefitCatalogRemote(catalogId);
    await deleteBenefitCatalogItem(catalogId);
  }

  if (!remoteDeleted && __DEV__) {
    console.warn('[PartnerBenefitOffers] delete: catalogue distant peut subsister', catalogId);
  }

  await dismissPendingCatalogId(catalogId);
  await purgeBenefitOfferNotifications(offer);

  all = await loadAll();
  const partnerNorm = offer.partnerName.trim().toLowerCase();
  const next = all.filter((o) => {
    if (o.id === offerId) return false;
    if (o.catalogId !== catalogId || o.status !== 'pending') return true;
    if (o.partnerUserId === offer.partnerUserId) return false;
    if (partnerNorm && o.partnerName.trim().toLowerCase() === partnerNorm) return false;
    return true;
  });
  await saveAll(next);

  if (offer.status === 'pending') {
    void appendUserNotification(offer.partnerUserId, {
      title: 'Demande d\'privilège annulée',
      message: `La proposition « ${offer.catalogTitle} » a été supprimée par THE LOOP.`,
      audience: 'partner',
    }).catch(() => {});
  }

  return true;
}

export async function deletePartnerBenefitOffersForCatalog(catalogId: string): Promise<number> {
  const all = await loadAll();
  const next = all.filter((o) => o.catalogId !== catalogId);
  const removed = all.length - next.length;
  if (removed > 0) await saveAll(next);
  return removed;
}

/** Retire les offres partenaire liées à un contenu supprimé (UUID publié ou local_id). */
export async function purgePartnerBenefitOffersForContentIds(contentIds: string[]): Promise<number> {
  const targets = new Set(contentIds.filter(Boolean));
  if (!targets.size) return 0;
  const all = await loadAll();
  const next = all.filter((o) => !o.contentId || !targets.has(o.contentId));
  const removed = all.length - next.length;
  if (removed > 0) await saveAll(next);
  return removed;
}
