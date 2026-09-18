import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBenefitCatalogItem, findCatalogOffering } from '@/lib/benefit-catalog-store';
import {
  benefitGeoMatchesUser,
  resolveBenefitGeoFromOffering,
  type BenefitGeoTarget,
} from '@/lib/benefit-geo';
import { locationsMatchPrefectureMesh } from '@/lib/guinea-locations';
import { isNetworkOnline } from '@/lib/offline-store';
import { resolveBeneficiaryDisplayName } from '@/lib/user-display-lookup';
import { listRegistryUsers } from '@/lib/user-registry-store';
import {
  grantPrimeBenefitsToTargets,
  type PrimeBenefit,
} from '@/lib/prime-benefits-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { listAutomationGrantableCatalog, type GrantableCatalogEntry } from '@/lib/admin-automation-benefits';
import { userMatchesBenefitCountry } from '@/lib/role-benefit-eligibility';
import {
  refreshRoleBenefitEntitlementsConfig,
  type RoleBenefitEntitlementsConfig,
  type RoleEntitlementKind,
} from '@/lib/role-benefit-entitlements-store';
import { resolveCountryCode } from '@/lib/country-settings-keys';
import type { UserRole } from '@/types';

export type DrawTargetRole = Extract<UserRole, 'USER_FREE' | 'USER_PRIME' | 'PARTNER' | 'ADMIN'>;

export const ALL_DRAW_TARGET_ROLES: DrawTargetRole[] = ['USER_FREE', 'USER_PRIME', 'PARTNER', 'ADMIN'];

export const DRAW_ROLE_OPTIONS: { value: DrawTargetRole; label: string }[] = [
  { value: 'USER_FREE', label: 'Membres' },
  { value: 'USER_PRIME', label: 'Loop Prime' },
  { value: 'PARTNER', label: 'Partenaires' },
  { value: 'ADMIN', label: 'Admins délégués' },
];

/** Super admin exclu du pool de tirage (réservé aux admins délégués). */
export function isSuperAdminDrawUser(user: { userRole?: string | null }): boolean {
  return (user.userRole ?? '').toLowerCase() === 'super_admin';
}

export function isDelegatedAdminDrawUser(user: { userRole?: string | null; role?: UserRole }): boolean {
  if (isSuperAdminDrawUser(user)) return false;
  return user.role === 'ADMIN' || (user.userRole ?? '').toLowerCase() === 'admin';
}

export function allDrawRolesSelected(roles: DrawTargetRole[]): boolean {
  return ALL_DRAW_TARGET_ROLES.every((role) => roles.includes(role));
}

function entitlementKindsForDrawRoles(roles: DrawTargetRole[]): RoleEntitlementKind[] {
  const out: RoleEntitlementKind[] = [];
  if (roles.includes('USER_FREE')) out.push('member');
  if (roles.includes('USER_PRIME')) out.push('prime');
  if (roles.includes('PARTNER')) out.push('partner');
  if (roles.includes('ADMIN')) out.push('admin');
  return out;
}

/** Exclut les privilèges déjà octroyés à tout un rôle ; conserve promo_code et campagnes limitées. */
export function isCatalogEligibleForDraw(
  catalogId: string,
  benefitPurpose: string | undefined,
  roles: DrawTargetRole[],
  config: RoleBenefitEntitlementsConfig,
): boolean {
  if (benefitPurpose === 'promo_code') return true;
  const kinds = entitlementKindsForDrawRoles(roles);
  for (const kind of kinds) {
    if ((config[kind] ?? []).some((entry) => entry.catalogId === catalogId)) return false;
  }
  return true;
}

export async function listDrawEligibleCatalog(options: {
  roles: DrawTargetRole[];
  countryCode?: string;
  drawCity?: string | null;
}): Promise<GrantableCatalogEntry[]> {
  const kinds = entitlementKindsForDrawRoles(options.roles);
  if (!kinds.length) return [];

  const cc = resolveCountryCode(options.countryCode);
  const grantable = await listAutomationGrantableCatalog({
    countryCode: cc,
    job: { countryCode: cc, city: options.drawCity?.trim() || null },
  });
  const config = await refreshRoleBenefitEntitlementsConfig(cc);

  return grantable.filter((row) =>
    isCatalogEligibleForDraw(row.item.id, row.item.benefitPurpose, options.roles, config),
  );
}

export interface BenefitDrawWinner {
  userId: string;
  displayName: string | null;
  phone: string | null;
  benefitId: string;
}

export interface BenefitDrawRecord {
  id: string;
  roles: DrawTargetRole[];
  winnerCount: number;
  catalogId: string;
  catalogTitle: string;
  partnerKey: string;
  partnerName: string | null;
  validityDays: number | null;
  validityStartsOnActivation: boolean;
  countryCode: string;
  drawCity?: string | null;
  customNote: string | null;
  drawnBy: string;
  drawnAt: string;
  winners: BenefitDrawWinner[];
}

