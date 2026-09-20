import AsyncStorage from '@react-native-async-storage/async-storage';
import { isNetworkOnline, markNetworkReachable, readLocalCache, writeLocalCache } from '@/lib/offline-store';
import {
  normalizePartnerName,
  partnerIdentityMatchesRecord,
  resolvePartnerIdentity,
  type PartnerIdentity,
} from '@/lib/partner-identity-store';
import { resolveStablePartnerKey } from '@/lib/partner-validation-code-store';
import {
  applyPartnerBenefitValidationViaBackend,
  fetchPartnerPendingValidationsViaBackend,
} from '@/lib/partner-validation-backend-api';
import {
  applyPartnerBenefitValidationDirect,
  fetchPartnerPendingValidationsDirect,
  finalizeMemberBenefitValidationRemote,
  reconcileMemberPendingRedemptionsRemote,
  type PartnerPendingValidationRow,
} from '@/lib/partner-validation-direct';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { getSupabasePublic } from '@/lib/supabase-public';
import { asDbInsert, asDbUpdate, undefinedIfNull } from '@/lib/supabase-types';
import type { Database } from '@/types/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

type DbSupabaseClient = SupabaseClient<Database>;

export const BENEFIT_REDEMPTION_TIMEOUT_MS = 10 * 60 * 1000;
export const BENEFIT_REDEMPTION_TIMEOUT_MINUTES = BENEFIT_REDEMPTION_TIMEOUT_MS / (60 * 1000);

/** Lecture redemptions validées / admin — RLS anon ne voit que les pending. */
function getBenefitRedemptionQueryClient() {
  if (isSupabaseConfigured() && supabase) return supabase;
  return getSupabasePublic();
}

export type BenefitRedemptionStatus = 'pending' | 'validated' | 'cancelled' | 'expired';

export interface BenefitRedemption {
  id: string;
  benefitId: string;
  userId: string;
  partnerId: string;
  partnerName: string;
  partnerCode: string;
  status: BenefitRedemptionStatus;
  createdAt: string;
  expiresAt: string;
  validatedAt: string | null;
  contentId?: string | null;
  contentType?: 'event' | 'spot' | 'tool' | null;
  contentTitle?: string | null;
}

