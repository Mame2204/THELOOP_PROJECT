import AsyncStorage from '@react-native-async-storage/async-storage';
import { canonicalPhone, phonesEqual } from '@/lib/phone-canonical';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';
import { inferCountryCodeFromPhone } from '@/lib/otp-auth';
import { buildAuthLoginEmailCandidates } from '@/lib/auth-login';
import { DEV_MEMBER_PASSWORD } from '@/lib/otp-auth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { asDbUpdate, callRpc } from '@/lib/supabase-types';
import { upsertRegistryUser } from '@/lib/user-registry-store';
import { setPhoneDeactivated } from '@/lib/deactivated-users-store';
import { initiatePasswordReset } from '@/lib/password-reset-store';
import { normalizeEmail, validateSignupEmail } from '@/lib/email-auth';
import type { AdminUserInvite } from '@/lib/admin-types';
import { ADMIN_ASSIGNABLE_ROLES } from '@/lib/admin-types';
import type { UserRole } from '@/types';

const KEY = 'loop_admin_user_invites_v1';

function mapDbInviteRow(row: {
  id: string;
  phone_number: string | null;
  email: string | null;
  user_role: string;
  first_name: string | null;
  last_name: string | null;
  country_code?: string | null;
  otp_sent_at: string;
  activated_at: string | null;
  created_at: string;
}): AdminUserInvite {
  return {
    id: row.id,
    phoneNumber: row.phone_number ?? 'non_renseigne',
    email: row.email,
    userRole: mapDbRole(row.user_role),
    firstName: row.first_name,
    lastName: row.last_name,
    countryCode: row.country_code ?? inferCountryCodeFromPhone(row.phone_number ?? ''),
    city: null,
    otpSentAt: row.otp_sent_at,
    activatedAt: row.activated_at,
    createdAt: row.created_at,
  };
}

async function fetchPendingInviteByEmailFromSupabase(email: string): Promise<AdminUserInvite | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  const { data, error } = await supabase.rpc('find_pending_admin_invite_by_email', {
    p_email: email,
  });

  if (error) {
    console.warn('[admin-invite-store] find_pending_admin_invite_by_email:', error.message);
    return null;
  }

  if (!data || typeof data !== 'object') return null;
  const row = data as {
    id?: string;
    phone_number?: string | null;
    email?: string | null;
    user_role?: string;
    first_name?: string | null;
    last_name?: string | null;
    country_code?: string | null;
    otp_sent_at?: string;
    activated_at?: string | null;
    created_at?: string;
  };

  if (!row.id || !row.user_role || !row.otp_sent_at || !row.created_at) return null;
  if (row.activated_at) return null;

  return mapDbInviteRow({
    id: row.id,
    phone_number: row.phone_number ?? null,
    email: row.email ?? null,
    user_role: row.user_role,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    country_code: row.country_code ?? null,
    otp_sent_at: row.otp_sent_at,
    activated_at: row.activated_at ?? null,
    created_at: row.created_at,
  });
}

function mapDbRole(role: string): AdminUserInvite['userRole'] {
  const allowed = ADMIN_ASSIGNABLE_ROLES;
  return allowed.includes(role as AdminUserInvite['userRole']) ? (role as AdminUserInvite['userRole']) : 'member';
}

function roleToAppRole(userRole: AdminUserInvite['userRole']): UserRole {
  switch (userRole) {
    case 'admin':
    case 'super_admin':
      return 'ADMIN';
    case 'partner':
      return 'PARTNER';
    case 'prime':
      return 'USER_PRIME';
    default:
      return 'USER_FREE';
  }
}