const DRAWS_KEY = 'loop_admin_benefit_draws_v1';

function shufflePick<T>(items: T[], count: number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(count, arr.length));
}

type DrawCandidateUser = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber: string;
  userRole?: string | null;
  role?: UserRole;
  countryCode?: string;
  interestCountryCode?: string | null;
  city?: string | null;
};

function rolesToDbValues(roles: DrawTargetRole[]): string[] {
  const out: string[] = [];
  if (roles.includes('USER_FREE')) out.push('member');
  if (roles.includes('USER_PRIME')) out.push('prime');
  if (roles.includes('PARTNER')) out.push('partner', 'tool_partner');
  if (roles.includes('ADMIN')) out.push('admin');
  return out;
}

function mapDbRowToDrawCandidate(
  row: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    phone_number?: string | null;
    user_role?: string | null;
    country_code?: string | null;
    interest_country_code?: string | null;
    city?: string | null;
  },
  countryCode: string,
): DrawCandidateUser {
  return {
    id: String(row.id),
    firstName: row.first_name,
    lastName: row.last_name,
    phoneNumber: row.phone_number ?? '',
    userRole: row.user_role,
    countryCode: row.country_code ?? countryCode,
    interestCountryCode: row.interest_country_code,
    city: row.city,
  };
}

function mapRegistryUserToDrawCandidate(
  user: Awaited<ReturnType<typeof listRegistryUsers>>[number],
): DrawCandidateUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    phoneNumber: user.phoneNumber,
    userRole: user.userRole,
    role: user.role,
    countryCode: user.countryCode,
    interestCountryCode: user.interestCountryCode,
    city: user.city,
  };
}

async function loadDrawCandidatePool(
  roles: DrawTargetRole[],
  countryCode: string,
  options?: {
    drawCity?: string | null;
    catalogGeo?: BenefitGeoTarget | null;
  },
): Promise<DrawCandidateUser[]> {
  if (!roles.length) return [];

  if (isSupabaseConfigured() && supabase && (await isNetworkOnline())) {
    const roleDb = rolesToDbValues(roles);
    if (!roleDb.length) return [];

    const { data, error } = await supabase
      .from('users')
      .select(
        'id, first_name, last_name, phone_number, user_role, country_code, interest_country_code, city',
      )
      .eq('is_active', true)
      .or(`country_code.eq.${countryCode},interest_country_code.eq.${countryCode}`)
      .in('user_role', roleDb)
      .limit(2000);

    if (!error && data) {
      return data
        .filter((u) => dbUserEligibleForDraw(u, roles, countryCode, options))
        .map((u) => mapDbRowToDrawCandidate(u, countryCode));
    }
  }

  const users = await listRegistryUsers(true);
  return users
    .filter((u) => userEligibleForDraw(u, roles, countryCode, options))
    .map(mapRegistryUserToDrawCandidate);
}

function matchesDrawRoleFromDb(
  user: { user_role?: string | null },
  roles: DrawTargetRole[],
): boolean {
  const dbRole = user.user_role ?? 'member';
  return roles.some((role) => {
    switch (role) {
      case 'USER_FREE':
        return dbRole === 'member';
      case 'USER_PRIME':
        return dbRole === 'prime';
      case 'PARTNER':
        return dbRole === 'partner' || dbRole === 'tool_partner';
      case 'ADMIN':
        return dbRole === 'admin';
      default:
        return false;
    }
  });
}

function matchesDrawRole(
  user: Awaited<ReturnType<typeof listRegistryUsers>>[number],
  roles: DrawTargetRole[],
): boolean {
  return roles.some((role) => {
    switch (role) {
      case 'USER_FREE':
        return user.role === 'USER_FREE' || user.userRole === 'member';
      case 'USER_PRIME':
        return (
          user.role === 'USER_PRIME' ||
          user.userRole === 'prime' ||
          user.subscriptionStatus === 'active'
        );
      case 'PARTNER':
        return user.role === 'PARTNER' || user.userRole === 'partner' || user.userRole === 'tool_partner';
      case 'ADMIN':
        return isDelegatedAdminDrawUser(user);
      default:
        return false;
    }
  });
}

