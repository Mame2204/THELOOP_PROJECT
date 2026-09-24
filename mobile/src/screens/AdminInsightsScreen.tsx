import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getFullAdminInsights, peekFullAdminInsights } from '@/lib/admin-insights-store';
import { filterLiveCatalogContent } from '@/lib/admin-catalog-filter';
import { filterSpotsOnly, filterTools, toolLocationIds } from '@/lib/location-kind-utils';
import type {
  EventInsight,
  SpotEngagementInsight,
  CategoryInsight,
  ContentTypeUsageInsight,
  WalkEngagementInsight,
  CornerInsight,
  PollInsight,
} from '@/lib/admin-types';
import type { Event } from '@/types';
import type { HomeLocation } from '@/lib/demo-data';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useAdminCatalog } from '@/hooks/useAdminCatalog';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminModuleAccess, useFilteredAdminTabs } from '@/hooks/useAdminModuleAccess';
import { AdminPageHeader, AdminKpiCard, ADMIN_THEME, adminCardStyle } from '@/components/admin/AdminShell';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { AdminTabMenu } from '@/components/admin/AdminTabMenu';
import { CONTENT_H_PADDING } from '@/constants/layout';
import { listPendingEvents, listPendingSpots } from '@/lib/partner-staging-store';
import { countPartnershipsByStatus } from '@/lib/admin-partnership-store';
import { countPendingSuggestions } from '@/lib/suggestions-store';
import { isTeamContentOrigin } from '@/lib/content-origin';
import { navigateRoot } from '@/lib/navigation-utils';
import type { AdminPermissionId } from '@/lib/admin-permissions';
import { useAdminPermissions } from '@/context/AdminPermissionsContext';
import { useRoute } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type InsightSection = 'overview' | 'events' | 'spots' | 'tools' | 'walks' | 'platform' | 'benefits';
type MetricTab = 'all' | 'favorites' | 'clicks' | 'stars' | 'ratings' | 'categories' | 'granted' | 'active' | 'consumed' | 'expired' | 'catalog' | 'corner' | 'polls' | 'walks';

function formatRatingMeta(avg: number, count: number): string {
  if (count <= 0) return '0 avis';
  return `${avg.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/5 · ${count} avis`;
}

const TYPE_META: Record<ContentTypeUsageInsight['kind'], { accent: string }> = {
  event: { accent: '#8b5cf6' },
  spot: { accent: '#06b6d4' },
  tool: { accent: '#10b981' },
  walk: { accent: '#f59e0b' },
  corner: { accent: '#ec4899' },
  chronique: { accent: '#14b8a6' },
  poll: { accent: '#8b5cf6' },
};

const INSIGHT_SECTION_DEFS: Array<{ id: InsightSection; label: string; permission: AdminPermissionId }> = [
  { id: 'overview', label: 'Vue d\'ensemble', permission: 'insights_overview' },
  { id: 'events', label: 'Événements', permission: 'insights_events' },
  { id: 'spots', label: 'Spots', permission: 'insights_spots' },
  { id: 'tools', label: 'Outils', permission: 'insights_tools' },
  { id: 'benefits', label: 'Privilèges', permission: 'insights_benefits' },
  { id: 'platform', label: 'Accueil', permission: 'insights_platform' },
];

type Props = NativeStackScreenProps<RootStackParamList, 'AdminInsights'>;

