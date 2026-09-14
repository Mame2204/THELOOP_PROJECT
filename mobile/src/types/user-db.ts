/**
 * Table PostgreSQL `public.users` — Production V1.0
 * Sync avec Supabase Auth : users.id = auth.users.id
 */
export interface DbUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  country_code: string;
  interest_country_code?: string | null;
  city?: string | null;
  birth_date?: string | null;
  company?: string | null;
  job_title?: string | null;
  user_role: string;
  qr_code_token: string;
  password_hash: string;
  is_active: boolean;
  prime_role_locked?: boolean;
  partner_can_manage_events?: boolean;
  partner_can_manage_spots?: boolean;
  partner_can_manage_tools?: boolean;
  created_at: string;
  updated_at: string;
}

export interface MemberSignUpInput {
  firstName: string;
  lastName: string;
  email: string;
  /** Optionnel — peut être complété dans le profil. */
  phoneNumber?: string | null;
  countryCode?: string;
  phoneDialCode?: string;
  city?: string | null;
  password: string;
  birthDate?: string | null;
  /** Code parrain optionnel à l'inscription. */
  referralCode?: string | null;
  /** Rôle imposé (invitation admin). Défaut : member. */
  userRole?: 'member' | 'prime' | 'partner' | 'admin' | 'super_admin';
  /** Champ honeypot — doit rester vide (anti-bot). */
  website?: string | null;
}

/**
 * Placeholder pour `users.password_hash` (NOT NULL en base).
 * Le mot de passe réel est stocké uniquement par Supabase Auth via signUp.
 */
export const PASSWORD_HASH_AUTH_PLACEHOLDER = 'managed_by_supabase_auth';

/** Colonnes publiques de `users` (sans password_hash). */
export const USER_PUBLIC_COLUMNS =
  'id, first_name, last_name, email, phone_number, country_code, interest_country_code, city, birth_date, company, job_title, user_role, qr_code_token, is_active, prime_role_locked, partner_can_manage_events, partner_can_manage_spots, partner_can_manage_tools, created_at, updated_at';

/** Colonnes minimales si la migration ville/naissance n'est pas encore appliquée. */
export const USER_BASE_COLUMNS =
  'id, first_name, last_name, email, phone_number, country_code, user_role, qr_code_token, is_active, created_at, updated_at';

/** Payload client pour upsert `users` (sans is_active/created_at/updated_at). */
export interface DbUserInsertPayload {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  country_code: string;
  user_role: string;
  qr_code_token: string;
  password_hash: string;
}
