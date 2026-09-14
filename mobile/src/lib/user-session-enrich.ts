import {
  getActiveSubscription,
  getPendingSubscriptions,
  getSuspendedSubscription,
  getUserFacingPrimePass,
  isRoleFreezeIntermediatePass,
  loadSubscriptionHistory,
} from '@/lib/subscription-history';
import { hydrateAndSyncPassGrantsFromSupabase } from '@/lib/pass-admin-store';
import { findRegistryUserById, updateRegistrySubscription } from '@/lib/user-registry-store';
import { syncUserDbRoleIfNeeded } from '@/lib/user-role-sync';
import type { User, UserRole } from '@/types';

const ROLE_RANK: Record<UserRole, number> = {
  USER_ANONYMOUS: 0,
  USER_FREE: 1,
  USER_PRIME: 2,
  PARTNER: 3,
  ADMIN: 4,
};

function higherRole(a: UserRole, b: UserRole): UserRole {
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

function applyRole(user: User, role: UserRole, userRole: string | null): User {
  return {
    ...user,
    role,
    userRole: userRole ?? user.userRole,
  };
}

/** Réconcilie rôle / abonnement depuis la base Supabase, le registre local et l'historique PASS. */
export async function enrichUserSession(user: User): Promise<User> {
  let next = { ...user };
  const registry = await findRegistryUserById(user.id);
  const dbSaysMember = user.userRole === 'member';
  const dbSaysPrime = user.userRole === 'prime';
  const isProtectedAppRole = next.role === 'ADMIN' || next.role === 'PARTNER';

  const history = await hydrateAndSyncPassGrantsFromSupabase(user.id);
  const realActivePrime = getActiveSubscription(history, 'prime');
  let activePrime = getUserFacingPrimePass(history) ?? realActivePrime;
  const suspendedPrime = getSuspendedSubscription(history, 'prime');

  // Source de vérité : `users.user_role` fixé par le super admin (Prime ↔ membre)
  if (dbSaysPrime && !isProtectedAppRole) {
    if (!activePrime && suspendedPrime) {
      const { restoreSuspendedPassesForRoleChange } = await import('@/lib/pass-admin-store');
      await restoreSuspendedPassesForRoleChange(user.id);
      const refreshed = await loadSubscriptionHistory(user.id);
      activePrime = getUserFacingPrimePass(refreshed) ?? getActiveSubscription(refreshed, 'prime');
    }
    if (!activePrime) {
      const { fetchUserDbRole } = await import('@/lib/user-role-sync');
      const stillPrime = (await fetchUserDbRole(user.id)) === 'prime';
      if (!stillPrime) {
        return applyRole(next, 'USER_FREE', 'member');
      }
    }
    next = {
      ...applyRole(next, 'USER_PRIME', 'prime'),
      subscriptionStatus: 'active',
      subscriptionExpiresAt:
        activePrime?.expiresAt ?? registry?.subscriptionExpiresAt ?? next.subscriptionExpiresAt ?? null,
    };
    if (registry) {
      const { upsertRegistryUser } = await import('@/lib/user-registry-store');
      await upsertRegistryUser({
        ...registry,
        role: 'USER_PRIME',
        userRole: 'prime',
        subscriptionStatus: 'active',
        subscriptionExpiresAt: next.subscriptionExpiresAt ?? null,
        adminRoleLocked: false,
      });
    }
    return next;
  }

  if (dbSaysMember && !isProtectedAppRole) {
    const adminForcedMember =
      user.primeRoleLocked === true || registry?.adminRoleLocked === true;
    const hasAdminFrozenPass = adminForcedMember || suspendedPrime != null;

    // Achat PASS : PASS actif (non gelé) alors que la base dit encore « membre »
    if (
      !hasAdminFrozenPass &&
      realActivePrime &&
      !isRoleFreezeIntermediatePass(realActivePrime)
    ) {
      await syncUserDbRoleIfNeeded(user.id, 'prime');
      next = {
        ...applyRole(next, 'USER_PRIME', 'prime'),
        subscriptionStatus: 'active',
        subscriptionExpiresAt: realActivePrime.expiresAt ?? registry?.subscriptionExpiresAt ?? null,
      };
      if (registry) {
        const { upsertRegistryUser } = await import('@/lib/user-registry-store');
        await upsertRegistryUser({
          ...registry,
          role: 'USER_PRIME',
          userRole: 'prime',
          subscriptionStatus: 'active',
          subscriptionExpiresAt: next.subscriptionExpiresAt ?? null,
          adminRoleLocked: false,
        });
      }
      return next;
    }

    const passBeforeSuspend = suspendedPrime ?? activePrime;
    if (
      hasAdminFrozenPass &&
      realActivePrime &&
      !isRoleFreezeIntermediatePass(realActivePrime)
    ) {
      const { suspendActivePassesForRoleChange } = await import('@/lib/pass-admin-store');
      await suspendActivePassesForRoleChange(user.id);
    }
    next = {
      ...applyRole(next, 'USER_FREE', 'member'),
      subscriptionStatus: passBeforeSuspend ? 'suspended' : 'none',
      subscriptionExpiresAt: passBeforeSuspend?.expiresAt ?? null,
    };
    if (registry) {
      const { upsertRegistryUser } = await import('@/lib/user-registry-store');
      await upsertRegistryUser({
        ...registry,
        role: 'USER_FREE',
        userRole: 'member',
        subscriptionStatus: passBeforeSuspend ? 'suspended' : 'none',
        subscriptionExpiresAt: passBeforeSuspend?.expiresAt ?? null,
        adminRoleLocked: hasAdminFrozenPass,
      });
    }
    return next;
  }

  const adminLocked = user.primeRoleLocked === true || registry?.adminRoleLocked === true;
  const blockPrimePromotion = adminLocked;

  if (registry?.role && registry.role !== 'USER_ANONYMOUS' && !blockPrimePromotion) {
    const mergedRole = higherRole(next.role, registry.role);
    if (mergedRole !== next.role) {
      next = applyRole(next, mergedRole, registry.userRole ?? next.userRole);
    }
    if (registry.subscriptionStatus === 'active') {
      next = {
        ...next,
        subscriptionStatus: 'active',
        subscriptionExpiresAt: registry.subscriptionExpiresAt ?? next.subscriptionExpiresAt ?? null,
      };
      if (registry.role === 'USER_PRIME' || registry.userRole === 'prime') {
        next = applyRole(next, 'USER_PRIME', 'prime');
      }
    }
  }

  if (activePrime && !isProtectedAppRole && !blockPrimePromotion) {
    next = {
      ...applyRole(next, 'USER_PRIME', 'prime'),
      subscriptionStatus: 'active',
      subscriptionExpiresAt: activePrime.expiresAt ?? next.subscriptionExpiresAt ?? null,
    };
  } else if (
    !activePrime &&
    next.role === 'USER_PRIME' &&
    history.some((r) => r.type === 'prime' && (r.status === 'expired' || r.status === 'active'))
  ) {
    const lastExpired = history.find((r) => r.type === 'prime' && r.status === 'expired');
    next = {
      ...applyRole(next, 'USER_FREE', 'member'),
      subscriptionStatus: getPendingSubscriptions(history, 'prime').length > 0 ? 'pending' : 'expired',
      subscriptionExpiresAt: lastExpired?.expiresAt ?? next.subscriptionExpiresAt ?? null,
    };
    await updateRegistrySubscription(
      user.id,
      next.subscriptionStatus ?? 'expired',
      next.subscriptionExpiresAt ?? null,
      'USER_FREE',
      'member',
    );
  }

  if (next.role !== user.role) {
    const roleToDb: Partial<Record<UserRole, string>> = {
      USER_PRIME: 'prime',
      PARTNER: 'partner',
      ADMIN: 'admin',
      USER_FREE: 'member',
    };
    next.userRole = roleToDb[next.role] ?? next.userRole;
  }

  if (
    next.role === 'USER_PRIME' &&
    next.userRole === 'prime' &&
    user.userRole !== 'prime' &&
    !isProtectedAppRole
  ) {
    await syncUserDbRoleIfNeeded(user.id, 'prime');
  } else if (
    next.role === 'USER_FREE' &&
    next.userRole === 'member' &&
    user.userRole !== 'prime' &&
    user.userRole !== 'member' &&
    !isProtectedAppRole
  ) {
    await syncUserDbRoleIfNeeded(user.id, 'member');
  }

  return next;
}