export function AdminInsightsScreen({ navigation }: Props) {
  const route = useRoute();
  const teamOnly = Boolean((route.params as { teamOnly?: boolean } | undefined)?.teamOnly);
  const { role } = useAuthContext();
  const { countryCode, countryLabel } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('insights');
  const { isSuperAdmin } = useAdminPermissions();

  const insightSections = useFilteredAdminTabs(
    'insights',
    teamOnly
      ? INSIGHT_SECTION_DEFS.filter((s) => s.id !== 'platform')
      : INSIGHT_SECTION_DEFS,
  ) as Array<{ id: InsightSection; label: string }>;

  const [section, setSection] = useState<InsightSection>('overview');

  useEffect(() => {
    if (insightSections.length && !insightSections.some((s) => s.id === section)) {
      setSection(insightSections[0].id);
    }
  }, [insightSections, section]);

  const {
    publicEvents,
    getHomeLocations,
    refresh: refreshCatalog,
    isLoading: catalogLoading,
    error: catalogError,
  } = useAdminCatalog();
  const locations = useMemo(() => {
    const all = getHomeLocations();
    return teamOnly ? all.filter((l) => isTeamContentOrigin(l.contentOrigin)) : all;
  }, [getHomeLocations, teamOnly]);
  const scopedEvents = useMemo(
    () => (teamOnly ? publicEvents.filter((e) => isTeamContentOrigin(e.contentOrigin)) : publicEvents),
    [publicEvents, teamOnly],
  );
  const pureSpots = useMemo(() => filterSpotsOnly(locations), [locations]);
  const tools = useMemo(() => filterTools(locations), [locations]);
  const toolIds = useMemo(() => toolLocationIds(locations), [locations]);
  const [metric, setMetric] = useState<MetricTab>('all');
  const [data, setData] = useState<Awaited<ReturnType<typeof getFullAdminInsights>> | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [moderationCount, setModerationCount] = useState(0);
  const [partnershipApproved, setPartnershipApproved] = useState(0);
  const [partnershipPending, setPartnershipPending] = useState(0);
  const [suggestionsPending, setSuggestionsPending] = useState(0);

  const load = useCallback(async (options?: { force?: boolean }) => {
    setInsightsError(null);
    const includePlatform = isSuperAdmin && !teamOnly;
    const force = options?.force === true;
    if (!force) {
      const peeked = await peekFullAdminInsights(countryCode, includePlatform);
      if (peeked) {
        setData(peeked);
        setInsightsLoading(false);
      } else {
        setInsightsLoading(true);
      }
    } else {
      setInsightsLoading(true);
    }
    try {
      const live = await filterLiveCatalogContent(scopedEvents, locations);
      setData(
        await getFullAdminInsights(
          live.events,
          live.spots,
          5,
          toolIds,
          countryCode,
          includePlatform,
          { force },
        ),
      );
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : 'Impossible de charger les insights.');
      console.warn('[AdminInsights]', err);
    } finally {
      setInsightsLoading(false);
    }
  }, [toolIds, scopedEvents, locations, countryCode, isSuperAdmin, teamOnly]);

  useEffect(() => {
    if (role !== 'ADMIN' || catalogLoading) return;
    void load();
  }, [role, load, catalogLoading]);

  useEffect(() => {
    if (role !== 'ADMIN') return;
    let cancelled = false;
    void (async () => {
      const [ev, sp, pCounts, sug] = await Promise.all([
        listPendingEvents(countryCode),
        listPendingSpots(countryCode),
        countPartnershipsByStatus(countryCode),
        countPendingSuggestions(countryCode),
      ]);
      if (cancelled) return;
      setModerationCount(
        ev.length +
          sp.filter((s) => s.subCategory !== 'tools').length +
          sp.filter((s) => s.subCategory === 'tools').length,
      );
      setPartnershipApproved(pCounts.approved);
      setPartnershipPending(pCounts.pending + pCounts.to_contact + pCounts.in_discussion);
      setSuggestionsPending(sug);
    })();
    return () => {
      cancelled = true;
    };
  }, [role, countryCode]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshCatalog();
    await load({ force: true });
    setRefreshing(false);
  }, [refreshCatalog, load]);

  if (role !== 'ADMIN') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle }}>Accès réservé</Text>
      </View>
    );
  }

  if (!allowed) {
    if (isLoading) {
      return (
        <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
          <ActivityIndicator color={ADMIN_THEME.accent} />
        </View>
      );
    }
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#ffffff' }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={ADMIN_THEME.accent} />}
    >
      <AdminPageHeader
        title="Insights"
        subtitle={
          teamOnly
            ? `Contenus THE LOOP — ${countryLabel}`
            : `Vue d’ensemble — ${countryLabel}`
        }
        shell={shell}
      />
      <AdminCountryBar shell={shell} compact />

      {!teamOnly ? (
      <View style={styles.quickRow}>
        <Pressable
          style={[styles.quick, moderationCount > 0 && styles.quickHot]}
          onPress={() => navigateRoot(navigation, 'AdminModeration', { tab: 'events' })}
        >
          <Text style={styles.quickTitle}>Modération</Text>
          <Text style={styles.quickValue}>{moderationCount}</Text>
        </Pressable>
        <Pressable
          style={styles.quick}
          onPress={() => navigateRoot(navigation, 'AdminPartnerships')}
        >
          <Text style={styles.quickTitle}>Pipeline</Text>
          <Text style={styles.quickValue}>{partnershipPending}</Text>
        </Pressable>
        <Pressable
          style={styles.quick}
          onPress={() => navigateRoot(navigation, 'AdminSuggestions')}
        >
          <Text style={styles.quickTitle}>Idées</Text>
          <Text style={styles.quickValue}>{suggestionsPending}</Text>
        </Pressable>
      </View>
      ) : null}

      <AdminTabMenu
        tabs={insightSections}
        active={section}
        onChange={(s) => {
          setSection(s);
          setMetric('all');
        }}
        shell={shell}
        accent={ADMIN_THEME.accent}
      />

      {catalogError ? (
        <Text style={[styles.statusHint, { color: '#b45309' }]}>{catalogError}</Text>
      ) : null}
      {insightsError ? (
        <Text style={[styles.statusHint, { color: '#b91c1c' }]}>{insightsError}</Text>
      ) : null}
      {(catalogLoading || insightsLoading) && !data ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={ADMIN_THEME.accent} />
          <Text style={[styles.statusHint, { color: shell.pageKicker }]}>Chargement des détails…</Text>
        </View>
      ) : null}

      {data ? (
        <InsightSectionKpis
          section={section}
          data={data}
          events={scopedEvents}
          spots={pureSpots}
          tools={tools}
          showAccueil={isSuperAdmin && !teamOnly}
          shell={shell}
        />
      ) : null}

      {section === 'overview' && data ? (
        <>
          <EngagementByTypeBlock rows={data.contentTypeUsage} shell={shell} />
        </>
      ) : null}

      {section === 'events' && data ? (
        <>
          <AdminTabMenu
            tabs={[
              { id: 'all', label: 'Tous' },
              { id: 'favorites', label: 'Favoris' },
              { id: 'clicks', label: 'Clics' },
              { id: 'categories', label: 'Catégories' },
            ]}
            active={metric}
            onChange={(m) => setMetric(m as MetricTab)}
            shell={shell}
            accent="#8b5cf6"
          />
          {metric === 'all' || metric === 'favorites' ? (
            <InsightBlock title="TOP 5 plébiscités — Favoris" items={data.eventsByFavorites} shell={shell} accent="#8b5cf6" showVenue />
          ) : null}
          {metric === 'all' || metric === 'clicks' ? (
            <InsightBlock title="TOP 5 plébiscités — Clics" items={data.eventsByClicks} shell={shell} accent="#06b6d4" showVenue metric="clics" />
          ) : null}
          {metric === 'all' || metric === 'categories' ? (
            <CategoryBlock title="TOP 5 plébiscités — catégories" items={data.topEventCategories} shell={shell} accent="#a78bfa" />
          ) : null}
        </>
      ) : null}

      {section === 'spots' && data ? (
        <>
          <AdminTabMenu
            tabs={[
              { id: 'all', label: 'Tous' },
              { id: 'favorites', label: 'Favoris' },
              { id: 'clicks', label: 'Clics' },
              { id: 'stars', label: 'Étoiles' },
              { id: 'ratings', label: 'Notes' },
              { id: 'categories', label: 'Catégories' },
            ]}
            active={metric}
            onChange={(m) => setMetric(m as MetricTab)}
            shell={shell}
            accent="#06b6d4"
          />
          {metric === 'all' || metric === 'favorites' ? (
            <SpotBlock title="TOP 5 plébiscités — Favoris" items={data.spotsByFavorites.filter((i) => !toolIds.has(i.id))} shell={shell} accent="#8b5cf6" metric="favoris" />
          ) : null}
          {metric === 'all' || metric === 'clicks' ? (
            <SpotBlock title="TOP 5 plébiscités — Clics" items={data.spotsByClicks.filter((i) => !toolIds.has(i.id))} shell={shell} accent="#06b6d4" metric="clics" />
          ) : null}
          {metric === 'all' || metric === 'stars' ? (
            <SpotBlock title="TOP 5 plébiscités — Étoiles" items={data.spotsByStars.filter((i) => !toolIds.has(i.id))} shell={shell} accent="#fbbf24" metric="étoiles" />
          ) : null}
          {metric === 'all' || metric === 'ratings' ? (
            <SpotBlock title="TOP 5 plébiscités — Notes" items={data.spotsByRatings.filter((i) => !toolIds.has(i.id))} shell={shell} accent="#f97316" metric="notes" />
          ) : null}
          {metric === 'all' || metric === 'categories' ? (
            <CategoryBlock title="TOP 5 plébiscités — catégories" items={data.topSpotCategories} shell={shell} accent="#22d3ee" />
          ) : null}
        </>
      ) : null}

      {section === 'tools' && data ? (
        <>
          <AdminTabMenu
            tabs={[
              { id: 'all', label: 'Tous' },
              { id: 'favorites', label: 'Favoris' },
              { id: 'clicks', label: 'Clics' },
              { id: 'stars', label: 'Étoiles' },
              { id: 'ratings', label: 'Notes' },
              { id: 'categories', label: 'Catégories' },
            ]}
            active={metric}
            onChange={(m) => setMetric(m as MetricTab)}
            shell={shell}
            accent="#10b981"
          />
          {metric === 'all' || metric === 'favorites' ? (
            <SpotBlock title="TOP 5 plébiscités — Favoris" items={data.spotsByFavorites.filter((i) => toolIds.has(i.id))} shell={shell} accent="#8b5cf6" metric="favoris" />
          ) : null}
          {metric === 'all' || metric === 'clicks' ? (
            <SpotBlock title="TOP 5 plébiscités — Clics" items={data.spotsByClicks.filter((i) => toolIds.has(i.id))} shell={shell} accent="#06b6d4" metric="clics" />
          ) : null}
          {metric === 'all' || metric === 'stars' ? (
            <SpotBlock title="TOP 5 plébiscités — Étoiles" items={data.spotsByStars.filter((i) => toolIds.has(i.id))} shell={shell} accent="#fbbf24" metric="étoiles" />
          ) : null}
          {metric === 'all' || metric === 'ratings' ? (
            <SpotBlock title="TOP 5 plébiscités — Notes" items={data.spotsByRatings.filter((i) => toolIds.has(i.id))} shell={shell} accent="#f97316" metric="notes" />
          ) : null}
          {metric === 'all' || metric === 'categories' ? (
            <CategoryBlock title="TOP 5 plébiscités — catégories" items={data.topToolCategories} shell={shell} accent="#34d399" />
          ) : null}
        </>
      ) : null}

      {section === 'platform' && data && isSuperAdmin ? (
        <>
          <AdminTabMenu
            tabs={[
              { id: 'all', label: 'Tous' },
              { id: 'corner', label: 'Le Singulier' },
              { id: 'polls', label: 'Sondages' },
              { id: 'walks', label: 'Parcours' },
            ]}
            active={metric}
            onChange={(m) => setMetric(m as MetricTab)}
            shell={shell}
            accent="#ec4899"
          />
          {metric === 'all' || metric === 'corner' ? (
            <>
              <CornerBlock title="Le Singulier — Clics" items={data.cornersByClicks} shell={shell} accent="#ec4899" />
              <CornerBlock title="Le Fragment — Clics" items={data.chroniquesByClicks ?? []} shell={shell} accent="#14b8a6" />
            </>
          ) : null}
          {metric === 'all' || metric === 'polls' ? (
            <PollInsightsBlock title="Sondages — participation" polls={data.pollInsights} shell={shell} accent="#8b5cf6" />
          ) : null}
          {metric === 'all' || metric === 'walks' ? (
            <>
              <WalkBlock title="Parcours — Favoris" items={data.walksByFavorites} shell={shell} accent="#f59e0b" metric="favoris" />
              <WalkBlock title="Parcours — Clics" items={data.walksByClicks} shell={shell} accent="#06b6d4" metric="clics" />
              <WalkBlock title="Parcours — Notes" items={data.walksByRatings} shell={shell} accent="#fb923c" metric="notes" />
            </>
          ) : null}
        </>
      ) : null}

      {section === 'benefits' && data ? (
        <BenefitKpisBlock kpis={data.benefitKpis} stats={data.catalogBenefitStats} shell={shell} hideKpis />
      ) : null}

      {section !== 'overview' && !data ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Chargement des données…</Text>
      ) : null}
    </ScrollView>
  );
}

