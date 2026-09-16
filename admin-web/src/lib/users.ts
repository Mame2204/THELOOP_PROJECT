import { parseInviteEmailError } from './auth-email-errors';
import { getMemberAuthRedirectUrl } from './auth-redirect';
import { getAccessToken, supabase } from './supabase';
import { getApiUrl } from './api';

export type UserRoleDb = 'member' | 'prime' | 'partner' | 'admin' | 'super_admin';

export interface AdminUserRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  userRole: UserRoleDb;
  isActive: boolean;
  accountStatus: string | null;
  countryCode: string | null;
  city: string | null;
  birthDate: string | null;
  partnerCanManageEvents: boolean;
  partnerCanManageSpots: boolean;
  partnerCanManageTools: boolean;
  lastSeenAt: string | null;
  lastSignInAt: string | null;
  createdAt: string | null;
}

export interface UserUpdateInput {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  city: string;
  countryCode: string;
  birthDate: string;
  userRole: UserRoleDb;
  isActive: boolean;
  partnerCanManageEvents: boolean;
  partnerCanManageSpots: boolean;
  partnerCanManageTools: boolean;
}

export type WaitlistStatus = 'pending' | 'invited' | 'activated' | 'rejected';

export interface WaitlistEntry {
  id: string;
  email: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  countryCode: string;
  city: string | null;
  source: string | null;
  status: WaitlistStatus;
  inviteId: string | null;
  invitedAt: string | null;
  createdAt: string;
}

const USER_SELECT =
  'id, email, first_name, last_name, phone_number, user_role, is_active, account_status, country_code, city, birth_date, partner_can_manage_events, partner_can_manage_spots, partner_can_manage_tools, last_seen_at, created_at';

function mapUser(row: Record<string, unknown>, lastSignInAt: string | null = null): AdminUserRow {
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    firstName: typeof row.first_name === 'string' ? row.first_name : null,
    lastName: typeof row.last_name === 'string' ? row.last_name : null,
    phoneNumber: typeof row.phone_number === 'string' ? row.phone_number : null,
    userRole: (row.user_role as UserRoleDb) ?? 'member',
    isActive: Boolean(row.is_active ?? true),
    accountStatus: typeof row.account_status === 'string' ? row.account_status : null,
    countryCode: typeof row.country_code === 'string' ? row.country_code : null,
    city: typeof row.city === 'string' ? row.city : null,
    birthDate: typeof row.birth_date === 'string' ? row.birth_date : null,
    partnerCanManageEvents: Boolean(row.partner_can_manage_events),
    partnerCanManageSpots: Boolean(row.partner_can_manage_spots),
    partnerCanManageTools: Boolean(row.partner_can_manage_tools),
    lastSeenAt: typeof row.last_seen_at === 'string' ? row.last_seen_at : null,
    lastSignInAt,
    createdAt: typeof row.created_at === 'string' ? row.created_at : null,
  };
}

export function rolesEditableBy(adminRole: string): UserRoleDb[] {
  if (adminRole === 'super_admin') {
    return ['member', 'prime', 'partner', 'admin', 'super_admin'];
  }
  return ['member', 'prime', 'partner'];
}

export function accountStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'invited':
      return 'Invitation en attente';
    case 'suspended':
      return 'Suspendu';
    case 'archived':
      return 'Archivé';
    case 'deleted':
      return 'Supprimé';
    case 'active':
    default:
      return 'Actif';
  }
}

export function roleLabel(role: string): string {
  switch (role) {
    case 'member':
      return 'Membre';
    case 'prime':
      return 'Prime';
    case 'partner':
      return 'Partenaire';
    case 'admin':
      return 'Admin';
    case 'super_admin':
      return 'Super admin';
    default:
      return role;
  }
}

