import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { AdminPageHeader } from '@/components/admin/AdminShell';
import { AdminTabMenu } from '@/components/admin/AdminTabMenu';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { TogglePill } from '@/components/admin/TogglePill';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminModuleAccess, useFilteredAdminTabs } from '@/hooks/useAdminModuleAccess';
import type { CountryCode } from '@/lib/countries';
import {
  isPartnerAssociatedBenefit,
  listBenefitCatalog,
  syncCatalogPartnerDirectoryLinks,
  type BenefitCatalogItem,
} from '@/lib/benefit-catalog-store';
import { resolveCountryCode } from '@/lib/admin-country';
import { isSuperAdminAccount } from '@/lib/role-benefit-eligibility';
import { syncUserRoleBenefitEntitlements } from '@/lib/prime-benefits-store';
import {
  catalogEntryFromItem,
  getStaffBenefitOverrides,
  isTeamBenefitEnabledForUser,
  setTeamBenefitEnabledForUser,
  type StaffBenefitOverrides,
} from '@/lib/staff-benefit-overrides-store';
import {
  getStaffTeamPackForCountry,
  saveStaffTeamPackForCountry,
} from '@/lib/staff-team-pack-store';
import { catalogForCountry } from '@/lib/staff-benefit-utils';
import { listRegistryUsers } from '@/lib/user-registry-store';
import type { RoleBenefitEntitlementEntry } from '@/lib/role-benefit-entitlements-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import type { User } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminStaffBenefits'>;
type Tab = 'founder' | 'team';

