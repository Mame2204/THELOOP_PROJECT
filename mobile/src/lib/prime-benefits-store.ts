import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizePhone } from '@/lib/otp-auth';
import { normalizeEmail } from '@/lib/email-auth';
import { inferCountryCodeFromPhone, DEFAULT_COUNTRY_CODE, type CountryCode } from '@/lib/countries';
import { resolveCountryCode } from '@/lib/country-settings-keys';
import { isNetworkOnline, markNetworkReachable } from '@/lib/offline-store';
import {
  clampValidityDaysToCatalogEnd,
  findCatalogOffering,
  getBenefitCatalogItem,
  listBenefitCatalog,
  type BenefitKind,
} from '@/lib/benefit-catalog-store';
import {
  benefitGeoMatchesUser,
  resolveBenefitGeoFromOffering,
} from '@/lib/benefit-geo';
import { resolvePartnerOfferingContext } from '@/lib/partner-identity-store';
import { resolvePartnerDisplayName } from '@/lib/partner-directory-store';
import { appendUserNotification, distributeNotification, formatBenefitGrantMessage, formatBenefitGrantPlaceLabel, sendBenefitGrantNotification } from '@/lib/user-notifications-store';
import { resolveBenefitDisplayContext } from '@/lib/benefit-display-context';
import { resolveBeneficiaryDisplayName, lookupUserByPhone, lookupUserByEmail } from '@/lib/user-display-lookup';
import { findRegistryUserByEmailOrPhone, listRegistryUsers } from '@/lib/user-registry-store';
import { locationsMatchPrefectureMesh } from '@/lib/guinea-locations';
import { peekRoleBenefitEntitlementsConfig, refreshRoleBenefitEntitlementsConfig, type RoleBenefitEntitlementEntry, type RoleEntitlementKind } from '@/lib/role-benefit-entitlements-store';
import { resolveStaffAdminEntitlementEntries } from '@/lib/staff-benefit-overrides-store';
import {
  isExcludedFromBenefitBroadcast,
  userMatchesBenefitCountry,
  userQualifiesForAdminEntitlements,
  userQualifiesForMemberEntitlements,
  userQualifiesForPartnerEntitlements,
  userQualifiesForPrimeEntitlements,
} from '@/lib/role-benefit-eligibility';
import { EXTERNAL_PARTNER_ID } from '@/lib/partner-directory-store';
import type { PartnerValidationCode } from '@/lib/partner-validation-code-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { User } from '@/types';

export type PrimeBenefitStatus = 'active' | 'pending_validation' | 'used' | 'expired_unused';

export type BenefitGrantAudience =
  | 'all_prime'
  | 'prime'
  | 'members'
  | 'prime_members'
  | 'partner'
  | 'member_prime_partner'
  | 'all_loop_roles'
  | 'birthday'
  | 'individual';

export interface PrimeBenefit {
  id: string;
  userId: string;
  userPhone: string | null;
  catalogId: string;
  title: string;
  description: string;
  partnerName: string | null;
  benefitKind: BenefitKind;
  quantityTotal: number | null;
  quantityUsed: number;
  maxUses: number | null;
  usesCount: number;
  status: PrimeBenefitStatus;
  grantedAt: string;
  expiresAt: string;
  usedAt: string | null;
  /** Validité en jours — utilisé si validityStartsOnActivation */
  validityDays?: number | null;
  /** La date d'expiration ne commence qu'à la première consommation */
  validityStartsOnActivation?: boolean;
  /** Date de début de consommation (première validation / utilisation) */
  activatedAt?: string | null;
  grantedBy: string;
  grantAudience: BenefitGrantAudience;
  customNote: string | null;
  /** Regroupe les octrois effectués en une seule opération admin. */
  grantBatchId?: string | null;
  /** Pays du Control Tower ayant octroyé l'avantage. */
  grantCountryCode?: string | null;
  grantCity?: string | null;
  contentId?: string | null;
  contentType?: 'event' | 'spot' | 'tool' | null;
  contentTitle?: string | null;
  /** Avantage inclus automatiquement avec le rôle membre ou PASS Prime. */
  roleEntitlement?: RoleEntitlementKind | null;
}

export interface BenefitGrantBatch {
  id: string;
  catalogIds: string[];
  titles: string[];
  grantedAt: string;
  expiresAt: string;
  grantAudience: BenefitGrantAudience;
  grantedBy: string;
  customNote: string | null;
    beneficiaries: Array<{
    benefitId: string;
    userId: string;
    userPhone: string | null;
    displayName: string | null;
    status: PrimeBenefitStatus;
    usageLabel: string;
    canRevoke: boolean;
  }>;
}

export function isBenefitFullyUsed(benefit: PrimeBenefit): boolean {
  if (benefit.status === 'used') return true;
  if (benefit.benefitKind === 'quantity' && benefit.quantityTotal != null && benefit.quantityTotal > 0) {
    return benefit.quantityUsed >= benefit.quantityTotal;
  }
  if (benefit.benefitKind === 'usage_limit' && benefit.maxUses != null && benefit.maxUses > 0) {
    return benefit.usesCount >= benefit.maxUses;
  }
  return false;
}

export function canRevokeBenefit(benefit: PrimeBenefit): boolean {
  // Entitlements auto liés au rôle : non révocables depuis « Derniers octrois »
  if (benefit.roleEntitlement || benefit.grantedBy === 'role-entitlement') return false;
  if (benefit.status === 'used' || benefit.status === 'expired_unused') return false;
  if (isBenefitFullyUsed(benefit)) return false;
  // Octrois admin : révocables tant que non consommés (y compris avant activation du compteur)
  return benefit.status === 'active' || benefit.status === 'pending_validation';
}

export function canRequestBenefitValidation(benefit: PrimeBenefit): boolean {
  return benefit.status === 'active' && !isBenefitFullyUsed(benefit);
}

/** Peut (re)pousser une demande vers le partenaire : actif OU déjà pending local. */
export function canPushBenefitValidation(benefit: PrimeBenefit): boolean {
  if (isBenefitFullyUsed(benefit) || benefit.status === 'used' || benefit.status === 'expired_unused') {
    return false;
  }
  return benefit.status === 'active' || benefit.status === 'pending_validation';
}

export function getBenefitUsageLabel(benefit: PrimeBenefit): string {
  if (benefit.benefitKind === 'quantity' && benefit.quantityTotal != null) {
    return `${benefit.quantityUsed}/${benefit.quantityTotal} utilisé(s)`;
  }
  if (benefit.benefitKind === 'usage_limit' && benefit.maxUses != null) {
    return `${benefit.usesCount}/${benefit.maxUses} utilisation(s)`;
  }
  if (benefit.status === 'used') return 'Utilisé';
  return 'Disponible';
}

interface ScheduledBenefitGrant {
  id: string;
  catalogIds: string[];
  partnerByCatalogId?: Record<string, string>;
  partnerDisplayNameByCatalogId?: Record<string, string>;
  audience: BenefitGrantAudience;
  targetPhones: string | null;
  customNote: string | null;
  scheduledAt: string;
  expiresAt: string;
  grantedBy: string;
  grantCountryCode?: string | null;
  grantCity?: string | null;
  status: 'scheduled' | 'sent' | 'cancelled';
  createdAt: string;
}

const GRANTS_KEY = 'loop_prime_benefits_v2';
const SCHEDULED_KEY = 'loop_scheduled_benefit_grants_v1';

/** Expiration lointaine tant que la consommation n'a pas démarré */
export const PENDING_ACTIVATION_EXPIRES = '2099-12-31T23:59:59.999Z';

/** Avantages rôle membre — valables sans limite de date. */
export const MEMBER_ROLE_ENTITLEMENT_EXPIRES = '2099-12-31T23:59:59.999Z';

export const VALIDITY_PRESET_OPTIONS: { days: number | null; label: string }[] = [
  { days: 7, label: '1 semaine' },
  { days: 14, label: '2 semaines' },
  { days: 30, label: '1 mois' },
  { days: 60, label: '2 mois' },
  { days: 90, label: '3 mois' },
  { days: null, label: 'Sans date de validité' },
];

export const BENEFIT_STATUS_LABELS: Record<PrimeBenefitStatus, string> = {
  active: 'Actif',
  pending_validation: 'En attente de validation',
  used: 'Déjà utilisé',
  expired_unused: 'Expiré sans utilisation',
};

export const GRANT_AUDIENCE_LABELS: Record<BenefitGrantAudience, string> = {
  all_prime: 'Tous les Prime',
  prime: 'Prime actifs',
  members: 'Membres',
  prime_members: 'Membres + Prime',
  partner: 'Partenaires',
  member_prime_partner: 'Les 3 (Membre · Prime · Partenaire)',
  all_loop_roles: 'Tous les rôles THE LOOP',
  birthday: 'Anniversaires du mois',
  individual: 'Individuel (tél. / e-mail)',
};

async function loadAllFromStorage(): Promise<PrimeBenefit[]> {
  try {
    const raw = await AsyncStorage.getItem(GRANTS_KEY);
    if (!raw) {
      const legacy = await AsyncStorage.getItem('loop_prime_benefits_v1');
      if (!legacy) return [];
      const parsed = JSON.parse(legacy) as Array<Record<string, unknown>>;
      return parsed.map((b) => ({
        id: String(b.id),
        userId: String(b.userId),
        userPhone: (b.userPhone as string) ?? null,
        catalogId: String(b.catalogId ?? 'legacy'),
        title: String(b.title),
        description: String(b.description),
        partnerName: (b.partnerName as string) ?? null,
        benefitKind: (b.benefitKind as BenefitKind) ?? 'unlimited',
        quantityTotal: b.quantityTotal != null ? Number(b.quantityTotal) : null,
        quantityUsed: Number(b.quantityUsed ?? 0),
        maxUses: b.maxUses != null ? Number(b.maxUses) : null,
        usesCount: Number(b.usesCount ?? (b.usedAt ? 1 : 0)),
        status: b.status as PrimeBenefitStatus,
        grantedAt: String(b.grantedAt),
        expiresAt: String(b.expiresAt),
        usedAt: (b.usedAt as string) ?? null,
        grantedBy: String(b.grantedBy),
        grantAudience: b.grantAudience as BenefitGrantAudience,
        customNote: null,
      }));
    }
    const parsed = JSON.parse(raw) as PrimeBenefit[];
    return Array.isArray(parsed)
      ? parsed.map((b) => normalizeBenefit(b))
      : [];
  } catch {
    return [];
  }
}

function mapAnalyticsRpcRow(row: Record<string, unknown>): PrimeBenefit {
  const usedAt = row.used_at ? String(row.used_at) : null;
  const rawStatus = row.status as PrimeBenefit['status'];
  const roleRaw = row.role_entitlement ? String(row.role_entitlement) : null;
  const roleEntitlement =
    roleRaw === 'member' || roleRaw === 'prime' || roleRaw === 'admin' || roleRaw === 'partner'
      ? roleRaw
      : null;
  const localId = String(row.local_id ?? crypto.randomUUID());
  const status: PrimeBenefit['status'] =
    usedAt && rawStatus !== 'expired_unused' ? 'used' : rawStatus;
  return normalizeBenefit({
    id: localId,
    userId: '00000000-0000-0000-0000-000000000000',
    userPhone: null,
    catalogId: String(row.catalog_local_id ?? row.catalog_id ?? ''),
    title: '—',
    description: '',
    partnerName: null,
    benefitKind: 'unlimited',
    quantityTotal: null,
    quantityUsed: 0,
    maxUses: null,
    usesCount: usedAt ? 1 : 0,
    status,
    grantedAt: new Date(0).toISOString(),
    expiresAt: row.expires_at ? String(row.expires_at) : new Date(0).toISOString(),
    usedAt,
    grantedBy: roleEntitlement ? 'role-entitlement' : 'admin',
    grantAudience: (row.grant_audience as PrimeBenefit['grantAudience']) ?? 'individual',
    customNote: null,
    grantBatchId: null,
    grantCountryCode: row.grant_country_code ? String(row.grant_country_code) : null,
    grantCity: null,
    roleEntitlement,
    validityDays: null,
    validityStartsOnActivation: false,
    activatedAt: null,
  });
}

