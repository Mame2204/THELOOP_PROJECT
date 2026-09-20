import { isNetworkOnline, markNetworkReachable } from '@/lib/offline-store';
import type { PrimeBenefit } from '@/lib/prime-benefits-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { undefinedIfNull } from '@/lib/supabase-types';
import { getSupabasePublic } from '@/lib/supabase-public';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function mapRemoteRow(row: Record<string, unknown>): PrimeBenefit {
  const rawRole = row.role_entitlement ? String(row.role_entitlement) : null;
  const roleEntitlement =
    rawRole === 'member' || rawRole === 'prime' || rawRole === 'admin' || rawRole === 'partner'
      ? (rawRole as PrimeBenefit['roleEntitlement'])
      : null;
  const catalogLocalId = row.catalog_local_id ? String(row.catalog_local_id) : null;
  const localId = String(row.local_id ?? row.id);
  const isRoleGrant = roleEntitlement != null || localId.startsWith('role-ben-');

  const usedAt = row.used_at ? String(row.used_at) : null;
  const rawStatus = row.status as PrimeBenefit['status'];
  const status: PrimeBenefit['status'] =
    usedAt && rawStatus !== 'expired_unused' ? 'used' : rawStatus;

  const grantAudience = (row.grant_audience as PrimeBenefit['grantAudience']) ?? 'individual';
  const individualAdminGrant = !isRoleGrant && grantAudience === 'individual';

  return {
    id: localId,
    userId: String(row.user_id),
    userPhone: null,
    catalogId: catalogLocalId ?? 'remote',
    title: String(row.title),
    description: String(row.description),
    partnerName: row.partner_name ? String(row.partner_name) : null,
    benefitKind: 'unlimited',
    quantityTotal: null,
    quantityUsed: 0,
    maxUses: null,
    usesCount: usedAt ? 1 : 0,
    status,
    grantedAt: String(row.granted_at),
    expiresAt: String(row.expires_at),
    usedAt,
    grantedBy: isRoleGrant ? 'role-entitlement' : 'admin',
    grantAudience,
    customNote: null,
    grantBatchId: isRoleGrant ? `role-entitlement-${roleEntitlement ?? 'member'}` : null,
    grantCountryCode: row.grant_country_code ? String(row.grant_country_code) : null,
    grantCity: row.grant_city ? String(row.grant_city) : null,
    roleEntitlement: roleEntitlement ?? null,
    // Octroi individuel (tirage / admin) : validité dès l'octroi, pas à la 1ère activation.
    validityStartsOnActivation: individualAdminGrant ? false : undefined,
  };
}

/** Valeurs acceptées par la contrainte SQL prime_benefit_grants_role_entitlement_check */
function remoteRoleEntitlement(
  value: PrimeBenefit['roleEntitlement'],
): 'member' | 'prime' | 'partner' | 'admin' | null {
  if (value === 'member' || value === 'prime' || value === 'partner' || value === 'admin') return value;
  return null;
}

export async function syncPrimeBenefitToRemote(benefit: PrimeBenefit): Promise<void> {
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return;
  if (!isUuid(benefit.userId)) return;

  const { data: remoteRow } = await supabase
    .from('prime_benefit_grants')
    .select('status, used_at')
    .eq('local_id', benefit.id)
    .maybeSingle();

  if (remoteRow) {
    const remoteStatus = String(remoteRow.status ?? '');
    const remoteUsedAt = remoteRow.used_at ? String(remoteRow.used_at) : null;
    if (
      (remoteStatus === 'used' || remoteUsedAt) &&
      (benefit.status === 'active' || benefit.status === 'pending_validation')
    ) {
      return;
    }
  }

  const catalogLocal =
    benefit.catalogId && benefit.catalogId !== 'remote' && benefit.catalogId !== 'legacy'
      ? benefit.catalogId
      : null;

  const { error } = await supabase.rpc('upsert_prime_benefit_grant', {
    p_local_id: benefit.id,
    p_user_id: benefit.userId,
    p_title: benefit.title,
    p_description: benefit.description,
    p_partner_name: benefit.partnerName ?? '',
    p_status: benefit.status,
    p_granted_at: benefit.grantedAt,
    p_expires_at: benefit.expiresAt,
    p_used_at: benefit.usedAt ?? '',
    p_grant_audience: benefit.grantAudience,
    p_grant_country_code: undefinedIfNull(benefit.grantCountryCode ?? null),
    p_grant_city: undefinedIfNull(benefit.grantCity ?? null),
    p_catalog_local_id: undefinedIfNull(catalogLocal),
    p_role_entitlement: undefinedIfNull(remoteRoleEntitlement(benefit.roleEntitlement ?? null)),
  });

  if (error) console.warn('[BenefitsSync] upsert:', error.message);
  else markNetworkReachable();
}

