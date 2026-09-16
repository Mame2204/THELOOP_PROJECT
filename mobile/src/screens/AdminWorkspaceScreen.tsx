import { useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useContent } from '@/context/ContentContext';
import { runAdminBackgroundJobs } from '@/lib/admin-background-runner';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  AdminSidebar,
  type AdminSidebarItem,
  type AdminSidebarKey,
} from '@/components/admin/AdminSidebar';
import { lazyScreen } from '@/navigation/lazyScreen';
import { useAdminPermissions } from '@/context/AdminPermissionsContext';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { listPendingEvents, listPendingSpots } from '@/lib/partner-staging-store';
import { countPartnershipsByStatus } from '@/lib/admin-partnership-store';
import { countWithdrawalRequests } from '@/lib/partner-withdrawal-request';
import { countPendingSuggestions } from '@/lib/suggestions-store';
import type { AdminPermissionId } from '@/lib/admin-permissions';
import type { AdminPanelParamList } from '@/navigation/types';

const Panel = createNativeStackNavigator<AdminPanelParamList>();

const AdminInsightsScreen = lazyScreen(
  () => require('@/screens/AdminInsightsScreen').AdminInsightsScreen,
  'AdminInsights',
);
const AdminAccueilScreen = lazyScreen(
  () => require('@/screens/AdminAccueilScreen').AdminAccueilScreen,
  'AdminAccueil',
);
const AdminRubriqueScreen = lazyScreen(
  () => require('@/screens/AdminRubriqueScreen').AdminRubriqueScreen,
  'AdminRubrique',
);
const AdminLoopScreen = lazyScreen(
  () => require('@/screens/AdminLoopScreen').AdminLoopScreen,
  'AdminLoopHub',
);
const AdminContentScreen = lazyScreen(
  () => require('@/screens/AdminContentScreen').AdminContentScreen,
  'AdminContent',
);
const AdminSpotStarsScreen = lazyScreen(
  () => require('@/screens/AdminSpotStarsScreen').AdminSpotStarsScreen,
  'AdminSpotStars',
);
const AdminFeaturedScreen = lazyScreen(
  () => require('@/screens/AdminFeaturedScreen').AdminFeaturedScreen,
  'AdminFeatured',
);
const AdminUsersScreen = lazyScreen(
  () => require('@/screens/AdminUsersScreen').AdminUsersScreen,
  'AdminUsers',
);
const AdminDemandesScreen = lazyScreen(
  () => require('@/screens/AdminDemandesScreen').AdminDemandesScreen,
  'AdminDemandes',
);
const AdminPartnershipsScreen = lazyScreen(
  () => require('@/screens/AdminPartnershipsScreen').AdminPartnershipsScreen,
  'AdminPartnerships',
);
const AdminSuggestionsScreen = lazyScreen(
  () => require('@/screens/AdminSuggestionsScreen').AdminSuggestionsScreen,
  'AdminSuggestions',
);
const AdminPrimeBenefitsScreen = lazyScreen(
  () => require('@/screens/AdminPrimeBenefitsScreen').AdminPrimeBenefitsScreen,
  'AdminPrimeBenefits',
);
const AdminStaffBenefitsScreen = lazyScreen(
  () => require('@/screens/AdminStaffBenefitsScreen').AdminStaffBenefitsScreen,
  'AdminStaffBenefits',
);
const AdminBenefitDrawScreen = lazyScreen(
  () => require('@/screens/AdminBenefitDrawScreen').AdminBenefitDrawScreen,
  'AdminBenefitDraw',
);
const AdminModerationScreen = lazyScreen(
  () => require('@/screens/AdminModerationScreen').AdminModerationScreen,
  'AdminModeration',
);
const AdminPassManagementScreen = lazyScreen(
  () => require('@/screens/AdminPassManagementScreen').AdminPassManagementScreen,
  'AdminPassManagement',
);
const AdminPaymentsScreen = lazyScreen(
  () => require('@/screens/AdminPaymentsScreen').AdminPaymentsScreen,
  'AdminPayments',
);
const AdminSuperSettingsScreen = lazyScreen(
  () => require('@/screens/AdminSuperSettingsScreen').AdminSuperSettingsScreen,
  'AdminSuperSettings',
);