function userEligibleForDraw(
  user: Awaited<ReturnType<typeof listRegistryUsers>>[number],
  roles: DrawTargetRole[],
  countryCode: string,
  options?: {
    drawCity?: string | null;
    catalogGeo?: BenefitGeoTarget | null;
  },
): boolean {
  if (user.role === 'USER_ANONYMOUS') return false;
  if (isSuperAdminDrawUser(user)) return false;
  if ((user.role === 'ADMIN' || user.userRole === 'admin') && !roles.includes('ADMIN')) return false;
  if (
    !userMatchesBenefitCountry(
      {
        countryCode: user.countryCode,
        interestCountryCode: user.interestCountryCode ?? null,
        phoneNumber: user.phoneNumber,
      },
      countryCode,
    )
  ) {
    return false;
  }
  if (!matchesDrawRole(user, roles)) return false;
  if (options?.drawCity?.trim() && !locationsMatchPrefectureMesh(user.city, options.drawCity)) return false;
  if (options?.catalogGeo && !benefitGeoMatchesUser(options.catalogGeo, user.city, countryCode)) return false;
  return true;
}

function dbUserEligibleForDraw(
  user: {
    user_role?: string | null;
    country_code?: string | null;
    interest_country_code?: string | null;
    city?: string | null;
  },
  roles: DrawTargetRole[],
  countryCode: string,
  options?: {
    drawCity?: string | null;
    catalogGeo?: BenefitGeoTarget | null;
  },
): boolean {
  if (user.user_role === 'super_admin') return false;
  if (user.user_role === 'admin' && !roles.includes('ADMIN')) return false;
  if (!matchesDrawRoleFromDb(user, roles)) return false;
  if (options?.drawCity?.trim() && !locationsMatchPrefectureMesh(user.city, options.drawCity)) return false;
  if (
    options?.catalogGeo &&
    !benefitGeoMatchesUser(options.catalogGeo, user.city ?? null, countryCode)
  ) {
    return false;
  }
  return true;
}

async function loadDrawsLocal(): Promise<BenefitDrawRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(DRAWS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BenefitDrawRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveDrawsLocal(items: BenefitDrawRecord[]): Promise<void> {
  await AsyncStorage.setItem(DRAWS_KEY, JSON.stringify(items));
}

async function syncDrawRemote(record: BenefitDrawRecord): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  await supabase.from('admin_benefit_draws').insert({
    id: record.id.startsWith('draw-') ? undefined : record.id,
    roles: record.roles,
    winner_count: record.winnerCount,
    catalog_id: record.catalogId,
    catalog_title: record.catalogTitle,
    partner_key: record.partnerKey,
    partner_name: record.partnerName,
    validity_days: record.validityDays ?? 30,
    validity_starts_on_activation: record.validityStartsOnActivation,
    country_code: record.countryCode,
    draw_city: record.drawCity ?? null,
    custom_note: record.customNote,
    drawn_by: /^[0-9a-f-]{36}$/i.test(record.drawnBy) ? record.drawnBy : null,
    drawn_at: record.drawnAt,
    winners: record.winners,
  });
}

function mapDrawRow(row: Record<string, unknown>): BenefitDrawRecord {
  const winnersRaw = row.winners;
  const winners = Array.isArray(winnersRaw)
    ? winnersRaw.map((w) => {
        const winner = w as Record<string, unknown>;
        return {
          userId: String(winner.userId),
          displayName: winner.displayName ? String(winner.displayName) : null,
          phone: winner.phone ? String(winner.phone) : null,
          benefitId: String(winner.benefitId ?? ''),
        };
      })
    : [];

  return {
    id: String(row.id),
    roles: (row.roles as DrawTargetRole[]) ?? [],
    winnerCount: Number(row.winner_count ?? winners.length),
    catalogId: String(row.catalog_id),
    catalogTitle: String(row.catalog_title),
    partnerKey: String(row.partner_key ?? ''),
    partnerName: row.partner_name ? String(row.partner_name) : null,
    validityDays: row.validity_days == null ? null : Number(row.validity_days),
    validityStartsOnActivation: row.validity_starts_on_activation !== false,
    countryCode: String(row.country_code ?? 'GN'),
    drawCity: row.draw_city ? String(row.draw_city) : null,
    customNote: row.custom_note ? String(row.custom_note) : null,
    drawnBy: row.drawn_by ? String(row.drawn_by) : 'admin',
    drawnAt: String(row.drawn_at),
    winners,
  };
}

async function fetchDrawsFromSupabase(countryCode?: string): Promise<BenefitDrawRecord[] | null> {
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return null;

  let query = supabase.from('admin_benefit_draws').select('id, roles, winner_count, catalog_id, catalog_title, partner_key, partner_name, validity_days, validity_starts_on_activation, country_code, draw_city, custom_note, drawn_by, drawn_at, winners').order('drawn_at', { ascending: false }).limit(100);
  if (countryCode) query = query.eq('country_code', countryCode);

  const { data, error } = await query;
  if (error) return null;
  return (data ?? []).map((row) => mapDrawRow(row as Record<string, unknown>));
}

