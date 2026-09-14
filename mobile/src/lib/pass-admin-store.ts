import {

  resolvePassActivationType,

  sendPassActivationNotification,

} from '@/lib/pass-activation-messages-store';

import { type CountryCode } from '@/lib/countries';
import { resolveCountryCode } from '@/lib/country-settings-keys';

import {
  computePassCatalogExpiry,
  getPassCatalogEntry,
  HERITAGE_CATALOG_ID,
  resolveIntermediatePassCatalog,
  type PassCatalogEntry,
} from '@/lib/pass-catalog-store';

import {
  getActiveSubscription,
  getSuspendedSubscription,
  isAdminGrantedPass,
  isHeritagePass,
  isRoleFreezeIntermediatePass,
  loadSubscriptionHistory,
  passDisplayLabel,
  saveSubscriptionHistory,
  synchronizeSubscriptionHistory,
  upsertActiveSubscription,
  type SubscriptionRecord,
} from '@/lib/subscription-history';

import { isNetworkOnline } from '@/lib/offline-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

import { syncUserDbRoleIfNeeded } from '@/lib/user-role-sync';

import { findRegistryUserById, listRegistryUsers, updateRegistrySubscription } from '@/lib/user-registry-store';



export { HERITAGE_CATALOG_ID };

export { HERITAGE_PASS_LABEL } from '@/lib/subscription-history';



export interface GrantedPassRow {

  userId: string;

  userName: string;

  userPhone: string | null;

  pass: SubscriptionRecord;

  catalogLabel: string;

}



export type BonusPassGrant = GrantedPassRow;



async function syncPassRoleToSupabase(userId: string, dbRole: 'prime' | 'member'): Promise<void> {

  await syncUserDbRoleIfNeeded(userId, dbRole);

}



function catalogPassKind(catalog: PassCatalogEntry): SubscriptionRecord['passKind'] {
  if (catalog.id === HERITAGE_CATALOG_ID) return 'heritage';
  // PASS gratuit sans date = même famille que Heritage (offert)
  if (catalog.priceGnf === 0 && catalog.validityDays == null) return 'bonus';
  return 'custom';
}

export function mapPassGrantCloudStatus(entry: SubscriptionRecord): string {
  if (entry.passKind === 'intermediate' || isRoleFreezeIntermediatePass(entry)) return 'suspended';
  if (entry.status === 'active') return 'active';
  if (entry.status === 'pending') return 'pending';
  if (entry.status === 'suspended') return 'suspended';
  return 'expired';
}

function parseGrantedByUuid(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return value;
  }
  return null;
}

function buildPassPurchaseRpcPayload(entry: SubscriptionRecord, targetUserId: string) {
  const passCatalogId = entry.passCatalogId ?? entry.billingPeriod ?? 'standard';
  return {
    p_user_id: targetUserId,
    p_pass_catalog_id: passCatalogId,
    p_label: entry.label,
    p_pass_kind: entry.passKind ?? 'custom',
    p_status: mapPassGrantCloudStatus(entry),
    p_started_at: entry.startedAt,
    p_expires_at: entry.expiresAt,
    p_local_id: entry.id,
    p_amount_gnf: entry.amountGnf ?? null,
    p_payment_method: entry.paymentMethod ?? null,
    p_paid_at: entry.paidAt ?? null,
    p_billing_period: entry.billingPeriod ?? null,
    p_scheduled_start_at: entry.scheduledStartAt ?? null,
  };
}

