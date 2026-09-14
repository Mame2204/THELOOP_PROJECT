import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoopLogo } from '@/components/LoopLogo';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { ADMIN_THEME } from '@/components/admin/AdminShell';
import { useAdminCatalog } from '@/hooks/useAdminCatalog';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useAdminPermissions } from '@/context/AdminPermissionsContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { listPendingEvents, listPendingSpots } from '@/lib/partner-staging-store';
import { countPartnershipsByStatus } from '@/lib/admin-partnership-store';
import { countPendingSuggestions } from '@/lib/suggestions-store';
import { processActiveAutomationJobs } from '@/lib/admin-automation-runner';
import { processDueScheduledNotifications } from '@/lib/admin-notifications-store';
import { processDueScheduledBenefitGrants } from '@/lib/prime-benefits-store';
import { filterSpotsOnly, filterTools } from '@/lib/location-kind-utils';
import type { AdminPermissionId } from '@/lib/admin-permissions';
import { navigateRoot } from '@/lib/navigation-utils';
import { LOOP_GOLD } from '@/lib/theme-config';
import type { TabScreenProps } from '@/navigation/types';
import type { RootStackParamList } from '@/navigation/types';

type Props = TabScreenProps<'AdminTower'>;

type NavItem = {
  icon: string;
  label: string;
  badge?: number;
  route: keyof RootStackParamList;
  params?: object;
  permission: AdminPermissionId;
};