const KEY = 'loop_benefit_redemptions_v1';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Pousse une redemption locale vers Supabase (RPC puis insert). */
async function pushRedemptionToRemote(
  entry: BenefitRedemption,
  extras?: { benefitTitle?: string | null; benefitDescription?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  if (!isUuid(entry.userId)) {
    return { ok: false, error: `userId non-UUID: ${entry.userId}` };
  }

  const remoteRow: Record<string, unknown> = {
    local_id: entry.id,
    benefit_id: entry.benefitId,
    user_id: entry.userId,
    partner_key: entry.partnerId,
    partner_name: entry.partnerName,
    partner_code: entry.partnerCode,
    status: entry.status,
    created_at: entry.createdAt,
    expires_at: entry.expiresAt,
  };
  if (entry.contentId) remoteRow.content_id = entry.contentId;
  if (entry.contentType) remoteRow.content_type = entry.contentType;
  if (entry.contentTitle) remoteRow.content_title = entry.contentTitle;

  const rpcClient = getSupabasePublic() ?? (isSupabaseConfigured() ? supabase : null);
  if (rpcClient) {
    const { data: rpcId, error: rpcError } = await rpcClient.rpc('request_benefit_redemption', {
      p_local_id: entry.id,
      p_benefit_id: entry.benefitId,
      p_user_id: entry.userId,
      p_partner_key: entry.partnerId,
      p_partner_name: entry.partnerName,
      p_partner_code: entry.partnerCode,
      p_expires_at: entry.expiresAt,
      p_content_id: undefinedIfNull(entry.contentId),
      p_content_type: undefinedIfNull(entry.contentType),
      p_content_title: undefinedIfNull(entry.contentTitle),
      p_benefit_title: undefinedIfNull(extras?.benefitTitle ?? null),
      p_benefit_description: undefinedIfNull(extras?.benefitDescription ?? null),
      p_grant_status: 'pending_validation',
    });
    if (!rpcError && rpcId) {
      markNetworkReachable();
      return { ok: true };
    }
    if (rpcError) {
      console.warn('[Redemption] RPC request_benefit_redemption:', rpcError.message);
      if (!/Could not find the function|schema cache/i.test(rpcError.message)) {
        // Erreur métier / RLS / SQL — on tente quand même l’insert, puis on remonte le message
      }
    }
  }

  const tryInsert = async (
    client: DbSupabaseClient,
    row: Record<string, unknown>,
  ): Promise<{ ok: boolean; error?: string }> => {
    const { error } = await client.from('benefit_redemptions').insert(asDbInsert('benefit_redemptions', row));
    if (!error) return { ok: true };
    const fallbackRow = { ...row };
    delete fallbackRow.content_id;
    delete fallbackRow.content_type;
    delete fallbackRow.content_title;
    const retry = await client.from('benefit_redemptions').insert(asDbInsert('benefit_redemptions', fallbackRow));
    if (retry.error) {
      console.warn('[Redemption] insert remote:', retry.error.message);
      return { ok: false, error: retry.error.message };
    }
    return { ok: true };
  };

  const publicClient = getSupabasePublic();
  if (publicClient) {
    const res = await tryInsert(publicClient as DbSupabaseClient, remoteRow);
    if (res.ok) {
      markNetworkReachable();
      return res;
    }
  }
  if (isSupabaseConfigured() && supabase) {
    const res = await tryInsert(supabase, remoteRow);
    if (res.ok) {
      markNetworkReachable();
      return res;
    }
    return res;
  }

  return { ok: false, error: 'Client Supabase indisponible' };
}

/**
 * Re-pousse toutes les demandes locales pending vers Supabase avec l’UUID de la carte QR.
 * À appeler à l’ouverture du QR membre (après « Utiliser » l’utilisateur quitte Avantages).
 */
export async function flushPendingBenefitRedemptionsForUser(
  sessionUserId: string,
  identity?: { phone?: string | null; email?: string | null },
): Promise<{ attempted: number; synced: number }> {
  if (!isUuid(sessionUserId)) {
    console.warn('[Redemption] flush skipped — sessionUserId non UUID', sessionUserId);
    return { attempted: 0, synced: 0 };
  }

  await expireStaleBenefitRedemptions();
  const all = await loadAll();
  const now = Date.now();
  const phoneNorm = identity?.phone
    ? (await import('@/lib/otp-auth')).normalizePhone(identity.phone)
    : '';
  const emailNorm = identity?.email?.trim().toLowerCase() ?? '';

  const matchesSession = (r: BenefitRedemption): boolean => {
    if (r.userId === sessionUserId) return true;
    if (phoneNorm && (r.userId === `phone:${phoneNorm}` || r.userId.includes(phoneNorm))) {
      return true;
    }
    if (emailNorm && r.userId === `email:${emailNorm}`) return true;
    // Ancien pending local sans UUID (phone:/email:/id démo)
    return !isUuid(r.userId);
  };

  const pending = all.filter(
    (r) =>
      r.status === 'pending' &&
      new Date(r.expiresAt).getTime() > now &&
      matchesSession(r),
  );

  let synced = 0;
  const next = [...all];
  for (const entry of pending) {
    const rewritten: BenefitRedemption = {
      ...entry,
      userId: sessionUserId,
      expiresAt:
        new Date(entry.expiresAt).getTime() < now + 60_000
          ? new Date(now + BENEFIT_REDEMPTION_TIMEOUT_MS).toISOString()
          : entry.expiresAt,
    };
    const idx = next.findIndex((r) => r.id === entry.id);
    if (idx >= 0) next[idx] = rewritten;

    const res = await pushRedemptionToRemote(rewritten);
    console.log('[Redemption] flush one', {
      id: rewritten.id,
      benefitId: rewritten.benefitId,
      partnerCode: rewritten.partnerCode,
      ok: res.ok,
      error: res.error ?? null,
    });
    if (res.ok) synced += 1;
  }
  await saveAll(next);

  if (pending.length > 0) {
    console.log('[Redemption] flush pending', {
      sessionUserId,
      attempted: pending.length,
      synced,
    });
  }
  return { attempted: pending.length, synced };
}

async function loadAll(): Promise<BenefitRedemption[]> {
  const cached = await readLocalCache<BenefitRedemption[]>(KEY);
  if (cached?.length) return cached;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BenefitRedemption[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAll(items: BenefitRedemption[]): Promise<void> {
  await writeLocalCache(KEY, items);
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

function partnerMatches(
  redemption: BenefitRedemption,
  partnerId: string,
  partnerName: string,
  identity?: PartnerIdentity,
): boolean {
  if (identity) {
    return partnerIdentityMatchesRecord(identity, redemption.partnerId, redemption.partnerName);
  }
  if (redemption.partnerId === partnerId) return true;
  return normalizePartnerName(redemption.partnerName) === normalizePartnerName(partnerName);
}

function mapRemoteRow(row: Record<string, unknown>): BenefitRedemption {
  return {
    id: String(row.local_id ?? row.id),
    benefitId: String(row.benefit_id),
    userId: String(row.user_id),
    partnerId: String(row.partner_key),
    partnerName: String(row.partner_name),
    partnerCode: String(row.partner_code),
    status: row.status as BenefitRedemptionStatus,
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    validatedAt: row.validated_at ? String(row.validated_at) : null,
    contentId: row.content_id ? String(row.content_id) : null,
    contentType: (row.content_type as BenefitRedemption['contentType']) ?? null,
    contentTitle: row.content_title ? String(row.content_title) : null,
  };
}

async function fetchRemotePending(userId: string, identity: PartnerIdentity): Promise<BenefitRedemption[]> {
  const client = getSupabasePublic();
  if (!client || !(await isNetworkOnline())) return [];
  if (!isUuid(userId)) return [];

  const keyList = Array.from(identity.keys).filter(Boolean);
  if (!keyList.length) return [];

  const { data, error } = await client
    .from('benefit_redemptions')
    .select('id, local_id, benefit_id, user_id, partner_key, partner_name, partner_code, status, created_at, expires_at, validated_at, content_id, content_type, content_title')
    .eq('user_id', userId)
    .in('partner_key', keyList)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .limit(50);

  if (error || !data) return [];
  return data.map((row) => mapRemoteRow(row as Record<string, unknown>));
}

async function syncRemoteStatus(ids: string[], status: BenefitRedemptionStatus, validatedAt?: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return;
  const payload: Record<string, unknown> = { status };
  if (validatedAt) payload.validated_at = validatedAt;

  await supabase
    .from('benefit_redemptions')
    .update(asDbUpdate('benefit_redemptions', payload))
    .in('local_id', ids);
}

export async function expireStaleBenefitRedemptions(): Promise<string[]> {
  const now = Date.now();
  const all = await loadAll();
  const expiredBenefitIds: string[] = [];
  const expiredIds: string[] = [];
  let changed = false;

  const next = all.map((r) => {
    if (r.status === 'pending' && new Date(r.expiresAt).getTime() <= now) {
      expiredBenefitIds.push(r.benefitId);
      expiredIds.push(r.id);
      changed = true;
      return { ...r, status: 'expired' as const };
    }
    return r;
  });

  if (changed) {
    await saveAll(next);
    await syncRemoteStatus(expiredIds, 'expired');
  }
  return expiredBenefitIds;
}

type RemoteGrantRow = {
  local_id: string;
  user_id: string;
  title: string;
  description: string;
  partner_name: string | null;
  status: string;
  granted_at: string;
  expires_at: string;
  used_at: string | null;
  grant_audience: string;
  grant_country_code: string | null;
  grant_city: string | null;
  catalog_local_id: string | null;
  role_entitlement: string | null;
};

async function markRemoteGrantUsed(
  client: NonNullable<ReturnType<typeof getSupabasePublic>>,
  grant: RemoteGrantRow,
  usedAt: string,
): Promise<boolean> {
  const roleEntitlement =
    grant.role_entitlement === 'member' || grant.role_entitlement === 'prime' || grant.role_entitlement === 'admin'
      ? grant.role_entitlement
      : null;

  const { error } = await client.rpc('upsert_prime_benefit_grant', {
    p_local_id: grant.local_id,
    p_user_id: grant.user_id,
    p_title: grant.title,
    p_description: grant.description,
    p_partner_name: grant.partner_name,
    p_status: 'used',
    p_granted_at: grant.granted_at,
    p_expires_at: grant.expires_at,
    p_used_at: usedAt,
    p_grant_audience: grant.grant_audience,
    p_grant_country_code: grant.grant_country_code,
    p_grant_city: grant.grant_city,
    p_catalog_local_id: grant.catalog_local_id,
    p_role_entitlement: roleEntitlement,
  });

  if (error) {
    console.warn('[Redemption] mark grant used remote:', error.message);
    return false;
  }
  return true;
}

async function revertRemoteGrantToActive(
  client: NonNullable<ReturnType<typeof getSupabasePublic>>,
  grant: RemoteGrantRow,
): Promise<boolean> {
  const roleEntitlement =
    grant.role_entitlement === 'member' || grant.role_entitlement === 'prime' || grant.role_entitlement === 'admin'
      ? grant.role_entitlement
      : null;

  const { error } = await client.rpc('upsert_prime_benefit_grant', {
    p_local_id: grant.local_id,
    p_user_id: grant.user_id,
    p_title: grant.title,
    p_description: grant.description,
    p_partner_name: grant.partner_name,
    p_status: 'active',
    p_granted_at: grant.granted_at,
    p_expires_at: grant.expires_at,
    p_used_at: null,
    p_grant_audience: grant.grant_audience,
    p_grant_country_code: grant.grant_country_code,
    p_grant_city: grant.grant_city,
    p_catalog_local_id: grant.catalog_local_id,
    p_role_entitlement: roleEntitlement,
  });

  if (error) {
    console.warn('[Redemption] revert grant remote:', error.message);
    return false;
  }
  return true;
}

/** Expire les demandes dépassées côté Supabase et repasse les octrois en « active ». */
export async function expireRemoteStaleBenefitRedemptionsForUser(userId: string): Promise<string[]> {
  const client = getSupabasePublic();
  if (!client || !(await isNetworkOnline()) || !isUuid(userId)) return [];

  const now = new Date().toISOString();
  const { data: stale, error } = await client
    .from('benefit_redemptions')
    .select('local_id, benefit_id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lte('expires_at', now)
    .limit(15);

  if (error || !stale?.length) return [];

  const benefitIds = [...new Set(stale.map((row) => String(row.benefit_id)))];
  const localIds = stale.map((row) => String(row.local_id));

  await client.from('benefit_redemptions').update({ status: 'expired' }).in('local_id', localIds);

  const { data: grants } = await client
    .from('prime_benefit_grants')
    .select(
      'local_id, user_id, title, description, partner_name, status, granted_at, expires_at, used_at, grant_audience, grant_country_code, grant_city, catalog_local_id, role_entitlement',
    )
    .eq('user_id', userId)
    .in('local_id', benefitIds)
    .eq('status', 'pending_validation')
    .limit(15);

  await Promise.all((grants ?? []).map((grant) => revertRemoteGrantToActive(client, grant as RemoteGrantRow)));

  return benefitIds;
}

/** Octroi pending_validation sans redemption pending valide → repasse en active. */
export async function reconcileStalePendingValidationGrantsForUser(userId: string): Promise<string[]> {
  const client = getSupabasePublic();
  if (!client || !(await isNetworkOnline()) || !isUuid(userId)) return [];

  const { data: pendingGrants, error: grantsError } = await client
    .from('prime_benefit_grants')
    .select(
      'local_id, user_id, title, description, partner_name, status, granted_at, expires_at, used_at, grant_audience, grant_country_code, grant_city, catalog_local_id, role_entitlement',
    )
    .eq('user_id', userId)
    .eq('status', 'pending_validation')
    .limit(15);

  if (grantsError || !pendingGrants?.length) return [];

  const benefitIds = pendingGrants.map((g) => String(g.local_id));
  const { data: redemptions } = await client
    .from('benefit_redemptions')
    .select('benefit_id, status, expires_at')
    .eq('user_id', userId)
    .in('benefit_id', benefitIds)
    .limit(15);

  const now = Date.now();
  const livePendingBenefitIds = new Set(
    (redemptions ?? [])
      .filter(
        (r) =>
          String(r.status) === 'pending' &&
          new Date(String(r.expires_at)).getTime() > now,
      )
      .map((r) => String(r.benefit_id)),
  );

  const revertedIds: string[] = [];
  await Promise.all(
    (pendingGrants as RemoteGrantRow[]).map(async (grant) => {
      if (livePendingBenefitIds.has(grant.local_id)) return;
      const ok = await revertRemoteGrantToActive(client, grant);
      if (ok) revertedIds.push(grant.local_id);
    }),
  );

  if (__DEV__ && revertedIds.length) {
    console.log('[Redemption] reconciled stale pending grants', { userId, count: revertedIds.length });
  }

  return revertedIds;
}

/** Octroi encore actif/pending mais redemption déjà validée → repasse en « used » (ré-octroi admin). */
const consumedReconcileInFlight = new Map<string, Promise<string[]>>();

export async function reconcileConsumedGrantsForUser(userId: string): Promise<string[]> {
  if (!isUuid(userId)) return [];

  const existing = consumedReconcileInFlight.get(userId);
  if (existing) return existing;

  const run = reconcileConsumedGrantsForUserOnce(userId);
  consumedReconcileInFlight.set(userId, run);
  try {
    return await run;
  } finally {
    consumedReconcileInFlight.delete(userId);
  }
}

async function reconcileConsumedGrantsForUserOnce(userId: string): Promise<string[]> {
  if (!(await isNetworkOnline())) return [];

  // Client authentifié (membre lit ses lignes) + anon en filet
  const clients = [
    getBenefitRedemptionQueryClient(),
    getSupabasePublic(),
  ].filter((c, i, arr): c is NonNullable<typeof c> => Boolean(c) && arr.indexOf(c) === i);

  if (!clients.length) return [];

  const consumed = new Set<string>();
  const usedAtByBenefit = new Map<string, string>();
  const validatedLocalIds = new Set<string>();

  for (const client of clients) {
    const { data: validated, error } = await client
      .from('benefit_redemptions')
      .select('local_id, benefit_id, validated_at')
      .eq('user_id', userId)
      .eq('status', 'validated')
      .limit(50);

    if (error) {
      if (__DEV__) console.warn('[Redemption] list validated:', error.message);
      continue;
    }
    for (const row of validated ?? []) {
      const benefitId = String(row.benefit_id);
      const localId = String(row.local_id ?? '');
      consumed.add(benefitId);
      if (localId) validatedLocalIds.add(localId);
      const usedAt = row.validated_at ? String(row.validated_at) : new Date().toISOString();
      if (!usedAtByBenefit.has(benefitId)) usedAtByBenefit.set(benefitId, usedAt);
    }

    // Grants déjà passés en used côté partenaire (RPC) — même sans relecture redemption
    const { data: usedGrants } = await client
      .from('prime_benefit_grants')
      .select('local_id, used_at, status')
      .eq('user_id', userId)
      .eq('status', 'used')
      .limit(50);
    for (const g of usedGrants ?? []) {
      const id = String(g.local_id);
      consumed.add(id);
      if (!usedAtByBenefit.has(id) && g.used_at) {
        usedAtByBenefit.set(id, String(g.used_at));
      }
    }
  }

  if (!consumed.size) return [];

  // Complète le remote si une redemption est validated mais le grant encore pending
  const client = clients[0];
  const benefitIds = [...consumed];
  const { data: pendingGrants } = await client
    .from('prime_benefit_grants')
    .select(
      'local_id, user_id, title, description, partner_name, status, granted_at, expires_at, used_at, grant_audience, grant_country_code, grant_city, catalog_local_id, role_entitlement',
    )
    .eq('user_id', userId)
    .in('local_id', benefitIds)
    .in('status', ['active', 'pending_validation'])
    .limit(50);

  if (pendingGrants?.length) {
    await Promise.all(
      (pendingGrants as RemoteGrantRow[]).map(async (grant) => {
        const usedAt = usedAtByBenefit.get(grant.local_id) ?? new Date().toISOString();
        await markRemoteGrantUsed(client, grant, usedAt);
      }),
    );
  }

  // Aligne les redemptions locales (sinon l’UI reste « en attente » via livePending)
  const all = await loadAll();
  let redemptionsChanged = false;
  const now = new Date().toISOString();
  const nextRedemptions = all.map((r) => {
    if (r.userId !== userId || r.status !== 'pending') return r;
    if (!consumed.has(r.benefitId) && !validatedLocalIds.has(r.id)) return r;
    redemptionsChanged = true;
    return {
      ...r,
      status: 'validated' as const,
      validatedAt: usedAtByBenefit.get(r.benefitId) ?? now,
    };
  });
  if (redemptionsChanged) await saveAll(nextRedemptions);

  if (redemptionsChanged || pendingGrants?.length) {
    console.log('[Redemption] reconcile consumed', {
      userId,
      count: consumed.size,
      benefitIds: [...consumed].slice(0, 5),
    });
  }

  return [...consumed];
}

/** Octrois avec redemption validée — considérés consommés pour le contrôle de ré-octroi admin. */
export async function listValidatedBenefitIdsForUsers(userIds: Iterable<string>): Promise<Set<string>> {
  const idSet = new Set([...userIds].filter(isUuid));
  const benefitIds = new Set<string>();

  const local = await loadAll();
  for (const row of local) {
    if (row.status === 'validated' && idSet.has(row.userId)) {
      benefitIds.add(row.benefitId);
    }
  }

  const client = getBenefitRedemptionQueryClient();
  if (client && (await isNetworkOnline()) && idSet.size) {
    const { data, error } = await client
      .from('benefit_redemptions')
      .select('benefit_id, user_id')
      .in('user_id', [...idSet])
      .eq('status', 'validated')
      .limit(15);

    if (error && __DEV__) {
      console.warn('[Redemption] list validated benefit ids:', error.message);
    }
    if (!error) {
      for (const row of data ?? []) {
        benefitIds.add(String(row.benefit_id));
      }
    }
  }

  return benefitIds;
}

/** Octrois consommés (redemption validée ou statut used côté serveur) — contrôle ré-octroi admin. */
export async function listConsumedBenefitIdsForGrantCheck(userIds: Iterable<string>): Promise<Set<string>> {
  const consumed = await listValidatedBenefitIdsForUsers(userIds);
  const idSet = new Set([...userIds].filter(isUuid));
  const client = getBenefitRedemptionQueryClient();

  if (!client || !(await isNetworkOnline()) || !idSet.size) {
    return consumed;
  }

  const { data: grants, error } = await client
    .from('prime_benefit_grants')
    .select('local_id, status, used_at')
    .in('user_id', [...idSet])
    .limit(15);

  if (error && __DEV__) {
    console.warn('[Redemption] list consumed grants:', error.message);
  }

  for (const row of grants ?? []) {
    const localId = row.local_id ? String(row.local_id) : '';
    if (!localId) continue;
    if (String(row.status) === 'used' || row.used_at) {
      consumed.add(localId);
    }
  }

  if (__DEV__) {
    console.log('[Redemption] consumed benefit ids for grant check', {
      users: idSet.size,
      consumed: consumed.size,
    });
  }

  return consumed;
}

export async function createBenefitRedemption(input: {
  benefitId: string;
  userId: string;
  partnerId: string;
  partnerName: string;
  partnerCode: string;
  contentId?: string | null;
  contentType?: 'event' | 'spot' | 'tool' | null;
  contentTitle?: string | null;
  benefitTitle?: string | null;
  benefitDescription?: string | null;
}): Promise<{ redemption: BenefitRedemption; remoteOk: boolean }> {
  const now = new Date();
  const { resolvePartnerUserIdForSync } = await import('@/lib/partner-user-resolve');
  const resolvedUserId = await resolvePartnerUserIdForSync(input.partnerId, input.partnerName);
  const stablePartnerId = resolvedUserId ?? (await resolveStablePartnerKey(input.partnerId, input.partnerName));
  const entry: BenefitRedemption = {
    id: `red-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    benefitId: input.benefitId,
    userId: input.userId,
    partnerId: stablePartnerId,
    partnerName: input.partnerName,
    partnerCode: input.partnerCode,
    status: 'pending',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + BENEFIT_REDEMPTION_TIMEOUT_MS).toISOString(),
    validatedAt: null,
    contentId: input.contentId ?? null,
    contentType: input.contentType ?? null,
    contentTitle: input.contentTitle ?? null,
  };

  const all = await loadAll();
  const withoutDuplicate = all.filter(
    (r) => !(r.benefitId === input.benefitId && r.status === 'pending'),
  );
  withoutDuplicate.push(entry);
  await saveAll(withoutDuplicate);

  // Toujours tenter le remote pour un UUID (le probe offline est trop pessimiste sur mobile)
  let remoteOk = false;
  let remoteError: string | undefined;
  if (isUuid(input.userId)) {
    const pushed = await pushRedemptionToRemote(entry, {
      benefitTitle: input.benefitTitle,
      benefitDescription: input.benefitDescription,
    });
    remoteOk = pushed.ok;
    remoteError = pushed.error;
    console.log('[Redemption] create', {
      id: entry.id,
      userId: entry.userId,
      remoteOk,
      remoteError: remoteError ?? null,
      partnerCode: entry.partnerCode,
      partnerKey: entry.partnerId,
      contentId: entry.contentId,
      benefitId: entry.benefitId,
      onlineProbe: await isNetworkOnline(),
    });
  } else {
    remoteError = `userId non-UUID: ${input.userId}`;
    console.warn('[Redemption] create skipped remote', {
      userId: input.userId,
      online: await isNetworkOnline(),
    });
  }

  return { redemption: entry, remoteOk };
}

export async function getPendingRedemptionForBenefit(benefitId: string): Promise<BenefitRedemption | null> {
  await expireStaleBenefitRedemptions();
  const all = await loadAll();
  return all.find((r) => r.benefitId === benefitId && r.status === 'pending') ?? null;
}

/** IDs d’avantages avec une demande locale encore valide (non expirée). */
export async function listLivePendingBenefitIdsForUser(userId: string): Promise<Set<string>> {
  await expireStaleBenefitRedemptions();
  const now = Date.now();
  const all = await loadAll();
  const ids = new Set<string>();
  for (const r of all) {
    if (r.userId !== userId || r.status !== 'pending') continue;
    if (new Date(r.expiresAt).getTime() <= now) continue;
    ids.add(r.benefitId);
  }
  return ids;
}

export async function listPendingRedemptionsForMemberAndPartner(
  userId: string,
  partnerId: string,
  partnerName: string,
  partnerCode?: string,
): Promise<BenefitRedemption[]> {
  await expireStaleBenefitRedemptions();

  if (partnerCode?.trim()) {
    const byCode = await fetchRemotePendingByCode(userId, partnerCode);
    if (byCode.length) return byCode;
    return fetchRemotePendingByPartnerHint(userId, partnerId, partnerName);
  }

  const identity = await resolvePartnerIdentity(partnerId, partnerName);
  const local = (await loadAll()).filter(
    (r) => r.userId === userId && r.status === 'pending' && partnerMatches(r, partnerId, partnerName, identity),
  );
  const remote = await fetchRemotePending(userId, identity);
  const merged = new Map<string, BenefitRedemption>();
  for (const r of [...local, ...remote]) merged.set(r.benefitId, r);
  return Array.from(merged.values());
}

async function fetchRemotePendingByCode(userId: string, partnerCode: string): Promise<BenefitRedemption[]> {
  const client = getSupabasePublic();
  if (!client || !(await isNetworkOnline())) return [];
  if (!isUuid(userId)) return [];
  const normalized = partnerCode.trim().toUpperCase();
  const { data, error } = await client
    .from('benefit_redemptions')
    .select('id, local_id, benefit_id, user_id, partner_key, partner_name, partner_code, status, created_at, expires_at, validated_at, content_id, content_type, content_title')
    .eq('user_id', userId)
    .eq('partner_code', normalized)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .limit(50);
  if (error || !data) return [];
  return data.map((row) => mapRemoteRow(row as Record<string, unknown>));
}

async function fetchRemotePendingByPartnerHint(
  userId: string,
  partnerId: string,
  partnerName: string,
): Promise<BenefitRedemption[]> {
  const client = getSupabasePublic();
  if (!client || !(await isNetworkOnline())) return [];
  if (!isUuid(userId)) return [];

  const { data, error } = await client
    .from('benefit_redemptions')
    .select('id, local_id, benefit_id, user_id, partner_key, partner_name, partner_code, status, created_at, expires_at, validated_at, content_id, content_type, content_title')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .limit(50);
  if (error || !data?.length) return [];

  const keys = new Set<string>();
  const id = partnerId.trim();
  if (id) {
    keys.add(id);
    if (id.startsWith('user:')) keys.add(id.slice(5));
    else keys.add(`user:${id}`);
  }
  const targetName = normalizePartnerName(partnerName);

  return data
    .map((row) => mapRemoteRow(row as Record<string, unknown>))
    .filter((r) => {
      if (keys.has(r.partnerId)) return true;
      return targetName && normalizePartnerName(r.partnerName) === targetName;
    });
}

export type { PartnerPendingValidationRow } from '@/lib/partner-validation-direct';

/** Lecture des demandes en attente — RPC Supabase, direct anon, backend LAN. */
export async function fetchPartnerPendingValidations(
  memberUserId: string,
  partnerCode: string,
  partnerHint?: { partnerId?: string; partnerName?: string; establishmentId?: string },
): Promise<PartnerPendingValidationRow[]> {
  if (!isUuid(memberUserId) || !(await isNetworkOnline())) return [];

  await Promise.race([
    Promise.all([
      expireRemoteStaleBenefitRedemptionsForUser(memberUserId),
      reconcileMemberPendingRedemptionsRemote(memberUserId),
    ]),
    new Promise<void>((resolve) => setTimeout(resolve, 4000)),
  ]).catch(() => undefined);

  const mapRowsWithGrants = async (
    redemptions: BenefitRedemption[],
  ): Promise<PartnerPendingValidationRow[]> => {
    if (!redemptions.length) return [];
    const { fetchRemotePrimeBenefitsForUserPublic } = await import('@/lib/prime-benefits-sync');
    const grants = await fetchRemotePrimeBenefitsForUserPublic(memberUserId).catch(() => []);
    const grantById = new Map(grants.map((g) => [g.id, g]));
    return redemptions.map((redemption) => {
      const grant = grantById.get(redemption.benefitId);
      return {
        redemption,
        benefitTitle: grant?.title?.trim() || redemption.contentTitle || 'Avantage',
        benefitDescription: grant?.description ?? '',
      };
    });
  };

  const mapRpcPendingRows = (rows: Record<string, unknown>[]): PartnerPendingValidationRow[] =>
    rows.map((row) => ({
      redemption: {
        id: String(row.redemption_local_id),
        benefitId: String(row.benefit_id),
        userId: memberUserId,
        partnerId: String(row.partner_key),
        partnerName: String(row.partner_name),
        partnerCode: String(row.partner_code),
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        expiresAt: String(row.expires_at),
        validatedAt: null,
        contentId: row.content_id ? String(row.content_id) : null,
        contentType: (row.content_type as BenefitRedemption['contentType']) ?? null,
        contentTitle: row.content_title ? String(row.content_title) : null,
      },
      benefitTitle: String(row.benefit_title ?? row.content_title ?? 'Avantage'),
      benefitDescription: String(row.benefit_description ?? ''),
    }));

  // 0) RPC : toutes les pending du membre (sans filtre code) — le plus fiable
  {
    const rpcClient = getSupabasePublic() ?? (isSupabaseConfigured() ? supabase : null);
    if (rpcClient) {
      const { data, error } = await rpcClient.rpc('list_member_pending_benefit_redemptions', {
        p_member_user_id: memberUserId,
      });
      if (!error && Array.isArray(data) && data.length) {
        if (__DEV__) {
          console.log('[PartnerValidation] list_member_pending RPC', {
            memberUserId,
            count: data.length,
            codes: data.map((r: Record<string, unknown>) => r.partner_code),
          });
        }
        let mapped = mapRpcPendingRows(data as Record<string, unknown>[]);
        const establishmentId = partnerHint?.establishmentId?.trim();
        if (establishmentId) {
          const forEstablishment = mapped.filter(
            (row) => !row.redemption.contentId || row.redemption.contentId === establishmentId,
          );
          if (forEstablishment.length) mapped = forEstablishment;
        }
        return mapped;
      }
      if (error && !/Could not find the function|schema cache/i.test(error.message)) {
        console.warn('[Redemption] list_member_pending RPC:', error.message);
      }
    }
  }

  if (isSupabaseConfigured() && supabase) {
    const rpcClient = getSupabasePublic() ?? supabase;
    const { data, error } = await rpcClient.rpc('list_partner_pending_validations', {
      p_member_user_id: memberUserId,
      p_partner_code: partnerCode,
    });
    if (!error && Array.isArray(data) && data.length) {
      let mapped = mapRpcPendingRows(data as Record<string, unknown>[]);

      const establishmentId = partnerHint?.establishmentId?.trim();
      if (establishmentId) {
        const forEstablishment = mapped.filter(
          (row) => !row.redemption.contentId || row.redemption.contentId === establishmentId,
        );
        if (forEstablishment.length) mapped = forEstablishment;
      }

      return mapped;
    }
    if (error && !error.message.includes('Could not find the function')) {
      console.warn('[Redemption] list pending RPC:', error.message);
    }
  }

  const direct = await fetchPartnerPendingValidationsDirect(memberUserId, partnerCode, partnerHint);
  if (direct.length) return direct;

  // Toutes les pending du membre (sans filtre partenaire) — diagnostic + filet de sécurité
  const client = getSupabasePublic();
  let allPending: BenefitRedemption[] = [];
  if (client) {
    const { data, error } = await client
      .from('benefit_redemptions')
      .select(
        'id, local_id, benefit_id, user_id, partner_key, partner_name, partner_code, status, created_at, expires_at, validated_at, content_id, content_type, content_title',
      )
      .eq('user_id', memberUserId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .limit(50);
    if (error) {
      console.warn('[Redemption] list all pending for member:', error.message);
    } else {
      allPending = (data ?? []).map((row) => mapRemoteRow(row as Record<string, unknown>));
    }
  }

  if (__DEV__) {
    console.log('[PartnerValidation] member pending dump', {
      memberUserId,
      partnerCode,
      hintId: partnerHint?.partnerId ?? null,
      hintName: partnerHint?.partnerName ?? null,
      totalPending: allPending.length,
      codes: allPending.map((r) => r.partnerCode),
      keys: allPending.map((r) => r.partnerId),
      names: allPending.map((r) => r.partnerName),
    });
  }

  if (allPending.length) {
    const code = partnerCode.trim().toUpperCase();
    const establishmentId = partnerHint?.establishmentId?.trim();
    const targetName = normalizePartnerName(partnerHint?.partnerName ?? '');
    const hintId = partnerHint?.partnerId?.trim() ?? '';

    const matched = allPending.filter((r) => {
      if (code && r.partnerCode?.toUpperCase() === code) return true;
      if (establishmentId && r.contentId === establishmentId) return true;
      if (targetName && normalizePartnerName(r.partnerName) === targetName) return true;
      if (
        hintId &&
        (r.partnerId === hintId || r.partnerId === `user:${hintId}` || hintId === `user:${r.partnerId}`)
      ) {
        return true;
      }
      return false;
    });

    // Si le code/nom ne matchent pas (mauvais rattachement à la création),
    // on montre quand même toutes les demandes du membre scanné.
    const rows = matched.length ? matched : allPending;
    return mapRowsWithGrants(rows);
  }

  const viaBackend = await Promise.race([
    fetchPartnerPendingValidationsViaBackend(memberUserId, partnerCode),
    new Promise<PartnerPendingValidationRow[]>((resolve) => setTimeout(() => resolve([]), 3000)),
  ]);
  if (viaBackend.length) return viaBackend;

  return [];
}

/** Valide ou annule — RPC Supabase batch, direct anon, backend LAN. */
export async function applyPartnerBenefitValidationRemote(
  partnerCode: string,
  redemptionLocalIds: string[],
  validate: boolean,
  partnerHint?: { partnerId?: string; partnerName?: string; establishmentId?: string },
  finalizeItems?: Array<{ redemptionId: string; benefitId: string; memberUserId: string }>,
): Promise<number> {
  if (!(await isNetworkOnline()) || !redemptionLocalIds.length) return 0;

  if (isSupabaseConfigured() && supabase) {
    const rpcClient = getSupabasePublic() ?? supabase;
    const { data, error } = await rpcClient.rpc('apply_partner_benefit_validation', {
      p_partner_code: partnerCode,
      p_redemption_local_ids: redemptionLocalIds,
      p_validate: validate,
    });
    if (!error) {
      const count = typeof data === 'number' ? data : Number(data ?? 0);
      if (count > 0) {
        markNetworkReachable();
        return count;
      }
    } else if (!error.message.includes('Could not find the function')) {
      console.warn('[Redemption] apply validation RPC:', error.message);
    }
  }

  const direct = await applyPartnerBenefitValidationDirect(
    partnerCode,
    redemptionLocalIds,
    validate,
    partnerHint,
  );
  if (direct > 0) {
    markNetworkReachable();
    return direct;
  }

  if (finalizeItems?.length) {
    const finalized = await finalizeMemberBenefitValidationRemote(finalizeItems, validate);
    if (finalized > 0) {
      markNetworkReachable();
      return finalized;
    }
  }

  try {
    const viaBackend = await applyPartnerBenefitValidationViaBackend(
      partnerCode,
      redemptionLocalIds,
      validate,
    );
    if (viaBackend > 0) {
      markNetworkReachable();
      return viaBackend;
    }
  } catch (e) {
    console.warn('[Redemption] apply via backend:', e instanceof Error ? e.message : e);
  }

  return 0;
}

export async function cancelRedemptions(ids: string[]): Promise<void> {
  const set = new Set(ids);
  const all = await loadAll();
  const next = all.map((r) =>
    set.has(r.id) && r.status === 'pending' ? { ...r, status: 'cancelled' as const } : r,
  );
  await saveAll(next);
  await syncRemoteStatus(ids, 'cancelled');
}

export async function validateRedemptions(ids: string[]): Promise<void> {
  const set = new Set(ids);
  const now = new Date().toISOString();
  const all = await loadAll();
  const validated = all.filter((r) => set.has(r.id) && r.status === 'pending');
  const next = all.map((r) =>
    set.has(r.id) && r.status === 'pending'
      ? { ...r, status: 'validated' as const, validatedAt: now }
      : r,
  );
  await saveAll(next);
  await syncRemoteStatus(ids, 'validated', now);

  for (const r of validated) {
    void import('@/lib/partner-milestone-store').then(({ evaluatePartnerMilestonesAfterValidation }) =>
      evaluatePartnerMilestonesAfterValidation({
        partnerKey: r.partnerId,
        partnerName: r.partnerName,
        memberUserId: r.userId,
      }),
    );
  }
}

export async function countPartnerValidationMetrics(
  partnerId: string,
  partnerName: string,
  since?: Date | null,
): Promise<{ validations: number; uniqueMembers: number }> {
  const identity = await resolvePartnerIdentity(partnerId, partnerName);

  let remoteValidations = 0;
  let remoteUniqueMembers = 0;
  if (isSupabaseConfigured() && supabase && (await isNetworkOnline())) {
    try {
      const { ensurePartnerSupabaseSession } = await import('@/lib/partner-spot-auth');
      await ensurePartnerSupabaseSession();
      const { data, error } = await supabase.rpc('count_my_partner_validation_metrics', {
        p_since: since ? since.toISOString() : undefined,
      });
      if (!error && data && typeof data === 'object') {
        const row = data as { validations?: number; unique_members?: number };
        remoteValidations = Number(row.validations ?? 0);
        remoteUniqueMembers = Number(row.unique_members ?? 0);
      }
    } catch {
      /* RPC absente ou réseau */
    }
  }

  const all = await loadAll();
  const sinceMs = since ? since.getTime() : null;
  const validated = all.filter((r) => {
    if (r.status !== 'validated') return false;
    if (!partnerMatches(r, partnerId, partnerName, identity)) return false;
    if (sinceMs != null) {
      if (!r.validatedAt) return false;
      return new Date(r.validatedAt).getTime() >= sinceMs;
    }
    return true;
  });

  return {
    validations: Math.max(validated.length, remoteValidations),
    uniqueMembers: Math.max(new Set(validated.map((r) => r.userId)).size, remoteUniqueMembers),
  };
}

/** Validations d'avantages groupées par contenu (event / spot / outil). */
export async function countPartnerValidationsByContent(
  partnerId: string,
  partnerName: string,
): Promise<Map<string, number>> {
  const identity = await resolvePartnerIdentity(partnerId, partnerName);
  const all = await loadAll();
  const map = new Map<string, number>();
  for (const r of all) {
    if (r.status !== 'validated') continue;
    if (!partnerMatches(r, partnerId, partnerName, identity)) continue;
    if (!r.contentId) continue;
    map.set(r.contentId, (map.get(r.contentId) ?? 0) + 1);
  }
  return map;
}
