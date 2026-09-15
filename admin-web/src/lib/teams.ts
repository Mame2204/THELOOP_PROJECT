import { supabase } from './supabase';

export interface RoleBenefitEntitlementEntry {
  catalogId: string;
  partnerId: string;
  partnerDisplayName?: string;
}

export interface StaffTeamPackConfig {
  byCountry: Record<string, RoleBenefitEntitlementEntry[]>;
  updatedAt: string;
  updatedBy?: string | null;
}

const REMOTE_KEY = 'staff_team_pack_by_country';

function emptyPack(): StaffTeamPackConfig {
  return { byCountry: {}, updatedAt: new Date(0).toISOString(), updatedBy: null };
}

export async function getStaffTeamPack(countryCode: string): Promise<RoleBenefitEntitlementEntry[]> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', REMOTE_KEY)
    .maybeSingle();
  if (error || data?.value == null) return [];
  const raw = data.value as Partial<StaffTeamPackConfig>;
  const entries = raw.byCountry?.[countryCode];
  return Array.isArray(entries) ? entries : [];
}

export async function saveStaffTeamPack(
  countryCode: string,
  entries: RoleBenefitEntitlementEntry[],
  updatedBy?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', REMOTE_KEY).maybeSingle();
  const current =
    data?.value && typeof data.value === 'object'
      ? (data.value as StaffTeamPackConfig)
      : emptyPack();
  const next: StaffTeamPackConfig = {
    byCountry: { ...current.byCountry, [countryCode]: entries },
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy ?? null,
  };
  const { error } = await supabase.from('app_settings').upsert({
    key: REMOTE_KEY,
    value: next,
    updated_at: next.updatedAt,
  });
  if (error) return { ok: false, error: error.message };

  // Aligne role_benefit_entitlements.admin pour le pays (admins délégués).
  const entitlementsKey = `role_benefit_entitlements_${countryCode}`;
  const entitlements = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', entitlementsKey)
    .maybeSingle();
  const base =
    entitlements.data?.value && typeof entitlements.data.value === 'object'
      ? (entitlements.data.value as Record<string, unknown>)
      : {};
  await supabase.from('app_settings').upsert({
    key: entitlementsKey,
    value: { ...base, admin: entries },
    updated_at: next.updatedAt,
  });

  return { ok: true };
}

export async function listDelegatedAdmins(countryCode: string): Promise<
  Array<{ id: string; name: string; email: string }>
> {
  const cc = countryCode.toUpperCase().slice(0, 2);
  const { data, error } = await supabase
    .from('users')
    .select('id, email, first_name, last_name, user_role, country_code')
    .eq('user_role', 'admin')
    .eq('is_active', true)
    .order('email')
    .limit(100);
  if (error || !data) return [];
  return data
    .filter((u) => (u.country_code ?? 'GN').toUpperCase().slice(0, 2) === cc)
    .map((u) => ({
      id: String(u.id),
      email: String(u.email ?? ''),
      name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || String(u.email ?? u.id).slice(0, 8),
    }));
}