/** Octrois pour KPI Insights admin — RPC admin puis fallback table. */
async function loadGrantsForAdminAnalytics(countryCode?: string): Promise<PrimeBenefit[]> {
  if (isSupabaseConfigured() && supabase && (await isNetworkOnline())) {
    try {
      const { data, error } = await supabase.rpc('list_admin_benefit_grants_analytics', {
        p_country_code: countryCode ?? null,
      });
      if (!error && data?.length) {
        return refreshStatuses((data as Record<string, unknown>[]).map(mapAnalyticsRpcRow));
      }
      if (error) console.warn('[PrimeBenefits] analytics rpc:', error.message);
      const { fetchAllRemotePrimeBenefits } = await import('@/lib/prime-benefits-sync');
      const remote = await fetchAllRemotePrimeBenefits();
      if (remote.length) return refreshStatuses(remote);
    } catch (e) {
      console.warn('[PrimeBenefits] analytics remote:', e);
    }
  }
  return refreshStatuses(await loadAllFromStorage());
}

function isRoleEntitlementBenefit(b: PrimeBenefit): boolean {
  if (b.id.startsWith('role-ben-')) return true;
  if (b.grantAudience === 'individual') return false;
  if (b.roleEntitlement) return true;
  return false;
}

async function loadAll(): Promise<PrimeBenefit[]> {
  const local = refreshStatuses(await loadAllFromStorage());
  if (isSupabaseConfigured() && supabase && (await isNetworkOnline())) {
    try {
      // Uniquement les grants de l’utilisateur courant des entrées locales — pas tout le catalogue admin.
      const userIds = [
        ...new Set(local.map((b) => b.userId).filter((id) => /^[0-9a-f-]{36}$/i.test(id))),
      ];
      const { fetchRemotePrimeBenefitsForUser, mergePrimeBenefits } = await import('@/lib/prime-benefits-sync');
      let merged = local;
      for (const uid of userIds.slice(0, 5)) {
        const remote = await fetchRemotePrimeBenefitsForUser(uid);
        if (remote.length) {
          merged = mergePrimeBenefits(
            merged,
            remote.map((b) => normalizeBenefit(b)),
          );
        }
      }
      const items = refreshStatuses(merged);
      await saveAll(items);
      return items;
    } catch (e) {
      console.warn('[PrimeBenefits] load remote:', e);
    }
  }
  return local;
}

async function saveAll(items: PrimeBenefit[]): Promise<void> {
  await AsyncStorage.setItem(GRANTS_KEY, JSON.stringify(items));
}

async function persistAndSync(
  items: PrimeBenefit[],
  changed?: PrimeBenefit[],
  options?: { awaitRemote?: boolean },
): Promise<void> {
  await saveAll(items);
  if (!changed?.length) return;
  const syncRemote = async () => {
    try {
      const { syncPrimeBenefitsBatch } = await import('@/lib/prime-benefits-sync');
      await syncPrimeBenefitsBatch(changed);
    } catch (e) {
      console.warn('[PrimeBenefits] sync remote:', e);
    }
  };
  if (options?.awaitRemote) await syncRemote();
  else void syncRemote();
}