export async function listAdminUsers(options: {
  page: number;
  pageSize?: number;
  search?: string;
  countryCode?: string | null;
  filterCountry?: boolean;
  role?: string | null;
  activeOnly?: boolean | null;
  /** invited | active (hors invited/deleted) | suspended | archived */
  accountStatus?: 'invited' | 'active' | 'suspended' | 'archived' | null;
  /** Sans activité app (last_seen_at) depuis N jours — filtre SQL, pas seulement la page courante. */
  inactiveDays?: number | null;
}): Promise<{ users: AdminUserRow[]; total: number; error?: string }> {
  const pageSize = options.pageSize ?? 20;
  let query = supabase
    .from('users')
    .select(USER_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(options.page * pageSize, options.page * pageSize + pageSize - 1);

  if (options.filterCountry && options.countryCode) {
    query = query.or(`country_code.eq.${options.countryCode},country_code.is.null`);
  }
  if (options.role) query = query.eq('user_role', options.role);
  if (options.accountStatus === 'invited') {
    query = query.eq('account_status', 'invited');
  } else if (options.accountStatus === 'active') {
    query = query.eq('account_status', 'active');
  } else if (options.accountStatus === 'suspended') {
    query = query.eq('account_status', 'suspended');
  } else if (options.accountStatus === 'archived') {
    query = query.eq('account_status', 'archived');
  } else {
    query = query.neq('account_status', 'deleted');
  }
  if (options.activeOnly === true) query = query.eq('is_active', true);
  if (options.activeOnly === false) query = query.eq('is_active', false);
  if (options.inactiveDays && options.inactiveDays > 0) {
    const cutoff = new Date(
      Date.now() - options.inactiveDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    query = query.or(`last_seen_at.is.null,last_seen_at.lt.${cutoff}`);
  }

  const q = options.search?.trim();
  if (q) {
    query = query.or(
      `email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone_number.ilike.%${q}%`,
    );
  }

  const { data, error, count } = await query;
  if (error) {
    // Colonne last_seen_at absente → retenter sans filtre inactivité
    if (options.inactiveDays && /last_seen_at/i.test(error.message)) {
      return listAdminUsers({ ...options, inactiveDays: null });
    }
    return { users: [], total: 0, error: error.message };
  }

  const ids = (data ?? []).map((r) => String(r.id));
  const activity = await fetchUsersActivity(ids);

  return {
    users: (data ?? []).map((r) =>
      mapUser(r as Record<string, unknown>, activity[String(r.id)]?.lastSignInAt ?? null),
    ),
    total: count ?? 0,
  };
}

async function fetchUsersActivity(
  userIds: string[],
): Promise<Record<string, { lastSignInAt: string | null }>> {
  const API_URL = getApiUrl();
  if (!API_URL || userIds.length === 0) return {};
  try {
    const res = await fetch(`${API_URL}/api/admin/users-activity`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${(await getAccessToken()) ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userIds }),
    });
    const body = (await res.json()) as {
      activity?: Record<string, { lastSignInAt: string | null }>;
    };
    if (!res.ok) return {};
    return body.activity ?? {};
  } catch {
    return {};
  }
}

export async function updateAdminUser(
  userId: string,
  input: UserUpdateInput,
  options?: { syncEmail?: boolean },
): Promise<{ ok: boolean; error?: string; emailWarning?: string }> {
  const email = input.email.trim().toLowerCase();
  const isPartner = input.userRole === 'partner';
  const patch: Record<string, unknown> = {
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    email,
    phone_number: input.phoneNumber.trim() || null,
    city: input.city.trim() || null,
    country_code: input.countryCode.trim().toUpperCase().slice(0, 2) || null,
    birth_date: input.birthDate.trim() || null,
    user_role: input.userRole,
    is_active: input.isActive,
    account_status: input.isActive ? 'active' : 'suspended',
    partner_can_manage_events: isPartner ? input.partnerCanManageEvents : false,
    partner_can_manage_spots: isPartner ? input.partnerCanManageSpots : false,
    partner_can_manage_tools: isPartner ? input.partnerCanManageTools : false,
    prime_role_locked: input.userRole === 'prime' ? false : undefined,
    updated_at: new Date().toISOString(),
  };

  if (input.userRole !== 'prime') {
    // Si on quitte Prime, verrouiller pour éviter réactivation auto (aligné mobile)
    patch.prime_role_locked = true;
  }

  const { error } = await supabase.from('users').update(patch).eq('id', userId);
  if (error) return { ok: false, error: error.message };

  let emailWarning: string | undefined;
  if (options?.syncEmail !== false) {
    const sync = await syncUserEmail(userId, email);
    if (!sync.ok) emailWarning = sync.error ?? 'E-mail Auth non synchronisé.';
  }

  return { ok: true, emailWarning };
}

