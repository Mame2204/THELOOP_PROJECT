import { supabase } from './supabase';
import { INTERMEDIATE_CATALOG_ID } from './pass';

type AppRole = 'member' | 'prime' | 'partner' | 'admin' | 'super_admin' | 'tool_partner';

function isPrimeRole(role: string): boolean {
  return role === 'prime' || role === 'USER_PRIME';
}

async function bulkPassStatus(
  userId: string,
  newStatus: string,
  matchStatuses: string[],
  options?: { excludeCatalogId?: string; onlyCatalogId?: string; onlyUnexpired?: boolean },
): Promise<{ ok: boolean; count: number; error?: string }> {
  const { data, error } = await supabase.rpc('bulk_update_user_pass_grants', {
    p_user_id: userId,
    p_new_status: newStatus,
    p_match_statuses: matchStatuses,
    p_exclude_catalog_id: options?.excludeCatalogId ?? null,
    p_only_catalog_id: options?.onlyCatalogId ?? null,
    p_only_unexpired: options?.onlyUnexpired ?? false,
  });
  if (error) return { ok: false, count: 0, error: error.message };
  return { ok: true, count: typeof data === 'number' ? data : 0 };
}

/** Aligné mobile `applyRoleDowngradeSideEffects` — sync cloud `user_pass_grants`. */
export async function applyPassRoleChangeEffects(
  userId: string,
  previousRole: string,
  nextRole: AppRole,
): Promise<{ ok: boolean; error?: string }> {
  const leftPrime = isPrimeRole(previousRole) && !isPrimeRole(nextRole);
  const joinedPrime = isPrimeRole(nextRole) && !isPrimeRole(previousRole);
  const leftPartner =
    (previousRole === 'partner' || previousRole === 'PARTNER') && nextRole !== 'partner';

  if (joinedPrime) {
    const expireIntermediate = await bulkPassStatus(userId, 'expired', ['active', 'suspended', 'revoked'], {
      onlyCatalogId: INTERMEDIATE_CATALOG_ID,
    });
    if (!expireIntermediate.ok) return { ok: false, error: expireIntermediate.error };

    const reactivate = await bulkPassStatus(userId, 'active', ['suspended', 'revoked'], {
      onlyUnexpired: true,
    });
    if (!reactivate.ok) return { ok: false, error: reactivate.error };
    return { ok: true };
  }

  if (leftPrime || (leftPartner && nextRole === 'member')) {
    const suspend = await bulkPassStatus(userId, 'suspended', ['active'], {
      excludeCatalogId: INTERMEDIATE_CATALOG_ID,
    });
    if (!suspend.ok) return { ok: false, error: suspend.error };
    return { ok: true };
  }

  return { ok: true };
}
