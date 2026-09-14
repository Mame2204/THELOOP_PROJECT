import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AdminContentItem, ContentStatus } from '@/lib/admin-types';
import { CONTENT_STATUS_LABELS, adminAccueilContentActionsFor, adminContentActionsFor } from '@/lib/admin-types';
import { CONTENT_ORIGIN_LABELS } from '@/lib/content-origin';
import { buildAdminAccueilContentList } from '@/lib/admin-accueil-content-list';
import {
  deleteAdminChronique,
  deleteAdminCreatorCorner,
  deleteAdminHomePartnerLogo,
  deleteAdminLoopWalk,
  invalidateAdminAccueilCache,
  setAdminChroniqueActive,
  setAdminCreatorCornerActive,
  setAdminHomePartnerLogoActive,
  setAdminWalkPublished,
} from '@/lib/admin-accueil-store';
import { buildAdminContentList, markContentArchived, setContentStatus } from '@/lib/admin-content-store';
import { syncPartnerViewsAfterAdminContentChange } from '@/lib/admin-content-partner-sync';
import { deleteAdminContent } from '@/lib/admin-content-delete';
import { buildContentDeleteImpact, formatCascadeDeleteMessage } from '@/lib/content-cascade-cleanup';
import { invalidateContentCache, loadAdminCatalogSnapshot, peekAdminCatalogSnapshot } from '@/lib/content-store';
import { useAdminPermissions } from '@/context/AdminPermissionsContext';
import { isToolLocation } from '@/lib/location-kind-utils';
import { navigateAdminPanel, navigateRoot } from '@/lib/navigation-utils';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { filterByAdminCountry } from '@/lib/admin-country';
import { useContent } from '@/context/ContentContext';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminModuleAccess, useFilteredAdminTabs } from '@/hooks/useAdminModuleAccess';
import type { AdminPermissionId } from '@/lib/admin-permissions';
import { AdminPageHeader, ADMIN_THEME, adminCardStyle } from '@/components/admin/AdminShell';
import { AdminActionIcon } from '@/components/admin/AdminActionIcon';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AdminPanelParamList, RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminContent'>;
type Tab = 'all' | 'events' | 'spots' | 'tools' | 'walks' | 'corner' | 'chronique' | 'logos';
type Filter = 'all' | ContentStatus;
type AccueilTab = 'walks' | 'corner' | 'chronique' | 'logos';

const CONTENT_TYPE_TABS: Array<{ id: Exclude<Tab, 'all'>; label: string; permission: AdminPermissionId }> = [
  { id: 'events', label: 'Événements', permission: 'content_events' },
  { id: 'spots', label: 'Spots', permission: 'content_spots' },
  { id: 'tools', label: 'Outils', permission: 'content_tools' },
  { id: 'walks', label: 'Parcours', permission: 'content_walks' },
  { id: 'corner', label: 'Le Singulier', permission: 'content_corner' },
  { id: 'chronique', label: 'Le Fragment', permission: 'content_chronique' },
  { id: 'logos', label: 'Logos', permission: 'content_logos' },
];

const FILTERS: Filter[] = ['all', 'draft', 'published', 'deactivated', 'archived'];

const ACCUEIL_TABS = new Set<Tab>(['walks', 'corner', 'chronique', 'logos']);

function resolveInitialTab(param?: RootStackParamList['AdminContent']['tab']): Tab {
  if (param === 'spots' || param === 'events' || param === 'tools') return param;
  if (param === 'walks' || param === 'corner' || param === 'chronique' || param === 'logos') return param;
  return 'all';
}

function accueilPanelTab(tab: AccueilTab): AdminPanelParamList['AdminAccueil']['tab'] {
  return tab;
}

function isAccueilKind(kind: AdminContentItem['kind']): kind is 'walk' | 'corner' | 'chronique' | 'logo' {
  return kind === 'walk' || kind === 'corner' || kind === 'chronique' || kind === 'logo';
}

function accueilKindToTab(kind: 'walk' | 'corner' | 'chronique' | 'logo'): AccueilTab {
  if (kind === 'walk') return 'walks';
  if (kind === 'corner') return 'corner';
  if (kind === 'chronique') return 'chronique';
  return 'logos';
}