function formatEngagementRowMeta(row: ContentTypeUsageInsight): string {
  if (row.kind === 'event') {
    return `${row.totalFavorites} favori${row.totalFavorites > 1 ? 's' : ''} · ${row.totalClicks} clic${row.totalClicks > 1 ? 's' : ''} · ${row.itemCount} fiche${row.itemCount > 1 ? 's' : ''}`;
  }
  if (row.kind === 'corner') {
    return `${row.itemCount} profil${row.itemCount > 1 ? 's' : ''} créé${row.itemCount > 1 ? 's' : ''} · ${row.totalClicks} clic${row.totalClicks > 1 ? 's' : ''}`;
  }
  if (row.kind === 'chronique') {
    return `${row.itemCount} Fragment${row.itemCount > 1 ? 's' : ''} · ${row.totalClicks} clic${row.totalClicks > 1 ? 's' : ''}`;
  }
  if (row.kind === 'poll') {
    const users = row.totalRatingCount;
    const votes = row.totalFavorites;
    const rate = users > 0 ? formatPct(row.ratingAvg) : '—';
    return `${votes} vote${votes > 1 ? 's' : ''} / ${users} utilisateur${users > 1 ? 's' : ''} (${rate}) · ${row.itemCount} sondage${row.itemCount > 1 ? 's' : ''}`;
  }
  if (row.kind === 'walk') {
    return `${row.totalFavorites} favori${row.totalFavorites > 1 ? 's' : ''} · ${row.totalClicks} clic${row.totalClicks > 1 ? 's' : ''} · ${formatRatingMeta(row.ratingAvg, row.totalRatingCount)} · ${row.itemCount} parcours`;
  }
  return `${row.totalFavorites} favori${row.totalFavorites > 1 ? 's' : ''} · ${row.totalClicks} clic${row.totalClicks > 1 ? 's' : ''} · ${formatRatingMeta(row.ratingAvg, row.totalRatingCount)} · ${row.itemCount} fiche${row.itemCount > 1 ? 's' : ''}`;
}

