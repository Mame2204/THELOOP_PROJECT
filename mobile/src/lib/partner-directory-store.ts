import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { listRegistryUsers } from '@/lib/user-registry-store';

export interface PartnerDirectoryEntry {
  id: string;
  name: string;
  source: 'establishment' | 'partner_user';
  countryCode: string;
  /** UUID compte users (partenaires uniquement). */
  userId?: string | null;
  /** Raison sociale / enseigne si connue. */
  company?: string | null;
}

const EXTERNAL_PARTNER_ID = '__external__';
export const EXTERNAL_PARTNER_LABEL = 'Autre partenaire';

export function partnerAccountUserId(entry: PartnerDirectoryEntry): string {
  if (entry.userId) return entry.userId;
  if (entry.id.startsWith('user:')) return entry.id.slice(5);
  return entry.id;
}

export function partnerAccountDisplayName(entry: PartnerDirectoryEntry): string {
  return entry.company?.trim() || entry.name?.trim() || 'Partenaire';
}

export function isExternalPartnerId(id: string | null | undefined): boolean {
  return id === EXTERNAL_PARTNER_ID || id === null || id === undefined;
}

export async function listPartnerDirectory(countryCode?: string): Promise<PartnerDirectoryEntry[]> {
  const entries = new Map<string, PartnerDirectoryEntry>();

  if (isSupabaseConfigured() && supabase) {
    let query = supabase
      .from('establishments')
      .select('id, name, country_code, master_id')
      .eq('is_active', true)
      .order('name')
      .limit(15);
    if (countryCode) query = query.eq('country_code', countryCode);
    const { data: establishmentRows } = await query;

    const masterIds = [
      ...new Set(
        (establishmentRows ?? [])
          .map((row) => (row.master_id ? String(row.master_id) : ''))
          .filter(Boolean),
      ),
    ];
    const staffUserByMasterId = new Map<string, string>();
    if (masterIds.length) {
      const { data: staffRows } = await supabase
        .from('partner_staff')
        .select('id, user_id')
        .in('id', masterIds)
        .limit(15);
      for (const staff of staffRows ?? []) {
        if (staff.user_id) staffUserByMasterId.set(String(staff.id), String(staff.user_id));
      }
    }

    for (const row of establishmentRows ?? []) {
      const masterId = row.master_id ? String(row.master_id) : '';
      const userId = masterId ? staffUserByMasterId.get(masterId) ?? null : null;
      entries.set(String(row.id), {
        id: String(row.id),
        name: String(row.name),
        source: 'establishment',
        countryCode: String(row.country_code ?? DEFAULT_COUNTRY_CODE),
        userId,
      });
    }
  }

  const users = await listRegistryUsers();
  for (const u of users) {
    if (u.userRole !== 'partner' && u.role !== 'PARTNER') continue;
    const code = u.countryCode ?? DEFAULT_COUNTRY_CODE;
    if (countryCode && code !== countryCode) continue;
    const name = (`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email);
    if (!name) continue;
    const id = `user:${u.id}`;
    if (!entries.has(id)) {
      entries.set(id, {
        id,
        name,
        source: 'partner_user',
        countryCode: code,
        userId: u.id,
      });
    }
  }

  if (isSupabaseConfigured() && supabase) {
    let userQuery = supabase
      .from('users')
      .select('id, first_name, last_name, email, company, country_code, user_role')
      .in('user_role', ['partner'])
      .eq('is_active', true)
      .limit(15);
    if (countryCode) userQuery = userQuery.eq('country_code', countryCode);
    const { data: partnerUsers } = await userQuery;
    for (const row of partnerUsers ?? []) {
      const userId = String(row.id);
      const id = `user:${userId}`;
      const personalName = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || String(row.email ?? '');
      const company = row.company ? String(row.company).trim() : null;
      const label = company || personalName;
      if (!label) continue;
      entries.set(id, {
        id,
        name: label,
        source: 'partner_user',
        countryCode: String(row.country_code ?? DEFAULT_COUNTRY_CODE),
        userId,
        company,
      });
    }
  }

  return Array.from(entries.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Comptes partenaires Pro uniquement — sans les spots/établissements. */
async function collectPartnerUserEntries(countryCode?: string): Promise<Map<string, PartnerDirectoryEntry>> {
  const entries = new Map<string, PartnerDirectoryEntry>();

  const users = await listRegistryUsers();
  for (const u of users) {
    if (u.userRole !== 'partner' && u.role !== 'PARTNER') continue;
    const code = u.countryCode ?? DEFAULT_COUNTRY_CODE;
    if (countryCode && code !== countryCode) continue;
    const name = (`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email);
    if (!name) continue;
    const id = `user:${u.id}`;
    entries.set(id, {
      id,
      name,
      source: 'partner_user',
      countryCode: code,
      userId: u.id,
    });
  }

  if (isSupabaseConfigured() && supabase) {
    let userQuery = supabase
      .from('users')
      .select('id, first_name, last_name, email, company, country_code, user_role')
      .in('user_role', ['partner'])
      .eq('is_active', true)
      .limit(15);
    if (countryCode) userQuery = userQuery.eq('country_code', countryCode);
    const { data: partnerUsers } = await userQuery;
    for (const row of partnerUsers ?? []) {
      const userId = String(row.id);
      const id = `user:${userId}`;
      const personalName = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || String(row.email ?? '');
      const company = row.company ? String(row.company).trim() : null;
      const label = company || personalName;
      if (!label) continue;
      entries.set(id, {
        id,
        name: label,
        source: 'partner_user',
        countryCode: String(row.country_code ?? DEFAULT_COUNTRY_CODE),
        userId,
        company,
      });
    }

    const { data: tokenRows } = await supabase.rpc('list_partner_token_directory');
    for (const token of tokenRows ?? []) {
      if (!token.user_id) continue;
      const userId = String(token.user_id);
      const id = `user:${userId}`;
      const tokenName = String(token.partner_name ?? '').trim();
      if (!tokenName) continue;
      const prev = entries.get(id);
      entries.set(id, {
        id,
        name: tokenName,
        source: 'partner_user',
        countryCode: prev?.countryCode ?? countryCode ?? DEFAULT_COUNTRY_CODE,
        userId,
        company: prev?.company ?? tokenName,
      });
    }
  }

  return entries;
}

