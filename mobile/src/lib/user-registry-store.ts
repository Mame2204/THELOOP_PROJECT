import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveCountryCode } from '@/lib/admin-country';
import type { CountryCode } from '@/lib/countries';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';
import { normalizePhone } from '@/lib/otp-auth';
import { isNetworkOnline } from '@/lib/offline-store';
import { hydrateScoped, peekMemory, peekScoped, scheduleScopedRefresh, scopedStorageKey } from '@/lib/swr-cache';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { SubscriptionStatus, User, UserRole } from '@/types';

export interface RegistryUser {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  userRole: string | null;
  birthDate: string | null;
  referralCode: string;
  referredByCode?: string | null;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionExpiresAt?: string | null;
  countryCode?: string | null;
  interestCountryCode?: string | null;
  city?: string | null;
  /** Verrou posé par un rétrograde admin (Prime → membre) — empêche la re-promotion locale. */
  adminRoleLocked?: boolean;
}

const KEY = 'loop_user_registry_v1';
const SCOPE = 'all';
const DISK_KEY = scopedStorageKey('loop_user_registry', SCOPE);

function dbRoleToUserRole(dbRole: string | null | undefined): UserRole {
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

function mapDbUserRow(row: Record<string, unknown>): RegistryUser {
  const userRole = row.user_role ? String(row.user_role) : 'member';
  return {
    id: String(row.id),
    email: row.email ? String(row.email) : null,
    phoneNumber: row.phone_number ? String(row.phone_number) : null,
    firstName: row.first_name ? String(row.first_name) : null,
    lastName: row.last_name ? String(row.last_name) : null,
    role: dbRoleToUserRole(userRole),
    userRole,
    birthDate: row.birth_date ? String(row.birth_date) : null,
    referralCode: row.referral_code ? String(row.referral_code) : '',
    referredByCode: row.referred_by_code ? String(row.referred_by_code) : null,
    subscriptionStatus: userRole === 'prime' ? 'active' : 'none',
    subscriptionExpiresAt: null,
    countryCode: row.country_code ? String(row.country_code) : null,
    interestCountryCode: row.interest_country_code ? String(row.interest_country_code) : null,
    city: row.city ? String(row.city) : null,
    adminRoleLocked: row.prime_role_locked === true,
  };
}

function mergeRegistry(local: RegistryUser[], remote: RegistryUser[]): RegistryUser[] {
  const byId = new Map<string, RegistryUser>();
  for (const row of local) {
    byId.set(row.id, row);
  }
  for (const row of remote) {
    const prev = byId.get(row.id);
    if (prev?.referralCode && !row.referralCode) {
      byId.set(row.id, {
        ...row,
        referralCode: prev.referralCode,
        referredByCode: row.referredByCode ?? prev.referredByCode ?? null,
      });
    } else {
      byId.set(row.id, row);
    }
  }
  return Array.from(byId.values());
}

async function fetchRegistryFromSupabase(): Promise<RegistryUser[] | null> {
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return null;

  // Pas de limit bas : les campagnes notif / octrois ont besoin de tous les comptes actifs.
  const { data, error } = await supabase
    .from('users')
    .select(
      'id, email, phone_number, first_name, last_name, user_role, birth_date, referral_code, referred_by_code, country_code, interest_country_code, city, prime_role_locked, is_active',
    )
    .eq('is_active', true)
    .range(0, 99_999);

  if (error || !data) {
    if (error) console.warn('[Registry] fetch users:', error.message);
    return null;
  }
  return data.map((row) => mapDbUserRow(row as Record<string, unknown>));
}

async function loadRegistry(): Promise<RegistryUser[]> {
  return (await peekScoped<RegistryUser[]>(SCOPE, DISK_KEY)) ?? [];
}

async function saveRegistry(users: RegistryUser[]): Promise<void> {
  await hydrateScoped(SCOPE, DISK_KEY, users);
}

/** Registre utilisateurs immédiat — cache local sans réseau. */
export async function peekRegistryUsers(): Promise<RegistryUser[]> {
  return loadRegistry();
}

export function getCachedRegistryUsers(): RegistryUser[] | null {
  return peekMemory<RegistryUser[]>(SCOPE);
}

export async function listRegistryUsers(forceRemote = false): Promise<RegistryUser[]> {
  if (forceRemote) {
    const local = await loadRegistry();
    const remote = await fetchRegistryFromSupabase();
    if (remote !== null) {
      const merged = mergeRegistry(local, remote);
      await saveRegistry(merged);
      return merged;
    }
    return local;
  }

  const cached = await loadRegistry();
  scheduleScopedRefresh(
    'registry_users',
    async () => {
      const local = cached;
      const remote = await fetchRegistryFromSupabase();
      if (remote === null) return null;
      return mergeRegistry(local, remote);
    },
    undefined,
    saveRegistry,
  );
  return cached;
}

/** Admins délégués (`user_role = admin`, actifs) pour TEAMS — aligné admin-web. */
export async function listDelegatedRegistryUsersForCountry(
  countryCode: CountryCode,
): Promise<RegistryUser[]> {
  const cc = countryCode.toUpperCase().slice(0, 2);

  if (isSupabaseConfigured() && supabase && (await isNetworkOnline())) {
    const { data, error } = await supabase
      .from('users')
      .select(
        'id, email, phone_number, first_name, last_name, user_role, birth_date, referral_code, referred_by_code, country_code, interest_country_code, city, prime_role_locked, is_active',
      )
      .eq('user_role', 'admin')
      .eq('is_active', true)
      .order('email')
      .limit(100);
    if (!error && data) {
      return data
        .map((row) => mapDbUserRow(row as Record<string, unknown>))
        .filter(
          (u) =>
            (u.countryCode ?? DEFAULT_COUNTRY_CODE).toUpperCase().slice(0, 2) === cc,
        );
    }
  }

  const registry = await listRegistryUsers(true);
  return registry.filter(
    (u) =>
      (u.userRole ?? '').toLowerCase() === 'admin' &&
      (u.countryCode ?? DEFAULT_COUNTRY_CODE).toUpperCase().slice(0, 2) === cc,
  );
}

const PASS_GRANT_EXCLUDED_ROLES = new Set(['admin', 'super_admin', 'partner', 'tool_partner']);

function isPassGrantTargetUser(user: RegistryUser): boolean {
  const dbRole = (user.userRole ?? '').toLowerCase();
  return user.role !== 'ADMIN' && !PASS_GRANT_EXCLUDED_ROLES.has(dbRole);
}

function matchesPassGrantSearch(user: RegistryUser, query: string): boolean {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return false;

  const hay = [user.firstName, user.lastName, user.email, user.phoneNumber, user.referralCode]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const phoneDigits = user.phoneNumber ? normalizePhone(user.phoneNumber).replace(/\D/g, '') : '';
  const queryDigits = query.replace(/\D/g, '');

  if (queryDigits.length >= 4 && phoneDigits.includes(queryDigits)) return true;
  return tokens.every((token) => hay.includes(token));
}

/** Recherche membres éligibles à un octroi PASS (Supabase en priorité, aligné écran Utilisateurs). */
export async function searchRegistryUsersForPassGrant(
  query: string,
  countryCode?: CountryCode,
  limit = 8,
): Promise<RegistryUser[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  if (isSupabaseConfigured() && supabase && (await isNetworkOnline())) {
    const safe = q.replace(/[%_,]/g, ' ').slice(0, 80);
    let dbQuery = supabase
      .from('users')
      .select(
        'id, email, phone_number, first_name, last_name, user_role, birth_date, referral_code, referred_by_code, country_code, interest_country_code, city, prime_role_locked, is_active',
      )
      .eq('is_active', true)
      .not('user_role', 'in', '(admin,super_admin,partner,tool_partner)')
      .or(
        `email.ilike.%${safe}%,first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,phone_number.ilike.%${safe}%`,
      )
      .order('email')
      .limit(limit);

    if (countryCode) {
      dbQuery = dbQuery.or(`country_code.eq.${countryCode},country_code.is.null`);
    }

    const { data, error } = await dbQuery;
    if (!error && data) {
      return data
        .map((row) => mapDbUserRow(row as Record<string, unknown>))
        .filter(isPassGrantTargetUser);
    }
  }

  const registry = await listRegistryUsers(true);
  return registry.filter(isPassGrantTargetUser).filter((u) => matchesPassGrantSearch(u, q)).slice(0, limit);
}

export async function findRegistryUserById(userId: string): Promise<RegistryUser | null> {
  const users = await loadRegistry();
  return users.find((u) => u.id === userId) ?? null;
}

export async function findRegistryUserByReferralCode(code: string): Promise<RegistryUser | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const users = await loadRegistry();
  return users.find((u) => u.referralCode.toUpperCase() === normalized) ?? null;
}