async function loadLocalInvites(): Promise<AdminUserInvite[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AdminUserInvite[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLocalInvites(invites: AdminUserInvite[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(invites));
}

async function upsertLocalInvite(invite: AdminUserInvite): Promise<void> {
  const local = await loadLocalInvites();
  const idx = local.findIndex((i) => i.id === invite.id || phonesEqual(i.phoneNumber, invite.phoneNumber));
  if (idx >= 0) local[idx] = { ...local[idx], ...invite };
  else local.unshift(invite);
  await saveLocalInvites(local);
}

export async function listAdminInvites(countryCode?: string): Promise<AdminUserInvite[]> {
  const local = await loadLocalInvites();
  const merged = new Map<string, AdminUserInvite>();
  for (const inv of local) merged.set(inv.id, inv);

  if (isSupabaseConfigured() && supabase) {
    let query = supabase
      .from('admin_user_invites')
      .select('id, phone_number, email, user_role, first_name, last_name, country_code, otp_sent_at, activated_at, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (countryCode) query = query.eq('country_code', countryCode);
    const { data } = await query;
    if (data?.length) {
      for (const row of data) {
        const inv: AdminUserInvite = {
          id: row.id,
          phoneNumber: row.phone_number ?? 'non_renseigne',
          email: row.email,
          userRole: mapDbRole(row.user_role),
          firstName: row.first_name,
          lastName: row.last_name,
          countryCode: row.country_code ?? inferCountryCodeFromPhone(row.phone_number),
          city: null,
          otpSentAt: row.otp_sent_at,
          activatedAt: row.activated_at,
          createdAt: row.created_at,
        };
        merged.set(inv.id, { ...merged.get(inv.id), ...inv });
      }
    }
  }

  const all = [...merged.values()];
  return countryCode ? all.filter((i) => i.countryCode === countryCode) : all;
}

/** Lecture locale prioritaire — l'activant n'est pas admin (RLS Supabase). */
export async function findPendingInviteByPhone(phone: string): Promise<AdminUserInvite | null> {
  const normalized = canonicalPhone(phone);
  const local = await loadLocalInvites();
  const fromLocal = local.find((i) => !i.activatedAt && phonesEqual(i.phoneNumber, normalized));
  if (fromLocal) return fromLocal;

  const invites = await listAdminInvites();
  return invites.find((i) => !i.activatedAt && phonesEqual(i.phoneNumber, normalized)) ?? null;
}

export async function findPendingInviteByEmail(email: string): Promise<AdminUserInvite | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const local = await loadLocalInvites();
  const fromLocal = local.find(
    (i) => !i.activatedAt && i.email && normalizeEmail(i.email) === normalized,
  );
  if (fromLocal) return fromLocal;

  const fromSupabase = await fetchPendingInviteByEmailFromSupabase(normalized);
  if (fromSupabase) return fromSupabase;

  return null;
}

export async function createAdminUserInvite(input: {
  email: string;
  phone?: string;
  countryCode?: string;
  phoneDialCode?: import('@/lib/countries').PhoneDialCode;
  city?: string | null;
  userRole: AdminUserInvite['userRole'];
  firstName?: string;
  lastName?: string;
  createdByAdminId: string;
}): Promise<AdminUserInvite> {
  const emailCheck = validateSignupEmail(input.email);
  if (!emailCheck.ok) {
    throw new Error(emailCheck.message);
  }
  const phoneNumber = input.phone?.trim()
    ? canonicalPhone(input.phone, input.phoneDialCode)
    : '';
  const countryCode = input.countryCode ?? DEFAULT_COUNTRY_CODE;

  const invite: AdminUserInvite = {
    id: `inv-${Date.now()}`,
    phoneNumber: phoneNumber || 'non_renseigne',
    email: emailCheck.email,
    userRole: input.userRole,
    firstName: input.firstName?.trim() || null,
    lastName: input.lastName?.trim() || null,
    countryCode,
    city: input.city?.trim() || null,
    otpSentAt: new Date().toISOString(),
    activatedAt: null,
    createdAt: new Date().toISOString(),
  };

  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('admin_user_invites')
      .insert({
        phone_number: invite.phoneNumber,
        country_code: countryCode,
        email: invite.email,
        user_role: input.userRole,
        first_name: invite.firstName,
        last_name: invite.lastName,
        created_by: input.createdByAdminId,
      })
      .select('id, created_at, otp_sent_at')
      .single();

    if (error) {
      throw new Error(error.message);
    }
    if (data) {
      invite.id = data.id;
      invite.createdAt = data.created_at;
      invite.otpSentAt = data.otp_sent_at;
    }
  }

  await upsertLocalInvite(invite);

  // Envoi e-mail d'invitation (Auth Admin via Edge Function)
  if (isSupabaseConfigured() && supabase && invite.email) {
    const mailResult = await sendAdminInviteEmail({
      email: invite.email,
      inviteId: invite.id,
      firstName: invite.firstName,
      lastName: invite.lastName,
      userRole: invite.userRole,
      countryCode: invite.countryCode,
      phoneNumber: invite.phoneNumber === 'non_renseigne' ? null : invite.phoneNumber,
      city: invite.city,
    });
    if (!mailResult.ok) {
      const err = new Error(
        mailResult.error ??
          "Invitation enregistrée, mais l'e-mail n'a pas pu être envoyé. Déployez la Edge Function admin-send-invite.",
      );
      (err as Error & { invite: AdminUserInvite }).invite = invite;
      throw err;
    }
  }

  return invite;
}

export async function sendAdminInviteEmail(input: {
  email: string;
  inviteId: string;
  firstName?: string | null;
  lastName?: string | null;
  userRole: AdminUserInvite['userRole'];
  countryCode?: string;
  phoneNumber?: string | null;
  city?: string | null;
}): Promise<{ ok: boolean; error?: string; retryAfterSeconds?: number }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: true };
  }
  const { getAuthMemberFacingRedirectUrl } = await import('@/lib/auth-redirect');
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return { ok: false, error: 'Session administrateur requise pour envoyer l\'invitation.' };
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!supabaseUrl) {
    return { ok: false, error: 'URL Supabase manquante.' };
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/admin-send-invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: input.email,
        inviteId: input.inviteId,
        redirectTo: getAuthMemberFacingRedirectUrl(),
        firstName: input.firstName,
        lastName: input.lastName,
        userRole: input.userRole,
        countryCode: input.countryCode,
        phoneNumber: input.phoneNumber,
        city: input.city,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      ok?: boolean;
      retry_after_seconds?: number | null;
    };
    if (!response.ok) {
      if (response.status === 404) {
        return {
          ok: false,
          error:
            'Edge Function admin-send-invite introuvable (404). Déployez-la sur Supabase : supabase functions deploy admin-send-invite',
        };
      }
      const { resolveAuthEmailErrorMessage, getRetryAfterSeconds } = await import(
        '@/lib/auth-email-errors'
      );
      const errPayload = {
        message: body.error,
        status: response.status,
        code: body.error?.includes('over_email_send_rate_limit')
          ? 'over_email_send_rate_limit'
          : undefined,
      };
      const retryAfter =
        typeof body.retry_after_seconds === 'number' && body.retry_after_seconds > 0
          ? body.retry_after_seconds
          : getRetryAfterSeconds(errPayload);
      const message = resolveAuthEmailErrorMessage(
        errPayload,
        body.error ?? `Erreur HTTP ${response.status}`,
      );
      return {
        ok: false,
        error: message,
        retryAfterSeconds: retryAfter ?? undefined,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Impossible de joindre admin-send-invite.',
    };
  }
}

