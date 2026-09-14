import { supabase } from './supabase';

export type PassCatalogStatus = 'active' | 'inactive' | 'archived';
export type BillingPeriod = 'monthly' | 'quarterly' | 'annual' | 'lifetime';

export interface PassCatalogEntry {
  id: string;
  label: string;
  description: string;
  priceGnf: number;
  validityDays: number | null;
  grantableBySuperAdmin: boolean;
  purchasableInShop: boolean;
  shopBillingPeriod: BillingPeriod | null;
  status: PassCatalogStatus;
  isBuiltin: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type PassPriceMap = Record<BillingPeriod, number>;

export interface PassShopSettings {
  maxPendingPasses: number;
}

export type PassMessageType =
  | 'heritage'
  | 'monthly'
  | 'quarterly'
  | 'annual'
  | 'lifetime'
  | 'referral'
  | 'default';

export interface PassActivationMessage {
  id: string;
  passType: PassMessageType;
  passCatalogId?: string | null;
  name: string;
  titleTemplate: string;
  messageTemplate: string;
  status: 'active' | 'inactive' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface ActiveGrantRow {
  localId: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  countryCode: string | null;
  catalogId: string | null;
  label: string;
  startedAt: string;
  expiresAt: string | null;
  grantNote: string | null;
}

export const HERITAGE_CATALOG_ID = 'pass-heritage-builtin';
export const INTERMEDIATE_CATALOG_ID = 'pass-intermediaire-builtin';

export const SHOP_PERIOD_VALIDITY_DAYS: Record<BillingPeriod, number | null> = {
  monthly: 30,
  quarterly: 90,
  annual: 365,
  lifetime: null,
};

export const PERIOD_LABELS: Record<BillingPeriod, string> = {
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  annual: 'Annuel',
  lifetime: 'À vie',
};

function nowIso() {
  return new Date().toISOString();
}

function remoteKey(base: string, countryCode: string) {
  return `${base}_${countryCode.toUpperCase().slice(0, 2)}`;
}

async function fetchSetting<T>(key: string, legacyKey?: string): Promise<T | null> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (!error && data?.value != null) return data.value as T;
  if (legacyKey) {
    const legacy = await supabase.from('app_settings').select('value').eq('key', legacyKey).maybeSingle();
    if (!legacy.error && legacy.data?.value != null) return legacy.data.value as T;
  }
  return null;
}

async function upsertSetting(key: string, value: unknown): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('app_settings').upsert({
    key,
    value,
    updated_at: nowIso(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function defaultCatalog(): PassCatalogEntry[] {
  const createdAt = nowIso();
  return [
    {
      id: HERITAGE_CATALOG_ID,
      label: 'PASS Heritage',
      description: 'Offert sans paiement, sans expiration.',
      priceGnf: 0,
      validityDays: null,
      grantableBySuperAdmin: true,
      purchasableInShop: false,
      shopBillingPeriod: null,
      status: 'active',
      isBuiltin: true,
      sortOrder: 0,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: INTERMEDIATE_CATALOG_ID,
      label: 'PassIntermediaire',
      description: 'Gel administratif (restauration PASS d’origine).',
      priceGnf: 0,
      validityDays: null,
      grantableBySuperAdmin: true,
      purchasableInShop: false,
      shopBillingPeriod: null,
      status: 'active',
      isBuiltin: true,
      sortOrder: 1,
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

function defaultPrices(countryCode: string): PassPriceMap {
  const cc = countryCode.toUpperCase();
  if (['SN', 'CI', 'ML', 'BF', 'BJ', 'TG', 'NE'].includes(cc)) {
    return { monthly: 85_000, quarterly: 240_000, annual: 850_000, lifetime: 2_500_000 };
  }
  return { monthly: 850_000, quarterly: 2_400_000, annual: 8_500_000, lifetime: 25_000_000 };
}

function normalizeCatalog(list: PassCatalogEntry[]): PassCatalogEntry[] {
  const builtins = defaultCatalog();
  const byId = new Map(list.map((e) => [e.id, e]));
  for (const b of builtins) {
    if (!byId.has(b.id)) byId.set(b.id, b);
  }
  return [...byId.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

export async function loadPassCatalog(countryCode: string): Promise<PassCatalogEntry[]> {
  const key = remoteKey('pass_catalog_v1', countryCode);
  const legacy = countryCode.toUpperCase() === 'GN' ? 'pass_catalog_v1' : undefined;
  const remote = await fetchSetting<PassCatalogEntry[]>(key, legacy);
  if (Array.isArray(remote) && remote.length) return normalizeCatalog(remote);
  const seeded = defaultCatalog();
  await upsertSetting(key, seeded);
  return seeded;
}

export async function savePassCatalog(
  countryCode: string,
  catalog: PassCatalogEntry[],
): Promise<{ ok: boolean; error?: string }> {
  return upsertSetting(remoteKey('pass_catalog_v1', countryCode), normalizeCatalog(catalog));
}

export function computeExpiry(validityDays: number | null, from = new Date()): string | null {
  if (validityDays == null) return null;
  const end = new Date(from);
  end.setDate(end.getDate() + validityDays);
  return end.toISOString();
}

export async function loadPassPrices(countryCode: string): Promise<PassPriceMap> {
  const key = remoteKey('pass_prices_v1', countryCode);
  const remote = await fetchSetting<Partial<PassPriceMap>>(key);
  const base = defaultPrices(countryCode);
  if (!remote) return base;
  const next = { ...base };
  for (const k of Object.keys(base) as BillingPeriod[]) {
    const n = Number(remote[k]);
    if (Number.isFinite(n) && n > 0) next[k] = Math.floor(n);
  }
  return next;
}

export async function savePassPrices(
  countryCode: string,
  prices: PassPriceMap,
): Promise<{ ok: boolean; error?: string }> {
  return upsertSetting(remoteKey('pass_prices_v1', countryCode), prices);
}

export async function loadShopSettings(countryCode: string): Promise<PassShopSettings> {
  const key = remoteKey('pass_shop_settings_v1', countryCode);
  const legacy = countryCode.toUpperCase() === 'GN' ? 'pass_shop_settings_v1' : undefined;
  const remote = await fetchSetting<Partial<PassShopSettings>>(key, legacy);
  const n = Number(remote?.maxPendingPasses);
  return {
    maxPendingPasses: Number.isFinite(n) ? Math.min(20, Math.max(0, Math.floor(n))) : 3,
  };
}

export async function saveShopSettings(
  countryCode: string,
  settings: PassShopSettings,
): Promise<{ ok: boolean; error?: string }> {
  return upsertSetting(remoteKey('pass_shop_settings_v1', countryCode), {
    maxPendingPasses: Math.min(20, Math.max(0, Math.floor(settings.maxPendingPasses))),
  });
}

export async function loadActivationMessages(
  countryCode: string,
): Promise<PassActivationMessage[]> {
  const key = remoteKey('pass_activation_messages_v1', countryCode);
  const legacy = countryCode.toUpperCase() === 'GN' ? 'pass_activation_messages_v1' : undefined;
  const remote = await fetchSetting<PassActivationMessage[]>(key, legacy);
  return Array.isArray(remote) ? remote : [];
}

export async function saveActivationMessages(
  countryCode: string,
  messages: PassActivationMessage[],
): Promise<{ ok: boolean; error?: string }> {
  return upsertSetting(remoteKey('pass_activation_messages_v1', countryCode), messages);
}

export async function listActiveGrants(): Promise<ActiveGrantRow[]> {
  const { data, error } = await supabase
    .from('user_pass_grants')
    .select(
      'local_id, user_id, pass_catalog_id, label, started_at, expires_at, grant_note, users!user_pass_grants_user_id_fkey(email, first_name, last_name, country_code)',
    )
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(200);

  if (error) {
    // Fallback without embed if FK name differs
    const plain = await supabase
      .from('user_pass_grants')
      .select('local_id, user_id, pass_catalog_id, label, started_at, expires_at, grant_note')
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(200);
    if (plain.error || !plain.data) return [];
    const userIds = [...new Set(plain.data.map((r) => String(r.user_id)))];
    const { data: users } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, country_code')
      .in('id', userIds);
    const byId = new Map((users ?? []).map((u) => [u.id, u]));
    return plain.data.map((r) => {
      const u = byId.get(String(r.user_id));
      return {
        localId: String(r.local_id ?? r.user_id),
        userId: String(r.user_id),
        userName:
          `${u?.first_name ?? ''} ${u?.last_name ?? ''}`.trim() || u?.email || String(r.user_id).slice(0, 8),
        userEmail: u?.email ?? null,
        countryCode: u?.country_code ?? null,
        catalogId: r.pass_catalog_id ? String(r.pass_catalog_id) : null,
        label: String(r.label ?? 'PASS'),
        startedAt: String(r.started_at),
        expiresAt: r.expires_at ? String(r.expires_at) : null,
        grantNote: r.grant_note ? String(r.grant_note) : null,
      };
    });
  }

  return (data ?? []).map((r) => {
    const u = r.users as
      | { email?: string; first_name?: string; last_name?: string; country_code?: string }
      | null;
    return {
      localId: String(r.local_id),
      userId: String(r.user_id),
      userName:
        `${u?.first_name ?? ''} ${u?.last_name ?? ''}`.trim() || u?.email || String(r.user_id).slice(0, 8),
      userEmail: u?.email ?? null,
      countryCode: u?.country_code ?? null,
      catalogId: r.pass_catalog_id ? String(r.pass_catalog_id) : null,
      label: String(r.label ?? 'PASS'),
      startedAt: String(r.started_at),
      expiresAt: r.expires_at ? String(r.expires_at) : null,
      grantNote: r.grant_note ? String(r.grant_note) : null,
    };
  });
}

export async function countActiveGrantsForCatalog(catalogId: string): Promise<number> {
  const { count, error } = await supabase
    .from('user_pass_grants')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .eq('pass_catalog_id', catalogId);
  if (error) return 0;
  return count ?? 0;
}

export async function searchGrantTargets(
  query: string,
  countryCode?: string,
): Promise<{ id: string; email: string; name: string }[]> {
  let q = supabase
    .from('users')
    .select('id, email, first_name, last_name, user_role, is_active')
    .eq('is_active', true)
    .not('user_role', 'in', '("admin","super_admin")')
    .order('created_at', { ascending: false })
    .limit(20);
  const s = query.trim();
  if (s) {
    q = q.or(`email.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%`);
  }
  if (countryCode) q = q.eq('country_code', countryCode);
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map((u) => ({
    id: u.id,
    email: u.email ?? '',
    name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email || u.id.slice(0, 8),
  }));
}

export async function grantPass(
  catalog: PassCatalogEntry,
  targetUserId: string,
  grantedByUserId: string,
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (catalog.status !== 'active') return { ok: false, error: 'Catalogue inactif.' };
  const localId = `prime-grant-${Date.now()}`;
  const startedAt = nowIso();
  const expiresAt = computeExpiry(catalog.validityDays);
  const passKind =
    catalog.id === HERITAGE_CATALOG_ID
      ? 'heritage'
      : catalog.shopBillingPeriod ?? 'custom';

  const { error } = await supabase.rpc('upsert_user_pass_grant_admin', {
    p_user_id: targetUserId,
    p_pass_catalog_id: catalog.id,
    p_label: catalog.label,
    p_pass_kind: passKind,
    p_status: 'active',
    p_started_at: startedAt,
    p_expires_at: expiresAt,
    p_granted_by: grantedByUserId,
    p_grant_note: note?.trim() || null,
    p_local_id: localId,
    p_amount_gnf: 0,
    p_payment_method: null,
    p_paid_at: null,
    p_billing_period: catalog.shopBillingPeriod,
    p_scheduled_start_at: null,
    p_frozen_pass_snapshot: null,
  });
  if (error) return { ok: false, error: error.message };

  // Sécurité : forcer subscription fields même si RPC a déjà mis le rôle
  await supabase
    .from('users')
    .update({
      subscription_status: 'active',
      subscription_expires_at: expiresAt,
      updated_at: nowIso(),
    })
    .eq('id', targetUserId)
    .not('user_role', 'in', '("admin","super_admin","partner")');

  return { ok: true };
}

export async function revokePass(
  userId: string,
  localId: string,
): Promise<{ ok: boolean; error?: string }> {
  const now = nowIso();
  const { error } = await supabase
    .from('user_pass_grants')
    .update({ status: 'revoked', expires_at: now, updated_at: now })
    .eq('local_id', localId)
    .eq('user_id', userId);
  if (error) return { ok: false, error: error.message };

  const { count } = await supabase
    .from('user_pass_grants')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'active');

  if ((count ?? 0) === 0) {
    await supabase
      .from('users')
      .update({
        user_role: 'member',
        subscription_status: 'expired',
        subscription_expires_at: now,
        updated_at: now,
      })
      .eq('id', userId)
      .not('user_role', 'in', '("admin","super_admin","partner")');
  }

  return { ok: true };
}
