import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  computeSubscriptionExpiry,
  primePlanLabel,
  type PrimeBillingPeriod,
} from '@/lib/prime-plans';
import { DEFAULT_COUNTRY_CODE, type CountryCode } from '@/lib/countries';
import { getPassPrices } from '@/lib/pass-pricing-store';
import { DEFAULT_MAX_PENDING_PASSES } from '@/lib/pass-shop-settings-store';
import type { SubscriptionStatus } from '@/types';

export const HERITAGE_PASS_LABEL = 'PASS Heritage';
export const INTERMEDIATE_PASS_LABEL = 'PASS intermédiaire';

export type PassKind = 'standard' | 'heritage' | 'bonus' | 'custom' | 'intermediate';
export type SubscriptionPlanType = 'prime' | 'partner';
export type PassPaymentMethod =
  | 'all'
  | 'orange_money'
  | 'mtn_momo'
  | 'soutra_money'
  | 'paycard'
  | 'card';

export interface SubscriptionRecord {
  id: string;
  type: SubscriptionPlanType;
  status: SubscriptionStatus;
  startedAt: string;
  expiresAt: string | null;
  label: string;
  billingPeriod?: PrimeBillingPeriod;
  amountGnf?: number;
  paymentMethod?: PassPaymentMethod;
  paidAt?: string | null;
  /** Début prévu pour un PASS en file d'attente. */
  scheduledStartAt?: string | null;
  /** PASS Heritage — sans expiration, révocable par super admin uniquement. */
  passKind?: PassKind;
  /** Référence catalogue PASS (super admin). */
  passCatalogId?: string | null;
  grantedBy?: string | null;
  grantNote?: string | null;
  /** Octroi PassIntermediaire : snapshot du PASS d'origine à restaurer. */
  frozenPassSnapshot?: SubscriptionRecord | null;
  /** Lien vers l'octroi PassIntermediaire pendant le gel. */
  roleFreezeIntermediateId?: string | null;
}

export type PurchasePassResult = {
  history: SubscriptionRecord[];
  activated: SubscriptionRecord | null;
  queued: SubscriptionRecord | null;
  activePrime: SubscriptionRecord | undefined;
};

const KEY_PREFIX = 'loop_subscriptions_';

function storageKey(userId: string) {
  return `${KEY_PREFIX}${userId}`;
}

function isActiveRecord(record: SubscriptionRecord, at = new Date()): boolean {
  if (record.status !== 'active') return false;
  // PASS Heritage / bonus : jamais expiré par date
  if (isHeritagePass(record)) return true;
  if (!record.expiresAt) return true;
  return new Date(record.expiresAt) > at;
}

function isSuspendedWithValidExpiry(record: SubscriptionRecord, at = new Date()): boolean {
  if (record.status !== 'suspended') return false;
  if (isHeritagePass(record)) return true;
  if (!record.expiresAt) return true;
  return new Date(record.expiresAt) > at;
}

function isLegacyHeritageLabel(label: string | undefined | null): boolean {
  const normalized = (label ?? '').toLowerCase();
  return (
    normalized.includes('heritage') ||
    normalized.includes('affinit') ||
    (normalized.includes('bonus') && normalized.includes('pass'))
  );
}

/** Octroi PassIntermediaire (gel admin) — visible dans PASS accordés. */
export function isRoleFreezeIntermediatePass(record: SubscriptionRecord): boolean {
  if (record.frozenPassSnapshot) return true;
  if (record.passCatalogId && /intermediaire/i.test(record.passCatalogId)) return true;
  if (/interm[eé]diaire/i.test(record.label) && Boolean(record.grantedBy)) return true;
  return false;
}

/** PASS affiché au membre (hors PassIntermediaire technique admin). */
export function getUserFacingPrimePass(
  history: SubscriptionRecord[],
): SubscriptionRecord | undefined {
  const active = history.find(
    (r) =>
      r.type === 'prime' &&
      r.status === 'active' &&
      !isRoleFreezeIntermediatePass(r),
  );
  if (active) return active;
  return getSuspendedSubscription(history, 'prime');
}

/** PASS Heritage (octroi admin sans expiration) — pas les achats ni PassIntermediaire. */
export function isHeritagePass(record: SubscriptionRecord): boolean {
  if (isRoleFreezeIntermediatePass(record)) return false;
  if (record.passKind === 'intermediate') return false;
  if (record.paymentMethod || (record.amountGnf != null && record.amountGnf > 0)) return false;
  if (record.passKind === 'heritage' || record.passKind === 'bonus') return true;
  return isLegacyHeritageLabel(record.label);
}

