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
  user_role: string;
  qr_code_token: string;
  password_hash: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MemberSignUpInput {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string | null;
  countryCode?: string;
  password: string;
  website?: string | null;
}

/**
 * Placeholder pour `users.password_hash` (NOT NULL en base).
 * Le mot de passe réel est stocké uniquement par Supabase Auth via signUp.
 */
export const PASSWORD_HASH_AUTH_PLACEHOLDER = 'managed_by_supabase_auth';

/** Colonnes publiques de `users` (sans password_hash). */
export const USER_PUBLIC_COLUMNS =
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