export async function listAdminBenefitDraws(countryCode?: string): Promise<BenefitDrawRecord[]> {
  const remote = await fetchDrawsFromSupabase(countryCode);
  if (remote !== null) {
    const allLocal = await loadDrawsLocal();
    const otherCountries = countryCode
      ? allLocal.filter((d) => d.countryCode !== countryCode)
      : [];
    await saveDrawsLocal([...remote, ...otherCountries].sort((a, b) => b.drawnAt.localeCompare(a.drawnAt)));
    return remote;
  }

  const local = await loadDrawsLocal();
  const filtered = countryCode ? local.filter((d) => d.countryCode === countryCode) : local;
  return filtered.sort((a, b) => b.drawnAt.localeCompare(a.drawnAt));
}

export async function countEligibleDrawCandidates(
  roles: DrawTargetRole[],
  countryCode: string,
  options?: {
    drawCity?: string | null;
    catalogGeo?: BenefitGeoTarget | null;
  },
): Promise<number> {
  const pool = await loadDrawCandidatePool(roles, countryCode, options);
  return pool.length;
}

export async function runAdminBenefitDraw(input: {
  roles: DrawTargetRole[];
  winnerCount: number;
  catalogId: string;
  partnerId: string;
  partnerDisplayName: string;
  drawCity?: string | null;
  countryCode: string;
  customNote?: string | null;
  drawnBy: string;
}): Promise<{ ok: boolean; error?: string; record?: BenefitDrawRecord }> {
  if (!input.roles.length) return { ok: false, error: 'roles_required' };
  if (input.winnerCount < 1) return { ok: false, error: 'invalid_count' };

  const drawEligible = await listDrawEligibleCatalog({
    roles: input.roles,
    countryCode: input.countryCode,
    drawCity: input.drawCity,
  });
  if (!drawEligible.some((row) => row.item.id === input.catalogId)) {
    return { ok: false, error: 'catalog_not_draw_eligible' };
  }

  const catalog = await getBenefitCatalogItem(input.catalogId);
  if (!catalog || !catalog.isActive) return { ok: false, error: 'invalid_catalog' };

  const offering = findCatalogOffering(catalog, input.partnerId, input.partnerDisplayName);
  const catalogGeo = await resolveBenefitGeoFromOffering(catalog, offering);

  const pool = await loadDrawCandidatePool(input.roles, input.countryCode, {
    drawCity: input.drawCity,
    catalogGeo,
  });

  if (!pool.length) return { ok: false, error: 'no_candidates' };

  const picked = shufflePick(pool, input.winnerCount);
  const drawId = `draw-${Date.now()}`;
  const note =
    input.customNote?.trim() ||
    `Tirage au sort THE LOOP — ${catalog.title}`;

  const validityDays = catalog.defaultValidityDays;
  const validityStartsOnActivation = catalog.validityStartsOnActivation !== false;

  const grantRes = await grantPrimeBenefitsToTargets({
    catalogIds: [input.catalogId],
    partnerByCatalogId: { [input.catalogId]: input.partnerId },
    partnerDisplayNameByCatalogId: { [input.catalogId]: input.partnerDisplayName },
    targets: picked.map((u) => ({
      userId: u.id,
      phone: u.phoneNumber,
    })),
    customNote: note,
    grantedBy: input.drawnBy,
    grantCountryCode: input.countryCode,
    validityDays,
    validityStartsOnActivation,
    grantBatchId: drawId,
  });

  if (!grantRes.benefits.length) return { ok: false, error: 'grant_failed' };

  const benefitByUser = new Map<string, PrimeBenefit>();
  for (const b of grantRes.benefits) benefitByUser.set(b.userId, b);

  const winners: BenefitDrawWinner[] = await Promise.all(
    picked.map(async (u) => {
      const benefit = benefitByUser.get(u.id);
      const resolved = await resolveBeneficiaryDisplayName(u.id, u.phoneNumber);
      const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ');
      return {
        userId: u.id,
        displayName: resolved ?? (fullName || u.phoneNumber),
        phone: u.phoneNumber,
        benefitId: benefit?.id ?? '',
      };
    }),
  );

  const record: BenefitDrawRecord = {
    id: drawId,
    roles: input.roles,
    winnerCount: input.winnerCount,
    catalogId: input.catalogId,
    catalogTitle: catalog.title,
    partnerKey: input.partnerId,
    partnerName: input.partnerDisplayName,
    validityDays,
    validityStartsOnActivation,
    countryCode: input.countryCode,
    drawCity: input.drawCity?.trim() || null,
    customNote: note,
    drawnBy: input.drawnBy,
    drawnAt: new Date().toISOString(),
    winners,
  };

  const all = await loadDrawsLocal();
  await saveDrawsLocal([record, ...all]);
  void syncDrawRemote(record);

  return { ok: true, record };
}
