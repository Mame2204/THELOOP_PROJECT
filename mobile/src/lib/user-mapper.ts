import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';
import { getAppRoleForDbSlug } from '@/lib/platform-roles-store';
import { DEFAULT_PARTNER_CONTENT_SCOPES, parsePartnerContentScopesFromRow, resolvePartnerContentScopes } from '@/lib/partner-content-scopes';
import type { User, UserRole } from '@/types';
import type { DbUser } from '@/types/user-db';

export function mapDbRole(dbRole: string): UserRole {
  if (dbRole === 'tool_partner') return 'PARTNER';
  return getAppRoleForDbSlug(dbRole) ?? 'USER_FREE';
}

export function mapDbUser(row: DbUser | Record<string, unknown>): User {
  const firstName = String(row.first_name ?? '').trim() || null;
  const lastName = String(row.last_name ?? '').trim() || null;
  const dbRole = String(row.user_role ?? 'member');
  const role = mapDbRole(dbRole);
  const scopeRaw = parsePartnerContentScopesFromRow(row as Record<string, unknown>);

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
    role,
    partnerContentScopes: resolvePartnerContentScopes(role, scopeRaw),
    company: typeof (row as Record<string, unknown>).company === 'string' ? String((row as Record<string, unknown>).company) : null,
    jobTitle: typeof (row as Record<string, unknown>).job_title === 'string' ? String((row as Record<string, unknown>).job_title) : null,
    sector: null,
    isDirectoryOptIn: false,
    birthDate: typeof (row as Record<string, unknown>).birth_date === 'string' ? String((row as Record<string, unknown>).birth_date) : null,
    countryCode: String((row as Record<string, unknown>).country_code ?? DEFAULT_COUNTRY_CODE),
    interestCountryCode:
      typeof (row as Record<string, unknown>).interest_country_code === 'string'
        ? String((row as Record<string, unknown>).interest_country_code)
        : null,
    city: typeof (row as Record<string, unknown>).city === 'string' ? String((row as Record<string, unknown>).city) : null,
    primeRoleLocked: row.prime_role_locked === true,
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
  const birthDate = typeof meta.birth_date === 'string' ? meta.birth_date : null;
  const countryCode = typeof meta.country_code === 'string'
    ? meta.country_code
    : DEFAULT_COUNTRY_CODE;
  const city = typeof meta.city === 'string' ? meta.city : null;
  const role = mapDbRole(dbRole);

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
    role,
    partnerContentScopes: resolvePartnerContentScopes(role, DEFAULT_PARTNER_CONTENT_SCOPES),
    company: null,
    jobTitle: null,
    sector: null,
    isDirectoryOptIn: false,
    birthDate,
    countryCode,
    interestCountryCode: null,
    city,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
