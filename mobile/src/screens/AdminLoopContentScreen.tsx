import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AdminContentItem, ContentStatus } from '@/lib/admin-types';
import { CONTENT_STATUS_LABELS, adminContentActionsFor } from '@/lib/admin-types';
import { CONTENT_ORIGIN_LABELS } from '@/lib/content-origin';
import { buildTeamAdminContentList, markContentArchived, setContentStatus } from '@/lib/admin-content-store';
import { deleteAdminContent } from '@/lib/admin-content-delete';
import { invalidateContentCache, loadAdminCatalogSnapshot } from '@/lib/content-store';
import { isToolLocation } from '@/lib/location-kind-utils';
import { navigateRoot } from '@/lib/navigation-utils';
import { useContent } from '@/context/ContentContext';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { AdminPageHeader, ADMIN_THEME, adminCardStyle } from '@/components/admin/AdminShell';
import { AdminActionIcon } from '@/components/admin/AdminActionIcon';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { PartnerSubmissionChoiceModal } from '@/components/PartnerSubmissionChoiceModal';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminLoopContent'>;
type Tab = 'all' | 'events' | 'spots' | 'tools';
type Filter = 'all' | ContentStatus;

const FILTERS: Filter[] = ['all', 'draft', 'published', 'deactivated', 'archived'];

function isCatalogContentKind(kind: AdminContentItem['kind']): kind is 'event' | 'spot' {
  return kind === 'event' || kind === 'spot';
}