/** PASS acheté gelé par bascule admin (passKind intermediate legacy). */
export function isIntermediatePass(record: SubscriptionRecord): boolean {
  return record.passKind === 'intermediate' || isRoleFreezeIntermediatePass(record);
}

/** Octrois admin (Heritage, catalogue, PassIntermediaire gel) — jamais les achats membres. */
export function isAdminGrantedPass(record: SubscriptionRecord): boolean {
  if (isRoleFreezeIntermediatePass(record)) return true;
  if (record.passKind === 'intermediate') return false;
  if (record.paymentMethod || (record.amountGnf != null && record.amountGnf > 0)) return false;
  if (record.grantedBy) return true;
  return isHeritagePass(record);
}

/** @deprecated Utiliser isHeritagePass */
export function isBonusPass(record: SubscriptionRecord): boolean {
  return isHeritagePass(record);
}

/** PASS gratuit (Heritage, bonus, octroi admin, prix 0). */
export function isFreePass(record: SubscriptionRecord): boolean {
  if (isAdminGrantedPass(record)) return true;
  if (isHeritagePass(record)) return true;
  if (record.amountGnf === 0) return true;
  if (record.passKind === 'custom' && Boolean(record.grantedBy) && (record.amountGnf == null || record.amountGnf === 0)) {
    return true;
  }
  return false;
}

export function passDisplayLabel(record: SubscriptionRecord): string {
  if (isRoleFreezeIntermediatePass(record) && record.frozenPassSnapshot) {
    const orig = record.frozenPassSnapshot;
    return `${orig.label?.trim() || 'PASS'} (gelé · ${record.label})`;
  }
  if (isHeritagePass(record)) return HERITAGE_PASS_LABEL;
  if (record.passKind === 'intermediate') {
    const base = record.label?.trim() || 'PASS';
    return `${base} (gelé)`;
  }
  const label = record.label?.trim();
  return label || 'PASS';
}

/** PASS actif, suspendu (gel admin) ou PassIntermediaire — occupe le créneau Prime. */
export function passOccupiesPrimeSlot(record: SubscriptionRecord, at = new Date()): boolean {
  if (record.type !== 'prime') return false;
  if (isRoleFreezeIntermediatePass(record) && record.status === 'active') return true;
  if (record.status === 'suspended') return isSuspendedWithValidExpiry(record, at);
  if (record.status === 'active') return isActiveRecord(record, at);
  return false;
}

export function getPrimeSlotHolder(
  history: SubscriptionRecord[],
  at = new Date(),
): SubscriptionRecord | undefined {
  return history.find((r) => passOccupiesPrimeSlot(r, at));
}

function normalizeHeritageRecord(record: SubscriptionRecord): { record: SubscriptionRecord; changed: boolean } {
  if (!isHeritagePass(record)) return { record, changed: false };
  let next = record;
  let changed = false;
  if (record.passKind !== 'heritage') {
    next = { ...next, passKind: 'heritage' };
    changed = true;
  }
  if (record.label !== HERITAGE_PASS_LABEL) {
    next = { ...next, label: HERITAGE_PASS_LABEL };
    changed = true;
  }
  return { record: next, changed };
}

function normalizeHistoryRecords(records: SubscriptionRecord[]): { records: SubscriptionRecord[]; changed: boolean } {
  let changed = false;
  const normalized = records.map((record) => {
    const result = normalizeHeritageRecord(record);
    if (result.changed) changed = true;
    return result.record;
  });
  return { records: normalized, changed };
}

export async function loadSubscriptionHistory(userId: string): Promise<SubscriptionRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SubscriptionRecord[];
    if (!Array.isArray(parsed)) return [];
    const { records, changed } = normalizeHistoryRecords(parsed);
    if (changed) await saveSubscriptionHistory(userId, records);
    return records;
  } catch {
    return [];
  }
}

export async function saveSubscriptionHistory(userId: string, records: SubscriptionRecord[]) {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(records));
}