const ROUTE_TO_KEY: Partial<Record<keyof AdminPanelParamList, AdminSidebarKey>> = {
  AdminAccueil: 'accueil',
  AdminRubrique: 'appTabs',
  AdminLoopHub: 'loop',
  AdminContent: 'content',
  /** Étoiles : accessible via Paramètres uniquement — surbrillance Param. */
  AdminSpotStars: 'settings',
  AdminInsights: 'insights',
  AdminUsers: 'users',
  AdminDemandes: 'demandes',
  AdminPartnerships: 'demandes',
  AdminSuggestions: 'demandes',
  AdminPrimeBenefits: 'benefits',
  AdminStaffBenefits: 'staff',
  AdminBenefitDraw: 'draw',
  AdminModeration: 'demandes',
  AdminPassManagement: 'pass',
  AdminPayments: 'pass',
  AdminSuperSettings: 'settings',
};

type SidebarNav =
  | { kind: 'route'; route: keyof AdminPanelParamList }
  | { kind: 'rubrique'; rubrique: 'visibility' };

const KEY_TO_NAV: Record<AdminSidebarKey, SidebarNav> = {
  accueil: { kind: 'route', route: 'AdminAccueil' },
  appTabs: { kind: 'rubrique', rubrique: 'visibility' },
  loop: { kind: 'route', route: 'AdminLoopHub' },
  content: { kind: 'route', route: 'AdminContent' },
  insights: { kind: 'route', route: 'AdminInsights' },
  users: { kind: 'route', route: 'AdminUsers' },
  demandes: { kind: 'route', route: 'AdminDemandes' },
  partnerships: { kind: 'route', route: 'AdminDemandes' },
  suggestions: { kind: 'route', route: 'AdminDemandes' },
  benefits: { kind: 'route', route: 'AdminPrimeBenefits' },
  staff: { kind: 'route', route: 'AdminStaffBenefits' },
  draw: { kind: 'route', route: 'AdminBenefitDraw' },
  moderation: { kind: 'route', route: 'AdminDemandes' },
  pass: { kind: 'route', route: 'AdminPassManagement' },
  settings: { kind: 'route', route: 'AdminSuperSettings' },
};