/** Active un compte invité (Auth déjà créé par l'admin) — définit le MDP côté serveur. */
export async function activateInvitedMemberAccount(input: {
  email: string;
  password: string;
  inviteId: string;
}): Promise<{ ok: boolean; error?: string; needsSignUp?: boolean }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'Supabase requis.' };
  }
  const emailCheck = validateSignupEmail(input.email);
  if (!emailCheck.ok) return { ok: false, error: emailCheck.message };

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!supabaseUrl) return { ok: false, error: 'URL Supabase manquante.' };

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/member-activate-invite`, {
      method: 'POST',
      headers: {
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: emailCheck.email,
        password: input.password,
        inviteId: input.inviteId,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      ok?: boolean;
    };
    if (response.status === 404 && body.error === 'no_auth_user') {
      return { ok: false, needsSignUp: true };
    }
    if (!response.ok) {
      return { ok: false, error: body.error ?? body.message ?? `Erreur HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Activation impossible.',
    };
  }
}

export async function markInviteActivated(inviteId: string, userIdOrPhone: string): Promise<void> {
  const now = new Date().toISOString();
  let userId = userIdOrPhone;

  if (!/^[0-9a-f-]{36}$/i.test(userIdOrPhone)) {
    const { findRegistryUserByEmailOrPhone } = await import('@/lib/user-registry-store');
    const match = await findRegistryUserByEmailOrPhone(null, canonicalPhone(userIdOrPhone));
    userId = match?.id ?? userIdOrPhone;
  }

  const local = await loadLocalInvites();
  const idx = local.findIndex((i) => i.id === inviteId);
  if (idx >= 0) {
    local[idx] = { ...local[idx], activatedAt: now };
    await saveLocalInvites(local);
  }

  if (isSupabaseConfigured() && supabase) {
    const inviteEmail = userIdOrPhone.includes('@')
      ? normalizeEmail(userIdOrPhone)
      : normalizeEmail(local[idx]?.email ?? '');
    if (inviteEmail) {
      const { error } = await supabase.rpc('mark_admin_user_invite_activated', {
        p_invite_id: inviteId,
        p_email: inviteEmail,
      });
      if (error) {
        console.warn('[admin-invite-store] mark_admin_user_invite_activated:', error.message);
      }
    }
  }

  const invite = local[idx] ?? (await findPendingInviteByPhone(userIdOrPhone));
  if (invite) {
    await upsertRegistryUser({
      id: userId,
      email: invite.email,
      phoneNumber: invite.phoneNumber,
      firstName: invite.firstName,
      lastName: invite.lastName,
      role: roleToAppRole(invite.userRole),
      userRole: invite.userRole,
      birthDate: null,
      referralCode: `LOOP-${String(userId).slice(0, 4).toUpperCase()}`,
      subscriptionStatus: invite.userRole === 'prime' ? 'active' : 'none',
      countryCode: invite.countryCode,
      city: invite.city ?? null,
    });
  }
}

