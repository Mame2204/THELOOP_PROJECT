import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { DateTimeField } from '@/components/DateTimeField';
import { PartnerPicker } from '@/components/PartnerPicker';
import { AdminPageHeader } from '@/components/admin/AdminShell';
import { AdminActionIcon } from '@/components/admin/AdminActionIcon';
import { AdminTabMenu } from '@/components/admin/AdminTabMenu';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useAdminModuleAccess, useFilteredAdminTabs } from '@/hooks/useAdminModuleAccess';
import type { AdminPermissionId } from '@/lib/admin-permissions';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminPermissions } from '@/context/AdminPermissionsContext';
import {
  deleteBenefitCatalogCascade,
  formatBenefitDeleteWarning,
  summarizeCatalogGrants,
} from '@/lib/benefit-catalog-delete';
import {
  BENEFIT_KIND_LABELS,
  BENEFIT_PURPOSE_LABELS,
  clampValidityDaysToCatalogEnd,
  createBenefitCatalogItemMulti,
  EXTERNAL_PARTNER_LABEL,
  isStandaloneTheLoopBenefit,
  countAssociatedActiveCatalogBenefits,
  listBenefitCatalog,
  repairBenefitCatalogOfferingPartnerIds,
  peekBenefitCatalog,
  filterStandaloneTheLoopBenefits,
  listStandaloneTheLoopBenefits,
  maxValidityDaysUntilEnd,
  syncCatalogPartnerDirectoryLinks,
  updateBenefitCatalogItem,
  type BenefitCatalogItem,
  type BenefitKind,
  type BenefitOfferingPartner,
  type BenefitPurpose,
} from '@/lib/benefit-catalog-store';
import { listBenefitTypes, peekBenefitTypes, type BenefitTypeDefinition } from '@/lib/benefit-types-store';
import {
  EXTERNAL_PARTNER_ID,
  listBenefitOfferingAccounts,
  peekBenefitOfferingAccounts,
  partnerAccountDisplayName,
  partnerAccountUserId,
  type PartnerDirectoryEntry,
} from '@/lib/partner-directory-store';
import {
  formatOfferingScopeLabel,
  listPartnerContentOptions,
  getCachedPartnerContentOptions,
  defaultPartnerWideContentOption,
  PARTNER_WIDE_CONTENT_KEY,
  isTheLoopOfferingAccount,
  type PartnerContentOption,
} from '@/lib/partner-content-options';
import { GuineaLocationPicker } from '@/components/GuineaLocationPicker';
import { formatGrantableBenefitGeoLabel } from '@/lib/benefit-geo';
import { formatDateDdMmYyyy, formatDateFr, formatValidityEndFromDays } from '@/lib/date-utils';
import {
  listAutomationGrantableCatalog,
  uniqueGrantableBenefits,
  type GrantableCatalogEntry,
} from '@/lib/admin-automation-benefits';
import {
  BENEFIT_STATUS_LABELS,
  GRANT_AUDIENCE_LABELS,
  getCatalogUsageStats,
  listBenefitGrantLines,
  revokeBenefit,
  syncUserRoleBenefitEntitlements,
  type BenefitGrantLine,
  type CatalogUsageStat,
} from '@/lib/prime-benefits-store';
import {
  refreshRoleBenefitEntitlementsConfig,
  saveRoleBenefitEntitlementsConfig,
  type RoleBenefitEntitlementEntry,
  type RoleEntitlementKind,
} from '@/lib/role-benefit-entitlements-store';
import {
  archivePartnerBenefitOffer,
  catalogHasPendingPartnerOffers,
  deletePartnerBenefitOffer,
  listAllPartnerBenefitOffersForAdmin,
  peekPartnerBenefitOffers,
  isPartnerOfferingValidated,
  PARTNER_OFFER_STATUS_LABELS,
  proposeCatalogBenefitsToPartners,
  resendPartnerBenefitOffer,
  syncPendingOffersFromCatalog,
  type PartnerBenefitOffer,
} from '@/lib/partner-benefit-offers-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminPrimeBenefits'>;
type Tab = 'creation' | 'catalog' | 'suivi' | 'grant';
type CreationSection = 'create' | 'validations';

function offeringIdentityKey(partner: BenefitOfferingPartner): string {
  return `${partner.partnerId}|${partner.displayName}|${partner.contentId ?? ''}|${partner.contentType ?? ''}`;
}

function contentOptionLabel(key: string | null, options: PartnerContentOption[]): string {
  if (!key) return 'Choisir un lieu…';
  const found = options.find((option) => option.key === key);
  if (!found) return 'Choisir un lieu…';
  return `${found.subtitle} · ${found.title}`;
}

const MAIN_TABS: { id: Tab; label: string; permission: AdminPermissionId }[] = [
  { id: 'creation', label: 'Création', permission: 'prime_benefits_creation' },
  { id: 'catalog', label: 'Catalogue', permission: 'prime_benefits_catalog' },
  { id: 'suivi', label: 'Suivi', permission: 'prime_benefits_suivi' },
  { id: 'grant', label: 'Octroyer', permission: 'prime_benefits_grant' },
];

const CREATION_SECTIONS: { id: CreationSection; label: string; permission: AdminPermissionId }[] = [
  { id: 'create', label: 'Création', permission: 'prime_benefits_creation' },
  { id: 'validations', label: 'Validation', permission: 'prime_benefits_validations' },
];

type GrantRoleTarget = 'member' | 'prime' | 'member_prime' | 'tous';

const GRANT_ROLE_TARGETS: { id: GrantRoleTarget; label: string; roles: RoleEntitlementKind[] }[] = [
  { id: 'member', label: 'MEMBRE', roles: ['member'] },
  { id: 'prime', label: 'PRIME', roles: ['prime'] },
  { id: 'member_prime', label: 'MEMBRE + PRIME', roles: ['member', 'prime'] },
  { id: 'tous', label: 'TOUS', roles: ['member', 'prime', 'partner'] },
];

const BENEFIT_PURPOSES: BenefitPurpose[] = ['standard', 'welcome', 'birthday', 'member_of_month', 'promo_code', 'generic_fallback'];

