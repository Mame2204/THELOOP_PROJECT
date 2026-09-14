import { isNetworkOnline } from '@/lib/offline-store';
import { normalizePartnerName } from '@/lib/partner-identity-store';
import type { BenefitRedemption } from '@/lib/benefit-redemption-store';
import { normalizePartnerValidationCode } from '@/lib/partner-validation-code-store';
import { getSupabasePublic } from '@/lib/supabase-public';

export interface PartnerPendingValidationRow {
  redemption: BenefitRedemption;
  benefitTitle: string;
  benefitDescription: string;
}

type PartnerCodeRow = {
  partner_key: string;
  partner_name: string;
  validation_code: string;
};

type RedemptionRow = {
  local_id: string;
  benefit_id: string;
  user_id: string;
  partner_key: string;
  partner_name: string;
  partner_code: string;
  status: string;
  expires_at: string;
  created_at?: string;
  content_id?: string | null;
  content_type?: string | null;
  content_title?: string | null;
};

type GrantRow = {
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function grantEligibleForPartnerValidation(status: string): boolean {
  return status === 'pending_validation' || status === 'active';
}

function dedupePendingRowsByBenefit(rows: PartnerPendingValidationRow[]): PartnerPendingValidationRow[] {
  const byBenefit = new Map<string, PartnerPendingValidationRow>();
  for (const row of rows) {
    const existing = byBenefit.get(row.redemption.benefitId);
    if (
      !existing ||
      new Date(row.redemption.createdAt).getTime() > new Date(existing.redemption.createdAt).getTime()
    ) {
      byBenefit.set(row.redemption.benefitId, row);
    }
  }
  return Array.from(byBenefit.values());
}

/** Redemption pending + grant déjà « used » → clôturer la redemption (état incohérent). */
async function reconcileOrphanPendingRedemptions(
  client: NonNullable<ReturnType<typeof getSupabasePublic>>,
  memberUserId: string,
  rows: RedemptionRow[],
): Promise<void> {
  if (!rows.length) return;

  const benefitIds = [...new Set(rows.map((row) => row.benefit_id))];
  const { data: grants } = await client
    .from('prime_benefit_grants')
    .select('local_id, status, used_at')
    .eq('user_id', memberUserId)
    .in('local_id', benefitIds)
    .limit(15);

  const usedByBenefit = new Map<string, string | null>();
  for (const grant of grants ?? []) {
    if (String(grant.status) === 'used') {
      usedByBenefit.set(String(grant.local_id), grant.used_at ? String(grant.used_at) : null);
    }
  }
  if (!usedByBenefit.size) return;

  const now = new Date().toISOString();
  await Promise.all(
    rows
      .filter((row) => usedByBenefit.has(row.benefit_id))
      .map((row) =>
        client
          .from('benefit_redemptions')
          .update({
            status: 'validated',
            validated_at: usedByBenefit.get(row.benefit_id) ?? now,
          })
          .eq('local_id', row.local_id)
          .eq('status', 'pending'),
      ),
  );

  if (__DEV__) {
    console.log('[PartnerValidation] reconciled orphan redemptions', {
      memberUserId,
      count: usedByBenefit.size,
    });
  }
}

export async function reconcileMemberPendingRedemptionsRemote(memberUserId: string): Promise<void> {
  const client = getSupabasePublic();
  if (!client || !(await isNetworkOnline()) || !isUuid(memberUserId)) return;

  const { data: pending } = await client
    .from('benefit_redemptions')
    .select('local_id, benefit_id, user_id, partner_key, partner_name, partner_code, status, expires_at')
    .eq('user_id', memberUserId)
    .eq('status', 'pending')
    .limit(15);

  if (!pending?.length) return;
  await reconcileOrphanPendingRedemptions(client, memberUserId, pending as RedemptionRow[]);
}

function mapPendingValidationRow(
  row: RedemptionRow,
  memberUserId: string,
  grant: GrantRow,
): PartnerPendingValidationRow {
  return {
    redemption: {
      id: row.local_id,
      benefitId: row.benefit_id,
      userId: memberUserId,
      partnerId: row.partner_key,
      partnerName: row.partner_name,
      partnerCode: row.partner_code,
      status: 'pending',
      createdAt: row.created_at ?? new Date().toISOString(),
      expiresAt: row.expires_at,
      validatedAt: null,
      contentId: row.content_id ? String(row.content_id) : null,
      contentType: (row.content_type as BenefitRedemption['contentType']) ?? null,
      contentTitle: row.content_title ? String(row.content_title) : null,
    },
    benefitTitle: grant.title?.trim() || 'Avantage',
    benefitDescription: grant.description ?? '',
  };
}

function redemptionMatchesPartner(
  redemption: RedemptionRow,
  partner: PartnerCodeRow,
  code: string,
  hint?: { partnerId?: string; partnerName?: string; establishmentId?: string },
): boolean {
  const redemptionCode = normalizePartnerValidationCode(redemption.partner_code ?? '');
  if (redemptionCode === code) return true;
  if (redemption.partner_key === partner.partner_key) return true;
  if (normalizePartnerName(redemption.partner_name) === normalizePartnerName(partner.partner_name)) {
    return true;
  }

  const hintId = hint?.partnerId?.trim();
  if (hintId) {
    if (redemption.partner_key === hintId) return true;
    if (hintId.startsWith('user:') && redemption.partner_key === hintId.slice(5)) return true;
    if (redemption.partner_key === `user:${hintId}`) return true;
  }

  const hintName = hint?.partnerName?.trim();
  if (hintName && normalizePartnerName(redemption.partner_name) === normalizePartnerName(hintName)) {
    return true;
  }

  // Demande initiée depuis la fiche établissement du partenaire
  const establishmentId = hint?.establishmentId?.trim();
  if (establishmentId && redemption.content_id && redemption.content_id === establishmentId) {
    return true;
  }

  return false;
}

async function loadPartnerCode(code: string): Promise<PartnerCodeRow | null> {
  const client = getSupabasePublic();
  if (!client) return null;
  const { data, error } = await client
    .from('partner_validation_codes')
    .select('partner_key, partner_name, validation_code')
    .eq('validation_code', code)
    .maybeSingle();
  if (error || !data) return null;
  return data as PartnerCodeRow;
}

const REDEMPTION_SELECT_WITH_CONTENT =
  'local_id, benefit_id, user_id, partner_key, partner_name, partner_code, status, expires_at, created_at, content_id, content_type, content_title';
const REDEMPTION_SELECT_BASE =
  'local_id, benefit_id, user_id, partner_key, partner_name, partner_code, status, expires_at, created_at';

async function loadPendingRedemptionsForMember(
  client: NonNullable<ReturnType<typeof getSupabasePublic>>,
  memberUserId: string,
): Promise<RedemptionRow[]> {
  const baseQuery = () =>
    client
      .from('benefit_redemptions')
      .select(REDEMPTION_SELECT_WITH_CONTENT)
      .eq('user_id', memberUserId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .limit(15);

  const { data, error } = await baseQuery();
  if (!error && data?.length) return data as RedemptionRow[];

  if (error && !/content_id|content_type|content_title|42703|column.*does not exist/i.test(error.message)) {
    if (__DEV__) console.warn('[PartnerValidation] pending redemptions:', error.message);
    return [];
  }

  const fallback = await client
    .from('benefit_redemptions')
    .select(REDEMPTION_SELECT_BASE)
    .eq('user_id', memberUserId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .limit(15);

  if (fallback.error || !fallback.data?.length) {
    if (__DEV__ && fallback.error) {
      console.warn('[PartnerValidation] pending redemptions:', fallback.error.message);
    }
    return [];
  }

  return fallback.data as RedemptionRow[];
}

/** Lecture directe Supabase (anon) — fonctionne en tunnel Expo sans serveur local. */
export async function fetchPartnerPendingValidationsDirect(
  memberUserId: string,
  partnerCode: string,
  partnerHint?: { partnerId?: string; partnerName?: string; establishmentId?: string },
): Promise<PartnerPendingValidationRow[]> {
  if (!isUuid(memberUserId) || !(await isNetworkOnline())) return [];

  const client = getSupabasePublic();
  if (!client) return [];

  const code = normalizePartnerValidationCode(partnerCode);
  if (!/^CODE-[A-Z0-9]{5}$/.test(code)) return [];

  const partner = await loadPartnerCode(code);
  const redemptions = await loadPendingRedemptionsForMember(client, memberUserId);

  if (__DEV__) {
    console.log('[PartnerValidation] direct probe', {
      memberUserId,
      partnerCode: code,
      partnerFound: Boolean(partner),
      partnerKey: partner?.partner_key ?? null,
      redemptions: redemptions.length,
      sampleCodes: redemptions.slice(0, 3).map((r) => r.partner_code),
    });
  }

  if (!redemptions.length) return [];

  await reconcileOrphanPendingRedemptions(client, memberUserId, redemptions);

  const activeRedemptions = await loadPendingRedemptionsForMember(client, memberUserId);
  if (!activeRedemptions.length) return [];

  const matchedRows = partner
    ? activeRedemptions.filter((row) => redemptionMatchesPartner(row, partner, code, partnerHint))
    : [];

  // Pas de match code/clé/nom → on expose quand même les demandes du membre scanné
  const rowsToShow = matchedRows.length ? matchedRows : activeRedemptions;

  const benefitIds = rowsToShow.map((row) => row.benefit_id);
  const { data: grants, error: grantsError } = await client
    .from('prime_benefit_grants')
    .select(
      'local_id, user_id, title, description, partner_name, status, granted_at, expires_at, used_at, grant_audience, grant_country_code, grant_city, catalog_local_id, role_entitlement',
    )
    .eq('user_id', memberUserId)
    .in('local_id', benefitIds)
    .limit(15);

  if (grantsError && __DEV__) {
    console.warn('[PartnerValidation] pending grants:', grantsError.message);
  }

  const grantById = new Map(((grants ?? []) as GrantRow[]).map((grant) => [grant.local_id, grant]));
  const items: PartnerPendingValidationRow[] = [];

  for (const row of rowsToShow) {
    const grant = grantById.get(row.benefit_id);
    if (grant?.status === 'used') {
      const validatedAt = grant.used_at ?? new Date().toISOString();
      await client
        .from('benefit_redemptions')
        .update({ status: 'validated', validated_at: validatedAt })
        .eq('local_id', row.local_id)
        .eq('status', 'pending');
      continue;
    }
    if (grant && !grantEligibleForPartnerValidation(grant.status)) continue;

    if (grant) {
      items.push(mapPendingValidationRow(row, memberUserId, grant));
    } else {
      // Grant absent / RLS : afficher quand même via métadonnées redemption
      items.push({
        redemption: {
          id: row.local_id,
          benefitId: row.benefit_id,
          userId: memberUserId,
          partnerId: row.partner_key,
          partnerName: row.partner_name,
          partnerCode: row.partner_code,
          status: 'pending',
          createdAt: row.created_at ?? new Date().toISOString(),
          expiresAt: row.expires_at,
          validatedAt: null,
          contentId: row.content_id ? String(row.content_id) : null,
          contentType: (row.content_type as BenefitRedemption['contentType']) ?? null,
          contentTitle: row.content_title ? String(row.content_title) : null,
        },
        benefitTitle: row.content_title?.trim() || row.partner_name || 'Avantage',
        benefitDescription: '',
      });
    }
  }

  if (__DEV__) {
    console.log('[PartnerValidation] pending direct', {
      memberUserId,
      partnerCode: code,
      redemptions: activeRedemptions.length,
      matched: matchedRows.length,
      shown: items.length,
    });
  }

  return dedupePendingRowsByBenefit(items);
}

async function upsertGrantStatus(grant: GrantRow, status: 'used' | 'active', usedAt: string | null): Promise<boolean> {
  const client = getSupabasePublic();
  if (!client) return false;

  const roleEntitlement =
    grant.role_entitlement === 'member' ||
    grant.role_entitlement === 'prime' ||
    grant.role_entitlement === 'partner' ||
    grant.role_entitlement === 'admin'
      ? grant.role_entitlement
      : null;

  const { error } = await client.rpc('upsert_prime_benefit_grant', {
    p_local_id: grant.local_id,
    p_user_id: grant.user_id,
    p_title: grant.title,
    p_description: grant.description,
    p_partner_name: grant.partner_name,
    p_status: status,
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
    console.warn('[PartnerValidation] upsert grant:', error.message);
    return false;
  }
  return true;
}

/** Validation / annulation directe Supabase (RPC sécurisée). */
export async function applyPartnerBenefitValidationDirect(
  partnerCode: string,
  redemptionLocalIds: string[],
  validate: boolean,
  partnerHint?: { partnerId?: string; partnerName?: string; establishmentId?: string },
): Promise<number> {
  if (!(await isNetworkOnline()) || !redemptionLocalIds.length) return 0;

  const client = getSupabasePublic();
  if (!client) return 0;

  const code = normalizePartnerValidationCode(partnerCode);
  const { data: appliedCount, error: rpcError } = await client.rpc('apply_partner_benefit_validation', {
    p_partner_code: code,
    p_redemption_local_ids: redemptionLocalIds,
    p_validate: validate,
  });

  if (!rpcError && typeof appliedCount === 'number' && appliedCount > 0) {
    return appliedCount;
  }

  if (rpcError && __DEV__) {
    console.warn('[PartnerValidation] apply RPC:', rpcError.message);
  }

  const partner = await loadPartnerCode(code);

  const { data: redemptions, error } = await client
    .from('benefit_redemptions')
    .select('local_id, benefit_id, user_id, partner_key, partner_name, partner_code, status, expires_at')
    .in('local_id', redemptionLocalIds)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .limit(15);

  if (error || !redemptions?.length) {
    if (__DEV__ && error) console.warn('[PartnerValidation] apply select:', error.message);
    return 0;
  }

  const now = new Date().toISOString();
  let applied = 0;

  for (const row of redemptions as RedemptionRow[]) {
    if (partner && !redemptionMatchesPartner(row, partner, code, partnerHint)) continue;

    const { data: grant, error: grantError } = await client
      .from('prime_benefit_grants')
      .select(
        'local_id, user_id, title, description, partner_name, status, granted_at, expires_at, used_at, grant_audience, grant_country_code, grant_city, catalog_local_id, role_entitlement',
      )
      .eq('local_id', row.benefit_id)
      .eq('user_id', row.user_id)
      .maybeSingle();

    if (grantError || !grant) {
      if (__DEV__) {
        console.warn('[PartnerValidation] apply grant skip', {
          benefitId: row.benefit_id,
          status: null,
          grantError: grantError?.message ?? null,
        });
      }
      continue;
    }

    const g = grant as GrantRow;

    if (validate && g.status === 'used') {
      const { error: redError } = await client
        .from('benefit_redemptions')
        .update({ status: 'validated', validated_at: g.used_at ?? now })
        .eq('local_id', row.local_id)
        .eq('status', 'pending');
      if (!redError) applied += 1;
      continue;
    }

    if (!grantEligibleForPartnerValidation(g.status)) {
      if (__DEV__) {
        console.warn('[PartnerValidation] apply grant skip', {
          benefitId: row.benefit_id,
          status: g.status,
          grantError: null,
        });
      }
      continue;
    }

    if (validate) {
      const { error: redError } = await client
        .from('benefit_redemptions')
        .update({ status: 'validated', validated_at: now })
        .eq('local_id', row.local_id);
      if (redError) continue;
      if (!(await upsertGrantStatus(g, 'used', now))) continue;
    } else {
      const { error: redError } = await client
        .from('benefit_redemptions')
        .update({ status: 'cancelled' })
        .eq('local_id', row.local_id);
      if (redError) continue;
      if (!(await upsertGrantStatus(g, 'active', null))) continue;
    }

    applied += 1;
  }

  return applied;
}

/** Dernier recours : valide les redemptions sélectionnées (IDs connus de l'écran partenaire). */
export async function finalizeMemberBenefitValidationRemote(
  items: Array<{ redemptionId: string; benefitId: string; memberUserId: string }>,
  validate: boolean,
): Promise<number> {
  if (!(await isNetworkOnline()) || !items.length) return 0;

  const client = getSupabasePublic();
  if (!client) return 0;

  const now = new Date().toISOString();
  let applied = 0;

  for (const item of items) {
    if (!isUuid(item.memberUserId)) continue;

    const { data: row, error: redError } = await client
      .from('benefit_redemptions')
      .select('local_id, benefit_id, user_id, status, expires_at')
      .eq('local_id', item.redemptionId)
      .eq('user_id', item.memberUserId)
      .eq('status', 'pending')
      .gt('expires_at', now)
      .maybeSingle();

    if (redError || !row) continue;

    const { data: grant, error: grantError } = await client
      .from('prime_benefit_grants')
      .select(
        'local_id, user_id, title, description, partner_name, status, granted_at, expires_at, used_at, grant_audience, grant_country_code, grant_city, catalog_local_id, role_entitlement',
      )
      .eq('local_id', item.benefitId)
      .eq('user_id', item.memberUserId)
      .maybeSingle();

    if (grantError || !grant) continue;

    const g = grant as GrantRow;

    if (validate && g.status === 'used') {
      const { error: updateRedError } = await client
        .from('benefit_redemptions')
        .update({ status: 'validated', validated_at: g.used_at ?? now })
        .eq('local_id', item.redemptionId)
        .eq('status', 'pending');
      if (!updateRedError) applied += 1;
      continue;
    }

    if (!grantEligibleForPartnerValidation(g.status)) continue;

    if (validate) {
      const { error: updateRedError } = await client
        .from('benefit_redemptions')
        .update({ status: 'validated', validated_at: now })
        .eq('local_id', item.redemptionId);
      if (updateRedError) continue;
      if (!(await upsertGrantStatus(g, 'used', now))) continue;
    } else {
      const { error: updateRedError } = await client
        .from('benefit_redemptions')
        .update({ status: 'cancelled' })
        .eq('local_id', item.redemptionId);
      if (updateRedError) continue;
      if (!(await upsertGrantStatus(g, 'active', null))) continue;
    }

    applied += 1;
  }

  if (__DEV__) {
    console.log('[PartnerValidation] finalize remote', { validate, applied, total: items.length });
  }

  return applied;
}