export async function findRegistryUserByEmailOrPhone(
  email?: string | null,
  phone?: string | null,
): Promise<RegistryUser | null> {
  const users = await loadRegistry();
  const emailNorm = email?.trim().toLowerCase();
  const phoneNorm = phone?.trim() ? normalizePhone(phone) : null;
  return (
    users.find(
      (u) =>
        (emailNorm && u.email?.toLowerCase() === emailNorm) ||
        (phoneNorm && u.phoneNumber && normalizePhone(u.phoneNumber) === phoneNorm),
    ) ?? null
  );
}

export async function upsertRegistryUser(entry: RegistryUser): Promise<void> {
  const users = await loadRegistry();
  const idx = users.findIndex((u) => u.id === entry.id);
  if (idx >= 0) {
    const prev = users[idx];
    users[idx] = {
      ...prev,
      ...entry,
      adminRoleLocked:
        entry.userRole === 'prime'
          ? false
          : entry.adminRoleLocked !== undefined
            ? entry.adminRoleLocked
            : prev.adminRoleLocked,
    };
  } else users.push(entry);
  await saveRegistry(users);
}

/** Fusionne par téléphone ou e-mail pour aligner l'ID auth Supabase avec le registre local. */
export async function upsertRegistryUserByIdentity(entry: RegistryUser): Promise<void> {
  const users = await loadRegistry();
  const phoneNorm = entry.phoneNumber ? normalizePhone(entry.phoneNumber) : null;
  const emailNorm = entry.email?.trim().toLowerCase() ?? null;

  const idxById = users.findIndex((u) => u.id === entry.id);
  const idxByPhone = phoneNorm
    ? users.findIndex((u) => u.phoneNumber && normalizePhone(u.phoneNumber) === phoneNorm)
    : -1;
  const idxByEmail = emailNorm
    ? users.findIndex((u) => u.email?.toLowerCase() === emailNorm)
    : -1;

  const mergeIdx = idxById >= 0 ? idxById : idxByPhone >= 0 ? idxByPhone : idxByEmail;
  if (mergeIdx >= 0) {
    const prev = users[mergeIdx];
    users[mergeIdx] = {
      ...prev,
      ...entry,
      id: entry.id,
      adminRoleLocked:
        entry.userRole === 'prime'
          ? false
          : entry.adminRoleLocked !== undefined
            ? entry.adminRoleLocked
            : prev.adminRoleLocked,
    };
  } else {
    users.push(entry);
  }
  await saveRegistry(users);
}