export function AdminControlTowerScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { role } = useAuthContext();
  const { hasPermission, isSuperAdmin } = useAdminPermissions();
  const { countryCode, countryLabel } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { publicEvents, getHomeLocations, refresh, isLoading } = useAdminCatalog();
  const [pendingEvents, setPendingEvents] = useState(0);
  const [pendingSpots, setPendingSpots] = useState(0);
  const [pendingTools, setPendingTools] = useState(0);
  const [partnershipPending, setPartnershipPending] = useState(0);
  const [suggestionsPending, setSuggestionsPending] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const loadMetaSeq = useRef(0);
  const lastJobsAtRef = useRef(0);

  const locations = getHomeLocations();
  const pureSpots = useMemo(() => filterSpotsOnly(locations), [locations]);
  const tools = useMemo(() => filterTools(locations), [locations]);

  const loadMeta = useCallback(async (options?: { runJobs?: boolean }) => {
    const seq = ++loadMetaSeq.current;
    const [ev, sp, pCounts, sugPending] = await Promise.all([
      listPendingEvents(countryCode),
      listPendingSpots(countryCode),
      countPartnershipsByStatus(countryCode),
      countPendingSuggestions(countryCode),
    ]);
    if (seq !== loadMetaSeq.current) return;
    setPendingEvents(ev.length);
    setPendingSpots(sp.filter((s) => s.subCategory !== 'tools').length);
    setPendingTools(sp.filter((s) => s.subCategory === 'tools').length);
    setPartnershipPending(pCounts.pending + pCounts.to_contact + pCounts.in_discussion);
    setSuggestionsPending(sugPending);

    // Jobs lourds : uniquement pull-to-refresh / démarrage espacé — pas à chaque focus (egress).
    if (options?.runJobs) {
      await processActiveAutomationJobs(countryCode, { getHomeLocations });
      await processDueScheduledNotifications();
      await processDueScheduledBenefitGrants();
    }
  }, [getHomeLocations, countryCode]);

  useEffect(() => {
    if (role !== 'ADMIN') return;
    // Un seul fetch meta ; jobs lourds au plus toutes les 10 min (pas à chaque focus).
    const now = Date.now();
    const runJobs = now - lastJobsAtRef.current > 10 * 60_000;
    if (runJobs) lastJobsAtRef.current = now;
    void loadMeta({ runJobs });
  }, [role, loadMeta]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    lastJobsAtRef.current = Date.now();
    await Promise.all([refresh(), loadMeta({ runJobs: true })]);
    setRefreshing(false);
  }, [refresh, loadMeta]);

  if (role !== 'ADMIN') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={[styles.deniedTitle, { color: shell.pageTitle }]}>Accès réservé</Text>
        <Text style={[styles.deniedBody, { color: shell.pageKicker }]}>
          Control Tower — administrateurs uniquement.
        </Text>
        <Pressable onPress={() => navigation.navigate('Agenda')}>
          <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700' }}>← Retour</Text>
        </Pressable>
      </View>
    );
  }

  const moderationCount = pendingEvents + pendingSpots + pendingTools;

  const navItems = [
    { icon: '📅', label: 'Contenu', route: 'AdminContent', permission: 'content' },
    { icon: '🏆', label: 'À la une', route: 'AdminFeatured', permission: 'featured' },
    { icon: '📊', label: 'Insights', route: 'AdminInsights', permission: 'insights' },
    { icon: '👥', label: 'Utilisateurs', route: 'AdminUsers', permission: 'users' },
    {
      icon: '📥',
      label: 'Demandes',
      badge: (partnershipPending + suggestionsPending + moderationCount) || undefined,
      route: 'AdminDemandes',
      permission: 'partnerships',
    },
    { icon: '🎁', label: 'Privilèges', route: 'AdminPrimeBenefits', permission: 'prime_benefits' },
    { icon: '🛡️', label: 'Privilèges TEAMS', route: 'AdminStaffBenefits', permission: 'prime_benefits' },
    { icon: '🎲', label: 'Tirage au sort', route: 'AdminBenefitDraw', permission: 'benefit_draw' },
    ...(isSuperAdmin
      ? ([
          {
            icon: '🎫',
            label: 'Gestion PASS',
            route: 'AdminPassManagement',
            permission: 'pass_management',
          },
          {
            icon: '⚙️',
            label: 'Paramètres',
            route: 'AdminSuperSettings',
            permission: 'manage_admins',
          },
        ] as const)
      : []),
  ].filter((m) => hasPermission(m.permission as AdminPermissionId)) as NavItem[];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || isLoading}
            onRefresh={() => void onRefresh()}
            tintColor={LOOP_GOLD}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <LoopLogo variant="app" size="md" showTagline={false} />
          <View style={styles.brandText}>
            <Text style={styles.brandKicker}>Control Tower</Text>
            <Text style={styles.brandCountry} numberOfLines={1}>
              {countryLabel}
            </Text>
          </View>
        </View>

        <View style={styles.countryWrap}>
          <AdminCountryBar shell={shell} />
        </View>

        <View style={styles.kpiRow}>
          <View style={styles.kpiChip}>
            <Text style={styles.kpiValue}>{publicEvents.length}</Text>
            <Text style={styles.kpiLabel}>Events</Text>
          </View>
          <View style={styles.kpiChip}>
            <Text style={styles.kpiValue}>{pureSpots.length}</Text>
            <Text style={styles.kpiLabel}>Spots</Text>
          </View>
          <View style={styles.kpiChip}>
            <Text style={styles.kpiValue}>{tools.length}</Text>
            <Text style={styles.kpiLabel}>Outils</Text>
          </View>
        </View>

        <Text style={styles.navSection}>Navigation</Text>

        <View style={styles.navList}>
          {navItems.map((item) => (
            <Pressable
              key={`${item.route}-${item.label}`}
              onPress={() => navigateRoot(navigation, item.route, item.params as never)}
              style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <Text style={styles.navIcon}>{item.icon}</Text>
              <Text style={styles.navLabel} numberOfLines={1}>
                {item.label}
              </Text>
              {item.badge != null && item.badge > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge > 99 ? '99+' : item.badge}</Text>
                </View>
              ) : (
                <Text style={styles.chevron}>›</Text>
              )}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  brandText: { flex: 1, minWidth: 0 },
  brandKicker: {
    color: LOOP_GOLD,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  brandCountry: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
  },
  countryWrap: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  kpiChip: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  kpiValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  kpiLabel: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  navSection: {
    marginBottom: 8,
    marginLeft: 4,
    color: 'rgba(255,255,255,0.35)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  navList: {
    gap: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  navItemPressed: {
    backgroundColor: 'rgba(201,168,76,0.18)',
    borderColor: 'rgba(201,168,76,0.45)',
  },
  navIcon: {
    fontSize: 16,
    width: 24,
    textAlign: 'center',
  },
  navLabel: {
    flex: 1,
    color: '#f5f5f5',
    fontSize: 13,
    fontWeight: '700',
  },
  chevron: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 18,
    fontWeight: '300',
  },
  badge: {
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: LOOP_GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#0a0a0a',
    fontSize: 10,
    fontWeight: '800',
  },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  deniedTitle: { fontSize: 18, fontWeight: '700' },
  deniedBody: { marginTop: 8, marginBottom: 16, textAlign: 'center', fontSize: 14 },
});
