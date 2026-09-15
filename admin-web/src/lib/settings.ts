import { supabase } from './supabase';
import { COUNTRY_OPTIONS } from './countries';
import type { AdminPermissionId } from './permissions';

// ─── Gates ───────────────────────────────────────────────────────────────────

export type PrelaunchMode = 'text' | 'countdown';

export interface AppGates {
  signupEnabled: boolean;
  passPurchaseEnabled: boolean;
  prelaunch: {
    enabled: boolean;
    mode: PrelaunchMode;
    title: string;
    message: string;
    countdownTo: string | null;
  };
  maintenance: {
    enabled: boolean;
    title: string;
    message: string;
  };
}

export const DEFAULT_APP_GATES: AppGates = {
  signupEnabled: false,
  passPurchaseEnabled: false,
  prelaunch: {
    enabled: false,
    mode: 'text',
    title: 'Bientôt',
    message: 'THE LOOP ouvre bientôt. Revenez très vite.',
    countdownTo: null,
  },
  maintenance: {
    enabled: false,
    title: 'Maintenance',
    message: 'THE LOOP est temporairement indisponible. Merci de votre patience.',
  },
};

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

export function normalizeAppGates(raw: unknown): AppGates {
  if (!raw || typeof raw !== 'object') {
    return structuredClone(DEFAULT_APP_GATES);
  }
  const row = raw as Record<string, unknown>;
  const pre = (row.prelaunch && typeof row.prelaunch === 'object' ? row.prelaunch : {}) as Record<
    string,
    unknown
  >;
  const maint = (row.maintenance && typeof row.maintenance === 'object'
    ? row.maintenance
    : {}) as Record<string, unknown>;
  return {
    signupEnabled: asBool(row.signupEnabled, DEFAULT_APP_GATES.signupEnabled),
    passPurchaseEnabled: asBool(row.passPurchaseEnabled, DEFAULT_APP_GATES.passPurchaseEnabled),
    prelaunch: {
      enabled: asBool(pre.enabled, DEFAULT_APP_GATES.prelaunch.enabled),
      mode: pre.mode === 'countdown' ? 'countdown' : 'text',
      title: asString(pre.title, DEFAULT_APP_GATES.prelaunch.title),
      message: asString(pre.message, DEFAULT_APP_GATES.prelaunch.message),
      countdownTo:
        typeof pre.countdownTo === 'string' && pre.countdownTo.trim() ? pre.countdownTo.trim() : null,
    },
    maintenance: {
      enabled: asBool(maint.enabled, DEFAULT_APP_GATES.maintenance.enabled),
      title: asString(maint.title, DEFAULT_APP_GATES.maintenance.title),
      message: asString(maint.message, DEFAULT_APP_GATES.maintenance.message),
    },
  };
}

async function upsertSetting(key: string, value: unknown): Promise<{ ok: boolean; error?: string }> {
  const { error: rpcError } = await supabase.rpc('admin_set_app_setting', {
    p_key: key,
    p_value: value,
  });
  if (!rpcError) return { ok: true };

  const { error } = await supabase.from('app_settings').upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function fetchSetting(key: string): Promise<unknown | null> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error || data?.value == null) return null;
  return data.value;
}

export async function loadAppGates(): Promise<AppGates> {
  return normalizeAppGates(await fetchSetting('app_gates'));
}

export async function saveAppGates(gates: AppGates): Promise<{ ok: boolean; error?: string }> {
  return upsertSetting('app_gates', gates);
}

export async function loadSuggestionButton(): Promise<boolean> {
  const raw = await fetchSetting('community_ui');
  if (raw && typeof raw === 'object' && 'showSuggestionButton' in (raw as object)) {
    return Boolean((raw as { showSuggestionButton?: boolean }).showSuggestionButton);
  }
  return true;
}

export async function saveSuggestionButton(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  return upsertSetting('community_ui', { showSuggestionButton: enabled });
}

// ─── Countries ───────────────────────────────────────────────────────────────

export async function loadEnabledCountries(): Promise<string[]> {
  const raw = await fetchSetting('enabled_content_countries');
  const valid = new Set(COUNTRY_OPTIONS.map((c) => c.code));
  if (!Array.isArray(raw)) return ['GN'];
  const codes = raw.filter((c): c is string => typeof c === 'string' && valid.has(c));
  return codes.length ? codes : ['GN'];
}

export async function saveEnabledCountries(
  codes: string[],
): Promise<{ ok: boolean; error?: string }> {
  const valid = new Set(COUNTRY_OPTIONS.map((c) => c.code));
  const unique = [...new Set(codes.filter((c) => valid.has(c)))];
  const safe = unique.length ? unique : ['GN'];
  return upsertSetting('enabled_content_countries', safe);
}

// ─── Categories ──────────────────────────────────────────────────────────────

export type CategoryKind = 'event' | 'spot' | 'tool';

export interface CategoryRow {
  slug: string;
  kind: CategoryKind;
  label: string;
  emoji: string;
  isActive: boolean;
  sortOrder: number;
  isBuiltin: boolean;
}

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  event: 'Événements',
  spot: 'Spots',
  tool: 'Outils',
};