function buildPassGrantAdminRpcPayload(entry: SubscriptionRecord, targetUserId: string) {
  const passCatalogId = entry.passCatalogId ?? entry.billingPeriod ?? 'standard';
  const grantedByUuid = parseGrantedByUuid(entry.grantedBy);
  const grantNote =
    entry.grantNote ??
    (entry.grantedBy && !grantedByUuid ? `[ref:${entry.grantedBy}]` : null);
  return {
    p_user_id: targetUserId,
    p_pass_catalog_id: passCatalogId,
    p_label: entry.label,
    p_pass_kind: entry.passKind ?? 'custom',
    p_status: mapPassGrantCloudStatus(entry),
    p_started_at: entry.startedAt,
    p_expires_at: entry.expiresAt,
    p_granted_by: grantedByUuid,
    p_grant_note: grantNote,
    p_local_id: entry.id,
    p_amount_gnf: entry.amountGnf ?? null,
    p_payment_method: entry.paymentMethod ?? null,
    p_paid_at: entry.paidAt ?? null,
    p_billing_period: entry.billingPeriod ?? null,
    p_scheduled_start_at: entry.scheduledStartAt ?? null,
    p_frozen_pass_snapshot: entry.frozenPassSnapshot ?? null,
    p_role_freeze_intermediate_id: entry.roleFreezeIntermediateId ?? null,
  };
}

async function bulkUpdatePassGrantsInSupabase(
  targetUserId: string,
  newStatus: string,
  matchStatuses: string[],
  options?: { excludeCatalogId?: string; onlyCatalogId?: string; onlyUnexpired?: boolean },
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const { error } = await supabase.rpc('bulk_update_user_pass_grants', {
    p_user_id: targetUserId,
    p_new_status: newStatus,
    p_match_statuses: matchStatuses,
    p_exclude_catalog_id: options?.excludeCatalogId ?? null,
    p_only_catalog_id: options?.onlyCatalogId ?? null,
    p_only_unexpired: options?.onlyUnexpired ?? false,
  });
  if (error) console.warn('[PassGrant] bulk update:', error.message);
}