function actionsForItem(item: AdminContentItem) {
  if (isAccueilKind(item.kind)) return adminAccueilContentActionsFor(item.contentStatus);
  return adminContentActionsFor(item.contentStatus);
}

export function AdminContentScreen({ navigation, route }: Props) {
  const { role } = useAuthContext();
  const { isSuperAdmin } = useAdminPermissions();
  const { shell } = useMemberTheme();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('content');
  const { refresh } = useContent();
  const { countryCode, countryLabel } = useAdminCountry();
  const [tab, setTab] = useState<Tab>(resolveInitialTab(route.params?.tab));
  const [filter, setFilter] = useState<Filter>('all');
  const typeTabs = useFilteredAdminTabs('content', CONTENT_TYPE_TABS);
  const visibleTabs = useMemo(
    () => (typeTabs.length > 1 ? [{ id: 'all' as const, label: 'Tous' }, ...typeTabs] : typeTabs),
    [typeTabs],
  );
  const isAccueilTab = ACCUEIL_TABS.has(tab);

  useEffect(() => {
    if (route.params?.tab) setTab(resolveInitialTab(route.params.tab));
  }, [route.params?.tab]);

  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some((t) => t.id === tab)) {
      setTab(visibleTabs[0].id);
    }
  }, [visibleTabs, tab]);

  const [items, setItems] = useState<AdminContentItem[]>([]);
  const [toolIds, setToolIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const applyCatalogSnapshot = useCallback(
    async (snapshot: Awaited<ReturnType<typeof peekAdminCatalogSnapshot>>) => {
      const allEv = filterByAdminCountry(snapshot.events, countryCode);
      const allSp = filterByAdminCountry(snapshot.locations, countryCode);
      const data = await buildAdminContentList(allEv, allSp);
      const ids = new Set(allSp.filter((s) => isToolLocation(s)).map((s) => s.id));
      setToolIds(ids);
      if (tab === 'events') setItems(data.events);
      else if (tab === 'tools') setItems(data.spots.filter((s) => ids.has(s.id)));
      else if (tab === 'spots') setItems(data.spots.filter((s) => !ids.has(s.id)));
      else if (tab === 'all') setItems(data.events.concat(data.spots));
      return { catalog: data, ids };
    },
    [tab, countryCode],
  );

  const loadCatalog = useCallback(
    async (force = false) => {
      // force=false : cache mémoire / peek (zéro full-fetch). force=true : pull-to-refresh uniquement.
      const snap = force
        ? await loadAdminCatalogSnapshot(true)
        : await loadAdminCatalogSnapshot(false, (fresh) => {
            void applyCatalogSnapshot(fresh);
          });
      await applyCatalogSnapshot(snap);
    },
    [applyCatalogSnapshot],
  );

  const loadAccueil = useCallback(async (force = false) => {
    const data = await buildAdminAccueilContentList(countryCode, { force });
    if (tab === 'walks') setItems(data.walks);
    else if (tab === 'corner') setItems(data.corners);
    else if (tab === 'chronique') setItems(data.chroniques);
    else if (tab === 'logos') setItems(data.logos);
    else if (tab === 'all') setItems([...data.walks, ...data.corners, ...data.chroniques, ...data.logos]);
  }, [tab, countryCode]);

  const load = useCallback(async (force = false) => {
    if (tab === 'all') {
      const snap = force
        ? await loadAdminCatalogSnapshot(true)
        : await loadAdminCatalogSnapshot(false);
      const allEv = filterByAdminCountry(snap.events, countryCode);
      const allSp = filterByAdminCountry(snap.locations, countryCode);
      const catalog = await buildAdminContentList(allEv, allSp);
      const ids = new Set(allSp.filter((s) => isToolLocation(s)).map((s) => s.id));
      setToolIds(ids);
      const accueil = await buildAdminAccueilContentList(countryCode, { force });
      setItems([
        ...catalog.events,
        ...catalog.spots,
        ...accueil.walks,
        ...accueil.corners,
        ...accueil.chroniques,
        ...accueil.logos,
      ]);
      return;
    }
    if (isAccueilTab) {
      await loadAccueil(force);
      return;
    }
    await loadCatalog(force);
  }, [tab, countryCode, loadAccueil, loadCatalog, isAccueilTab]);

  useEffect(() => {
    if (role === 'ADMIN') void load();
  }, [role, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (!isAccueilTab && tab !== 'all') await refresh();
    invalidateAdminAccueilCache(countryCode);
    await load(true);
    setRefreshing(false);
  }, [refresh, load, isAccueilTab, tab, countryCode]);

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  const filtered = items.filter((i) => filter === 'all' || i.contentStatus === filter);

  async function changeCatalogStatus(id: string, kind: 'event' | 'spot', status: ContentStatus) {
    const result = await setContentStatus(kind, id, status);
    if (!result.ok) {
      Alert.alert('Erreur', result.error ?? 'Impossible de mettre à jour le statut en base.');
      return;
    }
    if (status === 'archived' || status === 'deactivated') {
      const contentKind = toolIds.has(id) ? 'tool' : kind;
      await syncPartnerViewsAfterAdminContentChange(contentKind, id, 'hidden');
    }
    invalidateContentCache();
    await refresh();
    await load();
    if (status === 'deactivated') setFilter('deactivated');
    if (status === 'draft') setFilter('draft');
    if (status === 'archived') setFilter('archived');
    Alert.alert('Mis à jour', `Statut : ${CONTENT_STATUS_LABELS[status]}`);
  }

  async function changeAccueilStatus(item: AdminContentItem, status: ContentStatus) {
    const active = status === 'published';
    let ok = false;
    if (item.kind === 'walk') ok = await setAdminWalkPublished(item.id, active, countryCode);
    else if (item.kind === 'corner') ok = await setAdminCreatorCornerActive(item.id, countryCode, active);
    else if (item.kind === 'chronique') ok = await setAdminChroniqueActive(item.id, countryCode, active);
    else if (item.kind === 'logo') ok = await setAdminHomePartnerLogoActive(item.id, active, countryCode);

    if (!ok) {
      Alert.alert('Erreur', 'Impossible de mettre à jour le statut.');
      return;
    }
    invalidateAdminAccueilCache(countryCode, [
      item.kind === 'walk'
        ? 'walks'
        : item.kind === 'corner'
          ? 'corners'
          : item.kind === 'chronique'
            ? 'chroniques'
            : 'logos',
    ]);
    await load(true);
    if (status === 'deactivated') setFilter('deactivated');
    Alert.alert('Mis à jour', `Statut : ${CONTENT_STATUS_LABELS[status]}`);
  }

  async function archiveItem(id: string, kind: 'event' | 'spot', title: string) {
    Alert.alert('Archiver', `Archiver « ${title} » ? Le contenu restera en base mais ne sera plus visible publiquement ni côté partenaire.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Archiver',
        style: 'destructive',
        onPress: async () => {
          await markContentArchived(kind, id);
          const contentKind = toolIds.has(id) ? 'tool' : kind;
          await syncPartnerViewsAfterAdminContentChange(contentKind, id, 'hidden');
          invalidateContentCache();
          await refresh();
          await load();
        },
      },
    ]);
  }

  async function deleteAccueilItem(item: AdminContentItem) {
    if (!isSuperAdmin) {
      Alert.alert('Action réservée', 'Seul le super administrateur peut supprimer définitivement un contenu.');
      return;
    }
    Alert.alert('Supprimer', `Supprimer définitivement « ${item.title} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          let ok = false;
          if (item.kind === 'walk') {
            const result = await deleteAdminLoopWalk(item.id, countryCode);
            ok = result.ok;
          } else if (item.kind === 'corner') ok = await deleteAdminCreatorCorner(item.id, countryCode);
          else if (item.kind === 'chronique') ok = await deleteAdminChronique(item.id, countryCode);
          else if (item.kind === 'logo') ok = await deleteAdminHomePartnerLogo(item.id, countryCode);
          if (!ok) {
            Alert.alert('Erreur', 'Suppression impossible.');
            return;
          }
          invalidateAdminAccueilCache(countryCode);
          await load(true);
        },
      },
    ]);
  }

  async function deleteContentItem(id: string, kind: 'event' | 'spot', title: string, source: 'staging' | 'supabase' | 'demo') {
    if (!isSuperAdmin) {
      Alert.alert('Action réservée', 'Seul le super administrateur peut supprimer définitivement un contenu.');
      return;
    }

    const contentKind = toolIds.has(id) ? 'tool' : kind;
    const impact = buildContentDeleteImpact(contentKind, title);
    Alert.alert(
      'Suppression en cascade',
      source === 'staging'
        ? `Supprimer « ${title} » ?\n\nContenu staging local (pas en base Supabase).`
        : formatCascadeDeleteMessage(impact),
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
            await load();
          },
        },
      ],
    );
  }

  function previewItem(item: AdminContentItem) {
    if (item.kind === 'walk') {
      if (!item.slug) {
        Alert.alert('Aperçu indisponible', 'Ce parcours n’a pas encore de fiche publique.');
        return;
      }
      navigateRoot(navigation, 'LoopWalkDetail', { slug: item.slug });
      return;
    }
    if (item.kind === 'corner') {
      if (!item.slug) {
        Alert.alert('Aperçu indisponible', 'Ce corner n’a pas encore de fiche publique.');
        return;
      }
      navigateRoot(navigation, 'CreatorCornerDetail', { slug: item.slug });
      return;
    }
    if (item.kind === 'chronique') {
      Alert.alert(
        'Le Fragment',
        'La chronique s’affiche comme une carte sur Accueil. Le bouton redirige vers le spot, l’événement ou l’outil lié — pas de page article.',
      );
      return;
    }
    if (item.kind === 'logo') {
      Alert.alert('Aperçu', 'Les logos s’affichent sur l’Accueil membre (bandeau partenaires).');
      return;
    }
    if (!item.slug) {
      Alert.alert('Aperçu indisponible', 'Ce contenu n’a pas encore de fiche publique (brouillon staging).');
      return;
    }
    if (item.kind === 'event') {
      navigateRoot(navigation, 'EventDetail', { slug: item.slug });
      return;
    }
    navigateRoot(navigation, 'SpotDetail', { slug: item.slug });
  }

  function editItem(item: AdminContentItem) {
    if (isAccueilKind(item.kind)) {
      const tab = accueilPanelTab(accueilKindToTab(item.kind));
      if (!navigateAdminPanel(navigation, 'AdminAccueil', { tab })) {
        Alert.alert('Édition Accueil', 'Ouvrez Control Tower → Accueil pour modifier ce contenu.');
      }
      return;
    }
    navigateRoot(navigation, 'PartnerSubmission', {
      type: item.kind,
      id: item.id,
      asAdmin: true,
      contentChannel: item.contentOrigin === 'loop' ? 'loop' : 'admin',
      isTool: toolIds.has(item.id),
    });
  }

  function openCreateFlow() {
    if (tab === 'walks' || tab === 'corner' || tab === 'chronique' || tab === 'logos') {
      const accueilTab = accueilPanelTab(tab);
      if (!navigateAdminPanel(navigation, 'AdminAccueil', { tab: accueilTab })) {
        Alert.alert('Création Accueil', 'Ouvrez Control Tower → Accueil pour créer walks, corner, chronique ou logos.');
      }
      return;
    }
    Alert.alert(
      'Création équipe',
      'Les publications admin / THE LOOP se créent depuis l’onglet THE LOOP.\n\nIci vous gérez tout le catalogue (partenaires inclus).',
      [
        { text: 'OK', style: 'cancel' },
        { text: 'Ouvrir THE LOOP', onPress: () => navigateRoot(navigation, 'AdminLoopContent') },
      ],
    );
  }

  const subtitle = isAccueilTab
    ? `Accueil ${countryLabel} — ${tab === 'walks' ? 'parcours' : tab === 'corner' ? 'Le Singulier' : tab === 'chronique' ? 'Le Fragment' : 'logos partenaires'}`
    : tab === 'all'
      ? `Catalogue ${countryLabel} — événements, spots, outils, walks, corner, chronique et logos`
      : `Catalogue ${countryLabel} — événements, spots et outils`;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={ADMIN_THEME.accent} />}
    >
      <AdminPageHeader
        title="Contenu"
        subtitle={subtitle}
        shell={shell}
        onBack={() => navigation.goBack()}
      />
      <AdminCountryBar shell={shell} compact />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
        {visibleTabs.map((t) => (
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
      </ScrollView>

      <Pressable
        style={[styles.createBtn, { borderColor: shell.filterInactiveBorder }]}
        onPress={openCreateFlow}
      >
        <Text style={{ color: shell.pageKicker, fontWeight: '700' }}>
          {isAccueilTab ? 'Créer → onglet Accueil' : 'Créer → onglet THE LOOP'}
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
        const actions = actionsForItem(item);
        const catalogKind = item.kind === 'event' || item.kind === 'spot' ? item.kind : null;
        return (
        <View key={`${item.kind}-${item.id}`} style={adminCardStyle(shell)}>
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
            {item.kind === 'event' && item.organizerName ? ` · ${item.organizerName}` : ''}
          </Text>
          <Text style={[styles.meta, { color: shell.pageKicker }]}>
            {item.kind === 'walk' ? 'Parcours · ' : item.kind === 'corner' ? 'Le Singulier · ' : item.kind === 'chronique' ? 'Le Fragment · ' : item.kind === 'logo' ? 'Logo · ' : ''}
            {item.contentOrigin ? `${CONTENT_ORIGIN_LABELS[item.contentOrigin]} · ` : ''}
            {item.source}
            {item.kind === 'walk' && item.isFeatured ? ' · ★ Parcours de la semaine' : ''}
            {catalogKind && (item.isFeatured ? ' · ★ À la une' : ' · Standard')}
          </Text>

          <View style={styles.actions}>
            <AdminActionIcon
              action="preview"
              color={ADMIN_THEME.accent}
              onPress={() => previewItem(item)}
            />
            {actions.canEdit ? (
              <AdminActionIcon
                action="edit"
                color={ADMIN_THEME.accent}
                onPress={() => editItem(item)}
              />
            ) : null}
            {actions.canPublish ? (
              <AdminActionIcon
                action="publish"
                onPress={() => void (isAccueilKind(item.kind)
                  ? changeAccueilStatus(item, 'published')
                  : catalogKind && changeCatalogStatus(item.id, catalogKind, 'published'))}
              />
            ) : null}
            {actions.canDeactivate ? (
              <AdminActionIcon
                action="deactivate"
                onPress={() => void (isAccueilKind(item.kind)
                  ? changeAccueilStatus(item, 'deactivated')
                  : catalogKind && changeCatalogStatus(item.id, catalogKind, 'deactivated'))}
              />
            ) : null}
            {actions.canMoveToDraft && catalogKind ? (
              <AdminActionIcon action="draft" onPress={() => void changeCatalogStatus(item.id, catalogKind, 'draft')} />
            ) : null}
            {actions.canArchive && catalogKind ? (
              <AdminActionIcon action="archive" onPress={() => void archiveItem(item.id, catalogKind, item.title)} />
            ) : null}
            {actions.canDelete ? (
              <AdminActionIcon
                action="delete"
                onPress={() => void (isAccueilKind(item.kind)
                  ? deleteAccueilItem(item)
                  : catalogKind && deleteContentItem(item.id, catalogKind, item.title, item.source))}
              />
            ) : null}
          </View>
        </View>
        );
      })}

      {filtered.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucun contenu pour ce filtre.</Text>
      ) : null}
    </ScrollView>
  );
}

function statusColor(status: ContentStatus): string {
  if (status === 'published') return '#10b981';
  if (status === 'deactivated') return '#f59e0b';
  if (status === 'archived') return '#94a3b8';
  return '#94a3b8';
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  tabsScroll: { marginBottom: 12, flexGrow: 0 },
  tabs: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  createBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 12, borderStyle: 'dashed', minHeight: 48, justifyContent: 'center' },
  filterRow: { marginBottom: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, marginRight: 8, minHeight: 40, justifyContent: 'center' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  meta: { marginTop: 4, fontSize: 11 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14, alignItems: 'center' },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 14 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
