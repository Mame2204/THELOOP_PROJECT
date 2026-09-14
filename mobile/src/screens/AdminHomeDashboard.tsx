import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { AdminKpiCard, AdminPageHeader, ADMIN_THEME } from '@/components/admin/AdminShell';
import { useContent } from '@/context/ContentContext';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { listPendingEvents, listPendingSpots } from '@/lib/partner-staging-store';
import { countPartnershipsByStatus } from '@/lib/admin-partnership-store';
import { countPendingSuggestions } from '@/lib/suggestions-store';
import { processActiveAutomationJobs } from '@/lib/admin-automation-runner';
import { processDueScheduledNotifications } from '@/lib/admin-notifications-store';
import { processDueScheduledBenefitGrants } from '@/lib/prime-benefits-store';
import { getPlebiscitedWinners } from '@/lib/admin-insights-store';
import { filterLiveCatalogContent } from '@/lib/admin-catalog-filter';
import { filterSpotsOnly, filterTools } from '@/lib/location-kind-utils';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { PlebiscitedCategoryWinner } from '@/lib/admin-types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AdminPanelParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AdminPanelParamList, 'AdminAccueil'>;

/** Accueil Control Tower — panneau blanc (détail à droite de la barre). */
export function AdminHomeDashboard({ navigation }: Props) {
  const { role } = useAuthContext();
  const { countryCode, countryLabel } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { publicEvents, getHomeLocations, refresh, isLoading } = useContent();
  const [pendingEvents, setPendingEvents] = useState(0);
  const [pendingSpots, setPendingSpots] = useState(0);
  const [pendingTools, setPendingTools] = useState(0);
  const [partnershipApproved, setPartnershipApproved] = useState(0);
  const [partnershipPending, setPartnershipPending] = useState(0);
  const [suggestionsPending, setSuggestionsPending] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [plebiscitedItems, setPlebiscitedItems] = useState<PlebiscitedCategoryWinner[]>([]);
  const loadMetaSeq = useRef(0);

  const locations = getHomeLocations();
  const pureSpots = useMemo(() => filterSpotsOnly(locations), [locations]);
  const tools = useMemo(() => filterTools(locations), [locations]);
  const toolIds = useMemo(() => new Set(tools.map((t) => t.id)), [tools]);

  const loadMeta = useCallback(async () => {
    const seq = ++loadMetaSeq.current;
    const [ev, sp, pCounts, sugPending] = await Promise.all([
      listPendingEvents(countryCode),
      listPendingSpots(countryCode),
      countPartnershipsByStatus(countryCode),
      countPendingSuggestions(countryCode),
    ]);
    setPendingEvents(ev.length);
    setPendingSpots(sp.filter((s) => s.subCategory !== 'tools').length);
    setPendingTools(sp.filter((s) => s.subCategory === 'tools').length);
    setPartnershipApproved(pCounts.approved);
    setPartnershipPending(pCounts.pending + pCounts.to_contact + pCounts.in_discussion);
    setSuggestionsPending(sugPending);

    await processActiveAutomationJobs(countryCode, { getHomeLocations });
    await processDueScheduledNotifications();
    await processDueScheduledBenefitGrants();

    const live = await filterLiveCatalogContent(publicEvents, locations);
    const winners = await getPlebiscitedWinners(live.events, live.spots, toolIds);
    if (seq !== loadMetaSeq.current) return;
    setPlebiscitedItems(winners);

    if (isSupabaseConfigured() && supabase) {
      const [approvedRes, pendingRes] = await Promise.all([
        supabase
          .from('partnership_requests')
          .select('id', { count: 'exact', head: true })
          .eq('country_code', countryCode)
          .eq('status', 'approved'),
        supabase
          .from('partnership_requests')
          .select('id', { count: 'exact', head: true })
          .eq('country_code', countryCode)
          .in('status', ['pending', 'to_contact', 'in_discussion']),
      ]);
      if (approvedRes.count != null) setPartnershipApproved(approvedRes.count);
      if (pendingRes.count != null) setPartnershipPending(pendingRes.count);
    }
  }, [getHomeLocations, countryCode, publicEvents, locations, toolIds]);

  useEffect(() => {
    if (role === 'ADMIN') void loadMeta();
  }, [role, loadMeta]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), loadMeta()]);
    setRefreshing(false);
  }, [refresh, loadMeta]);

  if (role !== 'ADMIN') {
    return (
      <View style={[styles.denied, { backgroundColor: '#fff' }]}>
        <Text style={styles.deniedTitle}>Accès réservé</Text>
        <Text style={styles.deniedBody}>Control Tower — administrateurs uniquement.</Text>
      </View>
    );
  }

  const moderationCount = pendingEvents + pendingSpots + pendingTools;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing || isLoading}
          onRefresh={() => void onRefresh()}
          tintColor={ADMIN_THEME.accent}
        />
      }
    >
      <AdminPageHeader title="Control Tower" subtitle={`Vue d’ensemble — ${countryLabel}`} shell={shell} />
      <AdminCountryBar shell={shell} />

      <View style={styles.kpiGrid}>
        <AdminKpiCard label="Événements" value={String(publicEvents.length)} shell={shell} />
        <AdminKpiCard label="Spots" value={String(pureSpots.length)} shell={shell} accent="#06b6d4" />
        <AdminKpiCard label="Outils" value={String(tools.length)} shell={shell} accent="#10b981" />
        <AdminKpiCard
          label="Partenariats"
          value={String(partnershipApproved)}
          hint="Validés"
          shell={shell}
          accent="#f59e0b"
        />
      </View>

      <View style={styles.quickRow}>
        <Pressable
          style={[styles.quick, moderationCount > 0 && styles.quickHot]}
          onPress={() => navigation.navigate('AdminModeration', { tab: 'events' })}
        >
          <Text style={styles.quickTitle}>Modération</Text>
          <Text style={styles.quickValue}>{moderationCount}</Text>
        </Pressable>
        <Pressable
          style={styles.quick}
          onPress={() => navigation.navigate('AdminPartnerships')}
        >
          <Text style={styles.quickTitle}>Pipeline</Text>
          <Text style={styles.quickValue}>{partnershipPending}</Text>
        </Pressable>
        <Pressable
          style={styles.quick}
          onPress={() => navigation.navigate('AdminSuggestions')}
        >
          <Text style={styles.quickTitle}>Suggestions</Text>
          <Text style={styles.quickValue}>{suggestionsPending}</Text>
        </Pressable>
      </View>

      {plebiscitedItems.length > 0 ? (
        <>
          <Text style={[styles.section, { color: shell.pageKicker }]}>🏆 Plébiscités</Text>
          <View style={[styles.plebiscitedCard, { backgroundColor: shell.filterInactiveBg, borderColor: shell.tabIndicator }]}>
            {plebiscitedItems.map((w) => (
              <View key={w.kind} style={styles.plebiscitedRow}>
                <Text
                  style={[
                    styles.plebiscitedKind,
                    { color: w.kind === 'event' ? '#8b5cf6' : w.kind === 'spot' ? '#06b6d4' : '#10b981' },
                  ]}
                >
                  {w.kindLabel}
                </Text>
                <Text style={[styles.plebiscitedLabel, { color: shell.pageTitle }]} numberOfLines={1}>
                  {w.category?.label}
                </Text>
              </View>
            ))}
            <Pressable onPress={() => navigation.navigate('AdminInsights')}>
              <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700', fontSize: 12, marginTop: 8 }}>
                Voir les insights →
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <Text style={[styles.hint, { color: shell.pageKicker }]}>
        Utilisez le menu noir à gauche pour ouvrir un module. Le logo THE LOOP ramène ici.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  container: { paddingHorizontal: 14, paddingBottom: 40 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  quick: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#fafafa',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  quickHot: { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  quickTitle: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: '#737373' },
  quickValue: { marginTop: 4, fontSize: 18, fontWeight: '800', color: '#171717' },
  plebiscitedCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 4 },
  plebiscitedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  plebiscitedKind: { fontSize: 10, fontWeight: '800', width: 64 },
  plebiscitedLabel: { flex: 1, fontSize: 13, fontWeight: '700' },
  section: {
    marginTop: 20,
    marginBottom: 10,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  hint: { marginTop: 20, fontSize: 11, lineHeight: 16, fontStyle: 'italic' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  deniedTitle: { fontSize: 18, fontWeight: '700', color: '#171717' },
  deniedBody: { marginTop: 8, textAlign: 'center', fontSize: 14, color: '#737373' },
});