async function loadScheduled(): Promise<ScheduledBenefitGrant[]> {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScheduledBenefitGrant[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveScheduled(items: ScheduledBenefitGrant[]): Promise<void> {
  await AsyncStorage.setItem(SCHEDULED_KEY, JSON.stringify(items));
}

function isBirthdayThisMonth(birthDate: string | null): boolean {
  if (!birthDate) return false;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return false;
  return d.getMonth() === new Date().getMonth();
}

function normalizeBenefit(b: PrimeBenefit): PrimeBenefit {
  return {
    ...b,
    benefitKind: b.benefitKind ?? 'unlimited',
    quantityTotal: b.quantityTotal ?? null,
    quantityUsed: b.quantityUsed ?? 0,
    maxUses: b.maxUses ?? null,
    usesCount: b.usesCount ?? (b.usedAt ? 1 : 0),
    validityDays: b.validityDays ?? null,
    // Aligné sur le catalogue (true par défaut) — évite d'expirer à tort les octrois non activés
    validityStartsOnActivation: b.validityStartsOnActivation ?? true,
    activatedAt: b.activatedAt ?? null,
    roleEntitlement: b.roleEntitlement ?? null,
  };
}

export function getBenefitExpiryLabel(benefit: PrimeBenefit): string {
  const exp = new Date(benefit.expiresAt);
  const isSentinel = !Number.isNaN(exp.getTime()) && exp.getTime() >= new Date('2090-01-01').getTime();

  if (benefit.roleEntitlement === 'member' || (isSentinel && benefit.roleEntitlement)) {
    return 'Valable sans limite';
  }
  if (benefit.roleEntitlement === 'prime') {
    if (isSentinel) return 'Valable sans limite';
    return `Jusqu'au ${exp.toLocaleDateString('fr-FR')}`;
  }
  if (benefit.validityStartsOnActivation && !benefit.activatedAt) {
    const days = benefit.validityDays ?? 30;
    return `Valide ${days} j. à partir de la 1re utilisation`;
  }
  if (isSentinel) {
    const days = benefit.validityDays ?? 30;
    return `Valide ${days} j. (selon catalogue)`;
  }
  return `Expire le ${exp.toLocaleDateString('fr-FR')}`;
}

export function getRoleEntitlementBadge(benefit: PrimeBenefit): string | null {
  if (benefit.roleEntitlement === 'member') return 'Membre';
  if (benefit.roleEntitlement === 'prime') return 'Prime';
  if (benefit.roleEntitlement === 'partner') return 'Partenaire';
  if (benefit.roleEntitlement === 'admin') return 'Admin';
  return null;
}

/** Origine de l'avantage — distingue rôle Membre/Prime vs octrois admin, anniversaire, etc. */
export function getBenefitSourceLabel(benefit: PrimeBenefit): string {
  const roleBadge = getRoleEntitlementBadge(benefit);
  if (roleBadge) return roleBadge;

  if (benefit.grantAudience === 'birthday') return 'Cadeau anniversaire';
  if (benefit.grantAudience === 'individual') return 'Octroi personnel';
  if (benefit.grantBatchId?.startsWith('role-entitlement-')) {
    if (benefit.grantBatchId.includes('prime')) return 'Inclus PASS Prime';
    if (benefit.grantBatchId.includes('partner')) return 'Inclus Partenaire';
    if (benefit.grantBatchId.includes('admin')) return 'Inclus Admin';
    return 'Inclus Membre';
  }
  if (benefit.grantedBy === 'role-entitlement') {
    if (benefit.grantAudience === 'prime') return 'Inclus PASS Prime';
    if (benefit.grantAudience === 'partner') return 'Inclus Partenaire';
    return 'Inclus Membre';
  }

  switch (benefit.grantAudience) {
    case 'all_prime':
      return 'Campagne Prime (admin)';
    case 'prime':
      return 'Campagne Prime actifs';
    case 'members':
      return 'Campagne Membres';
    case 'prime_members':
      return 'Campagne Membres + Prime';
    case 'partner':
      return 'Campagne Partenaires';
    case 'member_prime_partner':
      return 'Campagne Les 3 rôles';
    case 'all_loop_roles':
      return 'Campagne tous rôles THE LOOP';
    default:
      return 'Octroi admin';
  }
}

export function getBenefitCardKey(benefit: PrimeBenefit): string {
  return `${benefit.id}|${benefit.catalogId}|${benefit.roleEntitlement ?? benefit.grantAudience}|${benefit.grantedAt}`;
}

export function activateBenefitValidityIfNeeded(benefit: PrimeBenefit, at = new Date()): PrimeBenefit {
  if (!benefit.validityStartsOnActivation || benefit.activatedAt) return benefit;
  const days = benefit.validityDays ?? 30;
  const activatedAt = at.toISOString();
  return {
    ...benefit,
    activatedAt,
    expiresAt: computeExpiresAtFromCatalog(days, at),
  };
}

function resolveStatus(benefit: PrimeBenefit): PrimeBenefitStatus {
  if (benefit.status === 'pending_validation') return 'pending_validation';
  // Révocation admin ou expiration sans usage : ne pas réactiver (ex. validité à l'activation)
  if (benefit.status === 'expired_unused') return 'expired_unused';
  if (benefit.status === 'used') return 'used';
  if (benefit.validityStartsOnActivation && !benefit.activatedAt) return 'active';
  if (benefit.usedAt && isBenefitFullyUsed(benefit)) return 'used';
  if (new Date(benefit.expiresAt).getTime() < Date.now()) {
    return benefit.usedAt || isBenefitFullyUsed(benefit) ? 'used' : 'expired_unused';
  }
  if (benefit.usedAt && benefit.benefitKind === 'unlimited') return 'used';
  return 'active';
}

function refreshStatuses(items: PrimeBenefit[]): PrimeBenefit[] {
  return items.map((b) => {
    if (b.status === 'pending_validation') {
      if (b.usedAt) return { ...b, status: 'used' };
      return b;
    }
    if (b.status === 'expired_unused' || b.status === 'used') {
      return b;
    }
    return { ...b, status: resolveStatus(b) };
  });
}

/** Bloque un nouvel octroi catalogue si l'avantage est octroyé mais pas encore consommé. */
export function benefitBlocksCatalogRegrant(benefit: PrimeBenefit): boolean {
  const [refreshed] = refreshStatuses([benefit]);
  if (refreshed.status === 'used' || refreshed.status === 'expired_unused') return false;
  if (refreshed.status === 'pending_validation') return true;
  if (refreshed.status === 'active') {
    if (refreshed.usedAt || refreshed.quantityUsed > 0 || refreshed.usesCount > 0) {
      return !isBenefitFullyUsed(refreshed);
    }
    return true;
  }
  return false;
}

/** Clé d'unicité octroi : catalogue + lieu + partenaire (pas le partenaire seul). */
export function grantRegrantSlotKey(
  benefit: Pick<PrimeBenefit, 'catalogId' | 'partnerName' | 'contentId'>,
): string {
  const catalog = benefit.catalogId?.trim() ?? '';
  const content = benefit.contentId?.trim() ?? '';
  const partner = benefit.partnerName?.trim().toLowerCase() ?? '';
  return `${catalog}::${content}::${partner}`;
}

function benefitBelongsToGrantRecipient(
  benefit: PrimeBenefit,
  resolvedUserId: string,
  phone: string | null,
  email?: string | null,
): boolean {
  if (benefit.userId === resolvedUserId) return true;
  if (phone && benefit.userPhone && normalizePhone(benefit.userPhone) === phone) return true;
  if (phone && benefit.userId === `phone:${phone}`) return true;
  if (phone && benefit.userId.startsWith('phone:') && normalizePhone(benefit.userId.slice(6)) === phone) {
    return true;
  }
  const emailNorm = email?.trim().toLowerCase();
  if (emailNorm && benefit.userId === `email:${emailNorm}`) return true;
  return false;
}

function memberHasBlockingCatalogGrant(
  existing: PrimeBenefit[],
  created: PrimeBenefit[],
  slotKey: string,
  resolvedUserId: string,
  phone: string | null,
  email: string | null | undefined,
  validatedBenefitIds: Set<string>,
): PrimeBenefit | null {
  const matchesGrantSlot = (benefit: PrimeBenefit) => {
    if (!benefitBelongsToGrantRecipient(benefit, resolvedUserId, phone, email)) return false;
    if (benefit.roleEntitlement) return false;
    return grantRegrantSlotKey(benefit) === slotKey;
  };

  const blocking =
    existing.find(
      (b) =>
        matchesGrantSlot(b) &&
        !validatedBenefitIds.has(b.id) &&
        benefitBlocksCatalogRegrant(b),
    ) ??
    created.find((b) => matchesGrantSlot(b) && benefitBlocksCatalogRegrant(b)) ??
    null;

  return blocking;
}

/** Recalcule les statuts (exporté pour tests). */
export function refreshBenefitStatuses(items: PrimeBenefit[]): PrimeBenefit[] {
  return refreshStatuses(items);
}

function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizePhone(a) === normalizePhone(b);
}

async function resolveBenefitIdentityKeys(
  userId: string,
  identity?: { phone?: string | null; email?: string | null },
): Promise<{ userIds: Set<string>; phone: string | null; email: string | null }> {
  const userIds = new Set<string>([userId]);
  const phone = identity?.phone ? normalizePhone(identity.phone) : null;
  const email = identity?.email?.trim().toLowerCase() ?? null;

  const registryMatch = await findRegistryUserByEmailOrPhone(identity?.email, identity?.phone);
  if (registryMatch) {
    userIds.add(registryMatch.id);
    if (registryMatch.phoneNumber) userIds.add(registryMatch.id);
  }

  const users = await listRegistryUsers();
  for (const u of users) {
    if (userIds.has(u.id)) continue;
    if (phonesMatch(u.phoneNumber, identity?.phone) || phonesMatch(u.phoneNumber, phone)) {
      userIds.add(u.id);
    }
    if (identity?.email && u.email?.toLowerCase() === identity.email?.trim().toLowerCase()) {
      userIds.add(u.id);
    }
  }

  return { userIds, phone, email };
}

function benefitBelongsToUser(
  benefit: PrimeBenefit,
  userIds: Set<string>,
  phone: string | null,
  email?: string | null,
): boolean {
  if (userIds.has(benefit.userId)) return true;
  if (phone && benefit.userPhone && normalizePhone(benefit.userPhone) === phone) return true;
  if (phone && benefit.userId === `phone:${phone}`) return true;
  if (phone && benefit.userId.startsWith('phone:') && normalizePhone(benefit.userId.slice(6)) === phone) return true;
  const emailNorm = email?.trim().toLowerCase();
  if (emailNorm && benefit.userId === `email:${emailNorm}`) return true;
  return false;
}


function parseIndividualGrantParts(raw: string): string[] {
  return raw.split(';').map((p) => p.trim()).filter(Boolean);
}

type GrantRecipientTarget = { userId: string; phone: string | null; email?: string | null };

async function resolveIndividualGrantTarget(
  part: string,
  users: Awaited<ReturnType<typeof listRegistryUsers>>,
): Promise<GrantRecipientTarget> {
  if (part.includes('@')) {
    const email = normalizeEmail(part);
    if (!email) {
      throw new Error('Adresse e-mail invalide.');
    }
    const lookedUp = await lookupUserByEmail(email);
    const match = users.find((u) => u.email?.toLowerCase() === email);
    const resolvedId = lookedUp?.id ?? match?.id ?? `email:${email}`;
    const phone =
      lookedUp?.phone != null
        ? normalizePhone(lookedUp.phone)
        : match?.phoneNumber
          ? normalizePhone(match.phoneNumber)
          : null;
    return {
      userId: resolvedId,
      phone: phone || null,
      email,
    };
  }

  const phone = normalizePhone(part);
  if (!phone) {
    throw new Error('Numéro de téléphone invalide.');
  }
  const lookedUp = await lookupUserByPhone(phone);
  const match = users.find((u) => phonesMatch(u.phoneNumber, phone));
  return {
    userId: lookedUp?.id ?? match?.id ?? `phone:${phone}`,
    phone,
    email: lookedUp?.email ?? match?.email ?? null,
  };
}

async function resolveGrantRecipientDetails(
  target: GrantRecipientTarget,
  users: Awaited<ReturnType<typeof listRegistryUsers>>,
): Promise<{ userId: string; phone: string | null; city: string | null }> {
  const emailHint =
    target.email?.trim().toLowerCase() ??
    (target.userId.startsWith('email:') ? target.userId.slice(6).toLowerCase() : null);

  if (emailHint) {
    const lookedUp = await lookupUserByEmail(emailHint);
    const registryMatch =
      users.find((u) => u.email?.toLowerCase() === emailHint) ??
      (lookedUp ? users.find((u) => u.id === lookedUp.id) : undefined);
    const userId = lookedUp?.id ?? registryMatch?.id ?? target.userId;
    const phone =
      target.phone ??
      (lookedUp?.phone ? normalizePhone(lookedUp.phone) : null) ??
      (registryMatch?.phoneNumber ? normalizePhone(registryMatch.phoneNumber) : null);
    const city =
      lookedUp?.city ??
      registryMatch?.city ??
      users.find((u) => u.id === userId)?.city ??
      null;
    return { userId, phone, city };
  }

  if (target.phone) {
    const lookedUp = await lookupUserByPhone(target.phone);
    const registryMatch = users.find((u) => u.phoneNumber && phonesMatch(u.phoneNumber, target.phone!));
    const userId = lookedUp?.id ?? registryMatch?.id ?? target.userId;
    const phone =
      target.phone ??
      (registryMatch?.phoneNumber ? normalizePhone(registryMatch.phoneNumber) : null);
    const city =
      lookedUp?.city ??
      registryMatch?.city ??
      users.find((u) => u.id === userId)?.city ??
      null;
    return { userId, phone, city };
  }

  return {
    userId: target.userId,
    phone: target.phone,
    city: users.find((u) => u.id === target.userId)?.city ?? null,
  };
}

function safePartnerLabel(...candidates: Array<string | null | undefined>): string {
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return 'Partenaire';
}

export async function listBenefitGrantRecipientTargets(
  audience: BenefitGrantAudience,
  targetPhones?: string,
  grantCountryCode?: string,
  grantCity?: string | null,
): Promise<GrantRecipientTarget[]> {
  const users = await listRegistryUsers();
  const inCountry = (u: (typeof users)[0]) => {
    if (!grantCountryCode) return true;
    return userMatchesBenefitCountry(
      {
        countryCode: u.countryCode ?? DEFAULT_COUNTRY_CODE,
        interestCountryCode: u.interestCountryCode ?? null,
        phoneNumber: u.phoneNumber ?? null,
      },
      grantCountryCode,
    );
  };
  const inCity = (u: (typeof users)[0]) => {
    if (!grantCity?.trim()) return true;
    return locationsMatchPrefectureMesh(u.city, grantCity);
  };
  if (audience === 'individual') {
    const parts = parseIndividualGrantParts(targetPhones ?? '');
    const results: GrantRecipientTarget[] = [];
    for (const part of parts) {
      results.push(await resolveIndividualGrantTarget(part, users));
    }
    return results;
  }
  return users
    .filter((u) => {
      if (!inCountry(u) || !inCity(u)) return false;
      // Tous les rôles THE LOOP = inclure aussi les admins
      if (audience !== 'all_loop_roles' && isExcludedFromBenefitBroadcast(u)) return false;
      switch (audience) {
        case 'all_prime':
        case 'prime':
          return u.role === 'USER_PRIME' || u.userRole === 'prime' || u.subscriptionStatus === 'active';
        case 'members':
          return u.role === 'USER_FREE' || u.userRole === 'member';
        case 'prime_members':
          return (
            u.role === 'USER_FREE' || u.role === 'USER_PRIME' ||
            u.userRole === 'member' || u.userRole === 'prime' ||
            u.subscriptionStatus === 'active'
          );
        case 'partner':
          return u.role === 'PARTNER' || u.userRole === 'partner';
        case 'member_prime_partner':
          return (
            u.role === 'USER_FREE' ||
            u.role === 'USER_PRIME' ||
            u.role === 'PARTNER' ||
            u.userRole === 'member' ||
            u.userRole === 'prime' ||
            u.userRole === 'partner' ||
            u.subscriptionStatus === 'active'
          );
        case 'all_loop_roles':
          return (
            u.role === 'USER_FREE' ||
            u.role === 'USER_PRIME' ||
            u.role === 'PARTNER' ||
            u.role === 'ADMIN' ||
            u.userRole === 'member' ||
            u.userRole === 'prime' ||
            u.userRole === 'partner' ||
            u.userRole === 'admin' ||
            u.userRole === 'super_admin' ||
            u.subscriptionStatus === 'active'
          );
        case 'birthday':
          return isBirthdayThisMonth(u.birthDate);
        default:
          return false;
      }
    })
    .map((u) => ({
      userId: u.id,
      phone: u.phoneNumber ? normalizePhone(u.phoneNumber) : null,
    }));
}

function formatBenefitNotificationLine(grant: {
  title: string;
  contentType?: PrimeBenefit['contentType'];
  contentTitle?: string | null;
  displayContext?: string | null;
}): string {
  const place = formatBenefitGrantPlaceLabel(grant);
  if (place) return `« ${grant.title} » — ${place}`;
  return `« ${grant.title} »`;
}

function isRemoteBenefitRecipientId(userId: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(userId);
}

async function notifyBenefitGrantTarget(
  target: { userId: string; phone: string | null },
  grants: Array<{
    title: string;
    contentType?: PrimeBenefit['contentType'];
    contentTitle?: string | null;
    displayContext?: string | null;
  }>,
  message: string,
): Promise<void> {
  if (isRemoteBenefitRecipientId(target.userId)) {
    if (grants.length === 1) {
      await sendBenefitGrantNotification({
        userId: target.userId,
        benefitTitle: grants[0].title,
        contentType: grants[0].contentType ?? null,
        contentTitle: grants[0].contentTitle ?? null,
        displayContext: grants[0].displayContext ?? null,
      });
    } else {
      await appendUserNotification(target.userId, {
        title: 'Nouveau privilège',
        message,
        audience: 'individual',
      });
    }
    return;
  }

  if (target.phone) {
    await distributeNotification({
      title: 'Nouveau privilège',
      message,
      audience: 'individual',
      targetPhone: target.phone,
    });
    return;
  }

  if (target.userId) {
    await appendUserNotification(target.userId, {
      title: 'Nouveau privilège',
      message,
      audience: 'individual',
    });
  }
}

/** Notifie chaque bénéficiaire pour les octrois réellement créés (admin, tirage, rôle, programmé…). */
async function pushCreatedBenefitNotifications(benefits: PrimeBenefit[]): Promise<void> {
  if (!benefits.length) return;

  const byUser = new Map<string, { phone: string | null; grants: PrimeBenefit[] }>();
  for (const benefit of benefits) {
    const entry = byUser.get(benefit.userId) ?? { phone: benefit.userPhone, grants: [] };
    entry.grants.push(benefit);
    byUser.set(benefit.userId, entry);
  }

  for (const [userId, { phone, grants }] of byUser) {
    const meta = grants.map((benefit) => ({
      title: benefit.title,
      contentType: benefit.contentType ?? null,
      contentTitle: benefit.contentTitle ?? null,
      displayContext: benefit.partnerName ?? null,
    }));
    const message =
      meta.length === 1
        ? formatBenefitGrantMessage({
            benefitTitle: meta[0].title,
            contentType: meta[0].contentType ?? null,
            contentTitle: meta[0].contentTitle ?? null,
            displayContext: meta[0].displayContext ?? null,
          })
        : `Vous avez reçu ${meta.length} avantages : ${meta.map((g) => formatBenefitNotificationLine(g)).join(' · ')}.`;
    await notifyBenefitGrantTarget({ userId, phone }, meta, message);
  }

  const { emitHomeRefresh } = await import('@/lib/home-refresh');
  emitHomeRefresh('benefit-grants');
}

async function executeGrant(input: {
  catalogIds: string[];
  partnerByCatalogId: Record<string, string>;
  partnerDisplayNameByCatalogId?: Record<string, string>;
  audience: BenefitGrantAudience;
  targetPhones?: string;
  customNote?: string | null;
  expiresAt: string;
  grantedBy: string;
  grantCountryCode?: string;
  grantCity?: string | null;
  targets?: GrantRecipientTarget[];
  validityDays?: number;
  validityStartsOnActivation?: boolean;
  grantBatchId?: string;
}): Promise<{ count: number; benefits: PrimeBenefit[]; skippedDuplicates: number }> {
  const targets =
    input.targets ??
    (await listBenefitGrantRecipientTargets(input.audience, input.targetPhones, input.grantCountryCode, input.grantCity));
  const catalogItems = await Promise.all(input.catalogIds.map((id) => getBenefitCatalogItem(id)));
  const validCatalog = catalogItems.filter(Boolean);
  if (!validCatalog.length || !targets.length) return { count: 0, benefits: [], skippedDuplicates: 0 };

  const now = new Date().toISOString();
  const grantBatchId = input.grantBatchId ?? `batch-${Date.now()}`;
  const created: PrimeBenefit[] = [];

  const users = await listRegistryUsers();
  const resolvedRecipients: Array<{
    recipient: Awaited<ReturnType<typeof resolveGrantRecipientDetails>>;
    identity: Awaited<ReturnType<typeof resolveBenefitIdentityKeys>>;
  }> = [];
  for (const target of targets) {
    const recipient = await resolveGrantRecipientDetails(target, users);
    const identity = await resolveBenefitIdentityKeys(recipient.userId, { phone: recipient.phone });
    resolvedRecipients.push({ recipient, identity });
  }

  const uuidTargets = [
    ...new Set(resolvedRecipients.map((r) => r.recipient.userId).filter(isRemoteBenefitRecipientId)),
  ];
  await Promise.all(uuidTargets.map((userId) => syncExpiredBenefitPendingStates(userId)));

  const { listConsumedBenefitIdsForGrantCheck } = await import('@/lib/benefit-redemption-store');
  const { fetchRemotePrimeBenefitsForUser, mergePrimeBenefits } = await import('@/lib/prime-benefits-sync');

  const consumedBenefitIds = await listConsumedBenefitIdsForGrantCheck(
    uuidTargets.length ? uuidTargets : resolvedRecipients.map((r) => r.recipient.userId),
  );

  let existing = refreshStatuses(await loadAll());
  for (const userId of uuidTargets) {
    const remoteGrants = await fetchRemotePrimeBenefitsForUser(userId);
    if (remoteGrants.length) {
      existing = refreshStatuses(mergePrimeBenefits(existing, remoteGrants));
    }
  }

  if (consumedBenefitIds.size > 0) {
    const nowIso = new Date().toISOString();
    existing = existing.map((benefit) => {
      if (!consumedBenefitIds.has(benefit.id)) return benefit;
      return {
        ...benefit,
        status: 'used' as const,
        usedAt: benefit.usedAt ?? nowIso,
        usesCount: Math.max(benefit.usesCount, 1),
      };
    });
  }
  let skippedDuplicates = 0;

  const grantCountry = input.grantCountryCode ?? null;

  for (const { recipient, identity } of resolvedRecipients) {
    const resolvedUserId = recipient.userId;
    const recipientPhone = recipient.phone;
    const recipientCity = recipient.city;
    for (const cat of validCatalog) {
      if (!cat) continue;
      const partnerKey = input.partnerByCatalogId[cat.id]?.trim() ?? '';
      const partnerDisplayName = input.partnerDisplayNameByCatalogId?.[cat.id]?.trim() ?? null;
      const offering = findCatalogOffering(cat, partnerKey, partnerDisplayName);
      const geo = await resolveBenefitGeoFromOffering(cat, offering);
      if (!benefitGeoMatchesUser(geo, recipientCity, input.grantCountryCode ?? null)) continue;

      const partnerLabel = safePartnerLabel(
        offering?.displayName,
        partnerDisplayName,
        partnerKey,
      );
      const partnerName = offering
        ? safePartnerLabel(offering.displayName, partnerLabel)
        : safePartnerLabel(
            await resolvePartnerDisplayName(partnerKey || null, partnerDisplayName, grantCountry ?? undefined),
            partnerLabel,
          );
      const partnerContext =
        offering?.contentId
          ? null
          : offering
            ? await resolvePartnerOfferingContext(offering.partnerId, partnerLabel).catch(() => null)
            : partnerKey
              ? await resolvePartnerOfferingContext(partnerKey, partnerLabel).catch(() => null)
              : null;
      const grantContentId =
        offering?.contentId ?? partnerContext?.contentId ?? partnerContext?.establishmentId ?? null;
      const grantSlotKey = grantRegrantSlotKey({
        catalogId: cat.id,
        partnerName,
        contentId: grantContentId,
      });

      const blockingGrant = memberHasBlockingCatalogGrant(
        existing,
        created,
        grantSlotKey,
        resolvedUserId,
        recipientPhone,
        identity.email,
        consumedBenefitIds,
      );
      if (blockingGrant) {
        if (__DEV__) {
          console.log('[PrimeBenefits] grant skip duplicate slot', {
            userId: resolvedUserId,
            catalogId: cat.id,
            slot: grantSlotKey,
            blockingBenefitId: blockingGrant.id,
            blockingStatus: blockingGrant.status,
            consumedKnown: consumedBenefitIds.has(blockingGrant.id),
          });
        }
        skippedDuplicates += 1;
        continue;
      }
      const description = input.customNote?.trim()
        ? `${cat.description}\n\n${input.customNote.trim()}`
        : cat.description;
      const startsOnActivation =
        input.validityStartsOnActivation ?? cat.validityStartsOnActivation !== false;
      const validityDays = input.validityDays ?? cat.defaultValidityDays;
      const clampedDays = (() => {
        if (validityDays == null || validityDays <= 0) return null;
        return clampValidityDaysToCatalogEnd(validityDays, cat.validityEndsAt).days;
      })();
      const itemExpiresAt = startsOnActivation
        ? PENDING_ACTIVATION_EXPIRES
        : clampedDays == null
          ? MEMBER_ROLE_ENTITLEMENT_EXPIRES
          : computeExpiresAtFromCatalog(clampedDays, new Date(now));
      created.push({
        id: `ben-${resolvedUserId}-${cat.id}-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
        userId: resolvedUserId,
        userPhone: recipientPhone,
        catalogId: cat.id,
        title: cat.title,
        description,
        partnerName,
        benefitKind: cat.benefitKind,
        quantityTotal: cat.benefitKind === 'quantity' ? cat.quantityPerGrant : null,
        quantityUsed: 0,
        maxUses: cat.benefitKind === 'usage_limit' ? cat.maxUsesPerGrant : null,
        usesCount: 0,
        status: 'active',
        grantedAt: now,
        expiresAt: itemExpiresAt,
        usedAt: null,
        validityDays: startsOnActivation ? clampedDays : null,
        validityStartsOnActivation: startsOnActivation,
        activatedAt: null,
        grantedBy: input.grantedBy,
        grantAudience: input.audience,
        customNote: input.customNote?.trim() || null,
        grantBatchId,
        grantCountryCode: input.grantCountryCode ?? null,
        grantCity: recipientCity ?? input.grantCity ?? null,
        contentId: grantContentId,
        contentType: offering?.contentType ?? partnerContext?.contentType ?? null,
        contentTitle: offering?.contentTitle ?? partnerContext?.contentTitle ?? null,
      });
    }
  }

  if (!created.length) {
    return { count: 0, benefits: [], skippedDuplicates };
  }

  const merged = [...created, ...existing];
  await persistAndSync(merged, created);
  try {
    await pushCreatedBenefitNotifications(created);
    markNetworkReachable();
  } catch (err) {
    console.warn('[PrimeBenefits] push notification:', err instanceof Error ? err.message : err);
  }
  if (__DEV__) {
    console.log('[PrimeBenefits] grant ok', { count: created.length, skippedDuplicates });
  }
  return { count: created.length, benefits: created, skippedDuplicates };
}

export async function grantPrimeBenefits(input: {
  catalogIds: string[];
  partnerByCatalogId: Record<string, string>;
  partnerDisplayNameByCatalogId?: Record<string, string>;
  audience: BenefitGrantAudience;
  targetPhones?: string;
  customNote?: string | null;
  expiresAt: string;
  scheduledAt?: string | null;
  grantedBy: string;
  grantCountryCode?: string;
  grantCity?: string | null;
}): Promise<{ count: number; scheduled: boolean; skippedDuplicates: number }> {
  const isScheduled = Boolean(input.scheduledAt && new Date(input.scheduledAt) > new Date());

  if (isScheduled) {
    const scheduled: ScheduledBenefitGrant = {
      id: `sbg-${Date.now()}`,
      catalogIds: input.catalogIds,
      partnerByCatalogId: input.partnerByCatalogId,
      partnerDisplayNameByCatalogId: input.partnerDisplayNameByCatalogId,
      audience: input.audience,
      targetPhones: input.targetPhones ?? null,
      customNote: input.customNote ?? null,
      scheduledAt: input.scheduledAt!,
      expiresAt: input.expiresAt,
      grantedBy: input.grantedBy,
      grantCountryCode: input.grantCountryCode ?? null,
      grantCity: input.grantCity ?? null,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    };
    const all = await loadScheduled();
    await saveScheduled([scheduled, ...all]);
    return { count: 0, scheduled: true, skippedDuplicates: 0 };
  }

  const res = await executeGrant(input);
  return { count: res.count, scheduled: false, skippedDuplicates: res.skippedDuplicates };
}

export async function grantPrimeBenefitsToTargets(input: {
  catalogIds: string[];
  partnerByCatalogId: Record<string, string>;
  partnerDisplayNameByCatalogId?: Record<string, string>;
  targets: Array<{ userId: string; phone: string | null }>;
  customNote?: string | null;
  grantedBy: string;
  grantCountryCode?: string;
  validityDays: number | null;
  validityStartsOnActivation?: boolean;
  grantBatchId?: string;
}): Promise<{ count: number; benefits: PrimeBenefit[]; skippedDuplicates: number }> {
  const startsOnActivation = input.validityStartsOnActivation ?? true;
  const unlimited = input.validityDays == null || input.validityDays <= 0;
  return executeGrant({
    catalogIds: input.catalogIds,
    partnerByCatalogId: input.partnerByCatalogId,
    partnerDisplayNameByCatalogId: input.partnerDisplayNameByCatalogId,
    audience: 'individual',
    customNote: input.customNote,
    expiresAt: unlimited
      ? MEMBER_ROLE_ENTITLEMENT_EXPIRES
      : startsOnActivation
        ? PENDING_ACTIVATION_EXPIRES
        : computeExpiresAtFromCatalog(input.validityDays!),
    grantedBy: input.grantedBy,
    grantCountryCode: input.grantCountryCode,
    targets: input.targets,
    validityDays: unlimited ? undefined : input.validityDays ?? undefined,
    validityStartsOnActivation: unlimited ? false : startsOnActivation,
    grantBatchId: input.grantBatchId,
  });
}

export async function processDueScheduledBenefitGrants(): Promise<number> {
  const all = await loadScheduled();
  const now = Date.now();
  let processed = 0;
  const updated = [...all];

  let changed = false;
  for (let i = 0; i < updated.length; i++) {
    const entry = updated[i];
    if (entry.status !== 'scheduled' || new Date(entry.scheduledAt).getTime() > now) continue;
    const res = await executeGrant({
      catalogIds: entry.catalogIds,
      partnerByCatalogId: entry.partnerByCatalogId ?? {},
      partnerDisplayNameByCatalogId: entry.partnerDisplayNameByCatalogId,
      audience: entry.audience,
      targetPhones: entry.targetPhones ?? undefined,
      customNote: entry.customNote,
      expiresAt: entry.expiresAt,
      grantedBy: entry.grantedBy,
      grantCountryCode: entry.grantCountryCode ?? undefined,
      grantCity: entry.grantCity ?? undefined,
    });
    if (res.count > 0) processed += 1;
    updated[i] = { ...entry, status: 'sent' };
    changed = true;
  }

  if (changed) await saveScheduled(updated);
  return processed;
}

export type UserPrimeBenefitList = {
  active: PrimeBenefit[];
  used: PrimeBenefit[];
  expired_unused: PrimeBenefit[];
};

/** Lecture locale seule — pas de pull réseau (fiches détail / UI légère). */
export async function peekUserPrimeBenefits(
  userId: string,
  identity?: { phone?: string | null; email?: string | null },
): Promise<UserPrimeBenefitList> {
  const { userIds, phone, email } = await resolveBenefitIdentityKeys(userId, identity);
  const all = refreshStatuses(await loadAllFromStorage()).filter((b) =>
    benefitBelongsToUser(b, userIds, phone, email),
  );
  return {
    active: all.filter((b) => b.status === 'active' || b.status === 'pending_validation'),
    used: all.filter((b) => b.status === 'used'),
    expired_unused: all.filter((b) => b.status === 'expired_unused'),
  };
}

export async function listUserPrimeBenefits(
  userId: string,
  identity?: { phone?: string | null; email?: string | null },
  options?: { force?: boolean },
): Promise<UserPrimeBenefitList> {
  const { userIds, phone, email } = await resolveBenefitIdentityKeys(userId, identity);
  const uuid = [...userIds].find((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (uuid) {
    await syncExpiredBenefitPendingStates(uuid);
  }
  let all = refreshStatuses(await loadAllFromStorage()).filter((b) =>
    benefitBelongsToUser(b, userIds, phone, email),
  );

  const lastRemoteAt = lastExpiredSyncAt.get(`remote-list:${uuid}`) ?? 0;
  const shouldFetchRemote =
    options?.force === true || Date.now() - lastRemoteAt > EXPIRED_SYNC_COOLDOWN_MS;

  try {
    const { fetchRemotePrimeBenefitsForUser, mergePrimeBenefits } = await import('@/lib/prime-benefits-sync');
    if (uuid && shouldFetchRemote) {
      lastExpiredSyncAt.set(`remote-list:${uuid}`, Date.now());
      const remote = await fetchRemotePrimeBenefitsForUser(uuid);
      all = refreshStatuses(mergePrimeBenefits(all, remote)).filter((b) =>
        benefitBelongsToUser(b, userIds, phone, email),
      );
      const others = refreshStatuses(await loadAllFromStorage()).filter(
        (b) => !benefitBelongsToUser(b, userIds, phone, email),
      );
      await saveAll([...others, ...all]);
    }
  } catch {
    /* garde le local */
  }

  return {
    active: all.filter((b) => b.status === 'active' || b.status === 'pending_validation'),
    used: all.filter((b) => b.status === 'used'),
    expired_unused: all.filter((b) => b.status === 'expired_unused'),
  };
}

export async function listAllPrimeBenefits(): Promise<PrimeBenefit[]> {
  return refreshStatuses(await loadAll()).sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
}

export async function listBenefitGrantBatches(countryCode?: string): Promise<BenefitGrantBatch[]> {
  const all = await listAllPrimeBenefits();
  const scoped = countryCode
    ? all.filter((b) => (b.grantCountryCode ?? inferCountryCodeFromPhone(b.userPhone)) === countryCode)
    : all;
  const batches = new Map<string, BenefitGrantBatch>();

  for (const benefit of scoped) {
    const batchKey =
      benefit.grantBatchId ??
      `${benefit.grantedAt.slice(0, 19)}|${benefit.grantAudience}|${benefit.grantedBy}|${benefit.catalogId}`;

    const displayName =
      (await resolveBeneficiaryDisplayName(benefit.userId, benefit.userPhone)) ??
      benefit.userPhone ??
      benefit.userId;

    const existing = batches.get(batchKey);
    const beneficiary = {
      benefitId: benefit.id,
      userId: benefit.userId,
      userPhone: benefit.userPhone,
      displayName,
      status: benefit.status,
      usageLabel: getBenefitUsageLabel(benefit),
      canRevoke: canRevokeBenefit(benefit),
    };

    if (existing) {
      if (!existing.catalogIds.includes(benefit.catalogId)) {
        existing.catalogIds.push(benefit.catalogId);
        existing.titles.push(benefit.title);
      }
      const already = existing.beneficiaries.some((b) => b.benefitId === benefit.id);
      if (!already) existing.beneficiaries.push(beneficiary);
    } else {
      batches.set(batchKey, {
        id: batchKey,
        catalogIds: [benefit.catalogId],
        titles: [benefit.title],
        grantedAt: benefit.grantedAt,
        expiresAt: benefit.expiresAt,
        grantAudience: benefit.grantAudience,
        grantedBy: benefit.grantedBy,
        customNote: benefit.customNote,
        beneficiaries: [beneficiary],
      });
    }
  }

  return Array.from(batches.values()).sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
}

/** Une ligne = un avantage × un lieu (spot / event / outil / partenaire). */
export interface BenefitGrantLine {
  id: string;
  catalogId: string;
  title: string;
  /** Lieu d'exercice (spot, event, outil) ou partenaire. */
  placeLabel: string | null;
  contentId: string | null;
  contentType: 'event' | 'spot' | 'tool' | null;
  partnerName: string | null;
  grantedAt: string;
  expiresAt: string;
  grantAudience: BenefitGrantAudience;
  grantedBy: string;
  customNote: string | null;
  beneficiaries: BenefitGrantBatch['beneficiaries'];
}

function grantPlaceKey(benefit: PrimeBenefit): string {
  if (benefit.contentId?.trim()) return `id:${benefit.contentId.trim()}`;
  const title = benefit.contentTitle?.trim();
  if (title && benefit.contentType) return `${benefit.contentType}:${title.toLowerCase()}`;
  if (title) return `title:${title.toLowerCase()}`;
  const partner = benefit.partnerName?.trim();
  if (partner) return `partner:${partner.toLowerCase()}`;
  return 'wide';
}

async function grantPlaceLabel(benefit: PrimeBenefit): Promise<string | null> {
  return resolveBenefitDisplayContext(benefit);
}

/**
 * Derniers octrois : une ligne par (catalogue + lieu).
 * Même avantage sur des lieux différents = lignes séparées.
 * Même avantage + même lieu = une seule ligne, tous les bénéficiaires.
 */
export async function listBenefitGrantLines(countryCode?: string): Promise<BenefitGrantLine[]> {
  const all = await listAllPrimeBenefits();
  const scoped = countryCode
    ? all.filter(
        (b) =>
          !b.grantCountryCode ||
          (b.grantCountryCode ?? inferCountryCodeFromPhone(b.userPhone)) === countryCode,
      )
    : all;

  const lines = new Map<string, BenefitGrantLine>();

  for (const benefit of scoped) {
    // Hors historique « Derniers octrois » : avantages auto liés au rôle
    if (benefit.roleEntitlement) continue;
    const placeKey = grantPlaceKey(benefit);
    const lineId = `${benefit.catalogId}::${placeKey}`;
    const displayName =
      (await resolveBeneficiaryDisplayName(benefit.userId, benefit.userPhone)) ??
      benefit.userPhone ??
      benefit.userId;

    const beneficiary = {
      benefitId: benefit.id,
      userId: benefit.userId,
      userPhone: benefit.userPhone,
      displayName,
      status: benefit.status,
      usageLabel: getBenefitUsageLabel(benefit),
      canRevoke: canRevokeBenefit(benefit),
    };

    const existing = lines.get(lineId);
    if (existing) {
      if (!existing.beneficiaries.some((b) => b.benefitId === benefit.id)) {
        existing.beneficiaries.push(beneficiary);
      }
      if (benefit.grantedAt > existing.grantedAt) existing.grantedAt = benefit.grantedAt;
      if (benefit.expiresAt > existing.expiresAt) existing.expiresAt = benefit.expiresAt;
      if (!existing.placeLabel) existing.placeLabel = await grantPlaceLabel(benefit);
    } else {
      lines.set(lineId, {
        id: lineId,
        catalogId: benefit.catalogId,
        title: benefit.title,
        placeLabel: await grantPlaceLabel(benefit),
        contentId: benefit.contentId ?? null,
        contentType: benefit.contentType ?? null,
        partnerName: benefit.partnerName ?? null,
        grantedAt: benefit.grantedAt,
        expiresAt: benefit.expiresAt,
        grantAudience: benefit.grantAudience,
        grantedBy: benefit.grantedBy,
        customNote: benefit.customNote,
        beneficiaries: [beneficiary],
      });
    }
  }

  return Array.from(lines.values()).sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
}

export async function countUserActiveBenefits(
  userId: string,
  identity?: { phone?: string | null; email?: string | null },
): Promise<number> {
  const grouped = await peekUserPrimeBenefits(userId, identity);
  return new Set(grouped.active.map((b) => b.catalogId)).size;
}

export async function markBenefitUsed(
  benefitId: string,
  userId: string,
  identity?: { phone?: string | null; email?: string | null },
): Promise<boolean> {
  const { userIds, phone, email } = await resolveBenefitIdentityKeys(userId, identity);
  const all = await loadAll();
  const idx = all.findIndex(
    (b) =>
      b.id === benefitId &&
      benefitBelongsToUser(b, userIds, phone, email) &&
      (b.status === 'active' || b.status === 'pending_validation') &&
      !isBenefitFullyUsed(b),
  );
  if (idx < 0) return false;

  const benefit = all[idx];
  const activated = activateBenefitValidityIfNeeded(benefit);
  let next: PrimeBenefit = activated;

  if (activated.benefitKind === 'quantity' && activated.quantityTotal != null) {
    const used = activated.quantityUsed + 1;
    next = {
      ...activated,
      quantityUsed: used,
      usedAt: used >= activated.quantityTotal ? new Date().toISOString() : activated.usedAt,
      status: used >= activated.quantityTotal ? 'used' : 'active',
    };
  } else if (activated.benefitKind === 'usage_limit' && activated.maxUses != null) {
    const count = activated.usesCount + 1;
    next = {
      ...activated,
      usesCount: count,
      usedAt: count >= activated.maxUses ? new Date().toISOString() : activated.usedAt,
      status: count >= activated.maxUses ? 'used' : 'active',
    };
  } else {
    next = { ...activated, usedAt: new Date().toISOString(), status: 'used', usesCount: 1 };
  }

  all[idx] = next;
  await persistAndSync(all, [next]);
  return true;
}

export async function deleteAllBenefitsForCatalog(catalogId: string): Promise<number> {
  const all = await loadAll();
  const remaining = all.filter((b) => b.catalogId !== catalogId);
  const removed = all.length - remaining.length;
  if (removed > 0) {
    await persistAndSync(remaining, []);
  }
  return removed;
}

export async function revokeBenefit(benefitId: string): Promise<boolean> {
  const all = await loadAll();
  const idx = all.findIndex((b) => b.id === benefitId);
  if (idx < 0) return false;
  const target = refreshStatuses([all[idx]])[0];
  if (!canRevokeBenefit(target)) return false;
  const revoked: PrimeBenefit = {
    ...target,
    status: 'expired_unused',
    expiresAt: new Date().toISOString(),
  };
  all[idx] = revoked;
  await persistAndSync(all, [revoked]);
  return true;
}

export async function revertBenefitToActive(benefitId: string): Promise<boolean> {
  const all = await loadAll();
  const idx = all.findIndex((b) => b.id === benefitId && b.status === 'pending_validation');
  if (idx < 0) return false;
  all[idx] = { ...all[idx], status: 'active' };
  const updated = all[idx];
  await persistAndSync(all, [updated]);
  return true;
}

export async function requestBenefitValidation(
  benefitId: string,
  userId: string,
  identity?: {
    phone?: string | null;
    email?: string | null;
    /** Fiche contenu (spot/event/outil) d’où part l’utilisation — prioritaire pour le partenaire. */
    contentId?: string | null;
    contentType?: 'event' | 'spot' | 'tool' | null;
    contentTitle?: string | null;
  },
): Promise<{ ok: boolean; reason?: string }> {
  console.log('[Benefits] validation start', { benefitId, userId, contentId: identity?.contentId ?? null });

  const { createBenefitRedemption } = await import('@/lib/benefit-redemption-store');
  const {
    resolvePartnerValidationCodeForContent,
    resolveStablePartnerKey,
  } = await import('@/lib/partner-validation-code-store');
  const { resolvePartnerUserIdForSync } = await import('@/lib/partner-user-resolve');
  const { findCatalogOffering, listBenefitCatalog } = await import('@/lib/benefit-catalog-store');
  const { EXTERNAL_PARTNER_ID } = await import('@/lib/partner-directory-store');

  const sessionUserId =
    /^[0-9a-f-]{36}$/i.test(userId)
      ? userId
      : userId;

  // Local uniquement — le benefitId vient du tap UI membre
  let all = refreshStatuses(await loadAllFromStorage());
  let idx = all.findIndex((b) => b.id === benefitId && canPushBenefitValidation(b));
  if (idx < 0) {
    const sameId = all.filter((b) => b.id === benefitId);
    console.warn('[Benefits] validation not_found', {
      benefitId,
      sameIdStatuses: sameId.map((b) => b.status),
      sameIdUserIds: sameId.map((b) => b.userId),
    });
    return { ok: false, reason: 'not_found' };
  }

  const benefit = all[idx];
  const activated = activateBenefitValidityIfNeeded(benefit);

  const contextContentId = identity?.contentId?.trim() || benefit.contentId?.trim() || '';
  const catalog = await listBenefitCatalog();
  const cat = catalog.find((c) => c.id === benefit.catalogId);
  const offering = cat
    ? (contextContentId
        ? cat.offeringPartners.find((p) => p.contentId === contextContentId)
        : undefined) ??
      (benefit.contentId
        ? cat.offeringPartners.find((p) => p.contentId === benefit.contentId)
        : undefined) ??
      findCatalogOffering(cat, '', benefit.partnerName) ??
      findCatalogOffering(cat, EXTERNAL_PARTNER_ID, benefit.partnerName) ??
      cat.offeringPartners[0]
    : undefined;

  const partnerName =
    offering?.displayName?.trim() ||
    benefit.partnerName?.trim() ||
    identity?.contentTitle?.trim() ||
    'Partenaire';
  if (!partnerName) {
    console.warn('[Benefits] validation no_partner', { benefitId, catalogId: benefit.catalogId });
    return { ok: false, reason: 'no_partner' };
  }

  const offeringPartnerId = offering?.partnerId?.trim() || EXTERNAL_PARTNER_ID;

  // Résolution partenaire — timeout court pour ne pas bloquer l’insert remote
  const resolvePartner = async () => {
    const resolvedUserId = await resolvePartnerUserIdForSync(offeringPartnerId, partnerName);
    const establishmentKey = await resolveStablePartnerKey(offeringPartnerId, partnerName);
    const partnerId = resolvedUserId ?? establishmentKey;
    const partnerCode = await resolvePartnerValidationCodeForContent(
      partnerId,
      partnerName,
      contextContentId || offering?.contentId || null,
    );
    return { partnerId: partnerCode.partnerId, partnerCode };
  };

  let partnerId = offeringPartnerId;
  let partnerCode: PartnerValidationCode;
  try {
    const resolved = await Promise.race([
      resolvePartner(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
    ]);
    if (resolved) {
      partnerId = resolved.partnerCode.partnerId;
      partnerCode = resolved.partnerCode;
    } else {
      console.warn('[Benefits] partner resolve timeout — fallback getOrCreate');
      const {
        getOrCreatePartnerValidationCode,
        getOrCreateTheLoopTeamValidationCode,
        isTheLoopTeamPartnerName,
      } = await import('@/lib/partner-validation-code-store');
      partnerCode = isTheLoopTeamPartnerName(partnerName)
        ? await getOrCreateTheLoopTeamValidationCode()
        : await getOrCreatePartnerValidationCode(offeringPartnerId, partnerName);
      partnerId = partnerCode.partnerId;
    }
  } catch (err) {
    console.warn('[Benefits] partner resolve error', err);
    const {
      getOrCreatePartnerValidationCode,
      getOrCreateTheLoopTeamValidationCode,
      isTheLoopTeamPartnerName,
    } = await import('@/lib/partner-validation-code-store');
    partnerCode = isTheLoopTeamPartnerName(partnerName)
      ? await getOrCreateTheLoopTeamValidationCode()
      : await getOrCreatePartnerValidationCode(offeringPartnerId, partnerName);
    partnerId = partnerCode.partnerId;
  }

  const activatedWithPartner = {
    ...activated,
    userId: sessionUserId,
    partnerName,
    contentId: contextContentId || offering?.contentId || activated.contentId || null,
    contentType:
      identity?.contentType ??
      offering?.contentType ??
      activated.contentType ??
      null,
    contentTitle:
      identity?.contentTitle?.trim() ||
      offering?.contentTitle ||
      activated.contentTitle ||
      null,
  };

  // 1) Marquer pending local IMMÉDIATEMENT
  all[idx] = { ...activatedWithPartner, status: 'pending_validation' };
  const updated = all[idx];
  await saveAll(all);

  // 2) Aligner le statut octroi côté serveur avant la redemption (octroi individuel admin déjà en base)
  await persistAndSync(all, [updated], { awaitRemote: true }).catch(() => undefined);

  // 3) Créer / re-pousser la demande (locale + remote pour le scan partenaire)
  const { redemption, remoteOk } = await createBenefitRedemption({
    benefitId: activatedWithPartner.id,
    userId: sessionUserId,
    partnerId,
    partnerName,
    partnerCode: partnerCode.code,
    contentId: activatedWithPartner.contentId ?? null,
    contentType: activatedWithPartner.contentType ?? null,
    contentTitle: activatedWithPartner.contentTitle ?? null,
    benefitTitle: activatedWithPartner.title,
    benefitDescription: activatedWithPartner.description,
  });

  console.log('[Benefits] validation requested', {
    benefitId: activatedWithPartner.id,
    userId: sessionUserId,
    partnerCode: partnerCode.code,
    partnerId,
    partnerName,
    contentId: activatedWithPartner.contentId,
    redemptionId: redemption.id,
    remoteOk,
  });

  markNetworkReachable();

  try {
    const { sendBenefitValidationPendingNotification } = await import('@/lib/user-notifications-store');
    const { BENEFIT_REDEMPTION_TIMEOUT_MINUTES } = await import('@/lib/benefit-redemption-store');
    await sendBenefitValidationPendingNotification({
      memberUserId: activatedWithPartner.userId,
      benefitTitle: activatedWithPartner.title,
      partnerName,
      displayContext: activatedWithPartner.contentTitle ?? partnerName,
      timeoutMinutes: BENEFIT_REDEMPTION_TIMEOUT_MINUTES,
    });
  } catch {
    /* notification locale best-effort */
  }

  if (!remoteOk) {
    return { ok: false, reason: 'remote_sync_failed' };
  }

  return { ok: true };
}

const pendingExpiredSync = new Map<string, Promise<void>>();
const lastExpiredSyncAt = new Map<string, number>();
const EXPIRED_SYNC_COOLDOWN_MS = 15_000;

export async function syncExpiredBenefitPendingStates(userId?: string): Promise<void> {
  const key = userId ?? '__all__';
  const inFlight = pendingExpiredSync.get(key);
  if (inFlight) return inFlight;
  const last = lastExpiredSyncAt.get(key) ?? 0;
  if (Date.now() - last < EXPIRED_SYNC_COOLDOWN_MS) return;
  lastExpiredSyncAt.set(key, Date.now());

  const run = (async () => {
  const {
    expireStaleBenefitRedemptions,
    expireRemoteStaleBenefitRedemptionsForUser,
    reconcileStalePendingValidationGrantsForUser,
    reconcileConsumedGrantsForUser,
    listLivePendingBenefitIdsForUser,
  } = await import('@/lib/benefit-redemption-store');
  let revertedToActiveIds = await expireStaleBenefitRedemptions();
  let consumedBenefitIds: string[] = [];
  if (userId && /^[0-9a-f-]{36}$/i.test(userId)) {
    const [remoteExpired, stalePending, consumed] = await Promise.all([
      expireRemoteStaleBenefitRedemptionsForUser(userId).catch(() => [] as string[]),
      reconcileStalePendingValidationGrantsForUser(userId).catch(() => [] as string[]),
      reconcileConsumedGrantsForUser(userId).catch(() => [] as string[]),
    ]);
    revertedToActiveIds = [...new Set([...revertedToActiveIds, ...remoteExpired, ...stalePending])];
    consumedBenefitIds = consumed;

    // Ne jamais annuler un pending local tant qu’une redemption locale est encore valide
    // SAUF si ce benefit vient d’être consommé (validé partenaire)
    const liveLocal = await listLivePendingBenefitIdsForUser(userId).catch(() => new Set<string>());
    if (liveLocal.size) {
      revertedToActiveIds = revertedToActiveIds.filter(
        (id) => !liveLocal.has(id) || consumedBenefitIds.includes(id),
      );
    }
  }
  if (!revertedToActiveIds.length && !consumedBenefitIds.length) return;
  const all = refreshStatuses(await loadAllFromStorage());
  let changed = false;
  const now = new Date().toISOString();
  const next = all.map((b) => {
    if (consumedBenefitIds.includes(b.id)) {
      changed = true;
      return {
        ...b,
        status: 'used' as const,
        usedAt: b.usedAt ?? now,
        usesCount: Math.max(b.usesCount, 1),
      };
    }
    if (b.status === 'pending_validation' && revertedToActiveIds.includes(b.id)) {
      changed = true;
      return { ...b, status: 'active' as const };
    }
    return b;
  });
  if (changed) {
    const touched = next.filter(
      (b) => consumedBenefitIds.includes(b.id) || revertedToActiveIds.includes(b.id),
    );
    // Local d’abord ; remote déjà à jour côté partenaire — ne pas bloquer
    await persistAndSync(next, touched, { awaitRemote: false });
  }
  })();

  pendingExpiredSync.set(key, run);
  try {
    await run;
  } finally {
    pendingExpiredSync.delete(key);
  }
}

export function computeExpiresAtFromCatalog(days: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export async function getMaxValidityDays(catalogIds: string[]): Promise<number> {
  const { clampValidityDaysToCatalogEnd, peekBenefitCatalog } = await import('@/lib/benefit-catalog-store');
  const items = await peekBenefitCatalog();
  const selected = items.filter((i) => catalogIds.includes(i.id));
  if (!selected.length) return 30;
  let max = 0;
  for (const item of selected) {
    const clamped = clampValidityDaysToCatalogEnd(item.defaultValidityDays, item.validityEndsAt);
    max = Math.max(max, clamped.days);
  }
  return max || 30;
}

/** Date d'expiration d'octroi plafonnée par validityEndsAt du catalogue si défini. */
export async function computeGrantExpiresAt(
  catalogIds: string[],
  from = new Date(),
): Promise<string> {
  const { peekBenefitCatalog } = await import('@/lib/benefit-catalog-store');
  const days = await getMaxValidityDays(catalogIds);
  let expiresAt = computeExpiresAtFromCatalog(days, from);
  const items = await peekBenefitCatalog();
  for (const item of items.filter((i) => catalogIds.includes(i.id))) {
    if (item.validityEndsAt) {
      const end = new Date(item.validityEndsAt);
      if (!Number.isNaN(end.getTime()) && end.getTime() < new Date(expiresAt).getTime()) {
        expiresAt = end.toISOString();
      }
    }
  }
  return expiresAt;
}

export interface BenefitOverviewKpis {
  granted: number;
  active: number;
  expired: number;
  consumed: number;
}

export interface BenefitInsightsDetails {
  catalogTotal: number;
  catalogActive: number;
  catalogActiveAssociated: number;
  individual: BenefitOverviewKpis;
  roleEntitlement: BenefitOverviewKpis;
  allGrants: BenefitOverviewKpis;
}

function filterGrantsByCountry(all: PrimeBenefit[], countryCode?: string): PrimeBenefit[] {
  if (!countryCode) return all;
  const cc = countryCode.toUpperCase().slice(0, 2);
  return all.filter(
    (b) => !b.grantCountryCode || b.grantCountryCode.toUpperCase().slice(0, 2) === cc,
  );
}

function computeBenefitOverviewKpis(benefits: PrimeBenefit[]): BenefitOverviewKpis {
  return {
    granted: benefits.length,
    active: benefits.filter((b) => b.status === 'active' || b.status === 'pending_validation').length,
    expired: benefits.filter((b) => b.status === 'expired_unused').length,
    consumed: benefits.filter((b) => b.status === 'used').length,
  };
}

export async function getBenefitInsightsDetails(countryCode?: string): Promise<BenefitInsightsDetails> {
  const { countDashboardActiveCatalogBenefits, listBenefitCatalog } = await import(
    '@/lib/benefit-catalog-store'
  );
  let all = filterGrantsByCountry(await loadGrantsForAdminAnalytics(countryCode), countryCode);
  const individual = all.filter((b) => !isRoleEntitlementBenefit(b));
  const role = all.filter((b) => isRoleEntitlementBenefit(b));
  const cc = countryCode?.toUpperCase().slice(0, 2);
  const catalogAll = await listBenefitCatalog(false);
  const catalog = cc
    ? catalogAll.filter((c) => (c.countryCode ?? '').toUpperCase().slice(0, 2) === cc)
    : catalogAll;
  const catalogActiveAssociated = await countDashboardActiveCatalogBenefits(countryCode);
  return {
    catalogTotal: catalog.length,
    catalogActive: catalog.filter((c) => c.isActive).length,
    catalogActiveAssociated,
    individual: computeBenefitOverviewKpis(individual),
    roleEntitlement: computeBenefitOverviewKpis(role),
    allGrants: computeBenefitOverviewKpis(all),
  };
}

export async function getBenefitOverviewKpis(countryCode?: string): Promise<BenefitOverviewKpis> {
  const details = await getBenefitInsightsDetails(countryCode);
  return details.allGrants;
}

export interface CatalogUsageStat {
  catalogId: string;
  title: string;
  granted: number;
  grantedIndividual: number;
  grantedRole: number;
  /** Affectés au membre et utilisés */
  used: number;
  /** Affectés au membre mais pas encore utilisés (active / pending_validation) */
  unusedAssigned: number;
  /** Catalogue actif sans aucun octroi membre */
  unassignedActive: number;
  isActive: boolean;
  /** @deprecated utiliser unusedAssigned */
  active: number;
}

export async function getCatalogUsageStats(countryCode?: string): Promise<CatalogUsageStat[]> {
  await purgeOrphanPrimeBenefits();
  const allBenefits = await loadGrantsForAdminAnalytics(countryCode);
  const cc = countryCode?.toUpperCase().slice(0, 2);
  const all = cc
    ? allBenefits.filter(
        (b) => !b.grantCountryCode || b.grantCountryCode.toUpperCase().slice(0, 2) === cc,
      )
    : allBenefits;
  const catalogAll = await listBenefitCatalog();
  const catalog = cc
    ? catalogAll.filter((c) => (c.countryCode ?? '').toUpperCase().slice(0, 2) === cc)
    : catalogAll;
  const catalogIds = new Set(catalog.map((c) => c.id));
  const byCatalog = new Map<string, CatalogUsageStat>();

  for (const item of catalog) {
    byCatalog.set(item.id, {
      catalogId: item.id,
      title: item.title,
      granted: 0,
      grantedIndividual: 0,
      grantedRole: 0,
      used: 0,
      unusedAssigned: 0,
      unassignedActive: item.isActive ? 1 : 0,
      isActive: item.isActive,
      active: 0,
    });
  }

  for (const benefit of all) {
    if (!catalogIds.has(benefit.catalogId)) continue;
    const stat = byCatalog.get(benefit.catalogId);
    if (!stat) continue;
    stat.granted += 1;
    if (isRoleEntitlementBenefit(benefit)) stat.grantedRole += 1;
    else stat.grantedIndividual += 1;
    if (benefit.status === 'used') stat.used += 1;
    if (benefit.status === 'active' || benefit.status === 'pending_validation') {
      stat.unusedAssigned += 1;
      stat.active += 1;
    }
    if (stat.granted > 0) stat.unassignedActive = 0;
  }

  return [...byCatalog.values()].sort(
    (a, b) => b.used - a.used || b.granted - a.granted || a.title.localeCompare(b.title, 'fr'),
  );
}

/** Retire les octrois dont le catalogue n'existe plus (suppression Paramètres / admin). */
export async function purgeOrphanPrimeBenefits(): Promise<number> {
  const { listBenefitCatalog } = await import('@/lib/benefit-catalog-store');
  const catalogIds = new Set((await listBenefitCatalog()).map((c) => c.id));
  const all = await loadAll();
  const next = all.filter((b) => catalogIds.has(b.catalogId));
  const removed = all.length - next.length;
  if (removed > 0) await persistAndSync(next, []);
  return removed;
}

function roleEntitlementBenefitId(userId: string, catalogId: string, role: RoleEntitlementKind): string {
  return `role-ben-${userId}-${catalogId}-${role}`;
}

function resolvePrimeEntitlementExpiresAt(user: User): string {
  if (user.subscriptionExpiresAt) {
    const exp = new Date(user.subscriptionExpiresAt);
    if (!Number.isNaN(exp.getTime())) return exp.toISOString();
  }
  return PENDING_ACTIVATION_EXPIRES;
}

async function buildRoleEntitlementBenefit(
  user: User,
  entry: RoleBenefitEntitlementEntry,
  role: RoleEntitlementKind,
  expiresAt: string,
): Promise<PrimeBenefit | null> {
  const { peekBenefitCatalog } = await import('@/lib/benefit-catalog-store');
  const catalog =
    (await peekBenefitCatalog()).find((c) => c.id === entry.catalogId) ??
    (await getBenefitCatalogItem(entry.catalogId));
  if (!catalog || !catalog.isActive) return null;

  const partnerKey = entry.partnerId ?? EXTERNAL_PARTNER_ID;
  const offering = findCatalogOffering(catalog, partnerKey, entry.partnerDisplayName ?? null);
  const partnerName = offering
    ? offering.displayName
    : (entry.partnerDisplayName?.trim() || partnerKey);
  const partnerContext = offering
    ? await resolvePartnerOfferingContext(offering.partnerId, partnerName ?? offering.displayName).catch(() => null)
    : null;

  const now = new Date().toISOString();
  const phone = user.phoneNumber ? normalizePhone(user.phoneNumber) : null;

  return normalizeBenefit({
    id: roleEntitlementBenefitId(user.id, entry.catalogId, role),
    userId: user.id,
    userPhone: phone,
    catalogId: entry.catalogId,
    title: catalog.title,
    description: catalog.description,
    partnerName,
    benefitKind: catalog.benefitKind,
    quantityTotal: catalog.benefitKind === 'quantity' ? catalog.quantityPerGrant : null,
    quantityUsed: 0,
    maxUses: catalog.benefitKind === 'usage_limit' ? catalog.maxUsesPerGrant : null,
    usesCount: 0,
    status: 'active',
    grantedAt: now,
    expiresAt,
    usedAt: null,
    validityDays: null,
    validityStartsOnActivation: false,
    activatedAt: null,
    grantedBy: 'role-entitlement',
    grantAudience: role === 'prime' ? 'prime' : role === 'admin' ? 'individual' : 'members',
    customNote: null,
    grantBatchId: `role-entitlement-${role}`,
    grantCountryCode: catalog.countryCode ?? null,
    grantCity: user.city ?? null,
    contentId: offering?.contentId ?? partnerContext?.contentId ?? null,
    contentType: offering?.contentType ?? partnerContext?.contentType ?? null,
    contentTitle: offering?.contentTitle ?? partnerContext?.contentTitle ?? null,
    roleEntitlement: role,
  });
}

function roleEntitlementCountriesForUser(user: User): CountryCode[] {
  const account = resolveCountryCode(user.countryCode);
  const interest = user.interestCountryCode ? resolveCountryCode(user.interestCountryCode) : null;
  const codes = new Set<CountryCode>([account]);
  if (interest) codes.add(interest);
  return [...codes];
}

/**
 * Octroie / met à jour / retire les avantages inclus automatiquement selon le rôle (membre / PASS Prime).
 */
export async function syncUserRoleBenefitEntitlements(user: User): Promise<number> {
  if (!user?.id || user.id === 'anonymous') return 0;

  const entitled = new Map<string, { entry: RoleBenefitEntitlementEntry; role: RoleEntitlementKind; expiresAt: string }>();

  for (const cc of roleEntitlementCountriesForUser(user)) {
    if (!userMatchesBenefitCountry(user, cc)) continue;

    await refreshRoleBenefitEntitlementsConfig(cc);
    const config = await peekRoleBenefitEntitlementsConfig(cc);

    if (userQualifiesForMemberEntitlements(user)) {
      for (const entry of config.member) {
        entitled.set(`member:${entry.catalogId}`, {
          entry,
          role: 'member',
          expiresAt: MEMBER_ROLE_ENTITLEMENT_EXPIRES,
        });
      }
    }

    if (userQualifiesForPrimeEntitlements(user)) {
      const primeExpires = resolvePrimeEntitlementExpiresAt(user);
      for (const entry of config.prime) {
        entitled.set(`prime:${entry.catalogId}`, {
          entry,
          role: 'prime',
          expiresAt: primeExpires,
        });
      }
    }

    if (userQualifiesForPartnerEntitlements(user)) {
      for (const entry of config.partner) {
        entitled.set(`partner:${entry.catalogId}`, {
          entry,
          role: 'partner',
          expiresAt: MEMBER_ROLE_ENTITLEMENT_EXPIRES,
        });
      }
    }
  }

  if (userQualifiesForAdminEntitlements(user)) {
    const staffEntries = await resolveStaffAdminEntitlementEntries(user);
    for (const entry of staffEntries) {
      entitled.set(`admin:${entry.catalogId}`, {
        entry,
        role: 'admin',
        expiresAt: MEMBER_ROLE_ENTITLEMENT_EXPIRES,
      });
    }
  }

  const all = refreshStatuses(await loadAllFromStorage());
  let changed = 0;
  const next = [...all];
  const touched: PrimeBenefit[] = [];
  const newlyCreated: PrimeBenefit[] = [];
  const revokedRemote: PrimeBenefit[] = [];

  // Enrichir avec le remote de CET utilisateur seulement (sans écraser pending via merge corrigé)
  if (isRemoteBenefitRecipientId(user.id)) {
    try {
      const { fetchRemotePrimeBenefitsForUser, mergePrimeBenefits } = await import('@/lib/prime-benefits-sync');
      const remote = await fetchRemotePrimeBenefitsForUser(user.id);
      if (remote.length) {
        const merged = refreshStatuses(
          mergePrimeBenefits(
            next,
            remote.map((b) => normalizeBenefit(b)),
          ),
        );
        next.length = 0;
        next.push(...merged);
      }
    } catch {
      /* garde le local */
    }
  }

  for (const [, spec] of entitled) {
    const built = await buildRoleEntitlementBenefit(user, spec.entry, spec.role, spec.expiresAt);
    if (!built) continue;

    const idx = next.findIndex((b) => b.id === built.id);
    if (idx < 0) {
      next.unshift(built);
      touched.push(built);
      newlyCreated.push(built);
      changed += 1;
      continue;
    }

    const existing = next[idx];
    if (existing.status === 'used' || existing.status === 'pending_validation') continue;

    const updated = normalizeBenefit({
      ...existing,
      title: built.title,
      description: built.description,
      partnerName: built.partnerName,
      expiresAt: spec.expiresAt,
      contentId: built.contentId,
      contentType: built.contentType,
      contentTitle: built.contentTitle,
      roleEntitlement: spec.role,
      status:
        existing.status === 'expired_unused' && new Date(spec.expiresAt).getTime() > Date.now()
          ? 'active'
          : existing.status,
    });

    if (
      updated.title !== existing.title ||
      updated.description !== existing.description ||
      updated.expiresAt !== existing.expiresAt ||
      updated.partnerName !== existing.partnerName ||
      updated.status !== existing.status
    ) {
      next[idx] = updated;
      touched.push(updated);
      changed += 1;
    }
  }

  for (let i = next.length - 1; i >= 0; i -= 1) {
    const benefit = next[i];
    if (benefit.userId !== user.id || !benefit.roleEntitlement) continue;
    const key = `${benefit.roleEntitlement}:${benefit.catalogId}`;
    if (entitled.has(key)) continue;

    if (benefit.roleEntitlement === 'member' && userQualifiesForPrimeEntitlements(user)) {
      revokedRemote.push({ ...benefit, status: 'expired_unused' });
      next.splice(i, 1);
      changed += 1;
      continue;
    }

    if (benefit.status !== 'active' && benefit.status !== 'pending_validation') continue;

    next[i] = { ...benefit, status: 'expired_unused' };
    touched.push(next[i]);
    changed += 1;
  }

  if (userQualifiesForPrimeEntitlements(user)) {
    const primeExpires = resolvePrimeEntitlementExpiresAt(user);
    for (let i = 0; i < next.length; i += 1) {
      const benefit = next[i];
      if (benefit.userId !== user.id || benefit.roleEntitlement !== 'prime') continue;
      if (benefit.expiresAt === primeExpires) continue;
      if (benefit.status === 'used') continue;
      next[i] = { ...benefit, expiresAt: primeExpires };
      touched.push(next[i]);
      changed += 1;
    }
  }

  if (changed > 0) {
    const refreshed = refreshStatuses(next);
    await persistAndSync(refreshed, [...touched, ...revokedRemote]);
    if (newlyCreated.length > 0) {
      await pushCreatedBenefitNotifications(newlyCreated);
      markNetworkReachable();
    }
  }

  return changed;
}

/**
 * Garantit un grant actif pour un catalogue (octroi existant ou entitlement rôle configuré).
 * Pas d'octroi « sauvage » : tirage / campagne admin doivent déjà exister en local ou remote.
 * Utilisé depuis les fiches contenu — ne bloque PAS sur sync réseau.
 */
export async function ensureActivePrivilegeGrant(
  user: User,
  catalogId: string,
  preferredRoles: RoleEntitlementKind[] = [],
  options?: { contentId?: string | null; skipRemoteSync?: boolean },
): Promise<PrimeBenefit | null> {
  if (!user?.id || user.id === 'anonymous' || !catalogId) return null;

  const skipRemote = options?.skipRemoteSync !== false; // défaut: rapide (Utiliser)
  const contentIdHint = options?.contentId?.trim() || null;
  console.log('[Benefits] ensure grant start', {
    catalogId,
    userId: user.id,
    skipRemote,
    contentId: contentIdHint,
  });

  const phone = user.phoneNumber ? normalizePhone(user.phoneNumber) : null;
  const email = user.email?.trim().toLowerCase() ?? null;

  const belongsLocal = (b: PrimeBenefit): boolean => {
    if (b.userId === user.id) return true;
    if (phone && b.userPhone && normalizePhone(b.userPhone) === phone) return true;
    if (phone && b.userId === `phone:${phone}`) return true;
    if (email && b.userId === `email:${email}`) return true;
    return false;
  };

  const pickLocal = async (): Promise<{ usable: PrimeBenefit | null; exhausted: boolean }> => {
    const all = refreshStatuses(await loadAllFromStorage()).filter(belongsLocal);
    const usable =
      all.find((b) => b.catalogId === catalogId && canPushBenefitValidation(b)) ?? null;
    if (usable) return { usable, exhausted: false };
    const exhausted = all.some(
      (b) => b.catalogId === catalogId && (b.status === 'used' || isBenefitFullyUsed(b)),
    );
    return { usable: null, exhausted };
  };

  const first = await pickLocal();
  if (first.usable) {
    console.log('[Benefits] ensure grant found local', { id: first.usable.id, status: first.usable.status });
    return first.usable;
  }
  if (first.exhausted) {
    console.log('[Benefits] ensure grant exhausted', { catalogId });
    return null;
  }

  // Sync rôle en arrière-plan uniquement (ne bloque pas Utiliser)
  if (!skipRemote) {
    try {
      await Promise.race([
        syncUserRoleBenefitEntitlements(user),
        new Promise<number>((resolve) => setTimeout(() => resolve(0), 2500)),
      ]);
      const after = await pickLocal();
      if (after.usable) return after.usable;
      if (after.exhausted) return null;
    } catch {
      /* création locale ci-dessous */
    }
  } else {
    void syncUserRoleBenefitEntitlements(user).catch(() => undefined);
  }

  const { peekRoleBenefitEntitlementsConfig } = await import('@/lib/role-benefit-entitlements-store');
  const {
    userQualifiesForMemberEntitlements,
    userQualifiesForPrimeEntitlements,
    userQualifiesForPartnerEntitlements,
    userQualifiesForAdminEntitlements,
  } = await import('@/lib/role-benefit-eligibility');
  const { peekBenefitCatalog } = await import('@/lib/benefit-catalog-store');

  const country = resolveCountryCode(user.countryCode);
  const config = await peekRoleBenefitEntitlementsConfig(country);

  const candidates: Array<{ entry: RoleBenefitEntitlementEntry; role: RoleEntitlementKind; expiresAt: string }> = [];
  const pushRole = (
    role: RoleEntitlementKind,
    entries: RoleBenefitEntitlementEntry[],
    qualifies: boolean,
    expiresAt: string,
  ) => {
    if (!qualifies) return;
    for (const entry of entries) {
      if (entry.catalogId !== catalogId) continue;
      candidates.push({ entry, role, expiresAt });
    }
  };

  pushRole('member', config.member, userQualifiesForMemberEntitlements(user), MEMBER_ROLE_ENTITLEMENT_EXPIRES);
  pushRole('prime', config.prime, userQualifiesForPrimeEntitlements(user), resolvePrimeEntitlementExpiresAt(user));
  pushRole('partner', config.partner, userQualifiesForPartnerEntitlements(user), MEMBER_ROLE_ENTITLEMENT_EXPIRES);
  if (userQualifiesForAdminEntitlements(user)) {
    const staffEntries = await resolveStaffAdminEntitlementEntries(user);
    pushRole('admin', staffEntries, true, MEMBER_ROLE_ENTITLEMENT_EXPIRES);
  }

  candidates.sort((a, b) => {
    const ai = preferredRoles.indexOf(a.role);
    const bi = preferredRoles.indexOf(b.role);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  const catalog =
    (await peekBenefitCatalog()).find((c) => c.id === catalogId) ??
    (await getBenefitCatalogItem(catalogId));
  if (!catalog?.isActive) {
    console.warn('[Benefits] ensure grant catalog inactive', { catalogId });
    return null;
  }

  const offeringForContent = contentIdHint
    ? catalog.offeringPartners.find((p) => p.contentId === contentIdHint)
    : undefined;

  const materialize = async (
    entry: RoleBenefitEntitlementEntry,
    role: RoleEntitlementKind,
    expiresAt: string,
  ): Promise<PrimeBenefit | null> => {
    // Construction locale sans resolvePartnerOfferingContext (évite hang réseau)
    const partnerKey = entry.partnerId ?? EXTERNAL_PARTNER_ID;
    const offering =
      offeringForContent ??
      findCatalogOffering(catalog, partnerKey, entry.partnerDisplayName ?? null) ??
      catalog.offeringPartners[0];
    if (!offering?.displayName?.trim() && !entry.partnerDisplayName?.trim()) {
      return null;
    }
    const partnerName =
      offering?.displayName?.trim() ||
      entry.partnerDisplayName?.trim() ||
      partnerKey;
    const now = new Date().toISOString();
    const built = normalizeBenefit({
      id: roleEntitlementBenefitId(user.id, entry.catalogId, role),
      userId: user.id,
      userPhone: phone,
      catalogId: entry.catalogId,
      title: catalog.title,
      description: catalog.description,
      partnerName,
      benefitKind: catalog.benefitKind,
      quantityTotal: catalog.benefitKind === 'quantity' ? catalog.quantityPerGrant : null,
      quantityUsed: 0,
      maxUses: catalog.benefitKind === 'usage_limit' ? catalog.maxUsesPerGrant : null,
      usesCount: 0,
      status: 'active',
      grantedAt: now,
      expiresAt,
      usedAt: null,
      validityDays: null,
      validityStartsOnActivation: false,
      activatedAt: null,
      grantedBy: 'role-entitlement',
      grantAudience: role === 'prime' ? 'prime' : role === 'admin' ? 'individual' : 'members',
      customNote: null,
      grantBatchId: `role-entitlement-${role}`,
      grantCountryCode: catalog.countryCode ?? null,
      grantCity: user.city ?? null,
      contentId: offering?.contentId ?? contentIdHint,
      contentType: offering?.contentType ?? null,
      contentTitle: offering?.contentTitle ?? null,
      roleEntitlement: role,
    });
    if (!canPushBenefitValidation(built)) return null;

    const all = refreshStatuses(await loadAllFromStorage());
    const existingGrant = all.find((b) => b.id === built.id);
    if (existingGrant) {
      if (canPushBenefitValidation(existingGrant)) return existingGrant;
      return null;
    }
    all.unshift(built);
    await persistAndSync(all, [built], { awaitRemote: false });
    return built;
  };

  for (const spec of candidates) {
    const built = await materialize(spec.entry, spec.role, spec.expiresAt);
    if (built) {
      console.log('[Benefits] ensure grant created', { id: built.id, role: spec.role });
      return built;
    }
  }

  console.warn('[Benefits] ensure grant denied — pas d’octroi individuel ni entitlement rôle', {
    catalogId,
    userId: user.id,
  });
  return null;
}