/** Expire les PASS terminés et active le prochain en attente si besoin. */
export async function synchronizeSubscriptionHistory(userId: string): Promise<SubscriptionRecord[]> {
  let history = await loadSubscriptionHistory(userId);
  const now = new Date();
  const nowIso = now.toISOString();
  let changed = false;

  const normalized = normalizeHistoryRecords(history);
  history = normalized.records;
  if (normalized.changed) changed = true;

  const updated = history.map((record) => {
    if (isHeritagePass(record)) return record;
    if (record.status === 'suspended' && record.expiresAt && new Date(record.expiresAt) <= now) {
      changed = true;
      return { ...record, status: 'expired' as SubscriptionStatus };
    }
    if (record.status === 'active' && record.expiresAt && new Date(record.expiresAt) <= now) {
      changed = true;
      return { ...record, status: 'expired' as SubscriptionStatus };
    }
    return record;
  });

  const slotHolder = getPrimeSlotHolder(updated, now);
  if (!slotHolder) {
    const pendingPrime = updated
      .filter((r) => r.type === 'prime' && r.status === 'pending')
      .sort((a, b) => {
        const sa = a.paidAt ?? a.startedAt;
        const sb = b.paidAt ?? b.startedAt;
        return sa.localeCompare(sb);
      });

    const next = pendingPrime[0];
    if (next) {
      const period = next.billingPeriod ?? 'monthly';
      const idx = updated.findIndex((r) => r.id === next.id);
      updated[idx] = {
        ...next,
        status: 'active',
        startedAt: nowIso,
        expiresAt: computeSubscriptionExpiry(period, now),
        scheduledStartAt: null,
        passKind: next.passKind === 'intermediate' ? 'standard' : next.passKind,
      };
      changed = true;
    }
  }

  if (changed) await saveSubscriptionHistory(userId, updated);
  return updated;
}

export async function upsertActiveSubscription(
  userId: string,
  record: Omit<SubscriptionRecord, 'id'> & { id?: string },
): Promise<SubscriptionRecord[]> {
  const history = await synchronizeSubscriptionHistory(userId);
  const now = new Date().toISOString();
  const updated = history.map((r) =>
    r.type === record.type && r.status === 'active'
      ? { ...r, status: 'expired' as SubscriptionStatus, expiresAt: r.expiresAt ?? now }
      : r,
  );
  const entry: SubscriptionRecord = {
    id: record.id ?? `${record.type}-${Date.now()}`,
    type: record.type,
    status: record.status,
    startedAt: record.startedAt,
    expiresAt: record.expiresAt,
    label: record.label,
    billingPeriod: record.billingPeriod,
    amountGnf: record.amountGnf,
    paymentMethod: record.paymentMethod,
    paidAt: record.paidAt,
    scheduledStartAt: record.scheduledStartAt,
    passKind: record.passKind,
    passCatalogId: record.passCatalogId,
    grantedBy: record.grantedBy,
    grantNote: record.grantNote,
  };
  updated.unshift(entry);
  await saveSubscriptionHistory(userId, updated);
  return updated;
}

export async function purchasePrimePass(
  userId: string,
  period: PrimeBillingPeriod,
  paymentMethod: PassPaymentMethod,
  options?: { maxPending?: number; countryCode?: CountryCode },
): Promise<PurchasePassResult> {
  let history = await synchronizeSubscriptionHistory(userId);
  const activePrime = history.find((r) => r.type === 'prime' && isActiveRecord(r));
  const pending = getPendingSubscriptions(history, 'prime');
  const now = new Date().toISOString();
  const prices = await getPassPrices(options?.countryCode ?? DEFAULT_COUNTRY_CODE);
  const amount = prices[period];
  const label = primePlanLabel(period);
  const maxPending = options?.maxPending ?? DEFAULT_MAX_PENDING_PASSES;

  if (activePrime && (!activePrime.expiresAt || isHeritagePass(activePrime))) {
    throw new Error(isHeritagePass(activePrime) ? 'bonus_active' : 'lifetime_active');
  }

  if (activePrime && pending.length >= maxPending) {
    throw new Error('pending_limit');
  }

  const base = {
    type: 'prime' as const,
    label,
    billingPeriod: period,
    amountGnf: amount,
    paymentMethod,
    paidAt: now,
    passKind: 'standard' as const,
  };

  if (!activePrime) {
    const entry: SubscriptionRecord = {
      id: `prime-${Date.now()}`,
      ...base,
      status: 'active',
      startedAt: now,
      expiresAt: computeSubscriptionExpiry(period),
      scheduledStartAt: null,
    };
    history = history.map((r) =>
      r.type === 'prime' && r.status === 'active'
        ? { ...r, status: 'expired' as SubscriptionStatus, expiresAt: r.expiresAt ?? now }
        : r,
    );
    history.unshift(entry);
    await saveSubscriptionHistory(userId, history);
    return { history, activated: entry, queued: null, activePrime: entry };
  }

  // Estimation d'affichage — l'activation réelle se fait à l'usage (expiration / retrait du PASS en cours)
  let estimatedQueueStart = activePrime.expiresAt ?? now;
  for (const p of pending) {
    if (p.scheduledStartAt) estimatedQueueStart = p.scheduledStartAt;
    const period = p.billingPeriod ?? 'monthly';
    const end = computeSubscriptionExpiry(period, new Date(estimatedQueueStart));
    if (end) estimatedQueueStart = end;
  }

  const entry: SubscriptionRecord = {
    id: `prime-${Date.now()}`,
    ...base,
    status: 'pending',
    startedAt: now,
    expiresAt: null,
    scheduledStartAt: estimatedQueueStart,
  };
  history.unshift(entry);
  await saveSubscriptionHistory(userId, history);
  return { history, activated: null, queued: entry, activePrime };
}

