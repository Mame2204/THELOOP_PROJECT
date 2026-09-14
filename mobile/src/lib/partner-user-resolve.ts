import { loadPartnerSpotSession } from '@/lib/partner-session-store';
import { partnerNamesMatch } from '@/lib/partner-name-utils';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { USER_PUBLIC_COLUMNS } from '@/types/user-db';
import { mapDbUser } from '@/lib/user-mapper';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function parsePartnerUserId(partnerId: string | null | undefined): string | null {
  const raw = partnerId?.trim() ?? '';
  if (!raw) return null;
  const userPrefix = /^user:([0-9a-f-]{36})$/i.exec(raw);
  if (userPrefix) return userPrefix[1];
  return isUuid(raw) ? raw : null;
}

async function isPartnerUserId(id: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { data } = await supabase.from('users').select('id').eq('id', id).maybeSingle();
  return Boolean(data?.id);
}

async function resolveUserIdFromEstablishmentId(establishmentId: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data: establishment } = await supabase
    .from('establishments')
    .select('master_id')
    .eq('id', establishmentId)
    .maybeSingle();
  if (!establishment?.master_id) return null;

  const { data: staffUserId } = await supabase.rpc('resolve_partner_staff_user_id', {
    p_staff_id: establishment.master_id,
  });
  return staffUserId ? String(staffUserId) : null;
}

/** Lie un jeton SPOT / nom partenaire au compte `users` en base. */
export async function resolvePartnerUserIdForSync(
  partnerId: string | null | undefined,
  partnerName: string | null | undefined,
): Promise<string | null> {
  const partnerIdRaw = partnerId?.trim() ?? '';
  const candidateUserId = parsePartnerUserId(partnerIdRaw);
  if (candidateUserId && (await isPartnerUserId(candidateUserId))) {
    return candidateUserId;
  }

  if (candidateUserId) {
    const fromEstablishment = await resolveUserIdFromEstablishmentId(candidateUserId);
    if (fromEstablishment) return fromEstablishment;
  }

  if (!isSupabaseConfigured() || !supabase) return null;

  if (partnerIdRaw === 'admin') {
    const { data: authData } = await supabase.auth.getUser();
    if (authData.user?.id) return authData.user.id;
  }

  const spotTokenMatch = /^partner-([0-9a-f-]{36})$/i.exec(partnerIdRaw);
  if (spotTokenMatch) {
    const { data: tokenUserId } = await supabase.rpc('resolve_partner_token_user_id', {
      p_token_id: spotTokenMatch[1],
    });
    if (tokenUserId) return String(tokenUserId);
  }

  const session = await loadPartnerSpotSession();
  if (session?.tokenCode) {
    const { data: tokenRows } = await supabase.rpc('validate_partner_spot_token', {
      p_code: session.tokenCode.trim().toUpperCase(),
    });
    const byCode = Array.isArray(tokenRows) ? tokenRows[0] : tokenRows;
    if (byCode?.user_id) return String(byCode.user_id);
  }

  const name = partnerName?.trim() ?? '';
  if (name && supabase) {
    const { data: tokenRows } = await supabase.rpc('list_partner_token_directory');

    for (const tokenRow of tokenRows ?? []) {
      const tokenName = tokenRow.partner_name ? String(tokenRow.partner_name) : '';
      if (tokenName && partnerNamesMatch(tokenName, name) && tokenRow.user_id) {
        return String(tokenRow.user_id);
      }
    }

    const { data: partnerUsers } = await supabase
      .from('users')
      .select('id, first_name, last_name, company, email')
      .eq('user_role', 'partner')
      .eq('is_active', true)
      .limit(15);

    for (const row of partnerUsers ?? []) {
      const userId = String(row.id);
      const fullName = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
      const company = row.company ? String(row.company).trim() : '';
      const email = row.email ? String(row.email).trim() : '';
      if (
        (fullName && partnerNamesMatch(fullName, name))
        || (company && partnerNamesMatch(company, name))
        || (email && partnerNamesMatch(email, name))
      ) {
        return userId;
      }
    }

    const { data: establishment } = await supabase
      .from('establishments')
      .select('id, master_id, name')
      .limit(50);

    for (const est of establishment ?? []) {
      const estName = est.name ? String(est.name) : '';
      if (!estName || !partnerNamesMatch(estName, name) || !est.master_id) continue;
      const { data: staffUserId } = await supabase.rpc('resolve_partner_staff_user_id', {
        p_staff_id: est.master_id,
      });
      if (staffUserId) return String(staffUserId);
    }
  }

  return null;
}

/** Libellé partenaire (company / nom) depuis Supabase quand la session SPOT est absente. */
export async function resolvePartnerDisplayNameFromDb(partnerUserId: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase || !isUuid(partnerUserId)) return null;
  const { data } = await supabase
    .from('users')
    .select('company, first_name, last_name, email')
    .eq('id', partnerUserId)
    .maybeSingle();
  if (!data) return null;
  const company = String(data.company ?? '').trim();
  if (company) return company;
  const personal = `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim();
  return personal || String(data.email ?? '').trim() || null;
}

export async function loadPartnerUserFromDatabase(partnerName: string): Promise<ReturnType<typeof mapDbUser> | null> {
  const userId = await resolvePartnerUserIdForSync('spot-token', partnerName);
  if (!userId || !supabase) return null;

  const { data, error } = await supabase
    .from('users')
    .select(`${USER_PUBLIC_COLUMNS}, account_status, is_active`)
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return mapDbUser(data as Record<string, unknown>);
}
