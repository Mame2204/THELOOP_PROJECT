import AsyncStorage from '@react-native-async-storage/async-storage';
import { asCountryCode } from '@/lib/countries';
import { extendSubscriptionByMonths } from '@/lib/prime-plans';
import { REFERRAL_CATALOG_ID, REFERRAL_PASS_LABEL } from '@/lib/pass-catalog-store';
import { loadReferralSettings } from '@/lib/referral-config-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  findRegistryUserById,
  findRegistryUserByReferralCode,
  listRegistryUsers,
  updateRegistrySubscription,
  upsertRegistryUser,
  userToRegistryEntry,
  type RegistryUser,
} from '@/lib/user-registry-store';
import { upsertActiveSubscription } from '@/lib/subscription-history';
import {
  sendPassActivationNotification,
} from '@/lib/pass-activation-messages-store';
import { syncUserDbRoleIfNeeded } from '@/lib/user-role-sync';
import {
  sendReferralCodeUsedNotification,
  sendReferralRewardNotification,
} from '@/lib/user-notifications-store';
import type { User } from '@/types';

export interface ReferralRecord {
  id: string;
  referrerUserId: string;
  referredUserId: string;
  referralCode: string;
  createdAt: string;
}

export interface ReferralRewardRecord {
  id: string;
  referrerUserId: string;
  rewardYear: number;
  monthsGranted: number;
  referralsCount: number;
  createdAt: string;
}

export interface ReferralStats {
  referralCode: string;
  totalReferrals: number;
  referralsThisYear: number;
  rewardsGrantedThisYear: number;
  monthsGrantedThisYear: number;
  monthsRemainingThisYear: number;
  /** Filleuls dans le palier en cours (0 = palier complet). */
  progressToNextReward: number;
  /** Paliers mathématiquement dus cette année (floor(filleuls / seuil)). */
  tiersEarnedThisYear: number;
  /** Paliers déjà enregistrés en base (referral_rewards). */
  tiersGrantedThisYear: number;
  /** Paliers dus mais pas encore octroyés — le parrain doit rafraîchir sa session. */
  pendingRewardTiers: number;
  referralsPerReward: number;
  rewardMonths: number;
  maxRewardMonthsPerYear: number;
}

/** Barre de progression parrainage (évite 0 % quand un palier vient d’être atteint). */
export function referralProgressView(stats: Pick<
  ReferralStats,
  'referralsThisYear' | 'referralsPerReward' | 'progressToNextReward'
>): { fillRatio: number; label: string } {
  const per = Math.max(1, stats.referralsPerReward);
  const inTier =
    stats.referralsThisYear > 0 && stats.progressToNextReward === 0
      ? per
      : stats.progressToNextReward;
  const fillRatio = Math.min(1, inTier / per);
  const label =
    stats.referralsThisYear > 0 && stats.progressToNextReward === 0
      ? `${per} / ${per} — palier atteint`
      : `${inTier} / ${per} vers le prochain mois offert`;
  return { fillRatio, label };
}

const REFERRALS_KEY = 'loop_referrals_v1';
const REWARDS_KEY = 'loop_referral_rewards_v1';
const PENDING_REWARDS_KEY = 'loop_pending_prime_rewards_v1';

interface PendingPrimeReward {
  userId: string;
  months: number;
  reason: string;
  createdAt: string;
}