/** Split admin : barre noire à gauche + détail blanc à droite. */
export function AdminWorkspaceScreen() {
  const { hasPermission, isSuperAdmin } = useAdminPermissions();
  const { countryCode } = useAdminCountry();
  const { getHomeLocations } = useContent();
  const [moderationCount, setModerationCount] = useState(0);
  const [partnershipPending, setPartnershipPending] = useState(0);
  const [suggestionsPending, setSuggestionsPending] = useState(0);
  const [withdrawalsPending, setWithdrawalsPending] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [ev, sp, pCounts, sug, withdrawals] = await Promise.all([
        listPendingEvents(countryCode),
        listPendingSpots(countryCode),
        countPartnershipsByStatus(countryCode),
        countPendingSuggestions(countryCode),
        countWithdrawalRequests(countryCode),
      ]);
      if (cancelled) return;
      setModerationCount(
        ev.length +
          sp.filter((s) => s.subCategory !== 'tools').length +
          sp.filter((s) => s.subCategory === 'tools').length,
      );
      setPartnershipPending(pCounts.pending + pCounts.to_contact + pCounts.in_discussion);
      setSuggestionsPending(sug);
      setWithdrawalsPending(withdrawals);
    })();
    return () => {
      cancelled = true;
    };
  }, [countryCode]);

  useEffect(() => {
    const tick = () => void runAdminBackgroundJobs(countryCode, getHomeLocations);
    tick();
    const interval = setInterval(tick, 60_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [countryCode, getHomeLocations]);

  const items = useMemo((): AdminSidebarItem[] => {
    const all: Array<AdminSidebarItem & { permission?: AdminPermissionId; superOnly?: boolean }> = [
      { key: 'insights', icon: '📊', label: 'Insights', permission: 'insights' },
      { key: 'accueil', icon: '🏠', label: 'Accueil', permission: 'featured' },
      { key: 'appTabs', icon: '📱', label: 'Onglets', permission: 'rubrique' },
      { key: 'loop', icon: '✨', label: 'THE LOOP', permission: 'loop_hub' },
      { key: 'content', icon: '🗂', label: 'Contenu', permission: 'content' },
      { key: 'users', icon: '👥', label: 'Users', permission: 'users' },
      {
        key: 'demandes',
        icon: '📥',
        label: 'Demandes',
        badge: (partnershipPending + moderationCount + suggestionsPending + withdrawalsPending) || undefined,
        permission: undefined,
      },
      { key: 'benefits', icon: '🎁', label: 'Privilèges', permission: 'prime_benefits' },
      { key: 'staff', icon: '🛡️', label: 'TEAMS', permission: 'staff_benefits' },
      { key: 'draw', icon: '🎲', label: 'Tirage', permission: 'benefit_draw' },
      { key: 'pass', icon: '🎫', label: 'PASS', permission: 'pass_management' },
      { key: 'settings', icon: '⚙️', label: 'Param.', permission: 'manage_admins' },
    ];

    return all
      .filter((item) => {
        if (item.key === 'demandes') {
          return (
            hasPermission('partnerships') ||
            hasPermission('moderation') ||
            hasPermission('suggestions')
          );
        }
        if (!item.permission) return true;
        return hasPermission(item.permission);
      })
      .map((entry) => {
        const { permission, superOnly, ...item } = entry;
        void permission;
        void superOnly;
        return item;
      });
  }, [
    hasPermission,
    isSuperAdmin,
    moderationCount,
    partnershipPending,
    suggestionsPending,
  ]);

  return (
    <Panel.Navigator
      initialRouteName="AdminInsights"
      layout={({ children, state, navigation }) => {
        const routeName = state.routes[state.index ?? 0]?.name as keyof AdminPanelParamList;
        let activeKey: AdminSidebarKey = ROUTE_TO_KEY[routeName] ?? 'insights';
        if (routeName === 'AdminRubrique') {
          activeKey = 'appTabs';
        }
        return (
          <View style={styles.root}>
            <AdminSidebar
              items={items}
              activeKey={activeKey}
              onSelect={(key) => {
                const nav = KEY_TO_NAV[key];
                if (nav.kind === 'rubrique') {
                  navigation.navigate('AdminRubrique', { rubrique: nav.rubrique });
                  return;
                }
                if (nav.route === 'AdminDemandes') {
                  navigation.navigate('AdminDemandes', {});
                  return;
                }
                if (nav.route === 'AdminModeration') {
                  navigation.navigate('AdminModeration', { tab: 'events' });
                  return;
                }
                navigation.navigate(nav.route as never);
              }}
            />
            <View style={styles.panel}>{children}</View>
          </View>
        );
      }}
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: '#ffffff' },
        lazy: true,
      }}
    >
      <Panel.Screen name="AdminInsights" component={AdminInsightsScreen} />
      <Panel.Screen name="AdminAccueil" component={AdminAccueilScreen} />
      <Panel.Screen name="AdminRubrique" component={AdminRubriqueScreen} />
      <Panel.Screen name="AdminLoopHub" component={AdminLoopScreen} />
      <Panel.Screen name="AdminContent" component={AdminContentScreen} />
      <Panel.Screen name="AdminSpotStars" component={AdminSpotStarsScreen} />
      <Panel.Screen name="AdminFeatured" component={AdminFeaturedScreen} />
      <Panel.Screen name="AdminUsers" component={AdminUsersScreen} />
      <Panel.Screen name="AdminDemandes" component={AdminDemandesScreen} />
      <Panel.Screen name="AdminPartnerships" component={AdminPartnershipsScreen} />
      <Panel.Screen name="AdminSuggestions" component={AdminSuggestionsScreen} />
      <Panel.Screen name="AdminPrimeBenefits" component={AdminPrimeBenefitsScreen} />
      <Panel.Screen name="AdminStaffBenefits" component={AdminStaffBenefitsScreen} />
      <Panel.Screen name="AdminBenefitDraw" component={AdminBenefitDrawScreen} />
      <Panel.Screen name="AdminModeration" component={AdminModerationScreen} />
      <Panel.Screen name="AdminPassManagement" component={AdminPassManagementScreen} />
      <Panel.Screen name="AdminPayments" component={AdminPaymentsScreen} />
      <Panel.Screen name="AdminSuperSettings" component={AdminSuperSettingsScreen} />
    </Panel.Navigator>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
  },
  panel: {
    flex: 1,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
});