export async function setUserActive(
  userId: string,
  isActive: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('users')
    .update({
      is_active: isActive,
      account_status: isActive ? 'active' : 'suspended',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function archiveUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('users')
    .update({
      is_active: false,
      account_status: 'archived',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteUserIfOrphan(
  userId: string,
): Promise<{ ok: boolean; orphan?: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('admin_delete_user_if_orphan', {
    p_user_id: userId,
  });
  if (error) {
    if (/LINKED_CONTENT/i.test(error.message)) {
      return { ok: false, orphan: false, error: 'Contenu lié — archivez plutôt.' };
    }
    if (/NOT_PENDING_INVITE/i.test(error.message)) {
      return { ok: false, error: 'Compte actif — utilisez Archiver ou Suspendre.' };
    }
    if (/FORBIDDEN_ADMIN/i.test(error.message)) {
      return { ok: false, error: 'Impossible de supprimer un administrateur.' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: Boolean(data), orphan: Boolean(data) };
}

export async function cancelPendingInvite(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('admin_cancel_pending_invite', {
    p_user_id: userId,
  });
  if (error) {
    if (/LINKED_CONTENT/i.test(error.message)) {
      return { ok: false, error: 'Contenu lié — impossible d’annuler.' };
    }
    if (/NOT_PENDING_INVITE/i.test(error.message)) {
      return { ok: false, error: 'Ce compte n’est pas une invitation en attente.' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: Boolean(data) };
}

export async function syncUserEmail(
  userId: string,
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error: rpcError } = await supabase.rpc('admin_sync_auth_user_email', {
    p_user_id: userId,
    p_email: email,
  });
  if (!rpcError) return { ok: true };

  const API_URL = getApiUrl();
  if (!API_URL) return { ok: false, error: rpcError.message };
  try {
    const res = await fetch(`${API_URL}/api/admin/sync-user-email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${(await getAccessToken()) ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, email }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? rpcError.message };
    return { ok: true };
  } catch {
    return { ok: false, error: rpcError.message };
  }
}

export async function sendPasswordReset(email: string): Promise<{ ok: boolean; error?: string }> {
  const redirectTo = getMemberAuthRedirectUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function createUserInvite(input: {
  email: string;
  phone?: string;
  countryCode: string;
  city?: string;
  userRole: UserRoleDb;
  firstName?: string;
  lastName?: string;
  createdByAdminId: string;
}): Promise<{
  ok: boolean;
  inviteId?: string;
  email?: string;
  mailMode?: string;
  error?: string;
  retryAfterSeconds?: number;
}> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) return { ok: false, error: 'E-mail invalide.' };

  const phone = input.phone?.trim() || '';

  const { data: existingProfile } = await supabase
    .from('users')
    .select('id, account_status')
    .ilike('email', email)
    .maybeSingle();

  if (
    existingProfile?.account_status &&
    !['invited', 'deleted'].includes(existingProfile.account_status)
  ) {
    return {
      ok: false,
      error: 'Compte déjà actif pour cet e-mail. Utilisez « Reset MDP » depuis la fiche utilisateur.',
    };
  }

  const { data: pendingInvite } = await supabase
    .from('admin_user_invites')
    .select('id')
    .ilike('email', email)
    .is('activated_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let inviteId: string;

  if (pendingInvite?.id) {
    const { error: updateErr } = await supabase
      .from('admin_user_invites')
      .update({
        phone_number: phone || 'non_renseigne',
        country_code: input.countryCode,
        user_role: input.userRole,
        first_name: input.firstName?.trim() || null,
        last_name: input.lastName?.trim() || null,
        created_by: input.createdByAdminId,
      })
      .eq('id', pendingInvite.id);
    if (updateErr) return { ok: false, error: updateErr.message };
    inviteId = pendingInvite.id;
  } else {
    const { data, error } = await supabase
      .from('admin_user_invites')
      .insert({
        phone_number: phone || 'non_renseigne',
        country_code: input.countryCode,
        email,
        user_role: input.userRole,
        first_name: input.firstName?.trim() || null,
        last_name: input.lastName?.trim() || null,
        created_by: input.createdByAdminId,
      })
      .select('id')
      .single();

    if (error || !data) return { ok: false, error: error?.message ?? 'Invitation impossible.' };
    inviteId = data.id;
  }

  if (existingProfile?.account_status === 'invited') {
    await supabase
      .from('users')
      .update({
        user_role: input.userRole,
        first_name: input.firstName?.trim() || null,
        last_name: input.lastName?.trim() || null,
        country_code: input.countryCode,
        city: input.city?.trim() || null,
        phone_number: phone || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingProfile.id);
  }

  const mail = await sendInviteEmail({
    email,
    inviteId,
    firstName: input.firstName,
    lastName: input.lastName,
    userRole: input.userRole,
    countryCode: input.countryCode,
    phoneNumber: input.phone,
    city: input.city,
  });
  if (!mail.ok) {
    return {
      ok: false,
      inviteId,
      retryAfterSeconds: mail.retryAfterSeconds,
      error:
        mail.error ??
        "Invitation enregistrée, mais l'e-mail n'a pas pu être envoyé (Edge Function admin-send-invite).",
    };
  }

  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existingUser?.id) {
    await supabase.from('user_notifications').insert({
      user_id: existingUser.id,
      title: 'Invitation THE LOOP',
      message:
        'Vous avez été invité(e) sur THE LOOP. Ouvrez le lien reçu par e-mail pour activer votre accès.',
      audience: 'individual',
      sent_at: new Date().toISOString(),
    });
  }

  return { ok: true, inviteId, email, mailMode: mail.mode };
}

export async function sendInviteEmail(input: {
  email: string;
  inviteId: string;
  firstName?: string | null;
  lastName?: string | null;
  userRole: string;
  countryCode?: string;
  phoneNumber?: string | null;
  city?: string | null;
}): Promise<{ ok: boolean; mode?: string; error?: string; retryAfterSeconds?: number }> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: 'Session expirée.' };
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl || !anon) return { ok: false, error: 'Supabase non configuré.' };

  const redirectTo = getMemberAuthRedirectUrl();

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/admin-send-invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: input.email,
        inviteId: input.inviteId,
        redirectTo,
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
      mode?: string;
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
      const parsed = parseInviteEmailError(body);
      return {
        ok: false,
        error: parsed.message,
        retryAfterSeconds: parsed.retryAfterSeconds,
      };
    }
    return { ok: true, mode: body.mode ?? 'invite' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Envoi impossible.' };
  }
}

function mapWaitlist(row: Record<string, unknown>): WaitlistEntry {
  const fullName =
    typeof row.full_name === 'string' && row.full_name.trim()
      ? row.full_name.trim()
      : [row.first_name, row.last_name]
          .filter((x) => typeof x === 'string' && String(x).trim())
          .join(' ') || null;
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    fullName,
    firstName: typeof row.first_name === 'string' ? row.first_name : null,
    lastName: typeof row.last_name === 'string' ? row.last_name : null,
    phone: typeof row.phone === 'string' ? row.phone : null,
    countryCode: typeof row.country_code === 'string' ? row.country_code : 'GN',
    city: typeof row.city === 'string' ? row.city : null,
    source: typeof row.source === 'string' ? row.source : null,
    status: (row.status as WaitlistStatus) ?? 'pending',
    inviteId: typeof row.invite_id === 'string' ? row.invite_id : null,
    invitedAt: typeof row.invited_at === 'string' ? row.invited_at : null,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

export async function listWaitlist(
  status?: WaitlistStatus | 'all',
): Promise<{ entries: WaitlistEntry[]; error?: string }> {
  let query = supabase
    .from('waitlist')
    .select(
      'id, email, full_name, first_name, last_name, phone, country_code, city, source, status, invite_id, invited_at, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(300);
  if (status && status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return { entries: [], error: error.message };
  return { entries: (data ?? []).map((r) => mapWaitlist(r as Record<string, unknown>)) };
}

export async function rejectWaitlist(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('waitlist')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function inviteFromWaitlist(
  entry: WaitlistEntry,
  adminId: string,
  userRole: UserRoleDb = 'member',
): Promise<{ ok: boolean; error?: string; retryAfterSeconds?: number }> {
  const firstName =
    entry.firstName?.trim() ||
    entry.fullName?.trim().split(/\s+/)[0] ||
    undefined;
  const lastName =
    entry.lastName?.trim() ||
    entry.fullName?.trim().split(/\s+/).slice(1).join(' ') ||
    undefined;

  if (entry.inviteId && entry.status === 'invited') {
    const resent = await sendInviteEmail({
      email: entry.email,
      inviteId: entry.inviteId,
      firstName,
      lastName,
      userRole,
      countryCode: entry.countryCode,
      phoneNumber: entry.phone,
      city: entry.city,
    });
    if (!resent.ok) {
      return { ok: false, error: resent.error, retryAfterSeconds: resent.retryAfterSeconds };
    }
    await supabase
      .from('waitlist')
      .update({ invited_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', entry.id);
    return { ok: true };
  }

  const created = await createUserInvite({
    email: entry.email,
    phone: entry.phone ?? undefined,
    countryCode: entry.countryCode,
    city: entry.city ?? undefined,
    userRole,
    firstName,
    lastName,
    createdByAdminId: adminId,
  });
  if (!created.ok || !created.inviteId) {
    return {
      ok: false,
      error: created.error ?? 'Invitation impossible.',
      retryAfterSeconds: created.retryAfterSeconds,
    };
  }

  const { error } = await supabase
    .from('waitlist')
    .update({
      status: 'invited',
      invite_id: created.inviteId,
      invited_at: new Date().toISOString(),
      first_name: firstName ?? null,
      last_name: lastName ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', entry.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