export async function listCategories(
  kind?: CategoryKind,
): Promise<{ items: CategoryRow[]; error?: string }> {
  let q = supabase
    .from('content_categories')
    .select('slug, kind, label, emoji, is_active, sort_order, is_builtin')
    .order('sort_order', { ascending: true })
    .limit(200);
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) return { items: [], error: error.message };
  return {
    items: (data ?? []).map((r) => ({
      slug: String(r.slug),
      kind: r.kind as CategoryKind,
      label: String(r.label ?? ''),
      emoji: String(r.emoji ?? ''),
      isActive: r.is_active !== false,
      sortOrder: Number(r.sort_order ?? 0),
      isBuiltin: Boolean(r.is_builtin),
    })),
  };
}

export async function setCategoryActive(
  kind: CategoryKind,
  slug: string,
  isActive: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('content_categories')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('kind', kind)
    .eq('slug', slug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateCategoryLabel(
  kind: CategoryKind,
  slug: string,
  label: string,
  emoji: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('content_categories')
    .update({
      label: label.trim(),
      emoji: emoji.trim() || '•',
      updated_at: new Date().toISOString(),
    })
    .eq('kind', kind)
    .eq('slug', slug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Legal ───────────────────────────────────────────────────────────────────

export type LegalKey =
  | 'cgu'
  | 'partner_terms'
  | 'mentions_legales'
  | 'privacy_policy'
  | 'conditions_pass_prime'
  | 'politique_cookies';

export const LEGAL_DOCS: { key: LegalKey; title: string }[] = [
  { key: 'cgu', title: "Conditions générales d'utilisation" },
  { key: 'privacy_policy', title: 'Politique de confidentialité' },
  { key: 'conditions_pass_prime', title: 'Conditions du PASS Prime' },
  { key: 'partner_terms', title: 'Conditions partenaires' },
  { key: 'politique_cookies', title: 'Politique de cookies' },
  { key: 'mentions_legales', title: 'Mentions légales' },
];

export interface LegalDoc {
  key: LegalKey;
  title: string;
  body: string;
  updatedAt: string | null;
}

export async function loadLegalDoc(key: LegalKey): Promise<LegalDoc> {
  const fallback = LEGAL_DOCS.find((d) => d.key === key)!;
  const { data } = await supabase
    .from('app_legal_content')
    .select('key, title, body, updated_at')
    .eq('key', key)
    .maybeSingle();
  if (!data) {
    return { key, title: fallback.title, body: '', updatedAt: null };
  }
  return {
    key,
    title: String(data.title || fallback.title),
    body: String(data.body ?? ''),
    updatedAt: data.updated_at ? String(data.updated_at) : null,
  };
}

export async function saveLegalDoc(
  key: LegalKey,
  title: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('app_legal_content').upsert({
    key,
    title: title.trim() || LEGAL_DOCS.find((d) => d.key === key)?.title,
    body,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Permissions ─────────────────────────────────────────────────────────────

export const SETTINGS_PERMISSION_OPTIONS: { id: AdminPermissionId; label: string }[] = [
  { id: 'insights', label: 'Insights' },
  { id: 'featured', label: 'Accueil' },
  { id: 'rubrique', label: 'Onglets' },
  { id: 'loop_hub', label: 'THE LOOP' },
  { id: 'content', label: 'Contenu' },
  { id: 'users', label: 'Users' },
  { id: 'partnerships', label: 'Partenariats' },
  { id: 'moderation', label: 'Modération' },
  { id: 'suggestions', label: 'Suggestions' },
  { id: 'prime_benefits', label: 'Privilèges' },
  { id: 'staff_benefits', label: 'TEAMS' },
  { id: 'benefit_draw', label: 'Tirage' },
  { id: 'pass_management', label: 'PASS' },
  { id: 'pass_payments', label: 'Paiements' },
];

export async function loadDefaultPermissions(): Promise<AdminPermissionId[]> {
  const { data, error } = await supabase.rpc('get_admin_default_permissions');
  if (!error && Array.isArray(data)) {
    return data.filter((p): p is string => typeof p === 'string');
  }
  return ['moderation', 'content', 'insights'];
}

export async function saveDefaultPermissions(
  permissions: AdminPermissionId[],
): Promise<{ ok: boolean; error?: string }> {
  const safe = permissions.filter((p) => typeof p === 'string');
  const { error } = await supabase.rpc('set_admin_default_permissions', {
    p_permissions: safe,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface AdminUserLite {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function listAdminUsersLite(): Promise<AdminUserLite[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, first_name, last_name, user_role')
    .in('user_role', ['admin', 'super_admin'])
    .eq('is_active', true)
    .order('email')
    .limit(100);
  if (error || !data) return [];
  return data.map((u) => ({
    id: u.id,
    email: u.email ?? '',
    name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email || u.id.slice(0, 8),
    role: u.user_role,
  }));
}

export async function loadUserPermissions(userId: string): Promise<AdminPermissionId[]> {
  const { data, error } = await supabase.rpc('get_user_admin_permissions', { p_user_id: userId });
  if (error || !Array.isArray(data)) return [];
  return data.filter((p): p is string => typeof p === 'string');
}

export async function saveUserPermissionOverrides(
  targetUserId: string,
  defaults: AdminPermissionId[],
  effective: AdminPermissionId[],
): Promise<{ ok: boolean; error?: string }> {
  const grants = effective.filter((p) => !defaults.includes(p));
  const revokes = defaults.filter((p) => !effective.includes(p));
  const { error } = await supabase.rpc('set_admin_permission_overrides', {
    p_target_user_id: targetUserId,
    p_grants: grants,
    p_revokes: revokes,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