async function persistPassGrantToSupabase(
  entry: SubscriptionRecord,
  targetUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'Supabase non configuré' };
  }
  const cloudStatus = mapPassGrantCloudStatus(entry);
  const passCatalogId = entry.passCatalogId ?? entry.billingPeriod ?? 'standard';
  const passKind = entry.passKind ?? 'custom';

  const { data: sessionData } = await supabase.auth.getSession();
  const authUserId = sessionData.session?.user?.id ?? null;
  const isSelfPurchase =
    !entry.grantedBy &&
    authUserId === targetUserId &&
    (entry.paymentMethod != null ||
      (entry.amountGnf != null && entry.amountGnf > 0) ||
      entry.status === 'pending');

  if (isSelfPurchase) {
    const { error } = await supabase.rpc(
      'upsert_user_pass_purchase',
      buildPassPurchaseRpcPayload(entry, targetUserId),
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (entry.grantedBy || entry.grantNote) {
    const { error } = await supabase.rpc(
      'upsert_user_pass_grant_admin',
      buildPassGrantAdminRpcPayload(entry, targetUserId),
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const row = {
    user_id: targetUserId,
    pass_catalog_id: passCatalogId,
    label: entry.label,
    pass_kind: passKind,
    status: cloudStatus,
    started_at: entry.startedAt,
    expires_at: entry.expiresAt,
    granted_by: parseGrantedByUuid(entry.grantedBy),
    grant_note: entry.grantNote ?? null,
    local_id: entry.id,
    amount_gnf: entry.amountGnf ?? null,
    payment_method: entry.paymentMethod ?? null,
    paid_at: entry.paidAt ?? null,
    billing_period: entry.billingPeriod ?? null,
    scheduled_start_at: entry.scheduledStartAt ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await supabase
    .from('user_pass_grants')
    .select('id')
    .eq('local_id', entry.id)
    .maybeSingle();
  if (existing?.id) {
    const { error } = await supabase.from('user_pass_grants').update(row).eq('id', existing.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }
  const { error } = await supabase.from('user_pass_grants').insert(row);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Sync cloud d'un PASS (achat ou octroi admin) vers `user_pass_grants`. */
export async function syncPassRecordToSupabase(
  entry: SubscriptionRecord,
  targetUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  return persistPassGrantToSupabase(entry, targetUserId);
}

async function revokePassGrantInSupabase(localId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('user_pass_grants')
    .update({ status: 'revoked', expires_at: now, updated_at: now })
    .eq('local_id', localId);
  if (error) console.warn('[PassGrant] revoke:', error.message);
}

/** Fusionne les octrois cloud dans l’historique local (sans écraser un actif plus récent local). */
export async function hydratePassGrantsFromSupabase(userId: string): Promise<SubscriptionRecord[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return loadSubscriptionHistory(userId);
  }
  const { data, error } = await supabase
    .from('user_pass_grants')
    .select(
      'id, pass_catalog_id, label, pass_kind, status, started_at, expires_at, granted_by, grant_note, local_id, amount_gnf, payment_method, paid_at, billing_period, scheduled_start_at, frozen_pass_snapshot, role_freeze_intermediate_id',
    )
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(15);
  if (error || !data?.length) {
    if (error) console.warn('[PassGrant] hydrate:', error.message);
    return loadSubscriptionHistory(userId);
  }

  const local = await loadSubscriptionHistory(userId);
  const byId = new Map(local.map((r) => [r.id, r]));
  let changed = false;

  for (const row of data) {
    const id = String(row.local_id ?? row.id);
    const expiresAt = row.expires_at ? String(row.expires_at) : null;
    const expiryValid = !expiresAt || new Date(expiresAt) > new Date();
    const status: SubscriptionRecord['status'] =
      row.status === 'pending'
        ? 'pending'
        : row.status === 'active'
          ? 'active'
          : row.status === 'suspended' || (row.status === 'revoked' && expiryValid)
            ? 'suspended'
            : 'expired';
    const frozenRaw = row.frozen_pass_snapshot as SubscriptionRecord | null | undefined;
    const remote: SubscriptionRecord = {
      id,
      type: 'prime',
      status,
      startedAt: String(row.started_at),
      expiresAt,
      label: String(row.label),
      passKind: (row.pass_kind as SubscriptionRecord['passKind']) ?? 'custom',
      passCatalogId: String(row.pass_catalog_id),
      grantedBy: row.granted_by ? String(row.granted_by) : null,
      grantNote: row.grant_note ? String(row.grant_note) : null,
      amountGnf: row.amount_gnf != null ? Number(row.amount_gnf) : 0,
      paymentMethod: (row.payment_method as SubscriptionRecord['paymentMethod']) ?? undefined,
      paidAt: row.paid_at ? String(row.paid_at) : null,
      billingPeriod: (row.billing_period as SubscriptionRecord['billingPeriod']) ?? undefined,
      scheduledStartAt: row.scheduled_start_at ? String(row.scheduled_start_at) : null,
      frozenPassSnapshot: frozenRaw && typeof frozenRaw === 'object' ? frozenRaw : null,
      roleFreezeIntermediateId: row.role_freeze_intermediate_id
        ? String(row.role_freeze_intermediate_id)
        : null,
    };
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, remote);
      changed = true;
    } else if (
      existing.status !== remote.status ||
      existing.expiresAt !== remote.expiresAt ||
      existing.scheduledStartAt !== remote.scheduledStartAt
    ) {
      // Ne pas écraser un suspendu local par un actif cloud si la base impose membre
      if (existing.status === 'suspended' && remote.status === 'active') {
        continue;
      }
      byId.set(id, {
        ...existing,
        ...remote,
        status: remote.status,
        expiresAt: remote.expiresAt ?? existing.expiresAt,
        scheduledStartAt: remote.scheduledStartAt ?? existing.scheduledStartAt,
        amountGnf: remote.amountGnf || existing.amountGnf,
        paymentMethod: remote.paymentMethod ?? existing.paymentMethod,
        paidAt: remote.paidAt ?? existing.paidAt,
        billingPeriod: remote.billingPeriod ?? existing.billingPeriod,
      });
      changed = true;
    }
  }

  const merged = Array.from(byId.values());
  if (changed) await saveSubscriptionHistory(userId, merged);
  return merged;
}

/** Hydrate cloud + sync file d'attente / notifications (connexion, écran abonnement). */
export async function hydrateAndSyncPassGrantsFromSupabase(userId: string): Promise<SubscriptionRecord[]> {
  await hydratePassGrantsFromSupabase(userId);
  const { syncPassHistoryWithNotifications } = await import('@/lib/pass-purchase-store');
  return syncPassHistoryWithNotifications(userId);
}



function buildGrantedPassRecord(
  catalog: PassCatalogEntry,
  grantedByUserId: string,
  note?: string | null,
  inductionStartedAt?: string | null,
): SubscriptionRecord {
  const now = new Date().toISOString();
  return {
    id: `prime-grant-${Date.now()}`,
    type: 'prime',
    status: 'active',
    /** Conserve la date d'induction d'origine si réaffectation après rétrograde. */
    startedAt: inductionStartedAt?.trim() || now,
    expiresAt: computePassCatalogExpiry(catalog.validityDays),
    label: catalog.label,
    passKind: catalogPassKind(catalog),
    passCatalogId: catalog.id,
    grantedBy: grantedByUserId,
    grantNote: note?.trim() || null,
    amountGnf: 0,
    paidAt: null,
  };
}



async function resolveUserCatalogCountry(userId: string): Promise<CountryCode> {
  const user = await findRegistryUserById(userId);
  return resolveCountryCode(user?.countryCode);
}



async function applyPrimeGrantToMember(

  targetUserId: string,

  entry: SubscriptionRecord,

  target: NonNullable<Awaited<ReturnType<typeof findRegistryUserById>>>,

  countryCode?: CountryCode,

): Promise<void> {

  if (target.role !== 'ADMIN' && target.role !== 'PARTNER') {

    await updateRegistrySubscription(

      targetUserId,

      'active',

      entry.expiresAt ?? null,

      'USER_PRIME',

      'prime',

    );

    await syncPassRoleToSupabase(targetUserId, 'prime');

    await sendPassActivationNotification({

      userId: targetUserId,

      firstName: target.firstName,

      passLabel: passDisplayLabel(entry),

      passType: resolvePassActivationType(entry),

      passCatalogId: entry.passCatalogId ?? null,

      record: entry,

      countryCode: countryCode ?? target.countryCode ?? undefined,

    });

  } else {

    await updateRegistrySubscription(

      targetUserId,

      'active',

      entry.expiresAt ?? null,

      target.role,

      target.userRole,

    );

  }

}



export async function grantPassFromCatalog(
  catalogId: string,
  targetUserId: string,
  grantedByUserId: string,
  note?: string | null,
  countryCode?: CountryCode,
): Promise<SubscriptionRecord> {
  const cc = countryCode ?? (await findRegistryUserById(targetUserId))?.countryCode;
  const catalog = await getPassCatalogEntry(catalogId, cc);
  // Tout PASS catalogue actif est octroyable (Heritage + pass créés)
  if (!catalog || catalog.status !== 'active') {
    throw new Error('pass_catalog_invalid');
  }

  const target = await findRegistryUserById(targetUserId);
  if (!target) throw new Error('user_not_found');

  const history = await loadSubscriptionHistory(targetUserId);
  const inductionStartedAt = history
    .filter((r) => r.type === 'prime' && r.startedAt)
    .map((r) => r.startedAt)
    .sort()[0] ?? null;

  const entry = buildGrantedPassRecord(catalog, grantedByUserId, note, inductionStartedAt);
  await upsertActiveSubscription(targetUserId, entry);
  const cloud = await persistPassGrantToSupabase(entry, targetUserId);
  if (!cloud.ok) {
    console.warn('[PassGrant] octroi cloud:', cloud.error);
  }
  await applyPrimeGrantToMember(targetUserId, entry, target, cc);
  return entry;
}



export async function grantBonusPass(

  targetUserId: string,

  grantedByUserId: string,

  note?: string | null,

): Promise<SubscriptionRecord> {

  return grantPassFromCatalog(HERITAGE_CATALOG_ID, targetUserId, grantedByUserId, note);

}



export async function revokeGrantedPass(targetUserId: string, passId: string): Promise<boolean> {

  const history = await loadSubscriptionHistory(targetUserId);

  const idx = history.findIndex(

    (r) => r.id === passId && isAdminGrantedPass(r) && r.status === 'active',

  );

  if (idx < 0) return false;



  const now = new Date().toISOString();

  history[idx] = { ...history[idx], status: 'expired', expiresAt: now };

  await saveSubscriptionHistory(targetUserId, history);
  await revokePassGrantInSupabase(passId);



  const synced = await synchronizeSubscriptionHistory(targetUserId);

  const stillActive = getActiveSubscription(synced, 'prime');

  const target = await findRegistryUserById(targetUserId);

  if (!target) return true;



  if (!stillActive && target.role !== 'ADMIN' && target.role !== 'PARTNER') {

    await updateRegistrySubscription(targetUserId, 'expired', now, 'USER_FREE', 'member');

    await syncPassRoleToSupabase(targetUserId, 'member');

  } else if (stillActive) {

    await updateRegistrySubscription(

      targetUserId,

      'active',

      stillActive.expiresAt ?? null,

      target.role,

      target.userRole,

    );

  }



  return true;

}



/**
 * Suspend les PASS actifs lors d'un changement de rôle (Prime → Membre).
 * Crée un octroi PassIntermediaire (visible PASS accordés) + snapshot du PASS d'origine.
 */
export async function suspendActivePassesForRoleChange(
  targetUserId: string,
  grantedByUserId = 'role-freeze',
): Promise<number> {
  const cc = await resolveUserCatalogCountry(targetUserId);
  const catalog = await resolveIntermediatePassCatalog(cc);
  const history = await loadSubscriptionHistory(targetUserId);
  let count = 0;
  const created: SubscriptionRecord[] = [];

  const next = history.map((r) => {
    if (r.type !== 'prime' || r.status !== 'active' || isRoleFreezeIntermediatePass(r)) return r;
    count += 1;
    const intermediateId = `prime-intermediate-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const snapshot: SubscriptionRecord = {
      ...r,
      status: 'suspended',
      passKind: r.passKind === 'intermediate' ? 'standard' : r.passKind,
      roleFreezeIntermediateId: intermediateId,
    };
    const note =
      `Gel rôle membre — PASS d'origine : ${r.label}` +
      (r.expiresAt ? ` · échéance ${r.expiresAt.slice(0, 10)}` : '');
    created.push({
      id: intermediateId,
      type: 'prime',
      status: 'active',
      startedAt: r.startedAt,
      expiresAt: r.expiresAt,
      label: catalog.label,
      passCatalogId: catalog.id,
      passKind: 'custom',
      grantedBy: grantedByUserId,
      grantNote: note,
      amountGnf: 0,
      paidAt: null,
      frozenPassSnapshot: snapshot,
    });
    return snapshot;
  });

  if (count > 0) {
    const merged = [...created, ...next];
    await saveSubscriptionHistory(targetUserId, merged);
    await synchronizeSubscriptionHistory(targetUserId);
    for (const pass of [...created, ...next.filter((r) => r.status === 'suspended')]) {
      await persistPassGrantToSupabase(pass, targetUserId);
    }
  }

  if (isSupabaseConfigured() && supabase && count > 0) {
    await bulkUpdatePassGrantsInSupabase(targetUserId, 'suspended', ['active'], {
      excludeCatalogId: catalog.id,
    });
  }

  const suspended = getSuspendedSubscription(await loadSubscriptionHistory(targetUserId), 'prime');
  await updateRegistrySubscription(
    targetUserId,
    suspended ? 'suspended' : 'none',
    suspended?.expiresAt ?? null,
    'USER_FREE',
    'member',
  );
  await syncPassRoleToSupabase(targetUserId, 'member');
  return count;
}

/**
 * Réactive le PASS d'origine (snapshot) et retire l'octroi PassIntermediaire.
 */
export async function restoreSuspendedPassesForRoleChange(targetUserId: string): Promise<number> {
  const history = await loadSubscriptionHistory(targetUserId);
  const now = new Date();
  let count = 0;
  const toSync: SubscriptionRecord[] = [];
  const next: SubscriptionRecord[] = [];

  for (const r of history) {
    if (isRoleFreezeIntermediatePass(r) && r.frozenPassSnapshot && r.status !== 'expired') {
      const snap = r.frozenPassSnapshot;
      if (snap.expiresAt && new Date(snap.expiresAt) <= now) {
        next.push({ ...r, status: 'expired', frozenPassSnapshot: null });
        toSync.push({ ...r, status: 'expired', frozenPassSnapshot: null });
        continue;
      }
      count += 1;
      const restored: SubscriptionRecord = {
        ...snap,
        status: 'active',
        roleFreezeIntermediateId: null,
        passKind: snap.passKind === 'intermediate' ? 'standard' : snap.passKind,
      };
      next.push({ ...r, status: 'expired', frozenPassSnapshot: null });
      next.push(restored);
      toSync.push({ ...r, status: 'expired', frozenPassSnapshot: null });
      toSync.push(restored);
      continue;
    }

    if (r.type === 'prime' && r.status === 'suspended') {
      if (r.expiresAt && new Date(r.expiresAt) <= now) {
        next.push({ ...r, status: 'expired' });
        continue;
      }
      count += 1;
      const restored: SubscriptionRecord = {
        ...r,
        status: 'active',
        passKind: r.passKind === 'intermediate' ? 'standard' : r.passKind,
        roleFreezeIntermediateId: null,
      };
      next.push(restored);
      toSync.push(restored);
      continue;
    }

    next.push(r);
  }

  if (count > 0) {
    await saveSubscriptionHistory(targetUserId, next);
    await synchronizeSubscriptionHistory(targetUserId);
    for (const pass of toSync) {
      await persistPassGrantToSupabase(pass, targetUserId);
    }
  }

  if (isSupabaseConfigured() && supabase && count > 0) {
    const cc = await resolveUserCatalogCountry(targetUserId);
    const catalog = await resolveIntermediatePassCatalog(cc);
    await bulkUpdatePassGrantsInSupabase(targetUserId, 'expired', ['active', 'suspended', 'revoked'], {
      onlyCatalogId: catalog.id,
    });
    await bulkUpdatePassGrantsInSupabase(targetUserId, 'active', ['suspended', 'revoked'], {
      onlyUnexpired: true,
    });
  }

  const active = getActiveSubscription(await loadSubscriptionHistory(targetUserId), 'prime');
  if (active && !isRoleFreezeIntermediatePass(active)) {
    await updateRegistrySubscription(
      targetUserId,
      'active',
      active.expiresAt ?? null,
      'USER_PRIME',
      'prime',
    );
    await syncPassRoleToSupabase(targetUserId, 'prime');
  }
  return count;
}

/** Révoque tous les PASS actifs (achats + grants) pour un compte — révocation définitive admin. */
export async function revokeAllActivePassesForUser(targetUserId: string): Promise<number> {
  const history = await loadSubscriptionHistory(targetUserId);
  const now = new Date().toISOString();
  let count = 0;
  const next = history.map((r) => {
    if (r.type === 'prime' && (r.status === 'active' || r.status === 'suspended')) {
      count += 1;
      if (isAdminGrantedPass(r)) {
        void revokePassGrantInSupabase(r.id);
      }
      return { ...r, status: 'expired' as const, expiresAt: now };
    }
    return r;
  });
  if (count > 0) {
    await saveSubscriptionHistory(targetUserId, next);
    await synchronizeSubscriptionHistory(targetUserId);
  }
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase
      .from('user_pass_grants')
      .update({ status: 'revoked', expires_at: now, updated_at: now })
      .eq('user_id', targetUserId)
      .in('status', ['active', 'suspended', 'revoked']);
    if (error) console.warn('[PassGrant] revoke all cloud:', error.message);
  }
  await updateRegistrySubscription(targetUserId, 'none', null, 'USER_FREE', 'member');
  await syncPassRoleToSupabase(targetUserId, 'member');
  return count;
}

export async function revokeBonusPass(targetUserId: string, passId: string): Promise<boolean> {

  return revokeGrantedPass(targetUserId, passId);

}



async function listGrantedPassesFromCloud(): Promise<GrantedPassRow[] | null> {
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return null;

  const { data, error } = await supabase
    .from('user_pass_grants')
    .select(
      'user_id, pass_catalog_id, label, pass_kind, status, started_at, expires_at, granted_by, grant_note, local_id',
    )
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(15);

  if (error) return null;

  const users = await listRegistryUsers();
  const results: GrantedPassRow[] = [];

  for (const row of data ?? []) {
    const userId = String(row.user_id);
    const passId = String(row.local_id ?? row.pass_catalog_id);
    const registry = users.find((u) => u.id === userId);
    const name = registry
      ? [registry.firstName, registry.lastName].filter(Boolean).join(' ').trim() ||
        registry.email ||
        userId.slice(0, 8)
      : userId.slice(0, 8);
    let catalogLabel = String(row.label);
    const catalogId = String(row.pass_catalog_id);
    const catalog = await getPassCatalogEntry(catalogId, registry?.countryCode);
    if (catalog) catalogLabel = catalog.label;

    results.push({
      userId,
      userName: name,
      userPhone: registry?.phoneNumber ?? null,
      pass: {
        id: passId,
        type: 'prime',
        status: 'active',
        startedAt: String(row.started_at),
        expiresAt: row.expires_at ? String(row.expires_at) : null,
        label: String(row.label),
        passKind: (row.pass_kind as SubscriptionRecord['passKind']) ?? 'custom',
        passCatalogId: catalogId,
        grantedBy: row.granted_by ? String(row.granted_by) : null,
        grantNote: row.grant_note ? String(row.grant_note) : null,
        amountGnf: 0,
        paidAt: null,
      },
      catalogLabel,
    });
  }

  return results.sort((a, b) => b.pass.startedAt.localeCompare(a.pass.startedAt));
}

export async function listActiveGrantedPasses(): Promise<GrantedPassRow[]> {
  const cloud = await listGrantedPassesFromCloud();
  if (cloud !== null) return cloud;

  const users = await listRegistryUsers();
  const results: GrantedPassRow[] = [];

  for (const user of users) {
    const history = await loadSubscriptionHistory(user.id);
    for (const pass of history) {
      if (!isAdminGrantedPass(pass) && !isRoleFreezeIntermediatePass(pass)) continue;
      if (pass.status !== 'active') continue;

      const name =
        [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
        user.email ||
        user.id.slice(0, 8);

      let catalogLabel = pass.label;
      if (pass.passCatalogId) {
        const catalog = await getPassCatalogEntry(pass.passCatalogId, user.countryCode);
        if (catalog) catalogLabel = catalog.label;
      }

      results.push({
        userId: user.id,
        userName: name,
        userPhone: user.phoneNumber,
        pass,
        catalogLabel,
      });
    }
  }

  return results.sort((a, b) => b.pass.startedAt.localeCompare(a.pass.startedAt));
}



export async function listActiveBonusPasses(): Promise<GrantedPassRow[]> {

  return listActiveGrantedPasses();

}

export async function countActivePassCatalogUsers(catalogId: string): Promise<number> {
  const users = await listRegistryUsers();
  let count = 0;
  for (const user of users) {
    const history = await synchronizeSubscriptionHistory(user.id);
    for (const pass of history) {
      if (pass.status !== 'active') continue;
      if (pass.passCatalogId === catalogId) {
        count += 1;
        continue;
      }
      if (catalogId === HERITAGE_CATALOG_ID && isHeritagePass(pass)) {
        count += 1;
      }
    }
  }
  return count;
}


