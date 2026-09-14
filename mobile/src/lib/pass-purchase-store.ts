import {
  resolvePassActivationType,
  sendPassActivationNotification,
} from '@/lib/pass-activation-messages-store';
import { getMaxPendingPasses } from '@/lib/pass-shop-settings-store';
import {
  getActiveSubscription,
  getPendingSubscriptions,
  loadSubscriptionHistory,
  passDisplayLabel,
  purchasePrimePass as purchasePrimePassCore,
  synchronizeSubscriptionHistory,
  type PassPaymentMethod,
  type PurchasePassResult,
  type SubscriptionRecord,
} from '@/lib/subscription-history';
import { syncUserDbRoleIfNeeded, fetchUserPrimeRoleLocked } from '@/lib/user-role-sync';
import { findRegistryUserById, updateRegistrySubscription } from '@/lib/user-registry-store';
import { hydrateAndSyncPassGrantsFromSupabase, syncPassRecordToSupabase } from '@/lib/pass-admin-store';
import { sendPassPurchaseNotification } from '@/lib/user-notifications-store';
import type { CountryCode } from '@/lib/countries';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';
import { resolveCountryCode } from '@/lib/country-settings-keys';
import type { PrimeBillingPeriod } from '@/lib/prime-plans';

async function notifyPassActivation(
  userId: string,
  record: SubscriptionRecord,
  firstName?: string | null,
  countryCode?: CountryCode,
): Promise<void> {
  const registry = firstName == null ? await findRegistryUserById(userId) : null;
  await sendPassActivationNotification({
    userId,
    firstName: firstName ?? registry?.firstName ?? null,
    passLabel: passDisplayLabel(record),
    passType: resolvePassActivationType(record),
    passCatalogId: record.passCatalogId ?? null,
    record,
    countryCode: resolveCountryCode(countryCode ?? registry?.countryCode),
  });
}

/** Notification à chaque achat (actif immédiat ou file d’attente). */
async function notifyPassPurchase(
  userId: string,
  record: SubscriptionRecord,
  kind: 'activated' | 'queued',
  firstName?: string | null,
): Promise<void> {
  const registry = firstName == null ? await findRegistryUserById(userId) : null;
  await sendPassPurchaseNotification({
    userId,
    passLabel: passDisplayLabel(record),
    firstName: firstName ?? registry?.firstName ?? null,
    kind,
    expiresAt: record.expiresAt ?? null,
    scheduledStartAt: record.scheduledStartAt ?? null,
  });
}

/** Sync historique + notifie si un PASS en file vient de s’activer. */
export async function syncPassHistoryWithNotifications(
  userId: string,
  firstName?: string | null,
  countryCode?: CountryCode,
): Promise<SubscriptionRecord[]> {
  const before = await loadSubscriptionHistory(userId);
  const beforeActive = getActiveSubscription(before, 'prime');
  const history = await synchronizeSubscriptionHistory(userId);
  const afterActive = getActiveSubscription(history, 'prime');
  if (afterActive && afterActive.id !== beforeActive?.id) {
    const registry = await findRegistryUserById(userId);
    const cc = resolveCountryCode(countryCode ?? registry?.countryCode ?? DEFAULT_COUNTRY_CODE);
    const roleLocked =
      (await fetchUserPrimeRoleLocked(userId)) || registry?.adminRoleLocked === true;
    if (!roleLocked) {
      await notifyPassActivation(userId, afterActive, firstName, cc);
      if (afterActive.type === 'prime') {
        await updateRegistrySubscription(
          userId,
          'active',
          afterActive.expiresAt ?? null,
          'USER_PRIME',
          'prime',
        );
        await syncUserDbRoleIfNeeded(userId, 'prime');
        void syncPassRecordToSupabase(afterActive, userId);
      }
    }
  }
  return history;
}

/**
 * Achat PASS (immédiat ou file d’attente) + sync rôle + notification d’achat.
 */
export async function purchasePrimePassWithSideEffects(
  userId: string,
  period: PrimeBillingPeriod,
  paymentMethod: PassPaymentMethod,
  firstName?: string | null,
  countryCode?: CountryCode,
): Promise<PurchasePassResult> {
  const maxPending = await getMaxPendingPasses(countryCode ?? DEFAULT_COUNTRY_CODE);
  const result = await purchasePrimePassCore(userId, period, paymentMethod, { maxPending, countryCode });

  if (result.activated) {
    await updateRegistrySubscription(
      userId,
      'active',
      result.activated.expiresAt ?? null,
      'USER_PRIME',
      'prime',
    );
    await syncUserDbRoleIfNeeded(userId, 'prime');
    const cloudSync = await syncPassRecordToSupabase(result.activated, userId);
    if (!cloudSync.ok) {
      console.warn('[PassPurchase] sync user_pass_grants:', cloudSync.error);
    }
    await notifyPassPurchase(userId, result.activated, 'activated', firstName);
  } else if (result.queued) {
    const cloudSync = await syncPassRecordToSupabase(result.queued, userId);
    if (!cloudSync.ok) {
      console.warn('[PassPurchase] sync pending user_pass_grants:', cloudSync.error);
    }
    await notifyPassPurchase(userId, result.queued, 'queued', firstName);
  }

  return result;
}

export async function countPendingPasses(userId: string): Promise<number> {
  const history = await synchronizeSubscriptionHistory(userId);
  return getPendingSubscriptions(history, 'prime').length;
}

/** Après paiement Djomy confirmé par le webhook serveur — sync cloud → local. */
export async function syncPassAfterDjomyPayment(
  userId: string,
  firstName?: string | null,
): Promise<PurchasePassResult> {
  await hydrateAndSyncPassGrantsFromSupabase(userId);
  const history = await syncPassHistoryWithNotifications(userId, firstName);
  const activated = getActiveSubscription(history, 'prime') ?? null;
  const queued =
    history.find((r) => r.type === 'prime' && r.status === 'pending' && r.paidAt) ?? null;
  return {
    history,
    activated,
    queued,
    activePrime: activated ?? undefined,
  };
}
