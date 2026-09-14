import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { usePartnerContentScopes } from '@/hooks/usePartnerContentScopes';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useContent } from '@/context/ContentContext';
import { AdminPageHeader, adminCardStyle } from '@/components/admin/AdminShell';
import { AdminTabMenu } from '@/components/admin/AdminTabMenu';
import {
  STATUS_LABELS,
  listPartnerEvents,
  listPartnerSpots,
  type SubmissionStatus,
} from '@/lib/partner-staging-store';
import {
  partnerEventContentKey,
  partnerSpotContentKey,
} from '@/lib/partner-content-visibility';
import { getPartnerContentBenefitCounters } from '@/lib/partner-benefit-matching';
import { fetchLivePartnerCatalogIds } from '@/lib/partner-catalog-ids';
import { peekContentSnapshot, getHomeLocations, getPublicEvents, getPrimeEvents } from '@/lib/content-store';
import { resolvePartnerWorkspaceContext } from '@/lib/partner-spot-auth';
import { navigateRoot } from '@/lib/navigation-utils';
import type { ShellTheme } from '@/lib/theme-config';
import type { TabScreenProps } from '@/navigation/types';

type Props = TabScreenProps<'PartnerStats'>;

const PRO_ACCENT = '#20C997';

type ContentSection = 'all' | 'spots' | 'tools' | 'events';
type MetricTab = 'all' | 'favorites' | 'clicks' | 'stars' | 'ratings';
type StatusTab = 'all' | SubmissionStatus;

type ContentKind = 'spot' | 'tool' | 'event';

type PerfItem = {
  id: string;
  kind: ContentKind;
  title: string;
  status: SubmissionStatus;
  clicks: number;
  favorites: number;
  stars: number;
  ratingAvg: number;
  ratingCount: number;
  activeBenefits: number;
  pendingBenefits: number;
  validations: number;
};

function formatRatingMeta(avg: number, count: number): string {
  if (count <= 0) return '0 avis';
  return `${avg.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/5 · ${count} avis`;
}

function kindLabel(kind: ContentKind): string {
  if (kind === 'event') return 'Événement';
  if (kind === 'tool') return 'Outil';
  return 'Spot';
}

function kindAccent(kind: ContentKind): string {
  if (kind === 'event') return '#8b5cf6';
  if (kind === 'tool') return '#10b981';
  return '#06b6d4';
}

function metricAccent(metric: MetricTab): string {
  if (metric === 'favorites') return '#8b5cf6';
  if (metric === 'clicks') return '#06b6d4';
  if (metric === 'stars') return '#fbbf24';
  if (metric === 'ratings') return '#f97316';
  return PRO_ACCENT;
}

function attractivenessScore(item: PerfItem): number {
  return item.favorites + item.clicks + item.stars * 5 + item.ratingAvg * 10 + item.ratingCount;
}

function sortByMetric(items: PerfItem[], metric: MetricTab): PerfItem[] {
  const copy = [...items];
  copy.sort((a, b) => {
    if (metric === 'favorites') return b.favorites - a.favorites || attractivenessScore(b) - attractivenessScore(a);
    if (metric === 'clicks') return b.clicks - a.clicks || attractivenessScore(b) - attractivenessScore(a);
    if (metric === 'stars') return b.stars - a.stars || attractivenessScore(b) - attractivenessScore(a);
    if (metric === 'ratings') {
      return b.ratingAvg - a.ratingAvg
        || b.ratingCount - a.ratingCount
        || attractivenessScore(b) - attractivenessScore(a);
    }
    return attractivenessScore(b) - attractivenessScore(a);
  });
  return copy;
}

function focusMetricLabel(metric: MetricTab, item: PerfItem): string | null {
  if (metric === 'favorites') return `${item.favorites} favori${item.favorites > 1 ? 's' : ''}`;
  if (metric === 'clicks') return `${item.clicks} clic${item.clicks > 1 ? 's' : ''}`;
  if (metric === 'stars') return `${item.stars}★`;
  if (metric === 'ratings') return formatRatingMeta(item.ratingAvg, item.ratingCount);
  return null;
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
  shell: ShellTheme;
}) {
  return (
    <View style={styles.rankRow}>
      <View style={[styles.rank, { backgroundColor: `${accent}22` }]}>
        <Text style={{ color: accent, fontWeight: '800' }}>#{rank}</Text>
      </View>
      <Text style={[styles.itemTitle, { color: shell.pageTitle }]} numberOfLines={2}>{title}</Text>
    </View>
  );
}

