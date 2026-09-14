import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuthContext } from '@/context/AuthContext';
import { useContent } from '@/context/ContentContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { AdminPageHeader } from '@/components/admin/AdminShell';
import { FilterPills } from '@/components/FilterPills';
import {
  STATUS_LABELS,
  listPartnerEvents,
  listPartnerSpots,
  retryPartnerStagingSync,
  type StagingEvent,
  type StagingSpot,
} from '@/lib/partner-staging-store';
import { PARTNER_PUBLICATION_NOTICE } from '@/lib/legal-content-store';
import { navigateRoot } from '@/lib/navigation-utils';
import { slugify } from '@/lib/content-mappers';
import { resolvePartnerWorkspaceContext } from '@/lib/partner-spot-auth';
import { useCategoryLabels } from '@/context/CategoryLabelsContext';
import { usePartnerContentScopes } from '@/hooks/usePartnerContentScopes';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerContent'>;
type ContentFilter = 'all' | 'events' | 'spots' | 'tools';

const PRO_ACCENT = '#20C997';

const FILTERS_ALL: { value: ContentFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'events', label: 'Événements' },
  { value: 'spots', label: 'Spots' },
  { value: 'tools', label: 'Outils' },
];

function canPartnerEdit(status: string): boolean {
  return status === 'draft' || status === 'pending' || status === 'rejected';
}