export async function deleteRemotePrimeBenefit(localId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return;
  if (!localId.trim()) return;

  const { error } = await supabase.from('prime_benefit_grants').delete().eq('local_id', localId);
  if (error) console.warn('[BenefitsSync] delete:', error.message);
}

export async function syncPrimeBenefitsBatch(benefits: PrimeBenefit[]): Promise<void> {
  await Promise.allSettled(
    benefits.map((b) =>
      Promise.race([
        syncPrimeBenefitToRemote(b),
        new Promise<void>((resolve) => setTimeout(resolve, 12_000)),
      ]),
    ),
  );
}

export async function fetchRemotePrimeBenefitsForUser(userId: string): Promise<PrimeBenefit[]> {
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return [];
  if (!isUuid(userId)) return [];

  const selectCols =
    'id, local_id, user_id, title, description, partner_name, status, granted_at, expires_at, used_at, grant_audience, grant_country_code, grant_city, role_entitlement, catalog_local_id';

  let fromTable: PrimeBenefit[] = [];
  const { data, error } = await supabase
    .from('prime_benefit_grants')
    .select(selectCols)
    .eq('user_id', userId)
    .order('granted_at', { ascending: false })
    .limit(100);

  if (!error && data) {
    fromTable = data.map((row) => mapRemoteRow(row as Record<string, unknown>));
  }

  // RPC public : octrois actifs même si auth.uid() ≠ userId (session partenaire sur le même appareil).
  const fromRpc = await fetchRemotePrimeBenefitsForUserPublic(userId);
  if (!fromTable.length) return fromRpc;
  if (!fromRpc.length) return fromTable;
  return mergePrimeBenefits(fromTable, fromRpc);
}

/** Lecture octrois membre via RPC sécurisée — scan QR partenaire (contourne RLS session partenaire). */
export async function fetchRemotePrimeBenefitsForUserPublic(userId: string): Promise<PrimeBenefit[]> {
  const client = getSupabasePublic();
  if (!client || !(await isNetworkOnline())) return [];
  if (!isUuid(userId)) return [];

  const { data, error } = await client.rpc('fetch_member_benefit_grants_public', {
    p_user_id: userId,
  });

  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((row) => mapRemoteRow(row));
}

/** Tous les octrois — source de vérité admin après purge sandbox. */
export async function fetchAllRemotePrimeBenefits(): Promise<PrimeBenefit[]> {
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return [];

  const { data, error } = await supabase
    .from('prime_benefit_grants')
    .select('id, local_id, user_id, title, description, partner_name, status, granted_at, expires_at, used_at, grant_audience, grant_country_code, grant_city, role_entitlement, catalog_local_id')
    .order('granted_at', { ascending: false })
    .limit(500);

  if (error || !data) return [];
  return data.map((row) => mapRemoteRow(row as Record<string, unknown>));
}

export function mergePrimeBenefits(local: PrimeBenefit[], remote: PrimeBenefit[]): PrimeBenefit[] {
  const byId = new Map<string, PrimeBenefit>();
  for (const b of remote) byId.set(b.id, b);
  for (const b of local) {
    const existing = byId.get(b.id);
    if (!existing) {
      byId.set(b.id, b);
      continue;
    }

    const resolvedStatus = resolveMergedBenefitStatus(b.status, existing.status);

    byId.set(b.id, {
      ...existing,
      ...b,
      status: resolvedStatus,
    });
  }
  return Array.from(byId.values());
}

function resolveMergedBenefitStatus(
  localStatus: PrimeBenefit['status'],
  remoteStatus: PrimeBenefit['status'],
): PrimeBenefit['status'] {
  if (localStatus === 'used' || remoteStatus === 'used') return 'used';
  if (localStatus === 'expired_unused' || remoteStatus === 'expired_unused') {
    // pending local gagne sur un remote « expired » stale pendant une demande en cours
    if (localStatus === 'pending_validation') return 'pending_validation';
    return 'expired_unused';
  }

  // Une demande « Utiliser » en cours a toujours priorité sur un remote encore « active »
  // (sync pending peut être en retard — ne jamais écraser le local).
  if (localStatus === 'pending_validation' || remoteStatus === 'pending_validation') {
    return 'pending_validation';
  }

  return localStatus;
}