function statusColor(status: SubmissionStatus): string {
  if (status === 'approved') return '#34d399';
  if (status === 'pending') return '#fbbf24';
  if (status === 'rejected') return '#f87171';
  return '#94a3b8';
}

export function PartnerStatsScreen({ navigation }: Props) {
  const { role, user } = useAuthContext();
  const { shell } = useMemberTheme();
  const { refresh } = useContent();
  const { canManageEvents, canManageSpots, canManageTools, hasAnyScope } = usePartnerContentScopes();
  const [items, setItems] = useState<PerfItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState<ContentSection>('all');
  const [metric, setMetric] = useState<MetricTab>('all');
  const [status, setStatus] = useState<StatusTab>('all');

  const sectionTabs = useMemo(() => {
    const tabs: { id: ContentSection; label: string }[] = [{ id: 'all', label: 'Tous' }];
    const hasSpots = items.some((i) => i.kind === 'spot');
    const hasTools = items.some((i) => i.kind === 'tool');
    const hasEvents = items.some((i) => i.kind === 'event');
    if (hasSpots || canManageSpots) tabs.push({ id: 'spots', label: 'Spots' });
    if (hasTools || canManageTools) tabs.push({ id: 'tools', label: 'Outils' });
    if (hasEvents || canManageEvents) tabs.push({ id: 'events', label: 'Événements' });
    return tabs;
  }, [items, canManageEvents, canManageSpots, canManageTools]);

  const metricTabs = useMemo(() => {
    const tabs: { id: MetricTab; label: string }[] = [
      { id: 'all', label: 'Tous' },
      { id: 'favorites', label: 'Favoris' },
      { id: 'clicks', label: 'Clics' },
    ];
    if (section !== 'events') {
      tabs.push({ id: 'stars', label: 'Étoiles' });
      tabs.push({ id: 'ratings', label: 'Notes' });
    }
    return tabs;
  }, [section]);

  const statusTabs = useMemo(
    (): { id: StatusTab; label: string }[] => [
      { id: 'all', label: 'Tous' },
      { id: 'draft', label: STATUS_LABELS.draft },
      { id: 'pending', label: STATUS_LABELS.pending },
      { id: 'approved', label: STATUS_LABELS.approved },
      { id: 'rejected', label: STATUS_LABELS.rejected },
    ],
    [],
  );

  useEffect(() => {
    if (!sectionTabs.some((t) => t.id === section)) {
      setSection(sectionTabs[0]?.id ?? 'all');
    }
  }, [section, sectionTabs]);

  useEffect(() => {
    if (!metricTabs.some((t) => t.id === metric)) {
      setMetric('all');
    }
  }, [metric, metricTabs]);

  const load = useCallback(async () => {
    if (!user?.id || role !== 'PARTNER') return;
    try {
      const ctx = await resolvePartnerWorkspaceContext(user);
      const { effectiveUserId, partnerLabel, phone, authUserId } = ctx;
      const authHint = authUserId ?? user.id;

      let sp: Awaited<ReturnType<typeof listPartnerSpots>> = [];
      let ev: Awaited<ReturnType<typeof listPartnerEvents>> = [];

      try {
        [sp, ev] = await Promise.all([
          listPartnerSpots(effectiveUserId, partnerLabel),
          listPartnerEvents(effectiveUserId, partnerLabel),
        ]);
      } catch (err) {
        console.warn('[PartnerStats] contenu:', err instanceof Error ? err.message : err);
      }

      const snapshot = await peekContentSnapshot();
      const catalogSpots = getHomeLocations(snapshot);
      const catalogEvents = [...getPublicEvents(snapshot), ...getPrimeEvents(snapshot)];

      const liveIdsPromise = fetchLivePartnerCatalogIds(effectiveUserId, partnerLabel, 'workspace').catch(
        () => new Set<string>(),
      );
      const countersPromise = getPartnerContentBenefitCounters(
        effectiveUserId,
        partnerLabel,
        phone,
        authHint,
      ).catch(
        () => new Map<string, { activeBenefits: number; pendingBenefits: number; validations: number }>(),
      );

      const emptyCounters = new Map<string, { activeBenefits: number; pendingBenefits: number; validations: number }>();
      const countersWithTimeout = Promise.race([
        countersPromise,
        new Promise<Map<string, { activeBenefits: number; pendingBenefits: number; validations: number }>>(
          (resolve) => setTimeout(() => resolve(emptyCounters), 6000),
        ),
      ]);

      const [liveIds, benefitCounters] = await Promise.all([liveIdsPromise, countersWithTimeout]);
      for (const s of sp) {
        const pub = partnerSpotContentKey(s);
        if (pub) liveIds.add(pub);
      }
      for (const e of ev) {
        const pub = partnerEventContentKey(e);
        if (pub) liveIds.add(pub);
      }

      const next: PerfItem[] = [];
      const seen = new Set<string>();

      const pushPerf = (item: PerfItem) => {
        if (seen.has(item.id)) return;
        seen.add(item.id);
        next.push(item);
      };

      const resolveCounters = (contentKey: string | null, stagingId: string) =>
        benefitCounters.get(contentKey ?? '')
        ?? benefitCounters.get(stagingId)
        ?? { activeBenefits: 0, pendingBenefits: 0, validations: 0 };

      // 1) Staging partenaire (source fiable hors-ligne)
      for (const s of sp) {
        const isTool = s.subCategory === 'tools';
        const contentKey = partnerSpotContentKey(s);
        if (contentKey) liveIds.add(contentKey);
        const live = catalogSpots.find((c) => c.id === contentKey || c.id === s.id);
        const counters = resolveCounters(contentKey, s.id);
        pushPerf({
          id: contentKey ?? s.id,
          kind: isTool ? 'tool' : 'spot',
          title: s.name,
          status: s.status,
          clicks: live?.clickCount ?? 0,
          favorites: live?.favoriteCount ?? 0,
          stars: live?.starCount ?? 0,
          ratingAvg: live?.ratingAvg ?? 0,
          ratingCount: live?.ratingCount ?? 0,
          activeBenefits: counters.activeBenefits,
          pendingBenefits: counters.pendingBenefits,
          validations: counters.validations,
        });
      }

      for (const e of ev) {
        const contentKey = partnerEventContentKey(e);
        if (contentKey) liveIds.add(contentKey);
        const live = catalogEvents.find((c) => c.id === contentKey || c.id === e.id);
        const counters = resolveCounters(contentKey, e.id);
        pushPerf({
          id: contentKey ?? e.id,
          kind: 'event',
          title: e.title,
          status: e.status,
          clicks: live?.clickCount ?? 0,
          favorites: live?.favoriteCount ?? 0,
          stars: 0,
          ratingAvg: 0,
          ratingCount: 0,
          activeBenefits: counters.activeBenefits,
          pendingBenefits: counters.pendingBenefits,
          validations: counters.validations,
        });
      }

      // 2) Enrichissement catalogue public (stats live si dispo)
      for (const loc of catalogSpots) {
        if (!liveIds.has(loc.id) || seen.has(loc.id)) continue;
        const isTool = loc.subCategory === 'tools';
        const counters = benefitCounters.get(loc.id) ?? { activeBenefits: 0, pendingBenefits: 0, validations: 0 };
        pushPerf({
          id: loc.id,
          kind: isTool ? 'tool' : 'spot',
          title: loc.name,
          status: 'approved',
          clicks: loc.clickCount ?? 0,
          favorites: loc.favoriteCount ?? 0,
          stars: loc.starCount ?? 0,
          ratingAvg: loc.ratingAvg ?? 0,
          ratingCount: loc.ratingCount ?? 0,
          activeBenefits: counters.activeBenefits,
          pendingBenefits: counters.pendingBenefits,
          validations: counters.validations,
        });
      }

      for (const e of catalogEvents) {
        if (!liveIds.has(e.id) || seen.has(e.id)) continue;
        const counters = benefitCounters.get(e.id) ?? { activeBenefits: 0, pendingBenefits: 0, validations: 0 };
        pushPerf({
          id: e.id,
          kind: 'event',
          title: e.title,
          status: 'approved',
          clicks: e.clickCount ?? 0,
          favorites: e.favoriteCount ?? 0,
          stars: 0,
          ratingAvg: 0,
          ratingCount: 0,
          activeBenefits: counters.activeBenefits,
          pendingBenefits: counters.pendingBenefits,
          validations: counters.validations,
        });
      }

      for (const id of liveIds) {
        if (seen.has(id)) continue;
        const stagingSpot = sp.find((s) => partnerSpotContentKey(s) === id || s.id === id);
        const stagingEvent = ev.find((e) => partnerEventContentKey(e) === id || e.id === id);
        const counters = benefitCounters.get(id) ?? { activeBenefits: 0, pendingBenefits: 0, validations: 0 };
        const isTool = stagingSpot?.subCategory === 'tools';
        pushPerf({
          id,
          kind: stagingEvent ? 'event' : isTool ? 'tool' : 'spot',
          title: stagingSpot?.name ?? stagingEvent?.title ?? 'Contenu publié',
          status: stagingSpot?.status ?? stagingEvent?.status ?? 'approved',
          clicks: 0,
          favorites: 0,
          stars: 0,
          ratingAvg: 0,
          ratingCount: 0,
          activeBenefits: counters.activeBenefits,
          pendingBenefits: counters.pendingBenefits,
          validations: counters.validations,
        });
      }

      setItems(next);
      if (__DEV__) {
        console.log('[PartnerStats] performances', {
          count: next.length,
          spots: sp.length,
          events: ev.length,
          liveIds: liveIds.size,
          counters: benefitCounters.size,
        });
      }
    } catch (err) {
      console.warn('[PartnerStats] chargement:', err instanceof Error ? err.message : err);
    }
  }, [user?.id, user?.phoneNumber, user?.company, user?.fullName, role]);

  const { run } = useFocusLoad(
    async () => {
      await load();
    },
    {
      ttlMs: 90_000,
      enabled: role === 'PARTNER' && Boolean(user?.id),
    },
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    await run(true);
    setRefreshing(false);
  }, [refresh, run]);

  const filtered = useMemo(() => {
    let list = items;
    if (section === 'spots') list = list.filter((i) => i.kind === 'spot');
    else if (section === 'tools') list = list.filter((i) => i.kind === 'tool');
    else if (section === 'events') list = list.filter((i) => i.kind === 'event');

    if (status !== 'all') list = list.filter((i) => i.status === status);

    return sortByMetric(list, metric);
  }, [items, section, status, metric]);

  if (role !== 'PARTNER') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={[styles.deniedTitle, { color: shell.pageTitle }]}>Performances</Text>
        <Text style={[styles.deniedBody, { color: shell.pageKicker }]}>Réservé aux partenaires THE LOOP.</Text>
        <Pressable onPress={() => navigateRoot(navigation, 'Auth', { mode: 'login' })}>
          <Text style={{ color: PRO_ACCENT, fontWeight: '700' }}>Se connecter avec e-mail et mot de passe →</Text>
        </Pressable>
      </View>
    );
  }

  const accent = metricAccent(metric);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={PRO_ACCENT} />}
    >
      <AdminPageHeader
        title="Performances"
        subtitle={user?.company ?? user?.fullName ?? 'Partenaire'}
        shell={shell}
        embedded={false}
        onBack={() => navigation.navigate('PartnerPro')}
      />
      <Text style={[styles.note, { color: shell.pageKicker }]}>
        Tous vos contenus · du plus attrayant au moins · vos propres actions ne sont pas comptées.
      </Text>

      {items.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>
          {hasAnyScope
            ? 'Aucun contenu publié pour le moment. Publiez ou faites valider un spot, un outil ou un événement.'
            : 'Aucun module de contenu activé pour votre compte.'}
        </Text>
      ) : (
        <>
          <Text style={[styles.section, { color: shell.pageTitle }]}>Type de contenu</Text>
          <AdminTabMenu
            tabs={sectionTabs}
            active={section}
            onChange={(s) => {
              setSection(s);
              setMetric('all');
            }}
            shell={shell}
            accent={PRO_ACCENT}
          />

          <Text style={[styles.section, { color: shell.pageTitle }]}>Classement</Text>
          <AdminTabMenu
            tabs={metricTabs}
            active={metric}
            onChange={setMetric}
            shell={shell}
            accent={accent}
          />

          <Text style={[styles.section, { color: shell.pageTitle }]}>Statut</Text>
          <AdminTabMenu
            tabs={statusTabs}
            active={status}
            onChange={setStatus}
            shell={shell}
            accent="#64748b"
          />

          <Text style={[styles.listTitle, { color: shell.pageTitle }]}>
            {filtered.length} élément{filtered.length > 1 ? 's' : ''} · du plus attrayant au moins
          </Text>
          <Text style={[styles.heroHint, { color: shell.pageKicker }]}>
            Du plus plébiscité au moins plébiscité
          </Text>

          {filtered.length === 0 ? (
            <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucun contenu pour ces filtres.</Text>
          ) : (
            filtered.map((item, index) => {
              const focus = focusMetricLabel(metric, item);
              const rowAccent = metric === 'all' ? kindAccent(item.kind) : accent;
              return (
                <View key={`${item.kind}-${item.id}`} style={adminCardStyle(shell)}>
                  <RankRow rank={index + 1} title={item.title} accent={rowAccent} shell={shell} />
                  <View style={styles.badges}>
                    <Text style={[styles.kindBadge, { color: kindAccent(item.kind), borderColor: `${kindAccent(item.kind)}55` }]}>
                      {kindLabel(item.kind)}
                    </Text>
                    <Text style={[styles.statusBadge, { color: statusColor(item.status) }]}>
                      {STATUS_LABELS[item.status]}
                    </Text>
                  </View>
                  {focus ? (
                    <Text style={[styles.metricFocus, { color: rowAccent }]}>{focus}</Text>
                  ) : null}
                  <Text style={[styles.meta, { color: shell.pageKicker }]}>
                    {item.kind === 'event'
                      ? `${item.favorites} favori${item.favorites > 1 ? 's' : ''} · ${item.clicks} clic${item.clicks > 1 ? 's' : ''}`
                      : `${item.favorites} favori${item.favorites > 1 ? 's' : ''} · ${item.clicks} clic${item.clicks > 1 ? 's' : ''} · ${item.stars}★ · ${formatRatingMeta(item.ratingAvg, item.ratingCount)}`}
                    {item.pendingBenefits > 0
                      ? ` · ${item.pendingBenefits} à valider`
                      : ''}
                    {` · ${item.activeBenefits} avantage${item.activeBenefits > 1 ? 's' : ''} actif${item.activeBenefits > 1 ? 's' : ''} · ${item.validations} validation${item.validations > 1 ? 's' : ''}`}
                  </Text>
                </View>
              );
            })
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 32 },
  note: { fontSize: 12, marginBottom: 10, fontStyle: 'italic' },
  section: { marginTop: 18, marginBottom: 8, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  listTitle: { marginTop: 8, marginBottom: 4, fontSize: 13, fontWeight: '800' },
  heroHint: { fontSize: 11, marginBottom: 12, fontStyle: 'italic' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  kindBadge: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadge: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', paddingVertical: 3 },
  metricFocus: { marginTop: 8, fontSize: 15, fontWeight: '800' },
  meta: { marginTop: 4, fontSize: 11, lineHeight: 16 },
  empty: { fontSize: 13, fontStyle: 'italic', marginBottom: 8 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  deniedTitle: { fontSize: 18, fontWeight: '700' },
  deniedBody: { marginTop: 8, marginBottom: 16, textAlign: 'center', fontSize: 14 },
});
