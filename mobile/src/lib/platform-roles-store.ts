import { loadCachedJson, saveCachedJson } from '@/lib/remote-settings-sync';
import { isNetworkOnline } from '@/lib/offline-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { ThemeId } from '@/lib/theme-config';
import type { UserRole } from '@/types';

export interface PlatformRole {
  slug: string;
  label: string;
  appRole: UserRole;
  themeId: ThemeId;
  isAdmin: boolean;
  sortOrder: number;
}

const CACHE_KEY = 'loop_platform_roles_v1';

let rolesBySlug = new Map<string, PlatformRole>();
let bootstrapped = false;

function rowToRole(row: Record<string, unknown>): PlatformRole {
  return {
    slug: String(row.slug),
    label: String(row.label),
    appRole: String(row.app_role) as UserRole,
    themeId: String(row.theme_id) as ThemeId,
    isAdmin: Boolean(row.is_admin),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function applyRoles(roles: PlatformRole[]): void {
  rolesBySlug = new Map(roles.map((r) => [r.slug, r]));
  bootstrapped = roles.length > 0;
}

export function isPlatformRolesLoaded(): boolean {
  return bootstrapped && rolesBySlug.size > 0;
}

export function listPlatformRoles(): PlatformRole[] {
  return Array.from(rolesBySlug.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getAppRoleForDbSlug(slug: string | null | undefined): UserRole | null {
  if (!slug) return null;
  if (slug === 'tool_partner') return 'PARTNER';
  return rolesBySlug.get(slug)?.appRole ?? null;
}

export function getThemeIdForDbSlug(slug: string | null | undefined): ThemeId | null {
  if (!slug) return null;
  return rolesBySlug.get(slug)?.themeId ?? null;
}

export function getPlatformRoleLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return rolesBySlug.get(slug)?.label ?? null;
}

async function fetchRemoteRoles(): Promise<PlatformRole[]> {
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return [];
  const { data, error } = await supabase
    .from('platform_roles')
    .select('slug, label, app_role, theme_id, is_admin, sort_order')
    .order('sort_order', { ascending: true })
    .limit(15);
  if (error) {
    console.warn('[PlatformRoles]', error.message);
    return [];
  }
  return (data ?? []).map((row) => rowToRole(row as Record<string, unknown>));
}

export async function bootstrapPlatformRoles(): Promise<void> {
  const cached = await loadCachedJson<PlatformRole[]>(CACHE_KEY);
  if (cached?.length) applyRoles(cached);

  const remote = await fetchRemoteRoles();
  if (remote.length) {
    applyRoles(remote);
    await saveCachedJson(CACHE_KEY, remote);
  }
}
