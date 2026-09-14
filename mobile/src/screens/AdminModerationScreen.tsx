import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminCatalog } from '@/hooks/useAdminCatalog';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminModuleAccess, useFilteredAdminTabs } from '@/hooks/useAdminModuleAccess';
import type { AdminPermissionId } from '@/lib/admin-permissions';
import { PageHeader } from '@/components/PageHeader';
import { AdminActionIcon } from '@/components/admin/AdminActionIcon';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { AdminTabMenu } from '@/components/admin/AdminTabMenu';
import { ADMIN_THEME } from '@/components/admin/AdminShell';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { invalidateContentCache } from '@/lib/content-store';
import { navigateRoot } from '@/lib/navigation-utils';
import { slugify } from '@/lib/content-mappers';
import {
  listPendingEvents,
  listPendingSpots,
  moderateEvent,
  moderateSpot,
  STATUS_LABELS,
  type StagingEvent,
  type StagingSpot,
} from '@/lib/partner-staging-store';
import { moderationResultCopy } from '@/lib/publication-messages';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminModeration'>;
type Tab = 'all' | 'events' | 'spots' | 'tools';

const MODERATION_TYPE_TABS: Array<{ id: Exclude<Tab, 'all'>; label: string; permission: AdminPermissionId }> = [
  { id: 'events', label: 'Événements', permission: 'moderation_events' },
  { id: 'spots', label: 'Spots', permission: 'moderation_spots' },
  { id: 'tools', label: 'Outils', permission: 'moderation_tools' },
];

type ModerationRow =
  | { kind: 'event'; item: StagingEvent }
  | { kind: 'spot'; item: StagingSpot }
  | { kind: 'tool'; item: StagingSpot };

type RejectTarget = {
  kind: 'event' | 'spot' | 'tool';
  id: string;
  title: string;
};