function EngagementByTypeBlock({
  rows,
  shell,
}: {
  rows: ContentTypeUsageInsight[];
  shell: ReturnType<typeof useMemberTheme>['shell'];
}) {
  const visible = rows.filter((row) => row.itemCount > 0);
  if (!visible.length) {
    return (
      <Text style={[styles.empty, { color: shell.pageKicker }]}>Pas encore de données plébiscités.</Text>
    );
  }

  return (
    <View style={[styles.hero, { backgroundColor: shell.filterInactiveBg, borderColor: shell.tabIndicator }]}>
      <Text style={[styles.heroTitle, { color: shell.tabIndicator }]}>🏆 Plébiscités par type</Text>
      <Text style={[styles.heroHint, { color: shell.pageKicker }]}>
        Du plus plébiscité au moins plébiscité
      </Text>
      {visible.map((row, index) => (
        <View key={row.kind} style={adminCardStyle(shell)}>
          <RankRow
            rank={index + 1}
            title={row.label}
            accent={TYPE_META[row.kind]?.accent ?? shell.tabIndicator}
            shell={shell}
          />
          <Text style={[styles.meta, { color: shell.pageKicker }]}>
            {formatEngagementRowMeta(row)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function formatPct(value: number): string {
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

type ContentStatusKey = 'draft' | 'published' | 'deactivated' | 'archived';

function countContentStatuses(
  items: Array<{ contentStatus?: ContentStatusKey }>,
): Record<ContentStatusKey, number> {
  const out: Record<ContentStatusKey, number> = {
    draft: 0,
    published: 0,
    deactivated: 0,
    archived: 0,
  };
  for (const item of items) {
    const key = item.contentStatus ?? 'draft';
    out[key] += 1;
  }
  return out;
}

function InsightSectionKpis({
  section,
  data,
  events,
  spots,
  tools,
  showAccueil,
  shell,
}: {
  section: InsightSection;
  data: NonNullable<Awaited<ReturnType<typeof getFullAdminInsights>>>;
  events: Event[];
  spots: HomeLocation[];
  tools: HomeLocation[];
  showAccueil: boolean;
  shell: ReturnType<typeof useMemberTheme>['shell'];
}) {
  const d = data.benefitDetails;
  const pc = data.platformCounts;

  let title = 'Indicateurs';
  const cards: Array<{ label: string; value: string; hint?: string; accent?: string }> = [];

  if (section === 'overview') {
    title = 'Vue d’ensemble';
    const ev = countContentStatuses(events);
    const sp = countContentStatuses(spots);
    const tl = countContentStatuses(tools);
    cards.push(
      { label: 'Événements publiés', value: String(ev.published) },
      { label: 'Spots publiés', value: String(sp.published), accent: '#06b6d4' },
      { label: 'Outils publiés', value: String(tl.published), accent: '#10b981' },
      { label: 'Modèles associés', value: String(d.catalogActiveAssociated), accent: '#8b5cf6' },
    );
    if (showAccueil) {
      cards.push(
        { label: 'Le Singulier', value: String(pc.corners), accent: '#ec4899' },
        { label: 'Le Fragment', value: String(pc.chroniques), accent: '#14b8a6' },
        { label: 'Sondages', value: String(pc.polls) },
        { label: 'Parcours', value: String(pc.walksPublished), accent: '#f59e0b' },
      );
    }
  } else if (section === 'events') {
    title = 'Événements — statuts';
    const m = countContentStatuses(events);
    cards.push(
      { label: 'Publiés', value: String(m.published) },
      { label: 'Archivés', value: String(m.archived) },
      { label: 'Désactivés', value: String(m.deactivated) },
      { label: 'Brouillons', value: String(m.draft) },
    );
  } else if (section === 'spots') {
    title = 'Spots — statuts';
    const m = countContentStatuses(spots);
    cards.push(
      { label: 'Publiés', value: String(m.published), accent: '#06b6d4' },
      { label: 'Archivés', value: String(m.archived) },
      { label: 'Désactivés', value: String(m.deactivated) },
      { label: 'Brouillons', value: String(m.draft) },
    );
  } else if (section === 'tools') {
    title = 'Outils — statuts';
    const m = countContentStatuses(tools);
    cards.push(
      { label: 'Publiés', value: String(m.published), accent: '#10b981' },
      { label: 'Archivés', value: String(m.archived) },
      { label: 'Désactivés', value: String(m.deactivated) },
      { label: 'Brouillons', value: String(m.draft) },
    );
  } else if (section === 'benefits') {
    title = 'Privilèges';
    cards.push({ label: 'Modèles créés', value: String(d.catalogTotal), accent: '#8b5cf6' });
    if (d.catalogActive !== d.catalogTotal) {
      cards.push({ label: 'Modèles actifs', value: String(d.catalogActive) });
    }
    cards.push(
      { label: 'Actifs associés', value: String(d.catalogActiveAssociated) },
      { label: 'Octrois individuels', value: String(d.individual.granted) },
      { label: 'Octrois par rôle', value: String(d.roleEntitlement.granted) },
      { label: 'Octrois total', value: String(d.allGrants.granted) },
      { label: 'Non consommés', value: String(d.allGrants.active), accent: '#34d399' },
      { label: 'Consommés', value: String(d.allGrants.consumed), accent: '#06b6d4' },
      { label: 'Expirés sans usage', value: String(d.allGrants.expired), accent: '#f87171' },
    );
  } else if (section === 'platform' && showAccueil) {
    title = 'Accueil — volumes';
    cards.push(
      { label: 'Le Singulier', value: String(pc.corners), accent: '#ec4899' },
      { label: 'Le Fragment', value: String(pc.chroniques), accent: '#14b8a6' },
      { label: 'Sondages', value: String(pc.polls) },
      { label: 'Parcours publiés', value: String(pc.walksPublished), accent: '#f59e0b' },
      { label: 'Logos', value: String(pc.logos) },
    );
  }

  if (!cards.length) return null;

  return (
    <View style={[styles.hero, { backgroundColor: shell.filterInactiveBg, borderColor: shell.tabIndicator, marginBottom: 12 }]}>
      <Text style={[styles.heroTitle, { color: shell.tabIndicator }]}>{title}</Text>
      <View style={styles.kpiGrid}>
        {cards.map((c) => (
          <AdminKpiCard
            key={c.label}
            label={c.label}
            value={c.value}
            hint={c.hint}
            shell={shell}
            accent={c.accent}
            style={styles.kpiThird}
          />
        ))}
      </View>
    </View>
  );
}

function BenefitKpisBlock({
  kpis,
  stats,
  shell,
  compact = false,
  hideKpis = false,
}: {
  kpis: { granted: number; active: number; expired: number; consumed: number };
  stats: Array<{ catalogId: string; title: string; granted: number; used: number; unusedAssigned: number }>;
  shell: ReturnType<typeof useMemberTheme>['shell'];
  compact?: boolean;
  hideKpis?: boolean;
}) {
  return (
    <>
      {!hideKpis ? (
        <>
          <Text style={[styles.section, { color: shell.pageKicker }]}>Privilèges — validation</Text>
          <View style={styles.kpiGrid}>
            <AdminKpiCard label="Octroyés" value={String(kpis.granted)} shell={shell} accent="#8b5cf6" style={styles.kpiThird} />
            <AdminKpiCard label="En cours" value={String(kpis.active)} shell={shell} accent="#34d399" style={styles.kpiThird} />
            <AdminKpiCard label="Consommés" value={String(kpis.consumed)} shell={shell} accent="#06b6d4" style={styles.kpiThird} />
            <AdminKpiCard label="Expirés" value={String(kpis.expired)} shell={shell} accent="#f87171" style={styles.kpiThird} />
          </View>
        </>
      ) : null}
      {!compact && stats.length > 0 ? (
        <>
          <Text style={[styles.section, { color: shell.pageKicker, marginTop: 8 }]}>Modèles associés</Text>
          {stats.map((stat) => (
            <View key={stat.catalogId} style={adminCardStyle(shell)}>
              <Text style={[styles.leaderItem, { color: shell.pageTitle, fontWeight: '700' }]} numberOfLines={2}>
                {stat.title}
                {!stat.isActive ? ' · inactif' : ''}
              </Text>
              <Text style={[styles.meta, { color: shell.pageKicker }]}>
                {stat.granted} octroi{stat.granted > 1 ? 's' : ''} ({stat.grantedIndividual ?? 0} ind. ·{' '}
                {stat.grantedRole ?? 0} rôle) · {stat.used} consommé{stat.used > 1 ? 's' : ''} ·{' '}
                {stat.unusedAssigned} non consommé{stat.unusedAssigned > 1 ? 's' : ''}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </>
  );
}

function CornerBlock({
  title,
  items,
  shell,
  accent,
}: {
  title: string;
  items: CornerInsight[];
  shell: ReturnType<typeof useMemberTheme>['shell'];
  accent: string;
}) {
  const visible = [...items]
    .sort((a, b) => b.clickCount - a.clickCount || Number(b.isActive) - Number(a.isActive))
    .slice(0, 10);
  return (
    <>
      <Text style={[styles.section, { color: shell.pageKicker }]}>{title}</Text>
      {visible.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucun Singulier enregistré.</Text>
      ) : (
        visible.map((item, index) => (
          <View key={item.id} style={adminCardStyle(shell)}>
            <RankRow rank={index + 1} title={item.personName} accent={accent} shell={shell} />
            <Text style={[styles.meta, { color: shell.pageKicker }]}>
              {item.clickCount} clic{item.clickCount > 1 ? 's' : ''}
              {item.periodLabel ? ` · ${item.periodLabel}` : ''}
              {item.isActive ? ' · Actif' : ''}
            </Text>
            <Text style={[styles.venue, { color: shell.pageTitle }]} numberOfLines={2}>{item.title}</Text>
          </View>
        ))
      )}
    </>
  );
}

function PollInsightsBlock({
  title,
  polls,
  shell,
  accent,
}: {
  title: string;
  polls: PollInsight[];
  shell: ReturnType<typeof useMemberTheme>['shell'];
  accent: string;
}) {
  return (
    <>
      <Text style={[styles.section, { color: shell.pageKicker }]}>{title}</Text>
      {polls.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucun sondage enregistré.</Text>
      ) : (
        polls.map((poll) => (
          <View key={poll.id} style={adminCardStyle(shell)}>
            <Text style={[styles.leaderItem, { color: shell.pageTitle, fontWeight: '700' }]} numberOfLines={3}>
              {poll.question}
            </Text>
            <Text style={[styles.meta, { color: shell.pageKicker }]}>
              {poll.responseCount} vote{poll.responseCount > 1 ? 's' : ''} / {poll.totalUsers} utilisateur{poll.totalUsers > 1 ? 's' : ''}
              {poll.totalUsers > 0 ? ` · ${formatPct(poll.userParticipationRate)} des inscrits` : ''}
              {poll.viewCount > 0 ? ` · ${poll.viewCount} vue${poll.viewCount > 1 ? 's' : ''}` : ''}
              {poll.isActive ? ' · Actif' : ''}
              {poll.weekKey ? ` · ${poll.weekKey}` : ''}
            </Text>
            {poll.options.length > 0 ? (
              <Text style={[styles.meta, { color: shell.pageKicker, marginTop: 6, fontWeight: '700' }]}>
                Réponses
              </Text>
            ) : null}
            {poll.options.map((opt) => (
              <Text key={opt.optionId} style={[styles.meta, { color: shell.pageTitle, marginTop: 4 }]}>
                · {opt.label} — {opt.voteCount} vote{opt.voteCount > 1 ? 's' : ''} ({formatPct(opt.voteRate)})
              </Text>
            ))}
          </View>
        ))
      )}
    </>
  );
}

function WalkBlock({
  title,
  items,
  shell,
  accent,
  metric,
}: {
  title: string;
  items: WalkEngagementInsight[];
  shell: ReturnType<typeof useMemberTheme>['shell'];
  accent: string;
  metric: 'favoris' | 'clics' | 'notes';
}) {
  return (
    <>
      <Text style={[styles.section, { color: shell.pageKicker }]}>{title}</Text>
      {items.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Pas encore de données.</Text>
      ) : (
        items.map((item, index) => (
          <View key={`${title}-${item.id}`} style={adminCardStyle(shell)}>
            <RankRow rank={index + 1} title={item.title} accent={accent} shell={shell} />
            <Text style={[styles.meta, { color: shell.pageKicker }]}>
              {metric === 'favoris'
                ? `${item.favoriteCount} favori${item.favoriteCount > 1 ? 's' : ''}`
                : metric === 'clics'
                  ? `${item.clickCount} clic${item.clickCount > 1 ? 's' : ''}`
                  : formatRatingMeta(item.ratingAvg, item.ratingCount)}
            </Text>
          </View>
        ))
      )}
    </>
  );
}

function CategoryBlock({
  title,
  items,
  shell,
  accent,
}: {
  title: string;
  items: CategoryInsight[];
  shell: ReturnType<typeof useMemberTheme>['shell'];
  accent: string;
}) {
  return (
    <>
      <Text style={[styles.section, { color: shell.pageKicker }]}>{title}</Text>
      {items.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Pas encore de données.</Text>
      ) : (
        items.map((item, index) => (
          <View key={`${title}-${item.key}`} style={adminCardStyle(shell)}>
            <RankRow rank={index + 1} title={item.label} accent={accent} shell={shell} />
            <Text style={[styles.meta, { color: shell.pageKicker }]}>
              {item.favoriteCount} favori{item.favoriteCount > 1 ? 's' : ''} · {item.clickCount} clic{item.clickCount > 1 ? 's' : ''}
              {item.ratingCount > 0 ? ` · ${formatRatingMeta(item.ratingAvg, item.ratingCount)}` : ''}
            </Text>
          </View>
        ))
      )}
    </>
  );
}

function InsightBlock({
  title,
  items,
  shell,
  accent,
  showVenue,
  metric = 'favoris',
}: {
  title: string;
  items: EventInsight[];
  shell: ReturnType<typeof useMemberTheme>['shell'];
  accent: string;
  showVenue?: boolean;
  metric?: 'favoris' | 'clics';
}) {
  return (
    <>
      <Text style={[styles.section, { color: shell.pageKicker }]}>{title}</Text>
      {items.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Pas encore de données.</Text>
      ) : (
        items.map((item, index) => (
          <View key={`${title}-${item.id}`} style={adminCardStyle(shell)}>
            <RankRow rank={index + 1} title={item.title} accent={accent} shell={shell} />
            <Text style={[styles.meta, { color: shell.pageKicker }]}>
              {metric === 'clics' ? `${item.clickCount} clic${item.clickCount > 1 ? 's' : ''}` : `${item.favoriteCount} favori${item.favoriteCount > 1 ? 's' : ''}`}
            </Text>
            {showVenue && item.venueName ? (
              <Text style={[styles.venue, { color: shell.pageTitle }]}>📍 {item.venueName}</Text>
            ) : null}
          </View>
        ))
      )}
    </>
  );
}

function SpotBlock({
  title,
  items,
  shell,
  accent,
  metric,
}: {
  title: string;
  items: SpotEngagementInsight[];
  shell: ReturnType<typeof useMemberTheme>['shell'];
  accent: string;
  metric: 'favoris' | 'clics' | 'étoiles' | 'notes';
}) {
  return (
    <>
      <Text style={[styles.section, { color: shell.pageKicker }]}>{title}</Text>
      {items.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Pas encore de données.</Text>
      ) : (
        items.map((item, index) => (
          <View key={`${title}-${item.id}`} style={adminCardStyle(shell)}>
            <RankRow rank={index + 1} title={item.title} accent={accent} shell={shell} />
            <Text style={[styles.meta, { color: shell.pageKicker }]}>
              {metric === 'favoris' && `${item.favoriteCount} favori${item.favoriteCount > 1 ? 's' : ''}`}
              {metric === 'clics' && `${item.clickCount} clic${item.clickCount > 1 ? 's' : ''}`}
              {metric === 'étoiles' && `${item.starCount}★ · score ${item.engagementScore}${item.starsSource === 'admin' ? ' (admin)' : ''}`}
              {metric === 'notes' && formatRatingMeta(item.ratingAvg, item.ratingCount)}
            </Text>
          </View>
        ))
      )}
    </>
  );
}

function RankRow({
  rank,
  title,
  accent,
  shell,
}: {
  rank: number;
  title: string;
  accent: string;
  shell: ReturnType<typeof useMemberTheme>['shell'];
}) {
  return (
    <View style={styles.rankRow}>
      <View style={[styles.rank, { backgroundColor: accent + '22' }]}>
        <Text style={{ color: accent, fontWeight: '800' }}>#{rank}</Text>
      </View>
      <Text style={[styles.itemTitle, { color: shell.pageTitle }]} numberOfLines={1}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: CONTENT_H_PADDING, paddingBottom: 40 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8, marginBottom: 8 },
  kpiThird: { width: '31.5%' },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  quick: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#fafafa',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  quickHot: { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  quickTitle: { fontSize: 8, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: '#737373' },
  quickValue: { marginTop: 2, fontSize: 16, fontWeight: '800', color: '#171717' },
  hero: { borderWidth: 2, borderRadius: 16, padding: 14, marginBottom: 8 },
  heroTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  heroHint: { fontSize: 11, marginBottom: 12, fontStyle: 'italic' },
  leaderItem: { marginTop: 6, fontSize: 14, fontWeight: '700' },
  section: { marginTop: 16, marginBottom: 8, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  meta: { marginTop: 6, fontSize: 11 },
  venue: { marginTop: 4, fontSize: 12, fontWeight: '600' },
  empty: { fontSize: 13, fontStyle: 'italic', marginBottom: 8 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  statusHint: { fontSize: 12, marginBottom: 8 },
});