async function loadReferralsRemote(userId: string): Promise<ReferralRecord[]> {
  if (!isSupabaseConfigured() || !supabase || !/^[0-9a-f-]{36}$/i.test(userId)) return [];
  const { data, error } = await supabase
    .from('referrals')
    .select('id, referrer_user_id, referred_user_id, referral_code, created_at')
    .or(`referrer_user_id.eq.${userId},referred_user_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error || !Array.isArray(data)) return [];
  return data.map((row) => ({
    id: String(row.id),
    referrerUserId: String(row.referrer_user_id),
    referredUserId: String(row.referred_user_id),
    referralCode: String(row.referral_code),
    createdAt: String(row.created_at),
  }));
}

async function loadRewardsRemote(userId: string): Promise<ReferralRewardRecord[]> {
  if (!isSupabaseConfigured() || !supabase || !/^[0-9a-f-]{36}$/i.test(userId)) return [];
  const { data, error } = await supabase
    .from('referral_rewards')
    .select('id, referrer_user_id, reward_year, months_granted, referrals_count, created_at')
    .eq('referrer_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !Array.isArray(data)) return [];
  return data.map((row) => ({
    id: String(row.id),
    referrerUserId: String(row.referrer_user_id),
    rewardYear: Number(row.reward_year),
    monthsGranted: Number(row.months_granted),
    referralsCount: Number(row.referrals_count),
    createdAt: String(row.created_at),
  }));
}

export function generateReferralCode(userId: string, firstName?: string | null): string {
  const prefix = 'LOOP';
  const namePart = (firstName ?? 'USER')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 4)
    .toUpperCase()
    .padEnd(4, 'X');
  const idPart = userId
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(-4)
    .toUpperCase()
    .padEnd(4, '0');
  return `${prefix}-${namePart}${idPart}`;
}

async function loadReferrals(): Promise<ReferralRecord[]> {
  const raw = await AsyncStorage.getItem(REFERRALS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ReferralRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveReferrals(records: ReferralRecord[]): Promise<void> {
  await AsyncStorage.setItem(REFERRALS_KEY, JSON.stringify(records));
}

async function loadRewards(): Promise<ReferralRewardRecord[]> {
  const raw = await AsyncStorage.getItem(REWARDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ReferralRewardRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveRewards(records: ReferralRewardRecord[]): Promise<void> {
  await AsyncStorage.setItem(REWARDS_KEY, JSON.stringify(records));
}

async function loadPendingRewards(): Promise<PendingPrimeReward[]> {
  const raw = await AsyncStorage.getItem(PENDING_REWARDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PendingPrimeReward[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function savePendingRewards(records: PendingPrimeReward[]): Promise<void> {
  await AsyncStorage.setItem(PENDING_REWARDS_KEY, JSON.stringify(records));
}

export async function ensureUserReferralCode(user: User): Promise<string> {
  await listRegistryUsers();
  const existing = await findRegistryUserById(user.id);
  if (existing?.referralCode) return existing.referralCode;

  const code = generateReferralCode(user.id, user.firstName);
  await upsertRegistryUser(userToRegistryEntry(user, code, user.referredByCode));

  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase
      .from('users')
      .update({ referral_code: code })
      .eq('id', user.id);
    if (error) {
      console.warn('[Referral] sync referral_code:', error.message);
    }
  }

  return code;
}

export async function registerNewMemberReferral(
  user: User,
  sponsorCode?: string | null,
): Promise<{ referralCode: string; referredByCode: string | null; rewardGrantedToReferrer: number }> {
  const normalizedSponsor = sponsorCode?.trim().toUpperCase() || null;
  const ownCode = generateReferralCode(user.id, user.firstName);

  let referredByCode: string | null = null;
  let rewardGranted = 0;

  if (normalizedSponsor && normalizedSponsor !== ownCode) {
    const referrer = await resolveSponsorReferrerByCode(normalizedSponsor);
    if (referrer && referrer.id !== user.id) {
      referredByCode = referrer.referralCode;
      const referrals = await loadReferrals();
      const remoteReferrals = await loadReferralsRemote(user.id);
      const allReferrals = [...remoteReferrals, ...referrals];
      const alreadyReferred = allReferrals.some((r) => r.referredUserId === user.id);
      if (!alreadyReferred) {
        const nextReferral: ReferralRecord = {
          id: `ref-${Date.now()}`,
          referrerUserId: referrer.id,
          referredUserId: user.id,
          referralCode: referrer.referralCode,
          createdAt: new Date().toISOString(),
        };
        referrals.push(nextReferral);
        await saveReferrals(referrals);
        if (isSupabaseConfigured() && supabase) {
          const { error: insertError } = await supabase.from('referrals').insert({
            referrer_user_id: referrer.id,
            referred_user_id: user.id,
            referral_code: referrer.referralCode,
          });
          if (insertError && !/duplicate key value|violates unique/i.test(insertError.message)) {
            console.warn('[Referral] insert remote:', insertError.message);
          }
        }
        await sendReferralCodeUsedNotification({
          referrerUserId: referrer.id,
          referredName: user.firstName,
        });
        if (referrer.role !== 'ADMIN') {
          // Source de vérité cloud : octroi PASS + notif parrain (RPC sécurité).
          if (isSupabaseConfigured() && supabase) {
            const { data: months, error: rewardError } = await supabase.rpc(
              'process_referrer_reward_for_referred',
            );
            if (rewardError) {
              console.warn('[Referral] process reward RPC:', rewardError.message);
              rewardGranted = await evaluateAndGrantReferralReward(referrer.id);
            } else {
              rewardGranted = Number(months) || 0;
            }
          } else {
            rewardGranted = await evaluateAndGrantReferralReward(referrer.id);
          }
        }
      }
    }
  }

  await upsertRegistryUser(
    userToRegistryEntry({ ...user, referredByCode }, ownCode, referredByCode),
  );

  return { referralCode: ownCode, referredByCode, rewardGrantedToReferrer: rewardGranted };
}

async function evaluateAndGrantReferralReward(referrerUserId: string): Promise<number> {
  const settings = await loadReferralSettings();
  if (settings.referralsPerReward <= 0 || settings.rewardMonths <= 0) return 0;

  const year = new Date().getFullYear();
  const localReferrals = await loadReferrals();
  const remoteReferrals = await loadReferralsRemote(referrerUserId);
  const referrals = remoteReferrals.length > 0 ? remoteReferrals : localReferrals;

  const localRewards = await loadRewards();
  const remoteRewards = await loadRewardsRemote(referrerUserId);
  const rewards = remoteRewards.length > 0 ? [...remoteRewards] : [...localRewards];

  const yearReferrals = referrals.filter(
    (r) => r.referrerUserId === referrerUserId && new Date(r.createdAt).getFullYear() === year,
  );
  const yearRewards = rewards.filter(
    (r) => r.referrerUserId === referrerUserId && r.rewardYear === year,
  );

  const monthsGrantedThisYear = yearRewards.reduce((sum, r) => sum + r.monthsGranted, 0);
  const monthsRemaining = Math.max(0, settings.maxRewardMonthsPerYear - monthsGrantedThisYear);
  if (monthsRemaining <= 0) return 0;

  const rewardsEarned = Math.floor(yearReferrals.length / settings.referralsPerReward);
  const rewardsAlreadyGranted = yearRewards.length;
  const newRewards = rewardsEarned - rewardsAlreadyGranted;
  if (newRewards <= 0) return 0;

  const monthsToGrant = Math.min(settings.rewardMonths * newRewards, monthsRemaining);
  if (monthsToGrant <= 0) return 0;

  const rewardRow: ReferralRewardRecord = {
    id: `reward-${Date.now()}`,
    referrerUserId,
    rewardYear: year,
    monthsGranted: monthsToGrant,
    referralsCount: yearReferrals.length,
    createdAt: new Date().toISOString(),
  };
  const nextLocalRewards = [...localRewards.filter((r) => r.id !== rewardRow.id), rewardRow];
  await saveRewards(nextLocalRewards);

  // Fallback démo / hors RPC : file d’attente locale + notif.
  const pending = await loadPendingRewards();
  pending.push({
    userId: referrerUserId,
    months: monthsToGrant,
    reason: `Parrainage — ${yearReferrals.length} filleuls`,
    createdAt: new Date().toISOString(),
  });
  await savePendingRewards(pending);

  await sendReferralRewardNotification({ userId: referrerUserId, months: monthsToGrant });

  return monthsToGrant;
}

/** Filet de sécurité : le parrain réconcilie ses mois dus au login. */
export async function reconcileReferralRewardsForCurrentUser(): Promise<number> {
  if (!isSupabaseConfigured() || !supabase) return 0;
  const { data, error } = await supabase.rpc('reconcile_my_referral_rewards');
  if (error) {
    console.warn('[Referral] reconcile rewards:', error.message);
    return 0;
  }
  return Number(data) || 0;
}

export async function getReferralStats(
  userId: string,
  user?: Pick<User, 'id' | 'firstName' | 'referralCode'>,
): Promise<ReferralStats | null> {
  await listRegistryUsers();
  let registry = await findRegistryUserById(userId);
  if (!registry && user) {
    const code = await ensureUserReferralCode(user as User);
    registry = await findRegistryUserById(userId) ?? {
      id: user.id,
      email: null,
      phoneNumber: null,
      firstName: user.firstName ?? null,
      lastName: null,
      role: 'USER_FREE',
      userRole: 'member',
      birthDate: null,
      referralCode: code,
    };
  }
  if (!registry) return null;

  let referralCode = registry.referralCode?.trim() || user?.referralCode?.trim() || '';
  if (!referralCode && user) {
    referralCode = await ensureUserReferralCode(user as User);
  }
  if (!referralCode) return null;

  const settings = await loadReferralSettings();
  const year = new Date().getFullYear();
  const localReferrals = await loadReferrals();
  const localRewards = await loadRewards();
  const remoteReferrals = await loadReferralsRemote(userId);
  const remoteRewards = await loadRewardsRemote(userId);
  const referrals = remoteReferrals.length > 0 ? remoteReferrals : localReferrals;
  const rewards = remoteRewards.length > 0 ? remoteRewards : localRewards;

  const yearReferrals = referrals.filter(
    (r) => r.referrerUserId === userId && new Date(r.createdAt).getFullYear() === year,
  );
  const yearRewards = rewards.filter((r) => r.referrerUserId === userId && r.rewardYear === year);
  const monthsGrantedThisYear = yearRewards.reduce((sum, r) => sum + r.monthsGranted, 0);
  const monthsRemainingThisYear = Math.max(0, settings.maxRewardMonthsPerYear - monthsGrantedThisYear);
  const per = settings.referralsPerReward;
  const progressToNextReward = per > 0 ? yearReferrals.length % per : 0;
  const tiersEarnedThisYear = per > 0 ? Math.floor(yearReferrals.length / per) : 0;
  const tiersGrantedThisYear = yearRewards.length;
  const pendingRewardTiers = Math.max(0, tiersEarnedThisYear - tiersGrantedThisYear);

  return {
    referralCode,
    totalReferrals: referrals.filter((r) => r.referrerUserId === userId).length,
    referralsThisYear: yearReferrals.length,
    rewardsGrantedThisYear: yearRewards.length,
    monthsGrantedThisYear,
    monthsRemainingThisYear,
    progressToNextReward,
    tiersEarnedThisYear,
    tiersGrantedThisYear,
    pendingRewardTiers,
    referralsPerReward: settings.referralsPerReward,
    rewardMonths: settings.rewardMonths,
    maxRewardMonthsPerYear: settings.maxRewardMonthsPerYear,
  };
}

export async function applyPendingPrimeRewards(user: User): Promise<User | null> {
  const registry = await findRegistryUserById(user.id);
  if (registry?.adminRoleLocked || user.primeRoleLocked === true) return null;

  const pending = await loadPendingRewards();
  const mine = pending.filter((p) => p.userId === user.id);
  if (mine.length === 0) return null;

  let totalMonths = 0;
  for (const reward of mine) totalMonths += reward.months;

  const currentExpires = registry?.subscriptionExpiresAt ?? user.subscriptionExpiresAt ?? null;
  const newExpiresAt = extendSubscriptionByMonths(totalMonths, currentExpires);

  await updateRegistrySubscription(user.id, 'active', newExpiresAt, 'USER_PRIME', 'prime');

  const remaining = pending.filter((p) => p.userId !== user.id);
  await savePendingRewards(remaining);

  const startedAt = new Date().toISOString();
  await upsertActiveSubscription(user.id, {
    type: 'prime',
    status: 'active',
    startedAt,
    expiresAt: newExpiresAt,
    label: `${REFERRAL_PASS_LABEL} (${totalMonths} mois offerts)`,
    passKind: 'referral',
    passCatalogId: REFERRAL_CATALOG_ID,
    grantNote: 'Octroi parrainage',
  });

  const { syncPassRecordToSupabase } = await import('@/lib/pass-admin-store');
  const history = await import('@/lib/subscription-history');
  const hist = await history.loadSubscriptionHistory(user.id);
  const active = hist.find((r) => r.type === 'prime' && r.status === 'active');
  if (active) void syncPassRecordToSupabase(active, user.id);

  await syncUserDbRoleIfNeeded(user.id, 'prime');
  await sendPassActivationNotification({
    userId: user.id,
    firstName: user.firstName,
    passLabel: `${REFERRAL_PASS_LABEL} (${totalMonths} mois offerts)`,
    passType: 'referral',
    countryCode: asCountryCode(user.countryCode),
  });

  return {
    ...user,
    userRole: 'prime',
    role: 'USER_PRIME',
    subscriptionStatus: 'active',
    subscriptionExpiresAt: newExpiresAt,
    isDirectoryOptIn: true,
    updatedAt: new Date().toISOString(),
  };
}

type SponsorReferrer = Pick<RegistryUser, 'id' | 'referralCode' | 'role' | 'userRole'>;

function mapDbRoleToUserRole(dbRole: string | null | undefined): User['role'] {
  switch (dbRole) {
    case 'super_admin':
    case 'admin':
      return 'ADMIN';
    case 'prime':
      return 'USER_PRIME';
    case 'partner':
    case 'tool_partner':
      return 'PARTNER';
    default:
      return 'USER_FREE';
  }
}

function sponsorFromRegistry(user: RegistryUser): SponsorReferrer {
  return {
    id: user.id,
    referralCode: user.referralCode,
    role: user.role,
    userRole: user.userRole,
  };
}

/** Parrain éligible : registre local (admin) puis Supabase RPC (inscription sans cache). */
export async function resolveSponsorReferrerByCode(code: string): Promise<SponsorReferrer | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  const local = await findRegistryUserByReferralCode(normalized);
  if (local) return sponsorFromRegistry(local);

  if (!isSupabaseConfigured() || !supabase) return null;

  const { data, error } = await supabase.rpc('lookup_sponsor_referral', { p_code: normalized });
  if (error) {
    console.warn('[Referral] lookup_sponsor_referral:', error.message);
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const row = data as unknown as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : null;
  if (!id) return null;
  const userRole = typeof row.user_role === 'string' ? row.user_role : 'member';
  const referralCode =
    typeof row.referral_code === 'string' && row.referral_code.trim()
      ? row.referral_code.trim().toUpperCase()
      : normalized;

  return {
    id,
    referralCode,
    userRole,
    role: mapDbRoleToUserRole(userRole),
  };
}

export async function isValidReferralCode(code: string): Promise<boolean> {
  const referrer = await resolveSponsorReferrerByCode(code);
  return referrer !== null;
}