export function PartnerContentScreen({ navigation }: Props) {
  const { role, user } = useAuthContext();
  const { shell } = useMemberTheme();
  const { publicEvents, primeEvents, getHomeLocations } = useContent();
  const [filter, setFilter] = useState<ContentFilter>('all');
  const [events, setEvents] = useState<StagingEvent[]>([]);
  const [spots, setSpots] = useState<StagingSpot[]>([]);
  const { eventLabel, spotLabel, toolLabel } = useCategoryLabels();
  const { canManageEvents, canManageSpots, canManageTools, hasAnyScope } = usePartnerContentScopes();
  const [refreshing, setRefreshing] = useState(false);

  const filters = useMemo(() => {
    const allowed = new Set<ContentFilter>(['all']);
    if (canManageEvents) allowed.add('events');
    if (canManageSpots) allowed.add('spots');
    if (canManageTools) allowed.add('tools');
    return FILTERS_ALL.filter((f) => allowed.has(f.value));
  }, [canManageEvents, canManageSpots, canManageTools]);

  useEffect(() => {
    if (!filters.some((f) => f.value === filter)) {
      setFilter(filters[0]?.value ?? 'all');
    }
  }, [filters, filter]);

  const loader = useCallback(async (force: boolean) => {
    if (!user || role !== 'PARTNER') return;
    const ctx = await resolvePartnerWorkspaceContext(user);
    const { effectiveUserId, partnerLabel } = ctx;
    // Sync staging → remote : uniquement pull-to-refresh (très coûteux en egress).
    if (force) {
      await retryPartnerStagingSync(effectiveUserId);
    }
    const [ev, sp] = await Promise.all([
      listPartnerEvents(effectiveUserId, partnerLabel),
      listPartnerSpots(effectiveUserId, partnerLabel),
    ]);
    setEvents(ev);
    setSpots(sp);
  }, [user?.id, user?.company, user?.fullName, role]);

  // TTL focus : évite un refetch remote à chaque retour d’onglet (listPartner* = réseau).
  const { run } = useFocusLoad(loader, {
    ttlMs: 90_000,
    enabled: role === 'PARTNER' && Boolean(user),
  });

  const venueSpots = useMemo(() => spots.filter((s) => s.subCategory !== 'tools'), [spots]);
  const toolSpots = useMemo(() => spots.filter((s) => s.subCategory === 'tools'), [spots]);

  const rows = useMemo(() => {
    const list: Array<{ type: 'event' | 'spot'; item: StagingEvent | StagingSpot; isTool: boolean }> = [];
    if (filter === 'all' || filter === 'events') {
      if (canManageEvents) events.forEach((e) => list.push({ type: 'event', item: e, isTool: false }));
    }
    if (filter === 'all' || filter === 'spots') {
      if (canManageSpots) venueSpots.forEach((s) => list.push({ type: 'spot', item: s, isTool: false }));
    }
    if (filter === 'all' || filter === 'tools') {
      if (canManageTools) toolSpots.forEach((s) => list.push({ type: 'spot', item: s, isTool: true }));
    }
    return list;
  }, [events, venueSpots, toolSpots, filter, canManageEvents, canManageSpots, canManageTools]);

  function previewPublished(type: 'event' | 'spot', item: StagingEvent | StagingSpot, isTool: boolean) {
    if (type === 'event') {
      const ev = item as StagingEvent;
      const catalog = [...publicEvents, ...primeEvents];
      const live =
        catalog.find((e) => ev.publishedEventId && e.id === ev.publishedEventId)
        ?? catalog.find((e) => e.id === ev.id)
        ?? catalog.find((e) => e.title.trim().toLowerCase() === ev.title.trim().toLowerCase());
      const slug = live?.slug || slugify(ev.title);
      if (!live?.slug && !slug) {
        Alert.alert('Aperçu indisponible', 'La fiche publique n\'est pas encore synchronisée. Tirez pour actualiser.');
        return;
      }
      navigateRoot(navigation, 'EventDetail', { slug: live?.slug ?? slug });
      return;
    }

    const spot = item as StagingSpot;
    const publishedId = isTool ? spot.publishedToolId : spot.publishedEstablishmentId;
    const catalog = getHomeLocations(isTool ? 'tools' : undefined).filter((l) =>
      isTool ? l.subCategory === 'tools' : l.subCategory !== 'tools',
    );
    const live =
      catalog.find((l) => publishedId && l.id === publishedId)
      ?? catalog.find((l) => l.id === spot.id)
      ?? catalog.find((l) => l.name.trim().toLowerCase() === spot.name.trim().toLowerCase());
    const slug = live?.slug || slugify(spot.name);
    if (!live?.slug && !slug) {
      Alert.alert('Aperçu indisponible', 'La fiche publique n\'est pas encore synchronisée. Tirez pour actualiser.');
      return;
    }
    navigateRoot(navigation, 'SpotDetail', { slug: live?.slug ?? slug });
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await run(true);
    setRefreshing(false);
  }, [run]);

  if (role !== 'PARTNER') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle }}>Espace partenaire</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={PRO_ACCENT} />}
    >
      <AdminPageHeader
        title="Mes contenus"
        subtitle="Brouillons, en attente et publiés"
        shell={shell}
        onBack={() => navigation.goBack()}
      />
      <Text style={[styles.notice, { color: shell.pageKicker }]}>{PARTNER_PUBLICATION_NOTICE}</Text>
      <FilterPills
        options={filters.map((f) => ({ id: f.value, label: f.label }))}
        value={filter}
        onChange={setFilter}
        accent={PRO_ACCENT}
      />

      {rows.map(({ type, item, isTool }) => {
        const editable = canPartnerEdit(item.status);
        const title = type === 'event' ? (item as StagingEvent).title : (item as StagingSpot).name;
        const meta =
          type === 'event'
            ? (item as StagingEvent).date
            : [(item as StagingSpot).district, (item as StagingSpot).city].filter(Boolean).join(' · ');
        const kindLabel = type === 'event' ? eventLabel : isTool ? toolLabel : spotLabel;
        const actionHint = editable ? 'Modifier' : 'aperçu public';
        return (
          <Pressable
            key={`${type}-${item.id}`}
            style={[styles.card, { backgroundColor: shell.cardBg, borderColor: shell.cardBorder }]}
            onPress={() => {
              if (editable) {
                navigateRoot(navigation, 'PartnerSubmission', {
                  type,
                  editId: item.id,
                  isTool: type === 'spot' ? isTool : undefined,
                });
                return;
              }
              previewPublished(type, item, isTool);
            }}
          >
            <View style={styles.row}>
              <Text style={[styles.title, { color: shell.pageTitle }]}>{title}</Text>
              <Text style={[styles.status, { color: editable ? '#fcd34d' : '#34d399' }]}>{STATUS_LABELS[item.status]}</Text>
            </View>
            <Text style={[styles.meta, { color: shell.pageKicker }]}>
              {kindLabel} · {meta} · {actionHint}
            </Text>
            {item.status === 'rejected' && item.rejectionReason ? (
              <Text style={[styles.rejection, { color: '#f87171' }]}>Motif : {item.rejectionReason}</Text>
            ) : null}
          </Pressable>
        );
      })}

      {rows.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>
          {!hasAnyScope ? 'Aucun module activé — contactez THE LOOP.' : "Aucun contenu pour l'instant."}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8, marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  title: { fontWeight: '700', flex: 1 },
  status: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  meta: { marginTop: 4, fontSize: 11 },
  rejection: { marginTop: 6, fontSize: 11, lineHeight: 16 },
  notice: { fontSize: 11, lineHeight: 16, marginBottom: 12, fontStyle: 'italic' },
  empty: { textAlign: 'center', marginTop: 24 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