function registryToUser(
  registryUser: Awaited<ReturnType<typeof listRegistryUsers>>[number],
  fallbackCountry: CountryCode,
): User {
  return {
    id: registryUser.id,
    email: registryUser.email,
    phoneNumber: registryUser.phoneNumber,
    firstName: registryUser.firstName,
    lastName: registryUser.lastName,
    fullName:
      `${registryUser.firstName ?? ''} ${registryUser.lastName ?? ''}`.trim() ||
      registryUser.email ||
      'Membre',
    userRole: registryUser.userRole as User['userRole'],
    role: registryUser.role,
    subscriptionStatus: registryUser.subscriptionStatus ?? 'none',
    subscriptionExpiresAt: registryUser.subscriptionExpiresAt ?? null,
    countryCode: registryUser.countryCode ?? fallbackCountry,
    city: registryUser.city ?? null,
    qrCodeToken: '',
    avatarUrl: null,
    company: null,
    jobTitle: null,
    sector: null,
    isDirectoryOptIn: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as User;
}

export function AdminStaffBenefitsScreen({ navigation }: Props) {
  const { user, role } = useAuthContext();
  const { countryCode, countryLabel } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('staff_benefits');
  const isFounder = user ? isSuperAdminAccount(user) : false;

  const [tab, setTab] = useState<Tab>(isFounder ? 'founder' : 'team');
  const [allCatalog, setAllCatalog] = useState<BenefitCatalogItem[]>([]);
  const [teamDraft, setTeamDraft] = useState<RoleBenefitEntitlementEntry[]>([]);
  const [search, setSearch] = useState('');
  const [founderOverrides, setFounderOverrides] = useState<StaffBenefitOverrides | null>(null);
  const [tick, setTick] = useState(0);
  const founderWriteAtRef = useRef(0);

  const teamSelectableCatalog = useMemo(
    () => allCatalog.filter((item) => item.isActive && isPartnerAssociatedBenefit(item)),
    [allCatalog],
  );

  const countryCatalog = useMemo(
    () => catalogForCountry(teamSelectableCatalog, countryCode),
    [teamSelectableCatalog, countryCode],
  );

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return countryCatalog;
    return countryCatalog.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.offeringPartners.some((p) => p.displayName.toLowerCase().includes(q)),
    );
  }, [countryCatalog, search]);

  const load = useCallback(async () => {
    await syncCatalogPartnerDirectoryLinks(countryCode);
    const [items, pack] = await Promise.all([
      listBenefitCatalog(true),
      getStaffTeamPackForCountry(countryCode),
    ]);
    setAllCatalog(items);
    setTeamDraft(pack);
    if (user && isSuperAdminAccount(user)) {
      const overrides = await getStaffBenefitOverrides(user.id);
      if (Date.now() - founderWriteAtRef.current < 4_000) return;
      setFounderOverrides(overrides);
    }
  }, [countryCode, user]);

  useEffect(() => {
    if (role === 'ADMIN') void load();
  }, [role, load, tick]);

  const inputStyle = [
    styles.input,
    { backgroundColor: shell.filterInactiveBg, borderColor: shell.filterInactiveBorder, color: shell.pageTitle },
  ];

  async function syncAdminsOfCountry(cc: CountryCode): Promise<void> {
    const registry = await listRegistryUsers();
    for (const u of registry) {
      // platform_roles : slug `admin` (délégué) vs `super_admin` — même app_role / is_admin
      if ((u.userRole ?? '').toLowerCase() !== 'admin') continue;
      const adminCc = resolveCountryCode(u.countryCode, u.phoneNumber) as CountryCode;
      if (adminCc !== cc) continue;
      await syncUserRoleBenefitEntitlements(registryToUser(u, cc)).catch(() => undefined);
    }
  }

  async function handleFounderToggle(catalogId: string, enabled: boolean) {
    if (!user) return;
    const previous = founderOverrides;
    founderWriteAtRef.current = Date.now();
    setFounderOverrides((prev) => {
      if (!prev) return prev;
      const enabledSet = new Set(prev.enabledCatalogIds);
      if (enabled) enabledSet.add(catalogId);
      else enabledSet.delete(catalogId);
      return {
        ...prev,
        enabledCatalogIds: Array.from(enabledSet),
        updatedAt: new Date().toISOString(),
      };
    });
    try {
      const saved = await setTeamBenefitEnabledForUser(
        user.id,
        catalogId,
        enabled,
        true,
        user.id,
      );
      setFounderOverrides(saved);
      await syncUserRoleBenefitEntitlements(user);
    } catch (e) {
      console.warn('[TEAMS] founder toggle:', e);
      setFounderOverrides(previous);
      setTick((t) => t + 1);
    }
  }

  async function handleTeamToggle(catalogId: string, enabled: boolean) {
    const item = countryCatalog.find((c) => c.id === catalogId);
    if (!item) return;

    const previous = teamDraft;
    const next = enabled
      ? [...teamDraft.filter((e) => e.catalogId !== catalogId), catalogEntryFromItem(item)]
      : teamDraft.filter((e) => e.catalogId !== catalogId);

    setTeamDraft(next);
    try {
      // Pack Admin = admins uniquement (pas de fusion super admin)
      await saveStaffTeamPackForCountry(countryCode, next, user?.id ?? 'admin');
      void syncAdminsOfCountry(countryCode);
      // Ne pas sync le super admin courant sur le pack équipe
      if (user && !isSuperAdminAccount(user)) {
        void syncUserRoleBenefitEntitlements(user).catch(() => undefined);
      }
    } catch (e) {
      console.warn('[TEAMS] team toggle:', e);
      setTeamDraft(previous);
      setTick((t) => t + 1);
    }
  }

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  const staffSubTabs = useFilteredAdminTabs('staff_benefits', [
    { id: 'team' as const, label: 'Admin', permission: 'staff_benefits_team' },
  ]);

  const tabs: { id: Tab; label: string; badge?: number }[] = isFounder
    ? [
        { id: 'founder', label: 'Super admin' },
        ...staffSubTabs.map((t) => ({ ...t, badge: teamDraft.length })),
      ]
    : staffSubTabs.map((t) => ({ ...t, badge: teamDraft.length }));

  return (
    <KeyboardAwareFormScroll style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
      <AdminPageHeader
        title="Privilèges TEAMS"
        subtitle={`Admins (hors super admin) · ${countryLabel}`}
        shell={shell}
        onBack={() => navigation.goBack()}
      />
      <AdminCountryBar shell={shell} compact />

      <AdminTabMenu tabs={tabs} active={tab} onChange={(t) => setTab(t as Tab)} shell={shell} />

      {tab === 'founder' && isFounder && user && founderOverrides ? (
        <>
          <Text style={[styles.hint, { color: shell.pageKicker }]}>
            Vos privilèges personnels (super admin). Indépendants du pack Admin.
          </Text>
          <TextInput
            style={inputStyle}
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher…"
            placeholderTextColor={shell.pageKicker}
          />
          {filteredCatalog.map((item) => (
            <View
              key={`f-${item.id}`}
              style={[styles.row, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.title, { color: shell.pageTitle }]}>{item.title}</Text>
                <Text style={[styles.meta, { color: shell.pageKicker }]} numberOfLines={1}>
                  {item.offeringPartners.map((p) => p.displayName).join(' · ')}
                </Text>
              </View>
              <TogglePill
                value={isTeamBenefitEnabledForUser(founderOverrides, item.id, true)}
                onChange={(next) => void handleFounderToggle(item.id, next)}
                activeLabel="Oui"
                inactiveLabel="Non"
                activeColor={shell.tabIndicator}
                shell={shell}
              />
            </View>
          ))}
        </>
      ) : null}

      {tab === 'team' ? (
        <>
          <Text style={[styles.hint, { color: shell.pageKicker }]}>
            Pack pour les admins délégués de {countryLabel} (rôle admin, hors super admin). Oui octroie /
            Non retire immédiatement.
          </Text>
          <TextInput
            style={inputStyle}
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher…"
            placeholderTextColor={shell.pageKicker}
          />
          {filteredCatalog.map((item) => {
            const enabled = teamDraft.some((e) => e.catalogId === item.id);
            return (
              <View
                key={`t-${item.id}`}
                style={[styles.row, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.title, { color: shell.pageTitle }]}>{item.title}</Text>
                  <Text style={[styles.meta, { color: shell.pageKicker }]} numberOfLines={1}>
                    {item.offeringPartners.map((p) => p.displayName).join(' · ')}
                  </Text>
                </View>
                <TogglePill
                  value={enabled}
                  onChange={(next) => void handleTeamToggle(item.id, next)}
                  activeLabel="Oui"
                  inactiveLabel="Non"
                  activeColor={shell.tabIndicator}
                  shell={shell}
                />
              </View>
            );
          })}
        </>
      ) : null}
    </KeyboardAwareFormScroll>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  hint: { fontSize: 12, lineHeight: 18, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8, fontSize: 14, textAlignVertical: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  title: { fontSize: 14, fontWeight: '700' },
  meta: { marginTop: 2, fontSize: 11 },
});