export function userToRegistryEntry(
  user: User,
  referralCode: string,
  referredByCode?: string | null,
  extras?: { adminRoleLocked?: boolean },
): RegistryUser {
  return {
    id: user.id,
    email: user.email,
    phoneNumber: user.phoneNumber,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    userRole: user.userRole,
    birthDate: user.birthDate ?? null,
    referralCode,
    referredByCode: referredByCode ?? user.referredByCode ?? null,
    subscriptionStatus: user.subscriptionStatus ?? 'none',
    subscriptionExpiresAt: user.subscriptionExpiresAt ?? null,
    countryCode: user.countryCode ?? null,
    city: user.city ?? null,
    adminRoleLocked:
      user.userRole === 'prime'
        ? false
        : extras?.adminRoleLocked !== undefined
          ? extras.adminRoleLocked
          : undefined,
  };
}

export async function updateRegistrySubscription(
  userId: string,
  subscriptionStatus: SubscriptionStatus,
  subscriptionExpiresAt: string | null,
  role?: UserRole,
  userRole?: string | null,
): Promise<void> {
  const users = await loadRegistry();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx < 0) return;
  users[idx] = {
    ...users[idx],
    subscriptionStatus,
    subscriptionExpiresAt,
    role: role ?? users[idx].role,
    userRole: userRole ?? users[idx].userRole,
    adminRoleLocked:
      userRole === 'prime' || role === 'USER_PRIME' ? false : users[idx].adminRoleLocked,
  };
  await saveRegistry(users);
}