export function AdminModerationScreen({ route, navigation }: Props) {
  const { role } = useAuthContext();
  const { countryCode } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('moderation');
  const { publicEvents, primeEvents, getHomeLocations, refresh } = useAdminCatalog();

  const initialTab: Tab =
    route.params?.tab === 'spots' ? 'spots'
      : route.params?.tab === 'tools' ? 'tools'
        : route.params?.tab === 'events' ? 'events'
          : 'all';

  const embedded = route.params?.embedded === true;

  const [tab, setTab] = useState<Tab>(initialTab);
  const [events, setEvents] = useState<StagingEvent[]>([]);
  const [spots, setSpots] = useState<StagingSpot[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const typeTabs = useFilteredAdminTabs('moderation', MODERATION_TYPE_TABS);
  const pendingSpots = useMemo(() => spots.filter((s) => s.subCategory !== 'tools'), [spots]);
  const pendingTools = useMemo(() => spots.filter((s) => s.subCategory === 'tools'), [spots]);
  const visibleTabs = useMemo(
    () =>
      typeTabs.length > 1
        ? [
            { id: 'all' as const, label: 'Tous', badge: events.length + pendingSpots.length + pendingTools.length },
            ...typeTabs.map((t) => ({
              ...t,
              badge: t.id === 'events' ? events.length : t.id === 'spots' ? pendingSpots.length : pendingTools.length,
            })),
          ]
        : typeTabs.map((t) => ({
            ...t,
            badge: t.id === 'events' ? events.length : t.id === 'spots' ? pendingSpots.length : pendingTools.length,
          })),
    [typeTabs, events.length, pendingSpots.length, pendingTools.length],
  );

  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some((t) => t.id === tab)) {
      setTab(visibleTabs[0].id as Tab);
    }
  }, [visibleTabs, tab]);

  const load = useCallback(async () => {
    const [ev, sp] = await Promise.all([listPendingEvents(countryCode), listPendingSpots(countryCode)]);
    setEvents(Array.isArray(ev) ? ev : []);
    setSpots(Array.isArray(sp) ? sp : []);
  }, [countryCode]);

  useEffect(() => {
    if (role === 'ADMIN') void load();
  }, [role, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function handleModerateEvent(id: string, approve: boolean, reason?: string) {
    const ok = await moderateEvent(id, approve, reason);
    invalidateContentCache();
    await Promise.all([load(), refresh()]);
    const copy = moderationResultCopy('event', approve, ok);
    Alert.alert(copy.title, copy.message);
  }

  async function handleModerateSpot(id: string, approve: boolean, asTool = false, reason?: string) {
    const ok = await moderateSpot(id, approve, reason);
    invalidateContentCache();
    await Promise.all([load(), refresh()]);
    const copy = moderationResultCopy(asTool ? 'tool' : 'spot', approve, ok);
    Alert.alert(copy.title, copy.message);
  }

  function openRejectModal(row: ModerationRow) {
    const title = row.kind === 'event' ? row.item.title : row.item.name;
    setRejectReason('');
    setRejectTarget({ kind: row.kind, id: row.item.id, title });
  }

  async function confirmReject() {
    const reason = rejectReason.trim();
    if (!reason) {
      Alert.alert('Motif requis', 'Indiquez le motif du refus pour le partenaire.');
      return;
    }
    if (!rejectTarget) return;
    const target = rejectTarget;
    setRejectTarget(null);
    setRejectReason('');
    if (target.kind === 'event') {
      await handleModerateEvent(target.id, false, reason);
      return;
    }
    await handleModerateSpot(target.id, false, target.kind === 'tool', reason);
  }

  const rows = useMemo((): ModerationRow[] => {
    const list: ModerationRow[] = [];
    if (tab === 'all' || tab === 'events') {
      events.forEach((item) => list.push({ kind: 'event', item }));
    }
    if (tab === 'all' || tab === 'spots') {
      pendingSpots.forEach((item) => list.push({ kind: 'spot', item }));
    }
    if (tab === 'all' || tab === 'tools') {
      pendingTools.forEach((item) => list.push({ kind: 'tool', item }));
    }
    return list;
  }, [tab, events, pendingSpots, pendingTools]);

  function editRow(row: ModerationRow) {
    if (row.kind === 'event') {
      navigateRoot(navigation, 'PartnerSubmission', { type: 'event', id: row.item.id, asAdmin: true });
      return;
    }
    navigateRoot(navigation, 'PartnerSubmission', {
      type: 'spot',
      id: row.item.id,
      asAdmin: true,
      isTool: row.kind === 'tool',
    });
  }

  function previewRow(row: ModerationRow) {
    const catalogEvents = [...publicEvents, ...primeEvents];
    const catalogSpots = getHomeLocations();

    if (row.kind === 'event') {
      const live = catalogEvents.find((e) => e.id === row.item.id);
      const slug = live?.slug || slugify(row.item.title);
      if (!live?.slug) {
        Alert.alert(
          'Aperçu public limité',
          'Ce contenu n\'est pas encore publié. Ouverture de la fiche si un slug est disponible — sinon utilisez Éditer.',
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Éditer', onPress: () => editRow(row) },
            ...(slug
              ? [{ text: 'Essayer l\'aperçu', onPress: () => navigateRoot(navigation, 'EventDetail', { slug }) }]
              : []),
          ],
        );
        return;
      }
      navigateRoot(navigation, 'EventDetail', { slug: live.slug });
      return;
    }

    const live = catalogSpots.find((s) => s.id === row.item.id);
    const slug = live?.slug || slugify(row.item.name);
    if (!live?.slug) {
      Alert.alert(
        'Aperçu public limité',
        'Ce contenu n\'est pas encore publié. Ouverture de la fiche si un slug est disponible — sinon utilisez Éditer.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Éditer', onPress: () => editRow(row) },
          ...(slug
            ? [{ text: 'Essayer l\'aperçu', onPress: () => navigateRoot(navigation, 'SpotDetail', { slug }) }]
            : []),
        ],
      );
      return;
    }
    navigateRoot(navigation, 'SpotDetail', { slug: live.slug });
  }

  if (role !== 'ADMIN') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Accès admin requis</Text>
      </View>
    );
  }

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  const inputStyle = [
    styles.input,
    {
      backgroundColor: shell.filterInactiveBg,
      borderColor: shell.filterInactiveBorder,
      color: shell.pageTitle,
    },
  ];

  return (
    <>
      <KeyboardAwareFormScroll
        style={{ flex: 1, backgroundColor: shell.pageBg }}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={shell.tabIndicator} />}
      >
        {!embedded ? (
          <>
            <PageHeader title="Modération" shell={shell} onBack={() => navigation.goBack()} />
            <AdminCountryBar shell={shell} compact />
          </>
        ) : null}

        <AdminTabMenu
          tabs={visibleTabs}
          active={tab}
          onChange={setTab}
          shell={shell}
          accent={ADMIN_THEME.accent}
        />

        {rows.map((row) => {
          const title = row.kind === 'event' ? row.item.title : row.item.name;
          const meta =
            row.kind === 'event'
              ? `${row.item.partnerName} · ${row.item.venueName}`
              : row.kind === 'tool'
                ? `${row.item.partnerName} · ${row.item.developer ?? 'Développeur non renseigné'}`
                : `${row.item.partnerName} · ${row.item.address}`;
          const kindLabel = row.kind === 'event' ? 'Événement' : row.kind === 'tool' ? 'Outil' : 'Spot';

          return (
            <View key={`${row.kind}-${row.item.id}`} style={[styles.card, { backgroundColor: shell.filterInactiveBg, borderColor: shell.filterInactiveBorder }]}>
              <Text style={[styles.kind, { color: ADMIN_THEME.accent }]}>{kindLabel}</Text>
              <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>{title}</Text>
              <Text style={[styles.meta, { color: shell.pageKicker }]}>{meta}</Text>
              <Text style={[styles.meta, { color: shell.pageKicker }]}>{STATUS_LABELS[row.item.status]}</Text>
              <View style={styles.row}>
                <AdminActionIcon action="preview" color={ADMIN_THEME.accent} onPress={() => previewRow(row)} />
                <AdminActionIcon action="edit" color={ADMIN_THEME.accent} onPress={() => editRow(row)} />
                <AdminActionIcon
                  action="approve"
                  onPress={() => void (row.kind === 'event'
                    ? handleModerateEvent(row.item.id, true)
                    : handleModerateSpot(row.item.id, true, row.kind === 'tool'))}
                />
                <AdminActionIcon
                  action="reject"
                  onPress={() => openRejectModal(row)}
                />
              </View>
            </View>
          );
        })}

        {rows.length === 0 ? (
          <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucun élément en attente pour ce filtre.</Text>
        ) : null}
      </KeyboardAwareFormScroll>

      <Modal
        visible={rejectTarget != null}
        transparent
        animationType="slide"
        onRequestClose={() => setRejectTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}>
            <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>Refuser la soumission</Text>
            <Text style={[styles.modalSubtitle, { color: shell.pageKicker }]}>
              {rejectTarget ? `« ${rejectTarget.title} »` : ''}
            </Text>
            <Text style={[styles.label, { color: shell.pageKicker }]}>Motif du refus *</Text>
            <TextInput
              style={inputStyle}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Ex. photo floue, horaires incomplets…"
              placeholderTextColor={shell.pageKicker}
              multiline
              textAlignVertical="top"
              autoFocus
            />
            <Pressable
              style={[styles.submit, { backgroundColor: '#ef4444' }]}
              onPress={() => void confirmReject()}
            >
              <Text style={styles.submitText}>Confirmer le refus</Text>
            </Pressable>
            <Pressable style={styles.modalClose} onPress={() => setRejectTarget(null)}>
              <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 32 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  kind: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  cardTitle: { fontWeight: '700', fontSize: 15 },
  meta: { marginTop: 4, fontSize: 12 },
  row: { flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' },
  empty: { textAlign: 'center', marginTop: 24, fontSize: 14 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: { borderWidth: 1, borderRadius: 16, margin: 12, marginBottom: 24, padding: 16 },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  modalSubtitle: { marginTop: 6, marginBottom: 12, fontSize: 13 },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, minHeight: 100, fontSize: 14, marginBottom: 12 },
  submit: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitText: { fontWeight: '800', color: '#fff' },
  modalClose: { alignItems: 'center', paddingVertical: 14 },
});