export async function listPartnerAccounts(countryCode?: string): Promise<PartnerDirectoryEntry[]> {
  const entries = await collectPartnerUserEntries(countryCode);
  return Array.from(entries.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

const offeringAccountsCache = new Map<string, PartnerDirectoryEntry[]>();

/** Cache mémoire immédiat — vide au premier lancement. */
export function peekBenefitOfferingAccounts(countryCode?: string): PartnerDirectoryEntry[] {
  const key = (countryCode ?? DEFAULT_COUNTRY_CODE).toUpperCase();
  return offeringAccountsCache.get(key) ?? [];
}

/**
 * Comptes pouvant offrir un avantage : partenaires Pro + super admins
 * (contenu event/spot/outil créé / validé par l'équipe THE LOOP).
 */
export async function listBenefitOfferingAccounts(countryCode?: string): Promise<PartnerDirectoryEntry[]> {
  const partners = await listPartnerAccounts(countryCode);
  const byId = new Map(partners.map((p) => [partnerAccountUserId(p), p]));

  const users = await listRegistryUsers();
  for (const u of users) {
    const role = (u.userRole ?? '').toLowerCase();
    if (role !== 'super_admin') continue;
    const personalName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email;
    if (!personalName) continue;
    const label = `THE LOOP · ${personalName}`;
    byId.set(u.id, {
      id: `user:${u.id}`,
      name: label,
      source: 'partner_user',
      countryCode: u.countryCode ?? countryCode ?? DEFAULT_COUNTRY_CODE,
      userId: u.id,
      company: 'THE LOOP',
    });
  }

  if (isSupabaseConfigured() && supabase) {
    const { data: admins } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, company, country_code, user_role')
      .eq('user_role', 'super_admin')
      .eq('is_active', true)
      .limit(15);
    for (const row of admins ?? []) {
      const userId = String(row.id);
      const personalName = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || String(row.email ?? '');
      const company = row.company ? String(row.company).trim() : null;
      const label = company || (personalName ? `THE LOOP · ${personalName}` : 'THE LOOP · Super admin');
      if (!label) continue;
      byId.set(userId, {
        id: `user:${userId}`,
        name: label,
        source: 'partner_user',
        countryCode: String(row.country_code ?? countryCode ?? DEFAULT_COUNTRY_CODE),
        userId,
        company: company ?? 'THE LOOP',
      });
    }
  }

  const result = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  offeringAccountsCache.set((countryCode ?? DEFAULT_COUNTRY_CODE).toUpperCase(), result);
  return result;
}

export async function resolvePartnerDisplayName(
  partnerId: string | null,
  externalName?: string | null,
  countryCode?: string,
): Promise<string | null> {
  if (externalName?.trim()) return externalName.trim();
  if (!partnerId || isExternalPartnerId(partnerId)) return externalName?.trim() || null;
  const directory = await listPartnerDirectory(countryCode);
  return directory.find((p) => p.id === partnerId)?.name ?? externalName?.trim() ?? null;
}

export { EXTERNAL_PARTNER_ID };
