import { DEFAULT_COUNTRY_CODE, inferCountryCodeFromPhone } from '@/lib/countries';
import type { User, UserRole } from '@/types';
import type { DbUser } from '@/types/user-db';

const DB_ROLE_TO_APP: Record<string, UserRole> = {
  member: 'USER_FREE',
  USER_FREE: 'USER_FREE',
  USER_PRIME: 'USER_PRIME',
  prime: 'USER_PRIME',
  BLACK_LOOP: 'USER_PRIME',
  PARTNER: 'PARTNER',
  partner: 'PARTNER',
  ADMIN: 'ADMIN',
  admin: 'ADMIN',
  super_admin: 'ADMIN',
};

export function mapDbRole(dbRole: string): UserRole {
  return DB_ROLE_TO_APP[dbRole] ?? 'USER_FREE';
}

export function mapDbUser(row: DbUser | Record<string, unknown>): User {
  const firstName = String(row.first_name ?? '').trim() || null;
  const lastName = String(row.last_name ?? '').trim() || null;
  const dbRole = String(row.user_role ?? 'member');

  return {
    id: String(row.id),
    email: String(row.email ?? '') || null,
    firstName,
    lastName,
    fullName: `${firstName ?? ''} ${lastName ?? ''}`.trim() || null,
    phoneNumber: typeof row.phone_number === 'string' ? row.phone_number : null,
    userRole: dbRole,
    qrCodeToken: String(row.qr_code_token ?? '') || null,
    avatarUrl: null,
    role: mapDbRole(dbRole),
    company: null,
    jobTitle: null,
    sector: null,
    isDirectoryOptIn: false,
    countryCode: String((row as Record<string, unknown>).country_code ?? inferCountryCodeFromPhone(typeof row.phone_number === 'string' ? row.phone_number : null) ?? DEFAULT_COUNTRY_CODE),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export interface AuthUserLike {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}

/** Repli si la ligne `users` est absente ou inaccessible (ex. RLS, délai trigger). */
export function mapAuthUserFallback(authUser: AuthUserLike): User {
  const meta = authUser.user_metadata ?? {};
  const firstName = String(meta.first_name ?? '').trim() || null;
  const lastName = String(meta.last_name ?? '').trim() || null;
  const dbRole = String(meta.user_role ?? 'member');
  const phoneNumber = typeof meta.phone_number === 'string' ? meta.phone_number : null;
  const countryCode = typeof meta.country_code === 'string'
    ? meta.country_code
    : inferCountryCodeFromPhone(phoneNumber) ?? DEFAULT_COUNTRY_CODE;

  return {
    id: authUser.id,
    email: authUser.email ?? null,
    firstName,
    lastName,
    fullName: `${firstName ?? ''} ${lastName ?? ''}`.trim() || null,
    phoneNumber,
    userRole: dbRole,
    qrCodeToken: typeof meta.qr_code_token === 'string' ? meta.qr_code_token : null,
    avatarUrl: null,
    role: mapDbRole(dbRole),
    company: null,
    jobTitle: null,
    sector: null,
    isDirectoryOptIn: false,
    countryCode,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