export function AdminPrimeBenefitsScreen({ navigation }: Props) {
  const { role, user } = useAuthContext();
  const { countryCode } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('prime_benefits');
  const { isSuperAdmin } = useAdminPermissions();

  const [tab, setTab] = useState<Tab>('creation');
  const [creationSection, setCreationSection] = useState<CreationSection>('create');
  const visibleMainTabs = useFilteredAdminTabs('prime_benefits', MAIN_TABS);
  const visibleCreationSections = useFilteredAdminTabs('prime_benefits', CREATION_SECTIONS);

  useEffect(() => {
    if (visibleMainTabs.length && !visibleMainTabs.some((t) => t.id === tab)) {
      setTab(visibleMainTabs[0].id);
    }
  }, [visibleMainTabs, tab]);

  useEffect(() => {
    if (visibleCreationSections.length && !visibleCreationSections.some((s) => s.id === creationSection)) {
      setCreationSection(visibleCreationSections[0].id);
    }
  }, [visibleCreationSections, creationSection]);

  const [catalog, setCatalog] = useState<BenefitCatalogItem[]>([]);
  const [paramBenefits, setParamBenefits] = useState<BenefitCatalogItem[]>([]);
  const [usageStats, setUsageStats] = useState<CatalogUsageStat[]>([]);
  const [partnerAccounts, setPartnerAccounts] = useState<PartnerDirectoryEntry[]>([]);
  const partnerAccountsRef = useRef(partnerAccounts);
  partnerAccountsRef.current = partnerAccounts;
  const [newPartnerId, setNewPartnerId] = useState<string>('');
  const [newContentKey, setNewContentKey] = useState<string | null>(null);
  const [createContentOptions, setCreateContentOptions] = useState<PartnerContentOption[]>([]);
  const [createContentLoading, setCreateContentLoading] = useState(false);
  const [, setNewTypeId] = useState<string | null>(null);
  const [, setNewKind] = useState<BenefitKind>('unlimited');
  const [, setNewQuantity] = useState('1');
  const [, setNewMaxUses] = useState('1');
  const [benefitTypes, setBenefitTypes] = useState<BenefitTypeDefinition[]>([]);
  const [existingCatalogId, setExistingCatalogId] = useState<string | null>(null);
  const [partnersToAdd, setPartnersToAdd] = useState<BenefitOfferingPartner[]>([]);
  const [partnerPickerOpen, setPartnerPickerOpen] = useState(false);
  const [contentPickerOpen, setContentPickerOpen] = useState(false);
  const [existingPickerOpen, setExistingPickerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BenefitCatalogItem | null>(null);
  const [detailItem, setDetailItem] = useState<BenefitCatalogItem | null>(null);
  const [detailOffer, setDetailOffer] = useState<PartnerBenefitOffer | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editValidity, setEditValidity] = useState('30');
  const [editValidityStartsOnActivation, setEditValidityStartsOnActivation] = useState(true);
  const [editKind, setEditKind] = useState<BenefitKind>('unlimited');
  const [editQuantity, setEditQuantity] = useState('');
  const [editMaxUses, setEditMaxUses] = useState('');
  const [editPurpose, setEditPurpose] = useState<BenefitPurpose>('standard');
  const [editTypeId, setEditTypeId] = useState<string | null>(null);
  const [editActive, setEditActive] = useState(true);
  const [editPartners, setEditPartners] = useState<BenefitOfferingPartner[]>([]);
  const [editPartnerPickerOpen, setEditPartnerPickerOpen] = useState(false);
  const [editPartnerId, setEditPartnerId] = useState<string>(EXTERNAL_PARTNER_ID);
  const [editPartnerExternal, setEditPartnerExternal] = useState('');
  const [editContentKey, setEditContentKey] = useState<string | null>(null);
  const [editContentOptions, setEditContentOptions] = useState<PartnerContentOption[]>([]);
  const [editContentLoading, setEditContentLoading] = useState(false);
  const [editContentPickerOpen, setEditContentPickerOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [offeringIndexByCatalogId, setOfferingIndexByCatalogId] = useState<Record<string, number>>({});
  const [customPartnerByCatalogId, setCustomPartnerByCatalogId] = useState<Record<string, string>>({});
  const [customNote, setCustomNote] = useState('');
  const [grantTarget, setGrantTarget] = useState<GrantRoleTarget>('member');
  const [grantCity, setGrantCity] = useState('');
  const [grantableOfferings, setGrantableOfferings] = useState<GrantableCatalogEntry[]>([]);
  const grantableCatalog = useMemo(
    () => uniqueGrantableBenefits(grantableOfferings),
    [grantableOfferings],
  );
  const [history, setHistory] = useState<BenefitGrantLine[]>([]);
  const [roleAssociations, setRoleAssociations] = useState<
    Array<{ role: RoleEntitlementKind; label: string; catalogId: string; title: string; partnerLabel: string }>
  >([]);
  const [selectedGrantLine, setSelectedGrantLine] = useState<BenefitGrantLine | null>(null);
  const [saving, setSaving] = useState(false);
  const [partnerOffers, setPartnerOffers] = useState<PartnerBenefitOffer[]>([]);
  const [editValidityEndsAt, setEditValidityEndsAt] = useState('');
  const [catalogStatusFilter, setCatalogStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');

  const hydrateCreationCache = useCallback(async () => {
    const [items, accounts, offers, types] = await Promise.all([
      peekBenefitCatalog(),
      Promise.resolve(peekBenefitOfferingAccounts(countryCode)),
      peekPartnerBenefitOffers(),
      peekBenefitTypes(false),
    ]);
    if (items.length) {
      setCatalog(items);
      setParamBenefits(filterStandaloneTheLoopBenefits(items, true));
    }
    if (accounts.length) {
      setPartnerAccounts(accounts);
      setNewPartnerId((prev) => {
        if (prev && accounts.some((a) => a.id === prev)) return prev;
        return accounts[0]?.id ?? '';
      });
    }
    if (offers.length) {
      const catalogIds = new Set(items.map((c) => c.id));
      setPartnerOffers(
        offers
          .filter((o) => catalogIds.has(o.catalogId))
          .filter((o) => !countryCode || o.countryCode === countryCode)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
    }
    if (types.length) setBenefitTypes(types);
  }, [countryCode]);

  const load = useCallback(async (options?: { skipDirectorySync?: boolean }) => {
    void repairBenefitCatalogOfferingPartnerIds().catch((err) => {
      console.warn('[AdminPrimeBenefits] repair offering_partners:', err);
    });
    const [items, accounts, stats, offers, types, standalone, lines, roleConfig] = await Promise.all([
      listBenefitCatalog(),
      listBenefitOfferingAccounts(countryCode),
      getCatalogUsageStats(),
      listAllPartnerBenefitOffersForAdmin(countryCode),
      listBenefitTypes(false),
      listStandaloneTheLoopBenefits(false),
      listBenefitGrantLines(countryCode),
      refreshRoleBenefitEntitlementsConfig(countryCode),
    ]);
    setCatalog(items);
    setParamBenefits(standalone.filter((b) => b.isActive));
    setPartnerAccounts(accounts);
    setNewPartnerId((prev) => {
      if (prev && accounts.some((a) => a.id === prev)) return prev;
      return accounts[0]?.id ?? '';
    });
    setUsageStats(stats);
    setHistory(lines);
    const roleLabels: Record<RoleEntitlementKind, string> = {
      member: 'Membres',
      prime: 'Prime',
      partner: 'Partenaires',
      admin: 'Admin',
    };
    const associations: Array<{
      role: RoleEntitlementKind;
      label: string;
      catalogId: string;
      title: string;
      partnerLabel: string;
    }> = [];
    // Octroi UI : membres / prime / partenaires uniquement (admins = TEAMS)
    for (const role of ['member', 'prime', 'partner'] as RoleEntitlementKind[]) {
      for (const entry of roleConfig[role] ?? []) {
        const cat = items.find((c) => c.id === entry.catalogId);
        associations.push({
          role,
          label: roleLabels[role],
          catalogId: entry.catalogId,
          title: cat?.title ?? entry.catalogId,
          partnerLabel: entry.partnerDisplayName?.trim() || '—',
        });
      }
    }
    setRoleAssociations(associations);
    setPartnerOffers(offers);
    setBenefitTypes(types);
    setNewTypeId((prev) => {
      const active = types.filter((t) => t.isActive);
      if (prev && active.some((t) => t.id === prev)) return prev;
      const first = active[0];
      if (first) {
        setNewKind(first.mechanic);
        if (first.defaultQuantity != null) setNewQuantity(String(first.defaultQuantity));
        if (first.defaultMaxUses != null) setNewMaxUses(String(first.defaultMaxUses));
        return first.id;
      }
      return prev;
    });

    if (!options?.skipDirectorySync) {
      void syncCatalogPartnerDirectoryLinks(countryCode).then((updates) => {
        if (updates > 0) void load({ skipDirectorySync: true });
      });
    }
  }, [countryCode]);

  function applyBenefitType(type: BenefitTypeDefinition, target: 'create' | 'edit') {
    if (target === 'create') {
      setNewTypeId(type.id);
      setNewKind(type.mechanic);
      if (type.defaultQuantity != null) setNewQuantity(String(type.defaultQuantity));
      if (type.defaultMaxUses != null) setNewMaxUses(String(type.defaultMaxUses));
      return;
    }
    setEditTypeId(type.id);
    setEditKind(type.mechanic);
    if (type.defaultQuantity != null) setEditQuantity(String(type.defaultQuantity));
    if (type.defaultMaxUses != null) setEditMaxUses(String(type.defaultMaxUses));
  }

  const partnerAccountPickerOptions = useMemo(
    () =>
      partnerAccounts.map((partner) => ({
        id: partner.id,
        label: partnerAccountDisplayName(partner),
        subtitle:
          partner.company === 'THE LOOP' || partner.name.startsWith('THE LOOP')
            ? 'Super admin · contenu THE LOOP'
            : 'Compte partenaire Pro',
      })),
    [partnerAccounts],
  );

  const editPartnerPickerOptions = useMemo(
    () => [
      ...partnerAccountPickerOptions,
      { id: EXTERNAL_PARTNER_ID, label: EXTERNAL_PARTNER_LABEL, subtitle: 'Partenaire hors annuaire' },
    ],
    [partnerAccountPickerOptions],
  );

  const createContentPickerOptions = useMemo(
    () =>
      createContentOptions.map((option) => ({
        id: option.key,
        label: option.title,
        subtitle: option.subtitle,
      })),
    [createContentOptions],
  );

  const editContentPickerOptions = useMemo(
    () =>
      editContentOptions.map((option) => ({
        id: option.key,
        label: option.title,
        subtitle: option.subtitle,
      })),
    [editContentOptions],
  );

  const usageByCatalogId = useMemo(
    () => new Map(usageStats.map((s) => [s.catalogId, s])),
    [usageStats],
  );

  /** Validations en cours — pending / refusées uniquement (pas les doublons cache local). */
  const validationOffers = useMemo(
    () => partnerOffers.filter((o) => o.status === 'pending' || o.status === 'declined'),
    [partnerOffers],
  );

  function applyCreateContentOptions(
    options: PartnerContentOption[],
    account: PartnerDirectoryEntry | null | undefined,
  ) {
    setCreateContentOptions(options);
    setNewContentKey((prev) => {
      if (prev && options.some((option) => option.key === prev)) return prev;
      if (account && isTheLoopOfferingAccount(account)) {
        return options[0]?.key ?? null;
      }
      return PARTNER_WIDE_CONTENT_KEY;
    });
  }

  const loadCreateContentOptions = useCallback(async (partnerId: string, force = false): Promise<PartnerContentOption[]> => {
    if (!partnerId) {
      setCreateContentOptions([]);
      setNewContentKey(null);
      return [];
    }
    const account = partnerAccountsRef.current.find((entry) => entry.id === partnerId);
    const userId = account
      ? partnerAccountUserId(account)
      : partnerAccountUserId({
          id: partnerId,
          name: '',
          source: 'partner_user',
          countryCode,
        });
    const params = { countryCode, partnerAccount: account ?? null };
    if (!force) {
      const cached = getCachedPartnerContentOptions(userId, params);
      if (cached) {
        applyCreateContentOptions(cached, account);
        return cached;
      }
    }
    setCreateContentLoading(true);
    try {
      const options = await listPartnerContentOptions(userId, params);
      applyCreateContentOptions(options, account);
      return options;
    } catch {
      const fallback = [defaultPartnerWideContentOption()];
      applyCreateContentOptions(fallback, account);
      return fallback;
    } finally {
      setCreateContentLoading(false);
    }
  }, [countryCode]);

  const loadEditContentOptions = useCallback(async (partnerId: string, force = false): Promise<PartnerContentOption[]> => {
    if (!partnerId || partnerId === EXTERNAL_PARTNER_ID) {
      setEditContentOptions([]);
      setEditContentKey(null);
      return [];
    }
    const account = partnerAccountsRef.current.find((entry) => entry.id === partnerId);
    const userId = account
      ? partnerAccountUserId(account)
      : partnerAccountUserId({
          id: partnerId,
          name: '',
          source: 'partner_user',
          countryCode,
        });
    const params = { countryCode, partnerAccount: account ?? null };
    if (!force) {
      const cached = getCachedPartnerContentOptions(userId, params);
      if (cached) {
        setEditContentOptions(cached);
        setEditContentKey((prev) => {
          if (prev && cached.some((option) => option.key === prev)) return prev;
          if (account && isTheLoopOfferingAccount(account)) return cached[0]?.key ?? null;
          return PARTNER_WIDE_CONTENT_KEY;
        });
        return cached;
      }
    }
    setEditContentLoading(true);
    try {
      const options = await listPartnerContentOptions(userId, params);
      setEditContentOptions(options);
      setEditContentKey((prev) => {
        if (prev && options.some((option) => option.key === prev)) return prev;
        if (account && isTheLoopOfferingAccount(account)) return options[0]?.key ?? null;
        return PARTNER_WIDE_CONTENT_KEY;
      });
      return options;
    } catch {
      const fallback = [defaultPartnerWideContentOption()];
      setEditContentOptions(fallback);
      setEditContentKey(PARTNER_WIDE_CONTENT_KEY);
      return fallback;
    } finally {
      setEditContentLoading(false);
    }
  }, [countryCode]);

  async function openCreateContentPicker() {
    if (!newPartnerId || createContentLoading) return;
    await loadCreateContentOptions(newPartnerId, true);
    setContentPickerOpen(true);
  }

  async function openEditContentPicker() {
    if (!editPartnerId || editPartnerId === EXTERNAL_PARTNER_ID || editContentLoading) return;
    await loadEditContentOptions(editPartnerId, true);
    setEditContentPickerOpen(true);
  }

  useEffect(() => {
    if (!newPartnerId) {
      setCreateContentOptions([]);
      setNewContentKey(null);
      return;
    }
    const account = partnerAccountsRef.current.find((entry) => entry.id === newPartnerId);
    if (!account || !isTheLoopOfferingAccount(account)) {
      setCreateContentOptions([defaultPartnerWideContentOption()]);
      setNewContentKey(PARTNER_WIDE_CONTENT_KEY);
    }
    void loadCreateContentOptions(newPartnerId);
  }, [newPartnerId, loadCreateContentOptions]);

  useEffect(() => {
    if (!editPartnerId || editPartnerId === EXTERNAL_PARTNER_ID) {
      setEditContentOptions([]);
      setEditContentKey(null);
      return;
    }
    void loadEditContentOptions(editPartnerId);
  }, [editPartnerId, loadEditContentOptions]);

  function buildOfferingFromSelection(
    partnerId: string,
    externalName: string,
    contentKey: string | null,
    contentOptions: PartnerContentOption[],
  ): BenefitOfferingPartner | null {
    if (partnerId === EXTERNAL_PARTNER_ID) {
      const name = externalName.trim();
      return name ? { partnerId: EXTERNAL_PARTNER_ID, displayName: name } : null;
    }

    const account = partnerAccounts.find((entry) => entry.id === partnerId);
    if (!account) return null;

    const key = contentKey ?? PARTNER_WIDE_CONTENT_KEY;
    if (key === PARTNER_WIDE_CONTENT_KEY) {
      return {
        partnerId: partnerAccountUserId(account),
        displayName: partnerAccountDisplayName(account),
        contentId: null,
        contentType: null,
        contentTitle: null,
      };
    }

    const content = contentOptions.find((option) => option.key === key);
    if (!content) return null;

    return {
      partnerId: partnerAccountUserId(account),
      displayName: partnerAccountDisplayName(account),
      contentId: content.contentId,
      contentType: content.contentType,
      contentTitle: content.contentId ? content.title : null,
    };
  }

  function resolvePartnerFromPicker(partnerId: string): BenefitOfferingPartner | null {
    return buildOfferingFromSelection(partnerId, '', newContentKey, createContentOptions);
  }

  function partnerLabel(partnerId: string): string {
    if (!partnerId) return 'Choisir un partenaire…';
    if (partnerId === EXTERNAL_PARTNER_ID) return EXTERNAL_PARTNER_LABEL;
    const account = partnerAccounts.find((entry) => entry.id === partnerId);
    return account ? partnerAccountDisplayName(account) : EXTERNAL_PARTNER_LABEL;
  }

  function openEdit(item: BenefitCatalogItem) {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditDesc(item.description);
    setEditValidity(String(item.defaultValidityDays));
    setEditValidityStartsOnActivation(item.validityStartsOnActivation !== false);
    setEditValidityEndsAt(item.validityEndsAt ? item.validityEndsAt.slice(0, 10) : '');
    setEditKind(item.benefitKind);
    setEditQuantity(item.quantityPerGrant != null ? String(item.quantityPerGrant) : '');
    setEditMaxUses(item.maxUsesPerGrant != null ? String(item.maxUsesPerGrant) : '');
    setEditPurpose(item.benefitPurpose ?? 'standard');
    setEditActive(item.isActive);
    setEditPartners([...item.offeringPartners]);
    setEditPartnerId(EXTERNAL_PARTNER_ID);
    setEditPartnerExternal('');
    const matchedType = benefitTypes.find((t) => t.mechanic === item.benefitKind);
    setEditTypeId(matchedType?.id ?? null);
  }

  function resolveEditPartnerFromPicker(partnerId: string): BenefitOfferingPartner | null {
    return buildOfferingFromSelection(partnerId, editPartnerExternal, editContentKey, editContentOptions);
  }

  function addEditPartner() {
    const account = partnerAccounts.find((entry) => entry.id === editPartnerId);
    const partner = resolveEditPartnerFromPicker(editPartnerId);
    if (!partner) {
      if (editPartnerId === EXTERNAL_PARTNER_ID) {
        Alert.alert('Partenaire requis', 'Choisissez un partenaire ou saisissez le nom externe.');
      } else if (account && isTheLoopOfferingAccount(account)) {
        Alert.alert(
          'Contenu requis',
          'Choisissez un événement, un spot ou un outil publié par THE LOOP.',
        );
      } else {
        Alert.alert(
          'Lieu requis',
          'Choisissez où l\'privilège est valable (événement, spot, outil ou tous les établissements).',
        );
      }
      return;
    }
    if (editPartners.some((entry) => offeringIdentityKey(entry) === offeringIdentityKey(partner))) {
      Alert.alert('Déjà ajouté', 'Cette combinaison partenaire + lieu est déjà associée.');
      return;
    }
    setEditPartners((prev) => [...prev, partner]);
    setEditPartnerExternal('');
    if (account && isTheLoopOfferingAccount(account)) {
      setEditContentKey(editContentOptions[0]?.key ?? null);
    } else {
      setEditContentKey(PARTNER_WIDE_CONTENT_KEY);
    }
  }

  async function handleSaveEdit() {
    if (!editingItem || !editTitle.trim() || !editDesc.trim()) {
      Alert.alert('Champs requis', 'Titre et description obligatoires.');
      return;
    }
    if (!editPartners.length) {
      Alert.alert('Partenaires requis', 'Au moins un partenaire doit proposer ce privilège.');
      return;
    }
    const pendingValidation = await catalogHasPendingPartnerOffers(editingItem.id);
    if (editActive && pendingValidation) {
      Alert.alert(
        'Validation en cours',
        'Ce privilège ne peut pas être activé tant qu\'un partenaire n\'a pas accepté la demande.',
      );
      return;
    }
    const updateResult = await updateBenefitCatalogItem(editingItem.id, {
      title: editTitle.trim(),
      description: editDesc.trim(),
      defaultValidityDays: Number(editValidity) || 30,
      validityStartsOnActivation: editValidityStartsOnActivation,
      validityEndsAt: editValidityEndsAt.trim()
        ? new Date(`${editValidityEndsAt.trim()}T23:59:59`).toISOString()
        : null,
      benefitKind: editKind,
      quantityPerGrant: editKind === 'quantity' ? Number(editQuantity) || null : null,
      maxUsesPerGrant: editKind === 'usage_limit' ? Number(editMaxUses) || null : null,
      benefitPurpose: editPurpose,
      isActive: pendingValidation ? false : editActive,
      offeringPartners: editPartners,
    });
    let resentToValidation = false;
    if (updateResult) {
      const updated = updateResult.item;
      await syncPendingOffersFromCatalog(updated);
      const related = partnerOffers.filter(
        (o) => o.catalogId === updated.id && (o.status === 'declined' || o.status === 'disabled'),
      );
      for (const offer of related) {
        await resendPartnerBenefitOffer(offer.id);
        resentToValidation = true;
      }
    }
    setEditingItem(null);
    await load();
    Alert.alert(
      'Enregistré',
      resentToValidation
        ? 'Privilège mis à jour et remis en validation partenaire.'
        : pendingValidation
          ? 'Privilège mis à jour (reste inactif jusqu\'à validation partenaire).'
          : 'Privilège mis à jour.',
    );
  }

  function addPartnerToCreateList() {
    if (!newPartnerId) {
      Alert.alert('Partenaire requis', 'Choisissez un partenaire ou THE LOOP.');
      return;
    }
    if (createContentLoading) {
      Alert.alert('Chargement', 'Les lieux de validité sont en cours de chargement. Réessayez dans quelques secondes.');
      return;
    }
    const account = partnerAccounts.find((entry) => entry.id === newPartnerId);
    const partner = resolvePartnerFromPicker(newPartnerId);
    if (!partner) {
      if (account && isTheLoopOfferingAccount(account)) {
        Alert.alert(
          'Contenu requis',
          'Choisissez un événement, un spot ou un outil publié par THE LOOP.',
        );
      } else {
        Alert.alert(
          'Lieu requis',
          'Choisissez où l\'privilège est valable (événement, spot, outil ou tous les établissements).',
        );
      }
      return;
    }
    if (partnersToAdd.some((entry) => offeringIdentityKey(entry) === offeringIdentityKey(partner))) {
      Alert.alert('Déjà ajouté', 'Cette combinaison partenaire + lieu est déjà dans la liste.');
      return;
    }
    setPartnersToAdd((prev) => [...prev, partner]);
    if (account && isTheLoopOfferingAccount(account)) {
      setNewContentKey(createContentOptions[0]?.key ?? null);
    } else {
      setNewContentKey(PARTNER_WIDE_CONTENT_KEY);
    }
  }

  useEffect(() => {
    if (role === 'ADMIN') {
      void hydrateCreationCache();
      void load();
      void listBenefitGrantLines(countryCode).then(setHistory);
    }
  }, [role, load, hydrateCreationCache, countryCode]);

  const inputStyle = [styles.input, { backgroundColor: shell.filterInactiveBg, borderColor: shell.filterInactiveBorder, color: shell.pageTitle }];
  const managedCatalog = useMemo(() => catalog.filter((c) => !isStandaloneTheLoopBenefit(c)), [catalog]);
  const [suiviRoleFilter, setSuiviRoleFilter] = useState<'all' | 'member' | 'prime' | 'partner'>('all');
  const [suiviBenefitFilter, setSuiviBenefitFilter] = useState<string>('all');

  const suiviRows = useMemo(() => {
    return roleAssociations.filter((row) => {
      if (suiviRoleFilter !== 'all' && row.role !== suiviRoleFilter) return false;
      if (suiviBenefitFilter !== 'all' && row.catalogId !== suiviBenefitFilter) return false;
      return true;
    });
  }, [roleAssociations, suiviRoleFilter, suiviBenefitFilter]);

  const suiviBenefitOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of roleAssociations) {
      if (!map.has(row.catalogId)) map.set(row.catalogId, row.title);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  }, [roleAssociations]);

  const suiviIndividualStats = useMemo(
    () => usageStats.filter((s) => s.granted > 0),
    [usageStats],
  );
  const validatedCatalogCount = useMemo(
    () => countAssociatedActiveCatalogBenefits(managedCatalog.filter((c) => c.isActive), { countryCode }),
    [managedCatalog, countryCode],
  );
  const catalogForTab = managedCatalog.filter((c) => {
    if (catalogStatusFilter === 'active') return c.isActive;
    if (catalogStatusFilter === 'inactive') return !c.isActive;
    return true;
  });

  useEffect(() => {
    if (role !== 'ADMIN' || tab !== 'grant') return;
    void load({ skipDirectorySync: true });
  }, [role, tab, countryCode, load]);

  useEffect(() => {
    if (role !== 'ADMIN' || tab !== 'grant') return;
    const handle = setTimeout(() => {
      void listAutomationGrantableCatalog({
        countryCode,
        job: { countryCode, city: grantCity.trim() || null },
      }).then(setGrantableOfferings);
    }, 300);
    return () => clearTimeout(handle);
  }, [role, tab, countryCode, grantCity]);

  function toggleCatalogId(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const item = catalog.find((c) => c.id === id);
      if (item?.offeringPartners[0]) {
        setOfferingIndexByCatalogId((p) => ({ ...p, [id]: 0 }));
      }
      return [...prev, id];
    });
  }

  function getSelectedOffering(catalogId: string): BenefitOfferingPartner | null {
    const item = catalog.find((c) => c.id === catalogId);
    if (!item?.offeringPartners.length) return null;
    const idx = offeringIndexByCatalogId[catalogId] ?? 0;
    const offering = item.offeringPartners[idx] ?? item.offeringPartners[0];
    const displayName = offering.displayName?.trim() || 'Partenaire';
    if (offering.partnerId === EXTERNAL_PARTNER_ID) {
      const custom = customPartnerByCatalogId[catalogId]?.trim();
      if (custom) return { ...offering, displayName: custom };
      return { ...offering, displayName };
    }
    return { ...offering, displayName };
  }

  function resolvePartnerForCatalog(catalogId: string): string | null {
    return getSelectedOffering(catalogId)?.displayName?.trim() ?? null;
  }

  async function handleDeleteBenefit(item: BenefitCatalogItem) {
    if (!isSuperAdmin) {
      Alert.alert('Action réservée', 'Seul le super administrateur peut supprimer un privilège.');
      return;
    }

    const summary = await summarizeCatalogGrants(item.id);
    Alert.alert('Suppression en cascade', formatBenefitDeleteWarning(item, summary), [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Continuer',
        style: 'destructive',
        onPress: () => {
          if (summary.grantCount === 0) {
            Alert.alert('Confirmer', 'Supprimer définitivement ce privilège ?', [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Supprimer',
                style: 'destructive',
                onPress: () => void runBenefitDelete(item.id, false),
              },
            ]);
            return;
          }

          Alert.alert(
            'Notifier les membres ?',
            `${summary.userIds.length} membre(s) ont reçu ce privilège.\n\nSouhaitez-vous leur envoyer une notification d'excuse ?`,
            [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Sans notification',
                style: 'destructive',
                onPress: () => void runBenefitDelete(item.id, false),
              },
              {
                text: 'Avec excuses',
                onPress: () => void runBenefitDelete(item.id, true),
              },
            ],
          );
        },
      },
    ]);
  }

  async function runBenefitDelete(catalogId: string, sendApology: boolean) {
    const res = await deleteBenefitCatalogCascade(catalogId, { sendApology });
    if (!res.ok) {
      Alert.alert('Erreur', res.error ?? 'Suppression impossible.');
      return;
    }
    await load();
    Alert.alert(
      'Supprimé',
      sendApology
        ? `Privilège retiré. ${res.removedGrants} octroi(s) supprimé(s) et notifications d'excuse envoyées.`
        : `Privilège retiré. ${res.removedGrants} octroi(s) supprimé(s).`,
    );
  }

  async function handleCreateCatalog() {
    if (!existingCatalogId) {
      Alert.alert('Privilège requis', 'Choisissez un privilège créé dans Paramètres → Privilège.');
      return;
    }
    if (!partnersToAdd.length) {
      Alert.alert('Partenaire requis', 'Ajoutez un partenaire (THE LOOP inclus) et un lieu de validité.');
      return;
    }
    const template =
      paramBenefits.find((c) => c.id === existingCatalogId) ??
      catalog.find((c) => c.id === existingCatalogId);
    if (!template) {
      Alert.alert('Privilège introuvable', 'Rechargez la liste puis réessayez.');
      return;
    }

    setSaving(true);
    try {
      const item = await createBenefitCatalogItemMulti({
        title: template.title,
        description: template.description,
        offeringPartners: partnersToAdd,
        defaultValidityDays: template.defaultValidityDays,
        validityEndsAt: template.validityEndsAt ?? null,
        validityStartsOnActivation: template.validityStartsOnActivation !== false,
        benefitKind: template.benefitKind,
        quantityPerGrant: template.quantityPerGrant,
        maxUsesPerGrant: template.maxUsesPerGrant,
        countryCode: template.countryCode ?? countryCode,
        city: template.city ?? null,
        isActive: false,
      });
      await proposeCatalogBenefitsToPartners(item, partnersToAdd);

      const onlyTheLoop = partnersToAdd.every(
        (p) =>
          p.displayName.toUpperCase().includes('THE LOOP') ||
          partnerAccounts.some(
            (a) =>
              partnerAccountUserId(a) === p.partnerId &&
              (a.company === 'THE LOOP' || a.name.startsWith('THE LOOP')),
          ),
      );
      setPartnersToAdd([]);
      setExistingCatalogId(null);

      const freshCatalog = await peekBenefitCatalog();
      const catalogIds = new Set(freshCatalog.map((c) => c.id));
      const freshOffers = (await peekPartnerBenefitOffers())
        .filter((o) => catalogIds.has(o.catalogId))
        .filter((o) => !countryCode || o.countryCode === countryCode)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setCatalog(freshCatalog);
      setPartnerOffers(freshOffers);
      void getCatalogUsageStats().then(setUsageStats);
      void listBenefitCatalog().catch(() => undefined);

      if (onlyTheLoop) {
        setTab('catalog');
        Alert.alert(
          'Créé et activé',
          'Association THE LOOP acceptée et privilège activé dans le Catalogue — disponible pour tirage et octroi.',
        );
      } else {
        setTab('creation');
        setCreationSection('validations');
        Alert.alert(
          'Envoyé en validation',
          'Partenaire Pro : inactif jusqu\'à acceptation. Une fois validé, il passe dans Catalogue.',
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      console.warn('[AdminPrimeBenefits] création association:', err);
      Alert.alert(
        'Échec de la création',
        message.includes('délai') || message.includes('timeout')
          ? `${message}\n\nVérifiez votre connexion puis réessayez.`
          : `${message}\n\nSi le problème persiste, relancez l'application.`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleGrant() {
    if (!selectedIds.length) {
      Alert.alert('Sélection requise', 'Choisissez au moins un privilège du catalogue.');
      return;
    }
    for (const id of selectedIds) {
      if (!resolvePartnerForCatalog(id)) {
        Alert.alert('Partenaire requis', 'Choisissez un partenaire pour chaque privilège sélectionné.');
        return;
      }
    }

    const target = GRANT_ROLE_TARGETS.find((t) => t.id === grantTarget);
    if (!target) return;

    const entries: RoleBenefitEntitlementEntry[] = [];
    for (const id of selectedIds) {
      const offering = getSelectedOffering(id);
      if (!offering) {
        Alert.alert('Partenaire requis', 'Choisissez un partenaire pour chaque privilège sélectionné.');
        return;
      }
      entries.push({
        catalogId: id,
        partnerId: offering.partnerId,
        partnerDisplayName: offering.displayName,
      });
    }

    setSaving(true);
    try {
      const current = await refreshRoleBenefitEntitlementsConfig(countryCode);
      const catalogIds = new Set(entries.map((e) => e.catalogId));
      const roles = new Set(target.roles);

      /** Sur les rôles ciblés : upsert. Sur les autres : retire ces catalogues (évite membre+prime fantôme). */
      const applyForRole = (
        existing: RoleBenefitEntitlementEntry[],
        include: boolean,
      ): RoleBenefitEntitlementEntry[] => {
        const without = existing.filter((e) => !catalogIds.has(e.catalogId));
        if (!include) return without;
        const map = new Map(without.map((e) => [e.catalogId, e]));
        for (const e of entries) map.set(e.catalogId, e);
        return [...map.values()];
      };

      const next = {
        member: applyForRole(current.member, roles.has('member')),
        prime: applyForRole(current.prime, roles.has('prime')),
        partner: applyForRole(current.partner, roles.has('partner')),
        admin: current.admin,
      };
      await saveRoleBenefitEntitlementsConfig(countryCode, next, user?.id ?? 'admin');

      const roleLabels: Record<RoleEntitlementKind, string> = {
        member: 'Membres',
        prime: 'Prime',
        partner: 'Partenaires',
        admin: 'Admin',
      };
      const immediate: Array<{
        role: RoleEntitlementKind;
        label: string;
        catalogId: string;
        title: string;
        partnerLabel: string;
      }> = [];
      for (const role of ['member', 'prime', 'partner'] as RoleEntitlementKind[]) {
        for (const entry of next[role]) {
          const cat = catalog.find((c) => c.id === entry.catalogId);
          immediate.push({
            role,
            label: roleLabels[role],
            catalogId: entry.catalogId,
            title: cat?.title ?? entry.catalogId,
            partnerLabel: entry.partnerDisplayName?.trim() || '—',
          });
        }
      }
      setRoleAssociations(immediate);

      if (user) {
        void syncUserRoleBenefitEntitlements(user).catch(() => undefined);
      }

      setSelectedIds([]);
      setOfferingIndexByCatalogId({});
      setCustomPartnerByCatalogId({});
      setCustomNote('');

      Alert.alert(
        'Associé',
        `${entries.length} privilège(s) → ${target.label} uniquement. Visible sur les fiches contenu. Les comptes concernés se mettent à jour à la prochaine connexion.`,
      );
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Association impossible.';
      Alert.alert('Erreur', message);
    } finally {
      setSaving(false);
    }
  }

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  return (
    <>
      <KeyboardAwareFormScroll style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
      <AdminPageHeader
        title="Privilèges THE LOOP"
        subtitle="Création, catalogue, suivi, octroi"
        shell={shell}
        onBack={() => navigation.goBack()}
      />

      <AdminCountryBar shell={shell} compact />

      <AdminTabMenu
        tabs={visibleMainTabs.map((t) => ({
          id: t.id,
          label: t.label,
          badge:
            t.id === 'catalog'
              ? validatedCatalogCount
              : t.id === 'creation'
                ? validationOffers.length || undefined
                : t.id === 'suivi'
                  ? roleAssociations.length || undefined
                  : undefined,
        }))}
        active={tab}
        onChange={setTab}
        shell={shell}
      />

      {tab === 'creation' ? (
        <>
          <AdminTabMenu
            tabs={visibleCreationSections.map((s) => ({
              id: s.id,
              label: s.label,
              badge:
                s.id === 'validations'
                  ? validationOffers.length
                  : undefined,
            }))}
            active={creationSection}
            onChange={setCreationSection}
            shell={shell}
          />

          {creationSection === 'create' ? (
            <>
              <Text style={[styles.hint, { color: shell.pageKicker }]}>
                Choisissez un privilège créé dans Paramètres → Privilège, un partenaire (THE LOOP inclus), puis un événement / spot / outil. THE LOOP : acceptation et activation automatiques. Partenaire Pro : validation requise, puis actif après acceptation.
              </Text>

              <Text style={[styles.label, { color: shell.pageKicker }]}>Privilège (Paramètres) *</Text>
              <Pressable style={inputStyle} onPress={() => setExistingPickerOpen(true)}>
                <Text style={{ color: existingCatalogId ? shell.pageTitle : shell.pageKicker }}>
                  {existingCatalogId
                    ? paramBenefits.find((c) => c.id === existingCatalogId)?.title ??
                      catalog.find((c) => c.id === existingCatalogId)?.title ??
                      'Choisir…'
                    : 'Choisir un privilège…'}
                </Text>
              </Pressable>
              {paramBenefits.length === 0 ? (
                <Text style={[styles.hint, { color: '#f59e0b' }]}>
                  Aucun privilège Paramètres actif — créez-en dans Paramètres → Privilège.
                </Text>
              ) : null}

              <Text style={[styles.label, { color: shell.pageKicker }]}>Partenaire *</Text>
              <Pressable
                style={inputStyle}
                onPress={() => {
                  if (!partnerAccounts.length) {
                    Alert.alert('Aucun compte', 'Aucun partenaire / THE LOOP disponible.');
                    return;
                  }
                  setPartnerPickerOpen(true);
                }}
              >
                <Text style={{ color: shell.pageTitle }}>
                  {newPartnerId ? partnerLabel(newPartnerId) : 'Choisir un partenaire…'}
                </Text>
              </Pressable>

              {newPartnerId ? (
                <>
                  <Text style={[styles.label, { color: shell.pageKicker }]}>
                    {(() => {
                      const account = partnerAccounts.find((entry) => entry.id === newPartnerId);
                      return account && isTheLoopOfferingAccount(account)
                        ? 'Contenu THE LOOP *'
                        : 'Lieu de validité *';
                    })()}
                  </Text>
                  <Pressable
                    style={inputStyle}
                    onPress={() => void openCreateContentPicker()}
                  >
                    <Text style={{ color: newContentKey ? shell.pageTitle : shell.pageKicker }}>
                      {createContentLoading
                        ? 'Chargement des lieux…'
                        : contentOptionLabel(newContentKey, createContentOptions)}
                    </Text>
                  </Pressable>
                  {(() => {
                    const account = partnerAccounts.find((entry) => entry.id === newPartnerId);
                    const isLoop = Boolean(account && isTheLoopOfferingAccount(account));
                    if (isLoop && createContentOptions.length === 0) {
                      return (
                        <Text style={[styles.hint, { color: '#f59e0b' }]}>
                          Aucun événement, spot ou outil THE LOOP publié pour ce pays. Publiez du contenu via THE LOOP → Mon contenu.
                        </Text>
                      );
                    }
                    if (!isLoop && createContentOptions.length <= 1) {
                      return (
                        <Text style={[styles.hint, { color: shell.pageKicker }]}>
                          Aucun contenu publié pour ce partenaire — choisissez « Tous les établissements ».
                        </Text>
                      );
                    }
                    if (isLoop) {
                      return (
                        <Text style={[styles.hint, { color: shell.pageKicker }]}>
                          Compte équipe THE LOOP : liez le privilège à un événement, spot ou outil publié par l'équipe (pas les contenus partenaires).
                        </Text>
                      );
                    }
                    return (
                      <Text style={[styles.hint, { color: shell.pageKicker }]}>
                        Lieux publiés de ce partenaire + option « Tous les établissements » (sans lieu précis).
                      </Text>
                    );
                  })()}
                </>
              ) : null}

              <Pressable style={[styles.addPartnerBtn, { borderColor: shell.filterInactiveBorder }]} onPress={addPartnerToCreateList}>
                <Text style={{ color: shell.tabIndicator, fontWeight: '700' }}>+ Ajouter partenaire et lieu</Text>
              </Pressable>
              {partnersToAdd.length > 0 ? (
                <View style={styles.catalogPick}>
                  {partnersToAdd.map((p) => (
                    <Pressable
                      key={offeringIdentityKey(p)}
                      style={[styles.chip, { borderColor: shell.filterInactiveBorder, backgroundColor: 'rgba(201,168,76,0.25)' }]}
                      onPress={() =>
                        setPartnersToAdd((prev) => prev.filter((entry) => offeringIdentityKey(entry) !== offeringIdentityKey(p)))
                      }
                    >
                      <Text style={{ color: shell.pageTitle, fontSize: 9, fontWeight: '700' }}>
                        {p.displayName} · {formatOfferingScopeLabel(p.contentType, p.contentTitle)} ×
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <Pressable
                style={[styles.submit, { backgroundColor: shell.tabIndicator, opacity: saving ? 0.6 : 1 }]}
                disabled={saving}
                onPress={() => void handleCreateCatalog()}
              >
                <Text style={styles.submitText}>
                  {saving ? 'Création en cours…' : 'Créer l\'association'}
                </Text>
              </Pressable>
            </>
          ) : null}

          {creationSection === 'validations' ? (
            <>
              <Text style={[styles.hint, { color: shell.pageKicker }]}>
                En attente de validation partenaire. Pas de validation automatique — la demande reste ici jusqu'à acceptation ou refus (avec motif).
              </Text>
              {validationOffers.length === 0 ? (
                <Text style={[styles.hint, { color: shell.pageKicker }]}>Aucune demande de validation.</Text>
              ) : (
                validationOffers.map((offer) => {
                  const live = catalog.find((c) => c.id === offer.catalogId);
                  const title = live?.title ?? offer.catalogTitle;
                  const description = live?.description ?? offer.catalogDescription;
                  return (
                  <View key={offer.id} style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
                    <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>{title}</Text>
                    <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
                      {offer.partnerName} · {PARTNER_OFFER_STATUS_LABELS[offer.status]}
                    </Text>
                    <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
                      {offer.respondedAt
                        ? `Répondu le ${formatDateFr(offer.respondedAt)}`
                        : `Créé le ${formatDateFr(offer.createdAt)} · en attente partenaire`}
                    </Text>
                    {(offer.contentTitle || offer.contentType || live) ? (
                      <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
                        Lieu : {formatOfferingScopeLabel(
                          offer.contentType ?? live?.offeringPartners.find((p) => p.displayName === offer.partnerName)?.contentType,
                          offer.contentTitle ?? live?.offeringPartners.find((p) => p.displayName === offer.partnerName)?.contentTitle,
                        )}
                      </Text>
                    ) : null}
                    {description ? (
                      <Text style={[styles.cardBody, { color: shell.pageKicker }]} numberOfLines={2}>{description}</Text>
                    ) : null}
                    {offer.status === 'declined' && offer.partnerResponseNote ? (
                      <Text style={[styles.cardBody, { color: '#f87171' }]}>
                        Motif du refus : {offer.partnerResponseNote}
                      </Text>
                    ) : offer.partnerResponseNote ? (
                      <Text style={[styles.cardBody, { color: shell.pageKicker }]}>{offer.partnerResponseNote}</Text>
                    ) : null}
                    <View style={styles.cardActions}>
                      <Pressable onPress={() => setDetailOffer({
                        ...offer,
                        catalogTitle: title,
                        catalogDescription: description,
                      })}>
                        <Text style={{ color: shell.pageKicker, fontWeight: '700', fontSize: 11 }}>Détails</Text>
                      </Pressable>
                      {(offer.status === 'declined' || offer.status === 'disabled') ? (
                        <Pressable onPress={() => void resendPartnerBenefitOffer(offer.id).then(() => load())}>
                          <Text style={{ color: shell.tabIndicator, fontWeight: '700', fontSize: 11 }}>Remettre en validation</Text>
                        </Pressable>
                      ) : null}
                      {offer.status === 'pending' || offer.status === 'declined' ? (
                        <AdminActionIcon
                          action="edit"
                          color={shell.tabIndicator}
                          onPress={() => {
                            const item = catalog.find((c) => c.id === offer.catalogId);
                            if (item) openEdit(item);
                            else Alert.alert('Introuvable', 'L\'privilège catalogue associé n\'existe plus.');
                          }}
                        />
                      ) : null}
                      {offer.status !== 'disabled' ? (
                        <AdminActionIcon
                          action="archive"
                          onPress={() => {
                            Alert.alert('Archiver', 'Archiver cette demande de validation ?', [
                              { text: 'Annuler', style: 'cancel' },
                              {
                                text: 'Archiver',
                                onPress: () => void archivePartnerBenefitOffer(offer.id).then(() => load()),
                              },
                            ]);
                          }}
                        />
                      ) : null}
                      <AdminActionIcon
                        action="delete"
                        onPress={() => {
                          Alert.alert('Supprimer', 'Supprimer définitivement cette demande ?', [
                            { text: 'Annuler', style: 'cancel' },
                            {
                              text: 'Supprimer',
                              style: 'destructive',
                              onPress: () => void deletePartnerBenefitOffer(offer.id).then(() => load()),
                            },
                          ]);
                        }}
                      />
                    </View>
                  </View>
                  );
                })
              )}
            </>
          ) : null}
        </>
      ) : tab === 'catalog' ? (
        <>
          <Text style={[styles.hint, { color: shell.pageKicker }]}>
            Catalogue validé — activez, désactivez ou modifiez y compris les privilèges inactifs.
          </Text>
          <View style={styles.catalogPick}>
            {([
              { id: 'active' as const, label: 'Actifs' },
              { id: 'inactive' as const, label: 'Désactivés' },
              { id: 'all' as const, label: 'Tous' },
            ]).map((f) => (
              <Pressable
                key={f.id}
                style={[
                  styles.chip,
                  { borderColor: shell.filterInactiveBorder },
                  catalogStatusFilter === f.id && { backgroundColor: shell.tabIndicator, borderColor: shell.tabIndicator },
                ]}
                onPress={() => setCatalogStatusFilter(f.id)}
              >
                <Text style={{ color: catalogStatusFilter === f.id ? '#fff' : shell.pageTitle, fontSize: 10, fontWeight: '700' }}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {catalogForTab.length === 0 ? (
            <Text style={[styles.hint, { color: shell.pageKicker }]}>
              Aucun privilège dans ce filtre.
            </Text>
          ) : (
            catalogForTab.map((item) => {
              const stat = usageByCatalogId.get(item.id);
              return (
                <View key={item.id} style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
                  <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>{item.title}</Text>
                  <Text style={{ color: item.isActive ? '#34d399' : '#f87171', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', marginTop: 4 }}>
                    {item.isActive ? 'Actif' : 'Désactivé'}
                  </Text>
                  <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
                    {item.offeringPartners
                      .map((p) => `${p.displayName} (${formatOfferingScopeLabel(p.contentType, p.contentTitle)})`)
                      .join(' · ')}{' '}
                    · jusqu’au {formatValidityEndFromDays(item.defaultValidityDays)} ·{' '}
                    {BENEFIT_KIND_LABELS[item.benefitKind]}
                    {item.validityEndsAt ? ` · limite ${formatDateDdMmYyyy(item.validityEndsAt)}` : ''}
                    {item.benefitKind === 'quantity' && item.quantityPerGrant ? ` · ×${item.quantityPerGrant}` : ''}
                    {item.benefitKind === 'usage_limit' && item.maxUsesPerGrant ? ` · ${item.maxUsesPerGrant} utilisations` : ''}
                  </Text>
                  {stat && stat.granted > 0 ? (
                    <Text style={[styles.usageLine, { color: shell.tabIndicator }]}>
                      Affectation consommée : {stat.used} · Octroyé non consommé : {stat.unusedAssigned}
                    </Text>
                  ) : null}
                  <Text style={[styles.cardBody, { color: shell.pageTitle }]} numberOfLines={2}>{item.description}</Text>
                  <View style={styles.cardActions}>
                    <Pressable onPress={() => setDetailItem(item)}>
                      <Text style={{ color: shell.pageKicker, fontWeight: '700', fontSize: 11 }}>Détails</Text>
                    </Pressable>
                    <AdminActionIcon action="edit" color={shell.tabIndicator} onPress={() => openEdit(item)} />
                    {item.isActive ? (
                      <AdminActionIcon
                        action="deactivate"
                        onPress={() => void updateBenefitCatalogItem(item.id, { isActive: false }).then(() => load())}
                      />
                    ) : (
                      <Pressable onPress={() => void updateBenefitCatalogItem(item.id, { isActive: true }).then(() => load())}>
                        <Text style={{ color: '#34d399', fontWeight: '700', fontSize: 11 }}>Réactiver</Text>
                      </Pressable>
                    )}
                    {isSuperAdmin ? (
                      <AdminActionIcon action="delete" onPress={() => void handleDeleteBenefit(item)} />
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </>
      ) : tab === 'suivi' ? (
        <>
          <Text style={[styles.hint, { color: shell.pageKicker }]}>
            Suivi des privilèges associés aux rôles (octroi) et des consommations individuelles éventuelles.
          </Text>

          <Text style={[styles.label, { color: shell.pageKicker }]}>Filtrer par rôle</Text>
          <View style={styles.audienceRow}>
            {(
              [
                { id: 'all' as const, label: 'Tous' },
                { id: 'member' as const, label: 'Membre' },
                { id: 'prime' as const, label: 'Prime' },
                { id: 'partner' as const, label: 'Partenaire' },
              ] as const
            ).map((opt) => {
              const active = suiviRoleFilter === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[styles.chip, { borderColor: shell.filterInactiveBorder }, active && { backgroundColor: shell.tabIndicator, borderColor: shell.tabIndicator }]}
                  onPress={() => setSuiviRoleFilter(opt.id)}
                >
                  <Text style={{ color: active ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { color: shell.pageKicker }]}>Filtrer par privilège</Text>
          <View style={styles.audienceRow}>
            <Pressable
              style={[styles.chip, { borderColor: shell.filterInactiveBorder }, suiviBenefitFilter === 'all' && { backgroundColor: shell.tabIndicator, borderColor: shell.tabIndicator }]}
              onPress={() => setSuiviBenefitFilter('all')}
            >
              <Text style={{ color: suiviBenefitFilter === 'all' ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>Tous</Text>
            </Pressable>
            {suiviBenefitOptions.map(([id, title]) => {
              const active = suiviBenefitFilter === id;
              return (
                <Pressable
                  key={id}
                  style={[styles.chip, { borderColor: shell.filterInactiveBorder }, active && { backgroundColor: shell.tabIndicator, borderColor: shell.tabIndicator }]}
                  onPress={() => setSuiviBenefitFilter(id)}
                >
                  <Text style={{ color: active ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }} numberOfLines={1}>
                    {title}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.section, { color: shell.pageKicker }]}>
            Affectations de rôle ({suiviRows.length})
          </Text>
          {roleAssociations.length === 0 ? (
            <Text style={[styles.hint, { color: shell.pageKicker }]}>
              Aucune association de rôle. Passez par l’onglet Octroi pour lier un privilège à Membre / Prime / Partenaire.
            </Text>
          ) : suiviRows.length === 0 ? (
            <Text style={[styles.hint, { color: shell.pageKicker }]}>Aucune ligne pour ces filtres.</Text>
          ) : (
            suiviRows.map((row) => (
              <View
                key={`suivi-${row.role}:${row.catalogId}`}
                style={[styles.statRow, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
              >
                <View style={styles.suiviHeader}>
                  <Text style={[styles.cardTitle, { color: shell.pageTitle, flex: 1, paddingRight: 8 }]} numberOfLines={2}>
                    {row.title}
                  </Text>
                  <Text style={styles.unusedBadge}>{row.label}</Text>
                </View>
                <Text style={[styles.cardMeta, { color: shell.tabIndicator }]} numberOfLines={1}>
                  {row.partnerLabel}
                </Text>
                <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
                  Cible : {row.label} · association automatique au rôle
                </Text>
              </View>
            ))
          )}

          <Text style={[styles.section, { color: shell.pageKicker }]}>
            Consommation individuelle ({suiviIndividualStats.length})
          </Text>
          {suiviIndividualStats.length === 0 ? (
            <Text style={[styles.hint, { color: shell.pageKicker }]}>
              Pas encore d’octrois individuels consommés / en cours (hors associations de rôle).
            </Text>
          ) : (
            suiviIndividualStats.map((stat) => (
              <View
                key={stat.catalogId}
                style={[styles.statRow, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
              >
                <View style={styles.suiviHeader}>
                  <Text style={[styles.cardTitle, { color: shell.pageTitle, flex: 1, paddingRight: 8 }]} numberOfLines={2}>
                    {stat.title}
                  </Text>
                  {stat.unusedAssigned > 0 ? (
                    <Text style={styles.unusedBadge}>Octroyé non consommé</Text>
                  ) : null}
                </View>
                <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
                  Affectation consommée : {stat.used}
                </Text>
                <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
                  Octroyé non consommé : {stat.unusedAssigned}
                </Text>
              </View>
            ))
          )}
        </>
      ) : tab === 'grant' ? (
        <>
          <GuineaLocationPicker
            value={grantCity}
            onChange={setGrantCity}
            shell={shell}
            label="Maillage localisation (octroi)"
            countryCode={countryCode}
            allowCommuneOnly
            optional
            placeholder="Vide = tout le pays — filtre aussi la cible"
          />
          <Text style={[styles.hint, { color: shell.pageKicker }]}>
            Chaque membre reçoit les privilèges de sa préfecture profil (commune et quartier ignorés). Les privilèges « tout le pays / en ligne » sont octroyés partout. Optionnel : restreindre la zone et la liste ci-dessous.
          </Text>

          <Text style={[styles.label, { color: shell.pageKicker }]}>Privilèges validés à octroyer *</Text>
          {grantableCatalog.length === 0 ? (
            <Text style={[styles.hint, { color: shell.pageKicker }]}>
              Aucun privilège validé pour cette zone (partenaire accepté + catalogue actif).
            </Text>
          ) : (
            <View style={styles.catalogPick}>
              {grantableCatalog.map((item) => (
                <Pressable
                  key={item.id}
                  style={[
                    styles.chip,
                    { borderColor: shell.filterInactiveBorder },
                    selectedIds.includes(item.id) && { backgroundColor: shell.tabIndicator, borderColor: shell.tabIndicator },
                  ]}
                  onPress={() => toggleCatalogId(item.id)}
                >
                  <Text style={{ color: selectedIds.includes(item.id) ? '#fff' : shell.pageTitle, fontSize: 10, fontWeight: '700' }}>
                    {item.title}
                  </Text>
                  <Text style={{ color: selectedIds.includes(item.id) ? '#111' : shell.pageKicker, fontSize: 8, marginTop: 2 }}>
                    {formatGrantableBenefitGeoLabel(item, grantableOfferings)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={[styles.hint, { color: shell.pageKicker }]}>
            Préférez un partenaire de la liste (établissement/compte) plutôt que « Autre partenaire » — cela lie le privilège au spot et au compte Pro pour la validation QR.
          </Text>
          {selectedIds.map((catalogId) => {
            const item = catalog.find((c) => c.id === catalogId);
            if (!item) return null;
            const options = item.offeringPartners;
            const selectedIdx = offeringIndexByCatalogId[catalogId] ?? 0;
            const selectedOffering = options[selectedIdx] ?? options[0];
            return (
              <View key={catalogId} style={[styles.partnerBlock, { borderColor: shell.filterInactiveBorder }]}>
                <Text style={[styles.label, { color: shell.pageKicker }]}>Partenaire — {item.title}</Text>
                <View style={styles.catalogPick}>
                  {options.map((opt, optIdx) => (
                    <Pressable
                      key={offeringIdentityKey(opt)}
                      style={[styles.chip, { borderColor: shell.filterInactiveBorder }, selectedIdx === optIdx && { backgroundColor: shell.tabIndicator, borderColor: shell.tabIndicator }]}
                      onPress={() => {
                        setOfferingIndexByCatalogId((p) => ({ ...p, [catalogId]: optIdx }));
                      }}
                    >
                      <Text style={{ color: selectedIdx === optIdx ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>
                        {opt.displayName}
                      </Text>
                      <Text style={{ color: selectedIdx === optIdx ? '#111' : shell.pageKicker, fontSize: 8, marginTop: 2 }}>
                        {formatOfferingScopeLabel(opt.contentType, opt.contentTitle)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {selectedOffering?.partnerId === EXTERNAL_PARTNER_ID ? (
                  <TextInput
                    style={inputStyle}
                    value={customPartnerByCatalogId[catalogId] ?? ''}
                    onChangeText={(t) => setCustomPartnerByCatalogId((p) => ({ ...p, [catalogId]: t }))}
                    placeholder="Nom du partenaire"
                    placeholderTextColor={shell.pageKicker}
                  />
                ) : null}
              </View>
            );
          })}

          <Text style={[styles.label, { color: shell.pageKicker }]}>Cible</Text>
          <View style={styles.audienceRow}>
            {GRANT_ROLE_TARGETS.map((opt) => {
              const active = grantTarget === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[styles.chip, { borderColor: shell.filterInactiveBorder }, active && { backgroundColor: shell.tabIndicator, borderColor: shell.tabIndicator }]}
                  onPress={() => setGrantTarget(opt.id)}
                >
                  <Text style={{ color: active ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: shell.pageKicker }]}>
            La cible choisie est exclusive pour les privilèges sélectionnés : ex. MEMBRE les retire de Prime / Partenaires s’ils y étaient. TOUS = Membres + Prime + Partenaires. Les admins se gèrent dans TEAMS.
          </Text>

          <Text style={[styles.label, { color: shell.pageKicker }]}>Note complémentaire (optionnel)</Text>
          <TextInput style={[...inputStyle, styles.multiline]} value={customNote} onChangeText={setCustomNote} placeholder="Code promo, conditions spéciales…" placeholderTextColor={shell.pageKicker} multiline />

          <Pressable style={[styles.submit, { backgroundColor: shell.tabIndicator }]} onPress={() => void handleGrant()} disabled={saving}>
            <Text style={styles.submitText}>{saving ? 'Enregistrement…' : 'Associer à la cible'}</Text>
          </Pressable>

          <Text style={[styles.section, { color: shell.pageKicker }]}>
            Associations de rôle ({roleAssociations.length})
          </Text>
          <Text style={[styles.hint, { color: shell.pageKicker }]}>
            Historique des privilèges liés aux rôles (source de vérité après chaque association).
          </Text>
          {roleAssociations.length === 0 ? (
            <Text style={[styles.hint, { color: shell.pageKicker }]}>
              Aucune association de rôle pour l’instant. Utilisez « Associer à la cible » ci-dessus.
            </Text>
          ) : (
            roleAssociations.map((row) => (
              <View
                key={`${row.role}:${row.catalogId}`}
                style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
              >
                <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>{row.title}</Text>
                <Text style={[styles.cardMeta, { color: shell.tabIndicator }]} numberOfLines={1}>
                  {row.partnerLabel}
                </Text>
                <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
                  Cible : {row.label}
                </Text>
                <Pressable
                  onPress={() => {
                    Alert.alert('Retirer l’association', `Retirer « ${row.title} » de ${row.label} ?`, [
                      { text: 'Annuler', style: 'cancel' },
                      {
                        text: 'Retirer',
                        style: 'destructive',
                        onPress: () => {
                          void (async () => {
                            const current = await refreshRoleBenefitEntitlementsConfig(countryCode);
                            const next = {
                              member: current.member,
                              prime: current.prime,
                              partner: current.partner,
                              admin: current.admin,
                              [row.role]: (current[row.role] ?? []).filter((e) => e.catalogId !== row.catalogId),
                            };
                            await saveRoleBenefitEntitlementsConfig(countryCode, next, user?.id ?? 'admin');
                            void load();
                          })();
                        },
                      },
                    ]);
                  }}
                  style={{ marginTop: 8 }}
                >
                  <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700' }}>Retirer</Text>
                </Pressable>
              </View>
            ))
          )}

          <Text style={[styles.section, { color: shell.pageKicker }]}>Octrois individuels ({history.length})</Text>
          {history.length === 0 ? (
            <Text style={[styles.hint, { color: shell.pageKicker }]}>
              Aucun octroi individuel (e-mail / téléphone). L’onglet Octroi associe des privilèges aux rôles — voir la liste ci-dessus.
            </Text>
          ) : null}
          {history.slice(0, 40).map((line) => (
            <Pressable
              key={line.id}
              style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
              onPress={() => setSelectedGrantLine(line)}
            >
              <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>
                {line.title}
              </Text>
              {line.placeLabel ? (
                <Text style={[styles.cardMeta, { color: shell.tabIndicator }]} numberOfLines={1}>
                  {line.placeLabel}
                </Text>
              ) : null}
              <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
                {GRANT_AUDIENCE_LABELS[line.grantAudience]} · {formatDateFr(line.grantedAt)} · {line.beneficiaries.length} bénéficiaire(s)
              </Text>
              <Text style={{ color: shell.tabIndicator, marginTop: 6, fontSize: 11, fontWeight: '700' }}>
                Voir / révoquer →
              </Text>
            </Pressable>
          ))}
        </>
      ) : null}

      </KeyboardAwareFormScroll>

      <Modal visible={selectedGrantLine != null} transparent animationType="slide" onRequestClose={() => setSelectedGrantLine(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}>
            {selectedGrantLine ? (
              <>
                <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>{selectedGrantLine.title}</Text>
                {selectedGrantLine.placeLabel ? (
                  <Text style={[styles.cardMeta, { color: shell.tabIndicator, paddingHorizontal: 16, marginBottom: 4 }]}>
                    {selectedGrantLine.placeLabel}
                  </Text>
                ) : null}
                <Text style={[styles.cardMeta, { color: shell.pageKicker, paddingHorizontal: 16, marginBottom: 8 }]}>
                  {GRANT_AUDIENCE_LABELS[selectedGrantLine.grantAudience]} · expire {formatDateFr(selectedGrantLine.expiresAt)}
                </Text>
                {selectedGrantLine.beneficiaries.length === 0 ? (
                  <Text style={[styles.emptyBeneficiaries, { color: shell.pageKicker }]}>
                    Aucun bénéficiaire enregistré pour cet octroi.
                  </Text>
                ) : (
                  <KeyboardAwareFormScroll style={styles.modalList} nestedScrollEnabled keyboardPriority={10}>
                    {selectedGrantLine.beneficiaries.map((b) => (
                      <View key={b.benefitId} style={[styles.beneficiaryRow, { borderBottomColor: shell.filterInactiveBorder }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: shell.pageTitle, fontWeight: '700', fontSize: 13 }}>
                            {b.displayName ?? b.userPhone ?? b.userId}
                          </Text>
                          {b.userPhone && b.displayName !== b.userPhone ? (
                            <Text style={{ color: shell.pageKicker, fontSize: 11, marginTop: 2 }}>{b.userPhone}</Text>
                          ) : null}
                        <Text style={{ color: shell.pageKicker, fontSize: 11, marginTop: 2 }}>
                          {BENEFIT_STATUS_LABELS[b.status]} · {b.usageLabel}
                        </Text>
                      </View>
                      {b.canRevoke ? (
                        <Pressable
                          onPress={() =>
                            void revokeBenefit(b.benefitId).then(async (ok) => {
                              if (!ok) {
                                Alert.alert('Révocation', 'Impossible de révoquer cet octroi.');
                                return;
                              }
                              await load();
                              const lines = await listBenefitGrantLines(countryCode);
                              setHistory(lines);
                              const next = lines.find((l) => l.id === selectedGrantLine.id) ?? null;
                              setSelectedGrantLine(next);
                            })
                          }
                        >
                          <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '700' }}>Révoquer</Text>
                        </Pressable>
                      ) : (
                        <Text style={{ color: shell.pageKicker, fontSize: 10, fontStyle: 'italic' }}>
                          {b.status === 'used'
                            ? 'Consommé'
                            : b.status === 'expired_unused'
                              ? 'Expiré / révoqué'
                              : 'Non révocable'}
                        </Text>
                      )}
                    </View>
                    ))}
                  </KeyboardAwareFormScroll>
                )}
                <Pressable style={styles.modalClose} onPress={() => setSelectedGrantLine(null)}>
                  <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Fermer</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <PartnerPicker
        visible={partnerPickerOpen}
        title="Choisir un compte partenaire"
        options={partnerAccountPickerOptions}
        selectedId={newPartnerId}
        onSelect={setNewPartnerId}
        onClose={() => setPartnerPickerOpen(false)}
        shell={shell}
      />

      <PartnerPicker
        visible={contentPickerOpen}
        title="Où est valable le privilège ?"
        options={createContentPickerOptions}
        selectedId={newContentKey}
        onSelect={setNewContentKey}
        onClose={() => setContentPickerOpen(false)}
        emptyMessage={
          createContentLoading
            ? 'Chargement des lieux…'
            : (() => {
                const account = partnerAccounts.find((entry) => entry.id === newPartnerId);
                return account && isTheLoopOfferingAccount(account)
                  ? 'Aucun event / spot / outil THE LOOP publié pour ce pays. Publiez du contenu via Mon contenu.'
                  : 'Aucun contenu publié — choisissez « Tous les établissements » si la liste ne se charge pas.';
              })()
        }
        shell={shell}
      />

      <PartnerPicker
        visible={existingPickerOpen}
        title="Privilège (Paramètres)"
        options={paramBenefits.map((c) => ({ id: c.id, label: c.title }))}
        selectedId={existingCatalogId}
        onSelect={setExistingCatalogId}
        onClose={() => setExistingPickerOpen(false)}
        shell={shell}
      />

      <Modal visible={editingItem != null} transparent animationType="slide" onRequestClose={() => setEditingItem(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}>
            <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>Modifier le privilège</Text>
            <KeyboardAwareFormScroll style={styles.editForm} nestedScrollEnabled keyboardPriority={10}>
              <Text style={[styles.label, { color: shell.pageKicker }]}>Titre *</Text>
              <TextInput style={inputStyle} value={editTitle} onChangeText={setEditTitle} placeholderTextColor={shell.pageKicker} />
              <Text style={[styles.label, { color: shell.pageKicker }]}>Description *</Text>
              <TextInput style={[...inputStyle, styles.multiline]} value={editDesc} onChangeText={setEditDesc} multiline placeholderTextColor={shell.pageKicker} />
              <Text style={[styles.label, { color: shell.pageKicker }]}>Type de privilège</Text>
              <View style={styles.catalogPick}>
                {benefitTypes.filter((t) => t.isActive || t.id === editTypeId).map((type) => (
                  <Pressable
                    key={type.id}
                    style={[styles.chip, { borderColor: shell.filterInactiveBorder }, editTypeId === type.id && { backgroundColor: shell.tabIndicator, borderColor: shell.tabIndicator }]}
                    onPress={() => applyBenefitType(type, 'edit')}
                  >
                    <Text style={{ color: editTypeId === type.id ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>{type.label}</Text>
                  </Pressable>
                ))}
              </View>
              {editKind === 'quantity' ? (
                <>
                  <Text style={[styles.label, { color: shell.pageKicker }]}>Quantité par octroi</Text>
                  <TextInput style={inputStyle} value={editQuantity} onChangeText={setEditQuantity} keyboardType="numeric" placeholderTextColor={shell.pageKicker} />
                </>
              ) : null}
              {editKind === 'usage_limit' ? (
                <>
                  <Text style={[styles.label, { color: shell.pageKicker }]}>Utilisations max</Text>
                  <TextInput style={inputStyle} value={editMaxUses} onChangeText={setEditMaxUses} keyboardType="numeric" placeholderTextColor={shell.pageKicker} />
                </>
              ) : null}
              <Text style={[styles.label, { color: shell.pageKicker }]}>Finalité</Text>
              <View style={styles.catalogPick}>
                {BENEFIT_PURPOSES.map((p) => (
                  <Pressable
                    key={p}
                    style={[styles.chip, { borderColor: shell.filterInactiveBorder }, editPurpose === p && { backgroundColor: shell.tabIndicator, borderColor: shell.tabIndicator }]}
                    onPress={() => setEditPurpose(p)}
                  >
                    <Text style={{ color: editPurpose === p ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>{BENEFIT_PURPOSE_LABELS[p]}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.label, { color: shell.pageKicker }]}>Validité (jours)</Text>
              <TextInput
                style={inputStyle}
                value={editValidity}
                onChangeText={(t) => {
                  const days = Number(t) || 0;
                  const ends = editValidityEndsAt.trim()
                    ? new Date(`${editValidityEndsAt.trim()}T23:59:59`).toISOString()
                    : null;
                  const capped = clampValidityDaysToCatalogEnd(days || 30, ends);
                  if (capped.capped) {
                    Alert.alert(
                      'Date limite',
                      `La validité ne peut pas dépasser la date limite enregistrée (${maxValidityDaysUntilEnd(ends)} j. max).`,
                    );
                    setEditValidity(String(capped.days));
                    return;
                  }
                  setEditValidity(t);
                }}
                keyboardType="numeric"
                placeholderTextColor={shell.pageKicker}
              />
              <Text style={[styles.hint, { color: shell.pageKicker }]}>
                Échéance indicative : {formatValidityEndFromDays(Number(editValidity) || 30)}
              </Text>
              <Text style={[styles.label, { color: shell.pageKicker }]}>Date limite absolue (optionnel)</Text>
              <DateTimeField
                value={editValidityEndsAt}
                onChange={(v) => {
                  setEditValidityEndsAt(v);
                  const ends = v.trim() ? new Date(`${v.trim()}T23:59:59`).toISOString() : null;
                  const capped = clampValidityDaysToCatalogEnd(Number(editValidity) || 30, ends);
                  if (capped.capped) setEditValidity(String(capped.days));
                }}
                placeholder="Ex. 31 déc. 2026"
                shell={shell}
                dateOnly
              />
              <Text style={[styles.hint, { color: shell.pageKicker }]}>
                Si renseignée, aucune affectation partenaire / octroi ne pourra aller au-delà de cette date.
              </Text>
              <Text style={[styles.label, { color: shell.pageKicker }]}>Début du compte</Text>
              <View style={styles.catalogPick}>
                <Pressable
                  style={[styles.chip, { borderColor: shell.filterInactiveBorder }, editValidityStartsOnActivation && { backgroundColor: shell.tabIndicator, borderColor: shell.tabIndicator }]}
                  onPress={() => setEditValidityStartsOnActivation(true)}
                >
                  <Text style={{ color: editValidityStartsOnActivation ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>
                    1ʳᵉ consommation
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.chip, { borderColor: shell.filterInactiveBorder }, !editValidityStartsOnActivation && { backgroundColor: shell.tabIndicator, borderColor: shell.tabIndicator }]}
                  onPress={() => setEditValidityStartsOnActivation(false)}
                >
                  <Text style={{ color: !editValidityStartsOnActivation ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>
                    Dès la réception
                  </Text>
                </Pressable>
              </View>
              <Pressable
                style={[styles.associateToggle, { borderColor: shell.filterInactiveBorder }, editActive && { backgroundColor: 'rgba(201,168,76,0.2)' }]}
                onPress={() => setEditActive((v) => !v)}
              >
                <Text style={{ color: shell.pageTitle, fontWeight: '700', fontSize: 12 }}>{editActive ? '☑' : '☐'} Actif dans le catalogue</Text>
              </Pressable>
              <Text style={[styles.label, { color: shell.pageKicker }]}>Compte partenaire *</Text>
              <Pressable style={inputStyle} onPress={() => setEditPartnerPickerOpen(true)}>
                <Text style={{ color: shell.pageTitle }}>
                  {editPartnerId === EXTERNAL_PARTNER_ID ? EXTERNAL_PARTNER_LABEL : (() => {
                    const account = partnerAccounts.find((entry) => entry.id === editPartnerId);
                    return account ? partnerAccountDisplayName(account) : 'Choisir…';
                  })()}
                </Text>
              </Pressable>
              {editPartnerId === EXTERNAL_PARTNER_ID ? (
                <TextInput style={inputStyle} value={editPartnerExternal} onChangeText={setEditPartnerExternal} placeholder="Nom externe" placeholderTextColor={shell.pageKicker} />
              ) : (
                <>
                  <Text style={[styles.label, { color: shell.pageKicker }]}>Lieu de validité *</Text>
                  <Pressable
                    style={inputStyle}
                    onPress={() => void openEditContentPicker()}
                  >
                    <Text style={{ color: editContentKey ? shell.pageTitle : shell.pageKicker }}>
                      {editContentLoading
                        ? 'Chargement des lieux…'
                        : contentOptionLabel(editContentKey, editContentOptions)}
                    </Text>
                  </Pressable>
                </>
              )}
              <Pressable style={[styles.addPartnerBtn, { borderColor: shell.filterInactiveBorder }]} onPress={addEditPartner}>
                <Text style={{ color: shell.tabIndicator, fontWeight: '700' }}>+ Ajouter partenaire et lieu</Text>
              </Pressable>
              <View style={styles.catalogPick}>
                {editPartners.map((p) => (
                  <Pressable
                    key={offeringIdentityKey(p)}
                    style={[styles.chip, { borderColor: shell.filterInactiveBorder, backgroundColor: 'rgba(201,168,76,0.25)' }]}
                    onPress={() => setEditPartners((prev) => prev.filter((entry) => offeringIdentityKey(entry) !== offeringIdentityKey(p)))}
                  >
                    <Text style={{ color: shell.pageTitle, fontSize: 9, fontWeight: '700' }}>
                      {p.displayName} · {formatOfferingScopeLabel(p.contentType, p.contentTitle)} ×
                    </Text>
                  </Pressable>
                ))}
              </View>
            </KeyboardAwareFormScroll>
            <Pressable style={[styles.submit, { backgroundColor: shell.tabIndicator, marginHorizontal: 16 }]} onPress={() => void handleSaveEdit()}>
              <Text style={styles.submitText}>Enregistrer</Text>
            </Pressable>
            <Pressable style={styles.modalClose} onPress={() => setEditingItem(null)}>
              <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <PartnerPicker
        visible={editPartnerPickerOpen}
        title="Compte partenaire à associer"
        options={editPartnerPickerOptions}
        selectedId={editPartnerId}
        onSelect={setEditPartnerId}
        onClose={() => setEditPartnerPickerOpen(false)}
        shell={shell}
      />

      <PartnerPicker
        visible={editContentPickerOpen}
        title="Lieu de validité"
        options={editContentPickerOptions}
        selectedId={editContentKey}
        onSelect={setEditContentKey}
        onClose={() => setEditContentPickerOpen(false)}
        emptyMessage={
          editContentLoading
            ? 'Chargement des lieux…'
            : 'Aucun contenu publié — « Tous les établissements » reste disponible après rechargement.'
        }
        shell={shell}
      />

      <Modal visible={detailItem != null} transparent animationType="slide" onRequestClose={() => setDetailItem(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}>
            {detailItem ? (
              <>
                <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>{detailItem.title}</Text>
                <KeyboardAwareFormScroll style={styles.editForm} nestedScrollEnabled keyboardPriority={10}>
                  <DetailRow label="Description" value={detailItem.description} shell={shell} />
                  <DetailRow label="Type" value={BENEFIT_KIND_LABELS[detailItem.benefitKind]} shell={shell} />
                  {detailItem.benefitKind === 'quantity' && detailItem.quantityPerGrant ? (
                    <DetailRow label="Quantité" value={`×${detailItem.quantityPerGrant}`} shell={shell} />
                  ) : null}
                  {detailItem.benefitKind === 'usage_limit' && detailItem.maxUsesPerGrant ? (
                    <DetailRow label="Utilisations max" value={String(detailItem.maxUsesPerGrant)} shell={shell} />
                  ) : null}
                  <DetailRow label="Finalité" value={BENEFIT_PURPOSE_LABELS[detailItem.benefitPurpose ?? 'standard']} shell={shell} />
                  <DetailRow label="Validité" value={`Jusqu’au ${formatValidityEndFromDays(detailItem.defaultValidityDays)} (${detailItem.defaultValidityDays} j.)`} shell={shell} />
                  <DetailRow
                    label="Statut"
                    value={
                      partnerOffers.some((o) => o.catalogId === detailItem.id && o.status === 'pending')
                        ? 'Inactif · en cours de validation partenaire'
                        : detailItem.isActive
                          ? 'Actif'
                          : 'Inactif'
                    }
                    shell={shell}
                  />
                  <DetailRow
                    label="Partenaires"
                    value={detailItem.offeringPartners
                      .map((p) => `${p.displayName} — ${formatOfferingScopeLabel(p.contentType, p.contentTitle)}`)
                      .join(' · ')}
                    shell={shell}
                  />
                  {detailItem.countryCode ? <DetailRow label="Pays" value={detailItem.countryCode} shell={shell} /> : null}
                  {detailItem.city ? <DetailRow label="Ville" value={detailItem.city} shell={shell} /> : null}
                  <DetailRow label="Créé le" value={formatDateFr(detailItem.createdAt)} shell={shell} />
                  <DetailRow label="Mis à jour" value={formatDateFr(detailItem.updatedAt)} shell={shell} />
                  {usageByCatalogId.get(detailItem.id) ? (
                    <DetailRow
                      label="Utilisation"
                      value={`${usageByCatalogId.get(detailItem.id)!.used} utilisé(s) · ${usageByCatalogId.get(detailItem.id)!.granted} octroyé(s)`}
                      shell={shell}
                    />
                  ) : null}
                </KeyboardAwareFormScroll>
                <Pressable style={styles.modalClose} onPress={() => setDetailItem(null)}>
                  <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Fermer</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={detailOffer != null} transparent animationType="slide" onRequestClose={() => setDetailOffer(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}>
            {detailOffer ? (
              <>
                <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>Détail validation</Text>
                <KeyboardAwareFormScroll style={styles.editForm} nestedScrollEnabled keyboardPriority={10}>
                  <DetailRow label="Privilège" value={detailOffer.catalogTitle} shell={shell} />
                  <DetailRow label="Description" value={detailOffer.catalogDescription || '—'} shell={shell} />
                  <DetailRow label="Partenaire" value={detailOffer.partnerName} shell={shell} />
                  <DetailRow label="Statut" value={PARTNER_OFFER_STATUS_LABELS[detailOffer.status]} shell={shell} />
                  <DetailRow
                    label="Lieu de validité"
                    value={formatOfferingScopeLabel(detailOffer.contentType, detailOffer.contentTitle)}
                    shell={shell}
                  />
                  {detailOffer.defaultValidityDays != null ? (
                    <DetailRow label="Validité" value={`Jusqu’au ${formatValidityEndFromDays(detailOffer.defaultValidityDays ?? 30)} (${detailOffer.defaultValidityDays ?? 30} j.)`} shell={shell} />
                  ) : null}
                  {detailOffer.benefitKind ? (
                    <DetailRow
                      label="Type"
                      value={BENEFIT_KIND_LABELS[detailOffer.benefitKind as BenefitKind] ?? detailOffer.benefitKind}
                      shell={shell}
                    />
                  ) : null}
                  <DetailRow label="Pays" value={detailOffer.countryCode} shell={shell} />
                  {detailOffer.city ? <DetailRow label="Ville" value={detailOffer.city} shell={shell} /> : null}
                  <DetailRow label="Créé le" value={formatDateFr(detailOffer.createdAt)} shell={shell} />
                  {detailOffer.respondedAt ? (
                    <DetailRow label="Répondu le" value={formatDateFr(detailOffer.respondedAt)} shell={shell} />
                  ) : null}
                  {detailOffer.status === 'declined' ? (
                    <DetailRow
                      label="Motif du refus partenaire"
                      value={detailOffer.partnerResponseNote?.trim() || 'Aucun motif saisi'}
                      shell={shell}
                    />
                  ) : detailOffer.partnerResponseNote ? (
                    <DetailRow label="Note partenaire" value={detailOffer.partnerResponseNote} shell={shell} />
                  ) : null}
                  {detailOffer.adminNote ? <DetailRow label="Note admin" value={detailOffer.adminNote} shell={shell} /> : null}
                </KeyboardAwareFormScroll>
                <Pressable style={styles.modalClose} onPress={() => setDetailOffer(null)}>
                  <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Fermer</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

function DetailRow({
  label,
  value,
  shell,
}: {
  label: string;
  value: string;
  shell: ReturnType<typeof useMemberTheme>['shell'];
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: shell.pageKicker, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color: shell.pageTitle, fontSize: 13, marginTop: 4, lineHeight: 20 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tabBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(148,163,184,0.15)' },
  suiviHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 },
  unusedBadge: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: '#f59e0b',
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 8 },
  hint: { fontSize: 11, marginBottom: 8, lineHeight: 16, fontStyle: 'italic' },
  roleSummary: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  roleCheck: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8, fontSize: 14 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  audienceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  catalogPick: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  partnerBlock: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  scheduleRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  scheduleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(148,163,184,0.15)' },
  submit: { marginTop: 16, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitText: { fontWeight: '800', color: '#fff' },
  section: { marginTop: 24, marginBottom: 8, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  cardMeta: { marginTop: 4, fontSize: 11 },
  cardBody: { marginTop: 4, fontSize: 12 },
  usageLine: { marginTop: 6, fontSize: 11, fontWeight: '700' },
  cardActions: { flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  statRow: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 6 },
  associateToggle: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  addPartnerBtn: { borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 8 },
  editForm: { maxHeight: 360, paddingHorizontal: 16, flexGrow: 0 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: { borderWidth: 1, borderRadius: 16, maxHeight: '80%', margin: 12, marginBottom: 24 },
  modalTitle: { fontSize: 16, fontWeight: '800', paddingHorizontal: 16, paddingTop: 16 },
  modalList: { maxHeight: 400 },
  emptyBeneficiaries: { paddingHorizontal: 16, paddingVertical: 24, fontSize: 13, textAlign: 'center', fontStyle: 'italic' },
  beneficiaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalClose: { alignItems: 'center', paddingVertical: 14 },
});