export function getActiveSubscription(
  history: SubscriptionRecord[],
  type: SubscriptionPlanType,
): SubscriptionRecord | undefined {
  return history.find((r) => r.type === type && isActiveRecord(r));
}

/** PASS suspendu par bascule admin (Prime → membre) — date de fin conservée. */
export function getSuspendedSubscription(
  history: SubscriptionRecord[],
  type: SubscriptionPlanType,
): SubscriptionRecord | undefined {
  return history.find((r) => r.type === type && isSuspendedWithValidExpiry(r));
}

/** PASS actif ou suspendu (admin) avec validité future — affichage / réaffectation. */
export function getRestorablePrimePass(
  history: SubscriptionRecord[],
): SubscriptionRecord | undefined {
  const suspended = getSuspendedSubscription(history, 'prime');
  if (suspended) return suspended;
  const intermediate = history.find(
    (r) => r.type === 'prime' && r.status === 'active' && isRoleFreezeIntermediatePass(r) && r.frozenPassSnapshot,
  );
  return intermediate?.frozenPassSnapshot ?? undefined;
}

export function getPendingSubscriptions(
  history: SubscriptionRecord[],
  type: SubscriptionPlanType,
): SubscriptionRecord[] {
  return history
    .filter((r) => r.type === type && r.status === 'pending')
    .sort((a, b) => {
      const sa = a.scheduledStartAt ?? a.paidAt ?? a.startedAt;
      const sb = b.scheduledStartAt ?? b.paidAt ?? b.startedAt;
      return sa.localeCompare(sb);
    });
}

export function getPastSubscriptions(
  history: SubscriptionRecord[],
  type: SubscriptionPlanType,
  active?: SubscriptionRecord,
  pending: SubscriptionRecord[] = [],
): SubscriptionRecord[] {
  const skip = new Set([active?.id, ...pending.map((p) => p.id)].filter(Boolean));
  return history.filter((r) => r.type === type && !skip.has(r.id) && r.status !== 'pending' && r.status !== 'active');
}

/** Au moins une ligne PASS Prime en base (tout statut). */
export function hasPrimePassHistory(history: SubscriptionRecord[]): boolean {
  return history.some((r) => r.type === 'prime');
}

/**
 * Profil membre : afficher « Mon PASS » seulement si le membre a déjà eu un PASS
 * (achat, file d’attente payée, octroi admin activé/expiré) — pas les comptes neufs.
 */
export function hasMeaningfulPrimePassHistory(history: SubscriptionRecord[]): boolean {
  return history.some((r) => {
    if (r.type !== 'prime') return false;
    const purchased =
      Boolean(r.paymentMethod) ||
      Boolean(r.paidAt) ||
      (r.amountGnf != null && r.amountGnf > 0);
    if (purchased) return true;
    if (isAdminGrantedPass(r)) {
      return r.status === 'active' || r.status === 'expired' || r.status === 'suspended';
    }
    return false;
  });
}

/** PASS achetés (hors octrois admin gratuits) pour l’historique membre. */
export function getPurchasedPassHistory(
  history: SubscriptionRecord[],
  type: SubscriptionPlanType = 'prime',
): SubscriptionRecord[] {
  return history
    .filter((r) => {
      if (r.type !== type) return false;
      if (isAdminGrantedPass(r) && (r.amountGnf == null || r.amountGnf === 0) && !r.paymentMethod) {
        return false;
      }
      return Boolean(r.paymentMethod) || (r.amountGnf != null && r.amountGnf > 0);
    })
    .sort((a, b) => (b.paidAt ?? b.startedAt).localeCompare(a.paidAt ?? a.startedAt));
}

export function formatPassAmount(amountGnf?: number): string {
  if (amountGnf == null) return '—';
  return `${amountGnf.toLocaleString('fr-FR')} GNF`;
}

export const PASS_PAYMENT_LABELS: Record<PassPaymentMethod, string> = {
  all: 'Portail de paiement',
  orange_money: 'Orange Money',
  mtn_momo: 'MTN MoMo',
  soutra_money: 'Soutra Money',
  paycard: 'PayCard',
  card: 'Carte bancaire',
};

/** Ordre d'affichage — aligné sur l'API gateway Djomy (OM, MOMO, SOUTRA_MONEY, PAYCARD, CARD). */
export const PASS_PAYMENT_METHODS_ORDER: PassPaymentMethod[] = [
  'all',
  'orange_money',
  'mtn_momo',
  'soutra_money',
  'paycard',
  'card',
];