export async function updateUserRole(
  userId: string,
  userRole: AdminUserInvite['userRole'],
  isActive: boolean,
  options?: { primeRoleLocked?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: true };
  }
  const dbPatch: Record<string, unknown> = {
    user_role: userRole,
    is_active: isActive,
    updated_at: new Date().toISOString(),
  };
  if (options?.primeRoleLocked !== undefined) {
    dbPatch.prime_role_locked = options.primeRoleLocked;
  } else if (userRole === 'prime') {
    dbPatch.prime_role_locked = false;
  }
  if (userRole === 'partner') {
    dbPatch.partner_can_manage_events = true;
    dbPatch.partner_can_manage_spots = true;
    dbPatch.partner_can_manage_tools = true;
  } else {
    // Rétrograde / autre rôle : couper les scopes partenaire
    dbPatch.partner_can_manage_events = false;
    dbPatch.partner_can_manage_spots = false;
    dbPatch.partner_can_manage_tools = false;
  }
  // Ne jamais patcher subscription_status / subscription_expires_at :
  // absents du schéma distant (cache PostgREST) sur certains projets.
  // Le retrait PASS / abonnement passe par revokeAllActivePassesForUser + registre local.
  const { error } = await supabase.from('users').update(asDbUpdate('users', dbPatch)).eq('id', userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Après un changement de rôle : suspend ou réactive le PASS sans modifier sa date de fin. */
export async function applyRoleDowngradeSideEffects(
  userId: string,
  previousRole: AdminUserInvite['userRole'] | string,
  nextRole: AdminUserInvite['userRole'],
  options?: { grantedByUserId?: string },
): Promise<void> {
  const leftPrime =
    (previousRole === 'prime' || previousRole === 'USER_PRIME') && nextRole !== 'prime';
  const joinedPrime = nextRole === 'prime' && previousRole !== 'prime';
  const leftPartner =
    (previousRole === 'partner' || previousRole === 'PARTNER') && nextRole !== 'partner';

  if (joinedPrime) {
    const { restoreSuspendedPassesForRoleChange } = await import('@/lib/pass-admin-store');
    await restoreSuspendedPassesForRoleChange(userId);
    return;
  }

  if (leftPrime || (leftPartner && nextRole === 'member')) {
    const { suspendActivePassesForRoleChange } = await import('@/lib/pass-admin-store');
    await suspendActivePassesForRoleChange(userId, options?.grantedByUserId ?? 'role-freeze');
  }
}

export async function toggleUserActive(
  userId: string,
  isActive: boolean,
  phone?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    if (phone) await setPhoneDeactivated(phone, !isActive);
    return { ok: true };
  }
  const { error } = await supabase
    .from('users')
    .update({
      is_active: isActive,
      account_status: isActive ? 'active' : 'suspended',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) return { ok: false, error: error.message };
  if (phone) await setPhoneDeactivated(phone, !isActive);
  return { ok: true };
}

import type { PartnerContentScopes } from '@/types';

export interface AdminUserProfilePatch {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  city?: string | null;
  countryCode?: string | null;
  birthDate?: string | null;
  userRole?: AdminUserInvite['userRole'];
  isActive?: boolean;
  partnerContentScopes?: PartnerContentScopes;
  primeRoleLocked?: boolean;
}

export async function updateAdminUserProfile(
  userId: string,
  patch: AdminUserProfilePatch,
): Promise<{ ok: boolean; error?: string; authSyncWarning?: string }> {
  const existing = await import('@/lib/user-registry-store').then((m) => m.findRegistryUserById(userId));
  if (existing) {
    await upsertRegistryUser({
      ...existing,
      ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
      ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.phoneNumber !== undefined ? { phoneNumber: patch.phoneNumber } : {}),
      ...(patch.city !== undefined ? { city: patch.city } : {}),
      ...(patch.countryCode !== undefined ? { countryCode: patch.countryCode } : {}),
      ...(patch.birthDate !== undefined ? { birthDate: patch.birthDate } : {}),
      ...(patch.userRole !== undefined ? { userRole: patch.userRole, role: roleToAppRole(patch.userRole) } : {}),
    });
  }

  if (!isSupabaseConfigured() || !supabase) {
    return { ok: true };
  }

  let normalizedNewEmail: string | null = null;
  let previousEmail: string | null = null;

  if (patch.email !== undefined) {
    const rawEmail = patch.email?.trim() ?? '';
    if (!rawEmail) {
      return { ok: false, error: 'E-mail requis pour permettre la connexion.' };
    }
    const emailCheck = validateSignupEmail(rawEmail);
    if (!emailCheck.ok) {
      return { ok: false, error: emailCheck.message };
    }
    normalizedNewEmail = emailCheck.email;

    const { data: prior, error: priorError } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .maybeSingle();
    if (priorError) {
      return { ok: false, error: priorError.message };
    }
    previousEmail = prior?.email ? normalizeEmail(String(prior.email)) : null;
  }

  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.firstName !== undefined) dbPatch.first_name = patch.firstName;
  if (patch.lastName !== undefined) dbPatch.last_name = patch.lastName;
  if (normalizedNewEmail) {
    dbPatch.email = normalizedNewEmail;
  }
  if (patch.phoneNumber !== undefined) dbPatch.phone_number = patch.phoneNumber;
  if (patch.city !== undefined) dbPatch.city = patch.city;
  if (patch.countryCode !== undefined) dbPatch.country_code = patch.countryCode;
  if (patch.birthDate !== undefined) dbPatch.birth_date = patch.birthDate || null;
  if (patch.userRole !== undefined) {
    dbPatch.user_role = patch.userRole;
    if (patch.primeRoleLocked !== undefined) {
      dbPatch.prime_role_locked = patch.primeRoleLocked;
    } else if (patch.userRole === 'prime') {
      dbPatch.prime_role_locked = false;
    }
  }
  if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive;
  if (patch.partnerContentScopes) {
    dbPatch.partner_can_manage_events = patch.partnerContentScopes.events;
    dbPatch.partner_can_manage_spots = patch.partnerContentScopes.spots;
    dbPatch.partner_can_manage_tools = patch.partnerContentScopes.tools;
  }

  const { error } = await supabase.from('users').update(asDbUpdate('users', dbPatch)).eq('id', userId);
  if (error) return { ok: false, error: error.message };

  let authSyncWarning: string | undefined;
  const emailChanged =
    normalizedNewEmail != null && normalizedNewEmail !== (previousEmail ?? '');

  if (emailChanged && normalizedNewEmail) {
    authSyncWarning = await syncAuthUserEmailAfterProfileSave(userId, normalizedNewEmail);
  }

  return { ok: true, authSyncWarning };
}

