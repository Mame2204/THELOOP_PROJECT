import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { createAdminUserInvite, sendAdminInviteEmail } from '@/lib/admin-invite-store';
import { normalizeEmail, validateSignupEmail } from '@/lib/email-auth';
import type { AdminAssignableRole } from '@/lib/admin-types';

export type WaitlistStatus = 'pending' | 'invited' | 'activated' | 'rejected';

export type WaitlistEntry = {
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
};

function mapRow(row: Record<string, unknown>): WaitlistEntry {
  const email = String(row.email ?? '');
  const fullName =
    typeof row.full_name === 'string' && row.full_name.trim()
      ? row.full_name.trim()
      : [row.first_name, row.last_name].filter((x) => typeof x === 'string' && String(x).trim()).join(' ') ||
        null;
  return {
    id: String(row.id),
    email,
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

export async function listWaitlistEntries(status?: WaitlistStatus): Promise<{
  entries: WaitlistEntry[];
  error?: string;
}> {
  if (!isSupabaseConfigured() || !supabase) {
    return { entries: [], error: 'Supabase requis' };
  }
  let query = supabase
    .from('waitlist')
    .select(
      'id, email, full_name, first_name, last_name, phone, country_code, city, source, status, invite_id, invited_at, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(300);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return { entries: [], error: error.message };
  return { entries: (data ?? []).map((row) => mapRow(row as Record<string, unknown>)) };
}

/** Pré-crée un compte (invitation + e-mail) depuis une entrée waitlist. */
export async function precreateAccountFromWaitlist(
  entry: WaitlistEntry,
  adminId: string,
  userRole: AdminAssignableRole = 'member',
): Promise<{ ok: boolean; error?: string }> {
  const emailCheck = validateSignupEmail(entry.email);
  if (!emailCheck.ok) return { ok: false, error: emailCheck.message };
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'Supabase requis' };
  }

  const nameParts = (entry.fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const firstName = entry.firstName?.trim() || nameParts[0] || undefined;
  const lastName =
    entry.lastName?.trim() || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined);

  // Renvoi : invitation déjà liée
  if (entry.inviteId && entry.status === 'invited') {
    const resent = await sendAdminInviteEmail({
      email: emailCheck.email,
      inviteId: entry.inviteId,
      firstName,
      lastName,
      userRole,
      countryCode: entry.countryCode,
      phoneNumber: entry.phone,
      city: entry.city,
    });
    if (!resent.ok) return { ok: false, error: resent.error };
    await supabase
      .from('waitlist')
      .update({ invited_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', entry.id);
    return { ok: true };
  }

  try {
    const invite = await createAdminUserInvite({
      email: emailCheck.email,
      phone: entry.phone ?? undefined,
      countryCode: entry.countryCode,
      city: entry.city,
      userRole,
      firstName,
      lastName,
      createdByAdminId: adminId,
    });

    const { error } = await supabase
      .from('waitlist')
      .update({
        status: 'invited',
        invite_id: invite.id,
        invited_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        first_name: firstName ?? null,
        last_name: lastName ?? null,
      })
      .eq('id', entry.id);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && 'invite' in err) {
      const invite = (err as Error & { invite: { id: string; email: string | null } }).invite;
      if (invite.email) {
        const resent = await sendAdminInviteEmail({
          email: normalizeEmail(invite.email),
          inviteId: invite.id,
          firstName,
          lastName,
          userRole,
          countryCode: entry.countryCode,
          phoneNumber: entry.phone,
          city: entry.city,
        });
        if (resent.ok) {
          await supabase
            .from('waitlist')
            .update({
              status: 'invited',
              invite_id: invite.id,
              invited_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', entry.id);
          return { ok: true };
        }
        return { ok: false, error: resent.error ?? err.message };
      }
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Pré-création impossible' };
  }
}

export async function updateWaitlistStatus(
  id: string,
  status: WaitlistStatus,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'Supabase requis' };
  }
  const { error } = await supabase
    .from('waitlist')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
