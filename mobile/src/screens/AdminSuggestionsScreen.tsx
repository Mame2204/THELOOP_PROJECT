import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { AdminPageHeader, ADMIN_THEME } from '@/components/admin/AdminShell';
import { AdminTabMenu } from '@/components/admin/AdminTabMenu';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { formatDateFr } from '@/lib/date-utils';
import {
  listCommunitySuggestions,
  updateSuggestionStatus,
  SUGGESTION_STATUS_LABELS,
  SUGGESTION_TYPE_LABELS,
  type CommunitySuggestion,
  type SuggestionStatus,
  type SuggestionType,
} from '@/lib/suggestions-store';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminSuggestions'>;

type StatusFilter = SuggestionStatus | 'all';
type TypeFilter = SuggestionType | 'all';

const STATUS_FLOW: SuggestionStatus[] = ['pending', 'reviewed', 'done', 'dismissed'];

const STATUS_FILTERS: StatusFilter[] = ['all', 'pending', 'reviewed', 'done', 'dismissed'];
const TYPE_FILTERS: TypeFilter[] = ['all', 'improvement', 'event', 'spot', 'tool', 'other'];

const TYPE_SHORT_LABELS: Record<TypeFilter, string> = {
  all: 'Tous',
  improvement: 'App',
  event: 'Événement',
  spot: 'Spot',
  tool: 'Outil',
  other: 'Autre',
};

export function AdminSuggestionsScreen({ navigation, route }: Props) {
  const { role } = useAuthContext();
  const { countryCode } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('suggestions');
  const embedded = route.params?.embedded === true;

  const [items, setItems] = useState<CommunitySuggestion[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const load = useCallback(async (force = false) => {
    const fetchFresh = force || isSupabaseConfigured();
    if (fetchFresh) setItems([]);
    setItems(await listCommunitySuggestions(countryCode, { force: fetchFresh }));
  }, [countryCode]);

  const { run } = useFocusLoad(
    async (force) => {
      await load(force);
    },
    { ttlMs: 90_000, enabled: role === 'ADMIN', resetKey: countryCode },
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await run(true);
    setRefreshing(false);
  }, [run]);

  const countsByStatus = useMemo(() => {
    const counts: Record<SuggestionStatus, number> = {
      pending: 0,
      reviewed: 0,
      done: 0,
      dismissed: 0,
    };
    for (const item of items) {
      counts[item.status] = (counts[item.status] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const countsByType = useMemo(() => {
    const counts: Record<SuggestionType, number> = {
      improvement: 0,
      event: 0,
      spot: 0,
      tool: 0,
      other: 0,
    };
    for (const item of items) {
      if (statusFilter !== 'all' && item.status !== statusFilter) continue;
      counts[item.suggestionType] = (counts[item.suggestionType] ?? 0) + 1;
    }
    return counts;
  }, [items, statusFilter]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (typeFilter !== 'all' && item.suggestionType !== typeFilter) return false;
      return true;
    });
  }, [items, statusFilter, typeFilter]);

  const statusTabs = useMemo(
    () =>
      STATUS_FILTERS.map((id) => ({
        id,
        label: id === 'all' ? 'Tous' : SUGGESTION_STATUS_LABELS[id],
        badge: id === 'all' ? items.length : countsByStatus[id],
      })),
    [countsByStatus, items.length],
  );

  const typeTabs = useMemo(
    () =>
      TYPE_FILTERS.map((id) => ({
        id,
        label: TYPE_SHORT_LABELS[id],
        badge:
          id === 'all'
            ? statusFilter === 'all'
              ? items.length
              : countsByStatus[statusFilter]
            : countsByType[id],
      })),
    [countsByStatus, countsByType, items.length, statusFilter],
  );

  async function cycleStatus(item: CommunitySuggestion) {
    const idx = STATUS_FLOW.indexOf(item.status);
    const next = STATUS_FLOW[(idx + 1) % STATUS_FLOW.length];
    const ok = await updateSuggestionStatus(item.id, next);
    if (!ok) {
      Alert.alert('Erreur', 'Mise à jour impossible');
      return;
    }
    await load(true);
  }

  if (role !== 'ADMIN') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle }}>Accès réservé aux administrateurs.</Text>
      </View>
    );
  }

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={ADMIN_THEME.accent} />}
    >
      {!embedded ? (
        <>
          <AdminPageHeader title="Suggestions" shell={shell} embedded={false} onBack={() => navigation.goBack()} />
          <AdminCountryBar shell={shell} />
        </>
      ) : null}

      <Text style={[styles.filterLabel, { color: shell.pageKicker }]}>Statut</Text>
      <AdminTabMenu
        tabs={statusTabs}
        active={statusFilter}
        onChange={setStatusFilter}
        shell={shell}
        accent={ADMIN_THEME.accent}
      />

      <Text style={[styles.filterLabel, { color: shell.pageKicker }]}>Type</Text>
      <AdminTabMenu
        tabs={typeTabs}
        active={typeFilter}
        onChange={setTypeFilter}
        shell={shell}
        accent={ADMIN_THEME.accent}
      />

      <Text style={[styles.meta, { color: shell.pageKicker }]}>
        {filtered.length} affichée{filtered.length > 1 ? 's' : ''}
        {filtered.length !== items.length ? ` · ${items.length} au total` : ''}
        {countsByStatus.pending > 0 ? ` · ${countsByStatus.pending} nouvelle${countsByStatus.pending > 1 ? 's' : ''}` : ''}
      </Text>

      {filtered.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>
          {items.length === 0
            ? 'Aucune suggestion pour l\'instant.'
            : 'Aucune suggestion pour ces filtres.'}
        </Text>
      ) : (
        filtered.map((item) => (
          <View
            key={item.id}
            style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
          >
            <View style={styles.cardTop}>
              <Text style={[styles.type, { color: ADMIN_THEME.accent }]}>
                {SUGGESTION_TYPE_LABELS[item.suggestionType]}
              </Text>
              <Pressable onPress={() => void cycleStatus(item)}>
                <Text style={[styles.status, { color: shell.tabIndicator }]}>
                  {SUGGESTION_STATUS_LABELS[item.status]} ↻
                </Text>
              </Pressable>
            </View>
            {item.title ? (
              <Text style={[styles.headline, { color: shell.pageTitle }]}>{item.title}</Text>
            ) : null}
            {item.placeName ? (
              <Text style={[styles.place, { color: shell.pageKicker }]}>📍 {item.placeName}</Text>
            ) : null}
            <Text style={[styles.body, { color: shell.pageTitle }]}>{item.description}</Text>
            <Text style={[styles.contact, { color: shell.pageKicker }]}>
              {[item.contactName, item.contactEmail, item.contactPhone].filter(Boolean).join(' · ') || 'Anonyme'}
            </Text>
            <Text style={[styles.date, { color: shell.pageKicker }]}>{formatDateFr(item.createdAt)}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  filterLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  meta: { fontSize: 12, marginBottom: 12, marginTop: 2 },
  empty: { fontSize: 14, fontStyle: 'italic', textAlign: 'center', marginTop: 24 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  type: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  status: { fontSize: 11, fontWeight: '700' },
  headline: { marginTop: 8, fontSize: 16, fontWeight: '800' },
  place: { marginTop: 4, fontSize: 12 },
  body: { marginTop: 8, fontSize: 13, lineHeight: 20 },
  contact: { marginTop: 10, fontSize: 11 },
  date: { marginTop: 4, fontSize: 10 },
});