export function AdminLoopContentScreen({ navigation }: Props) {
  const { role } = useAuthContext();
  const { shell } = useMemberTheme();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('content');
  const { refresh } = useContent();
  const [tab, setTab] = useState<Tab>('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<Awaited<ReturnType<typeof buildTeamAdminContentList>>['events']>([]);
  const [toolIds, setToolIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [submissionModalOpen, setSubmissionModalOpen] = useState(false);

  const openSubmission = useCallback(
    (params: { type: 'event' | 'spot'; isTool?: boolean }) => {
      setSubmissionModalOpen(false);
      navigateRoot(navigation, 'PartnerSubmission', {
        type: params.type,
        asAdmin: true,
        contentChannel: 'loop',
        isTool: params.isTool,
      });
    },
    [navigation],
  );

  const load = useCallback(async (force = false) => {
    const snapshot = await loadAdminCatalogSnapshot(force);
    const data = await buildTeamAdminContentList(snapshot.events, snapshot.locations);
    const ids = new Set(snapshot.locations.filter((s) => isToolLocation(s)).map((s) => s.id));
    setToolIds(ids);
    if (tab === 'events') setItems(data.events);
    else if (tab === 'tools') setItems(data.spots.filter((s) => ids.has(s.id)));
    else if (tab === 'spots') setItems(data.spots.filter((s) => !ids.has(s.id)));
    else setItems([...data.events, ...data.spots]);
  }, [tab]);

  useEffect(() => {
    // Cache mémoire admin (TTL 10 min) — pas de full-fetch à chaque onglet.
    if (role === 'ADMIN') void load(false);
  }, [role, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    await load(true);
    setRefreshing(false);
  }, [refresh, load]);

  const filtered = useMemo(
    () => items.filter((i) => filter === 'all' || i.contentStatus === filter),
    [items, filter],
  );

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  async function changeStatus(id: string, kind: 'event' | 'spot', status: ContentStatus) {
    const result = await setContentStatus(kind, id, status);
    if (!result.ok) {
      Alert.alert('Erreur', result.error ?? 'Impossible de mettre à jour le statut en base.');
      return;
    }
    invalidateContentCache();
    await refresh();
    await load(true);
    if (status === 'deactivated') setFilter('deactivated');
    Alert.alert('Mis à jour', `Statut : ${CONTENT_STATUS_LABELS[status]}`);
  }

  async function archiveItem(id: string, kind: 'event' | 'spot', title: string) {
    Alert.alert('Archiver', `Archiver « ${title} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Archiver',
        style: 'destructive',
        onPress: async () => {
          await markContentArchived(kind, id);
          invalidateContentCache();
          await refresh();
          await load(true);
        },
      },
    ]);
  }

  async function deleteContentItem(id: string, kind: 'event' | 'spot', title: string, source: 'staging' | 'supabase' | 'demo') {
    Alert.alert(
      'Supprimer',
      source === 'staging'
        ? `Supprimer « ${title} » ?\n\nContenu staging local.`
        : `Supprimer définitivement « ${title} » ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            const res = await deleteAdminContent(kind, id, { isTool: toolIds.has(id) });
            if (!res.ok) {
              Alert.alert('Erreur', res.error ?? 'Suppression impossible.');
              return;
            }
            invalidateContentCache();
            await refresh();
            await load(true);
          },
        },
      ],
    );
  }

  function previewItem(item: (typeof items)[number]) {
    if (!item.slug) {
      Alert.alert('Aperçu indisponible', 'Ce contenu n’a pas encore de fiche publique (brouillon).');
      return;
    }
    if (item.kind === 'event') {
      navigateRoot(navigation, 'EventDetail', { slug: item.slug });
      return;
    }
    navigateRoot(navigation, 'SpotDetail', { slug: item.slug });
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={ADMIN_THEME.accent} />}
    >
      <AdminPageHeader
        title="Mon contenu"
        subtitle="Événements, spots et outils — équipe THE LOOP"
        shell={shell}
        onBack={() => navigation.goBack()}
      />

      <AdminCountryBar shell={shell} compact />

      <View style={styles.tabs}>
        {([
          { id: 'all' as const, label: 'Tous' },
          { id: 'events' as const, label: 'Événements' },
          { id: 'spots' as const, label: 'Spots' },
          { id: 'tools' as const, label: 'Outils' },
        ]).map((t) => (
          <Pressable
            key={t.id}
            style={[styles.tab, { borderColor: shell.filterInactiveBorder }, tab === t.id && { backgroundColor: ADMIN_THEME.glow, borderColor: ADMIN_THEME.accent }]}
            onPress={() => setTab(t.id)}
          >
            <Text style={{ color: tab === t.id ? ADMIN_THEME.accent : shell.pageTitle, fontWeight: '700', fontSize: 12 }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.createBtn, { borderColor: ADMIN_THEME.accent }]}
        onPress={() => {
          if (tab === 'all') {
            setSubmissionModalOpen(true);
            return;
          }
          openSubmission({
            type: tab === 'events' ? 'event' : 'spot',
            isTool: tab === 'tools',
          });
        }}
      >
        <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700' }}>
          {tab === 'all'
            ? '+ Nouvelle soumission'
            : `+ Créer ${tab === 'events' ? 'un événement' : tab === 'tools' ? 'un outil' : 'un spot'}`}
        </Text>
      </Pressable>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, { borderColor: shell.filterInactiveBorder }, filter === f && { backgroundColor: ADMIN_THEME.accent }]}
            onPress={() => setFilter(f)}
          >
            <Text style={{ color: filter === f ? '#fff' : shell.pageKicker, fontSize: 10, fontWeight: '700' }}>
              {f === 'all' ? 'Tous' : CONTENT_STATUS_LABELS[f]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {filtered.map((item) => {
        const actions = adminContentActionsFor(item.contentStatus);
        const catalogKind = isCatalogContentKind(item.kind) ? item.kind : null;
        return (
          <View key={item.id} style={adminCardStyle(shell)}>
            <View style={styles.cardTop}>
              <Text style={[styles.cardTitle, { color: shell.pageTitle }]} numberOfLines={1}>{item.title}</Text>
              <View style={[styles.statusPill, { backgroundColor: statusColor(item.contentStatus) + '22' }]}>
                <Text style={{ color: statusColor(item.contentStatus), fontSize: 9, fontWeight: '800' }}>
                  {CONTENT_STATUS_LABELS[item.contentStatus]}
                </Text>
              </View>
            </View>
            <Text style={[styles.meta, { color: shell.pageKicker }]} numberOfLines={1}>
              {item.subtitle}
              {item.organizerName ? ` · ${item.organizerName}` : ''}
            </Text>
          <Text style={[styles.meta, { color: shell.pageKicker }]}>
            {item.contentOrigin ? `${CONTENT_ORIGIN_LABELS[item.contentOrigin]} · ` : ''}
            {item.source} · {item.isFeatured ? '★ À la une' : 'Standard'}
          </Text>

            <View style={styles.actions}>
              <AdminActionIcon action="preview" color={ADMIN_THEME.accent} onPress={() => previewItem(item)} />
              {actions.canEdit && catalogKind ? (
                <AdminActionIcon
                  action="edit"
                  color={ADMIN_THEME.accent}
                  onPress={() => navigateRoot(navigation, 'PartnerSubmission', {
                    type: catalogKind,
                    id: item.id,
                    asAdmin: true,
                    contentChannel: item.contentOrigin === 'admin' ? 'admin' : 'loop',
                    isTool: toolIds.has(item.id),
                  })}
                />
              ) : null}
              {actions.canPublish && catalogKind ? (
                <AdminActionIcon action="publish" onPress={() => void changeStatus(item.id, catalogKind, 'published')} />
              ) : null}
              {actions.canDeactivate && catalogKind ? (
                <AdminActionIcon action="deactivate" onPress={() => void changeStatus(item.id, catalogKind, 'deactivated')} />
              ) : null}
              {actions.canMoveToDraft && catalogKind ? (
                <AdminActionIcon action="draft" onPress={() => void changeStatus(item.id, catalogKind, 'draft')} />
              ) : null}
              {actions.canArchive && catalogKind ? (
                <AdminActionIcon action="archive" onPress={() => void archiveItem(item.id, catalogKind, item.title)} />
              ) : null}
              {actions.canDelete && catalogKind ? (
                <AdminActionIcon
                  action="delete"
                  onPress={() => void deleteContentItem(item.id, catalogKind, item.title, item.source)}
                />
              ) : null}
            </View>
          </View>
        );
      })}

      {filtered.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>
          Aucune publication d'équipe. Créez un contenu ci-dessus — les publications partenaires restent dans Control Tower → Contenu.
        </Text>
      ) : null}

      <PartnerSubmissionChoiceModal
        visible={submissionModalOpen}
        shell={shell}
        onClose={() => setSubmissionModalOpen(false)}
        onEvent={() => openSubmission({ type: 'event' })}
        onSpot={() => openSubmission({ type: 'spot' })}
        onTool={() => openSubmission({ type: 'spot', isTool: true })}
      />
    </ScrollView>
  );
}

function statusColor(status: ContentStatus): string {
  if (status === 'published') return '#10b981';
  if (status === 'draft') return '#f59e0b';
  if (status === 'deactivated') return '#ef4444';
  return '#94a3b8';
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 10 },
  tab: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  createBtn: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 12 },
  filterRow: { marginBottom: 8, maxHeight: 36 },
  filterChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontWeight: '700', fontSize: 15 },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  meta: { marginTop: 4, fontSize: 11 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  empty: { textAlign: 'center', marginTop: 28, fontStyle: 'italic', paddingHorizontal: 12 },
});