async function syncAuthUserEmailAfterProfileSave(
  userId: string,
  email: string,
): Promise<string | undefined> {
  if (!supabase) return 'Synchronisation Auth indisponible.';

  const { error: rpcError } = await callRpc(supabase, 'admin_sync_auth_user_email', {
    p_user_id: userId,
    p_email: email,
  });
  if (!rpcError) return undefined;

  const { isAdminBackendConfigured, syncUserEmailViaBackend } = await import('@/lib/admin-user-backend-api');
  if (isAdminBackendConfigured()) {
    const backendRes = await syncUserEmailViaBackend(userId, email);
    if (backendRes.ok) return undefined;
    return (
      backendRes.error ??
      'Profil enregistré, mais la connexion Auth n\'a pas pu être synchronisée.'
    );
  }

  const { mapAuthEmailSyncError } = await import('@/lib/auth-login');
  return (
    mapAuthEmailSyncError(rpcError.message) +
    ' Le profil public.users est à jour ; lancez le backend admin ou exécutez la migration SQL.'
  );
}

export async function requestAdminPasswordReset(
  email: string,
  adminId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const check = validateSignupEmail(email);
  if (!check.ok) return { ok: false, error: check.message };
  if (!isSupabaseConfigured() || !supabase) {
    await initiatePasswordReset(check.email, adminId);
    return { ok: true };
  }
  const { getAuthMemberFacingRedirectUrl } = await import('@/lib/auth-redirect');
  const { error } = await supabase.auth.resetPasswordForEmail(check.email, {
    redirectTo: getAuthMemberFacingRedirectUrl(),
  });
  if (error) return { ok: false, error: error.message };
  await initiatePasswordReset(check.email, adminId);
  return { ok: true };
}

/** Après OTP validé — tente mise à jour Supabase Auth (comptes dev Loop1234!). */
export async function applyPasswordResetAfterOtp(
  phone: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: true };
  }
  const phoneNumber = canonicalPhone(phone);
  const { data: userRow, error } = await supabase
    .from('users')
    .select('email')
    .eq('phone_number', phoneNumber)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!userRow?.email) return { ok: false, error: 'Compte introuvable' };

  const loginEmails = buildAuthLoginEmailCandidates(userRow.email, phoneNumber);
  const candidates = [DEV_MEMBER_PASSWORD, 'Loop1234!'];
  for (const authEmail of loginEmails) {
    for (const candidate of candidates) {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: candidate,
      });
      if (!signInError && data.session) {
        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        await supabase.auth.signOut();
        if (updateError) return { ok: false, error: updateError.message };
        return { ok: true };
      }
    }
  }
  const { getAuthMemberFacingRedirectUrl } = await import('@/lib/auth-redirect');
  await supabase.auth.resetPasswordForEmail(userRow.email, {
    redirectTo: getAuthMemberFacingRedirectUrl(),
  });
  return { ok: true };
}
