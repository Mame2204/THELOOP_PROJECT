import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useAdminCatalog } from '@/hooks/useAdminCatalog';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { AdminPageHeader, ADMIN_THEME, adminCardStyle } from '@/components/admin/AdminShell';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { AdminTabMenu } from '@/components/admin/AdminTabMenu';
import { AdminListPager, ADMIN_LIST_PAGE_SIZE } from '@/components/admin/AdminListPager';
import { isTeamContentOrigin } from '@/lib/content-origin';
import { matchesAdminCountry } from '@/lib/admin-country';
import { isToolLocation } from '@/lib/location-kind-utils';
import { computeEngagementScore, getSpotStarSettings } from '@/lib/spot-stars-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminLoopStats'>;
type ContentSection = 'all' | 'spots' | 'tools' | 'events';
type MetricTab = 'all' | 'favorites' | 'clicks' | 'stars' | 'ratings';

type PerfItem = {
  id: string;
  kind: 'spot' | 'tool' | 'event';
  title: string;
  clicks: number;
  favorites: number;
  stars: number;
  ratingAvg: number;
  ratingCount: number;
};

function formatRatingMeta(avg: number, count: number): string {
  if (count <= 0) return '0 avis';
  return `${avg.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/5 · ${count} avis`;
}

function sortByMetric(
  items: PerfItem[],
  metric: MetricTab,
  score: (item: PerfItem) => number,
): PerfItem[] {
  const copy = [...items];
  copy.sort((a, b) => {
    if (metric === 'favorites') return b.favorites - a.favorites || b.clicks - a.clicks;
    if (metric === 'clicks') return b.clicks - a.clicks || b.favorites - a.favorites;
    if (metric === 'stars') return b.stars - a.stars || b.favorites - a.favorites;
    if (metric === 'ratings') return b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount;
    return score(b) - score(a) || b.clicks - a.clicks || b.favorites - a.favorites;
  });
  return copy;
}

export function AdminLoopStatsScreen({ navigation }: Props) {
  const { role } = useAuthContext();
  const { countryLabel, countryCode } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { publicEvents, primeEvents, getHomeLocations, refresh } = useAdminCatalog();
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState<ContentSection>('all');
  const [metric, setMetric] = useState<MetricTab>('all');
  const [page, setPage] = useState(0);
  const [scoreWeights, setScoreWeights] = useState({
    clickWeight: 1,
    favoriteWeight: 5,
    ratingWeight: 10,
  });

  const engagementScore = useCallback(
    (item: PerfItem) =>
      computeEngagementScore(item.clicks, item.favorites, item.ratingAvg, scoreWeights),
    [scoreWeights],
  );

  useEffect(() => {
    void getSpotStarSettings(countryCode).then((s) => {
      setScoreWeights({
        clickWeight: s.clickWeight,
        favoriteWeight: s.favoriteWeight,
        ratingWeight: s.ratingWeight ?? 10,
      });
    });
  }, [countryCode]);

  const items = useMemo(() => {
    const next: PerfItem[] = [];
    for (const e of [...publicEvents, ...primeEvents]) {
      if (!isTeamContentOrigin(e.contentOrigin) || !matchesAdminCountry(e.countryCode, countryCode)) continue;
      next.push({
        id: e.id,
        kind: 'event',
        title: e.title,
        clicks: e.clickCount ?? 0,
        favorites: e.favoriteCount ?? 0,
        stars: 0,
        ratingAvg: 0,
        ratingCount: 0,
      });
    }
    for (const loc of getHomeLocations()) {
      if (!isTeamContentOrigin(loc.contentOrigin) || !matchesAdminCountry(loc.countryCode, countryCode)) continue;
      next.push({
        id: loc.id,
        kind: isToolLocation(loc) ? 'tool' : 'spot',
        title: loc.name,
        clicks: loc.clickCount ?? 0,
        favorites: loc.favoriteCount ?? 0,
        stars: loc.starCount ?? 3,
        ratingAvg: loc.ratingAvg ?? 0,
        ratingCount: loc.ratingCount ?? 0,
      });
    }
    return next;
  }, [publicEvents, primeEvents, getHomeLocations, countryCode]);

  // Catalogue via useAdminCatalog (cache TTL) — pas de full-fetch forcé au focus (egress).

  const filtered = useMemo(() => {
    let list = items;
    if (section === 'events') list = list.filter((i) => i.kind === 'event');
    else if (section === 'spots') list = list.filter((i) => i.kind === 'spot');
    else if (section === 'tools') list = list.filter((i) => i.kind === 'tool');
    return sortByMetric(list, metric, engagementScore);
  }, [items, section, metric, engagementScore]);

  const paged = useMemo(() => {
    const start = page * ADMIN_LIST_PAGE_SIZE;
    return filtered.slice(start, start + ADMIN_LIST_PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => {
    setPage(0);
  }, [section, metric, countryCode]);

  if (role !== 'ADMIN') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle }}>Accès réservé</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refresh().finally(() => setRefreshing(false));
          }}
          tintColor={ADMIN_THEME.accent}
        />
      }
    >
      <AdminPageHeader
        title="Performances"
        subtitle={`THE LOOP · ${countryLabel}`}
        shell={shell}
        onBack={() => navigation.goBack()}
      />
      <AdminCountryBar shell={shell} compact />
      <Text style={[styles.note, { color: shell.pageKicker }]}>
        Score « Tous » : clics×{scoreWeights.clickWeight} + favoris×{scoreWeights.favoriteWeight} + moyenne
        note×{scoreWeights.ratingWeight} (Paramètres étoiles).
      </Text>

      <AdminTabMenu
        tabs={[
          { id: 'all', label: 'Tous' },
          { id: 'events', label: 'Événements' },
          { id: 'spots', label: 'Spots' },
          { id: 'tools', label: 'Outils' },
        ]}
        active={section}
        onChange={(s) => {
          setSection(s);
          setMetric('all');
        }}
        shell={shell}
        accent={ADMIN_THEME.accent}
      />

      <AdminTabMenu
        tabs={[
          { id: 'all', label: 'Tous' },
          { id: 'favorites', label: 'Favoris' },
          { id: 'clicks', label: 'Clics' },
          { id: 'stars', label: 'Étoiles' },
          { id: 'ratings', label: 'Notes' },
        ]}
        active={metric}
        onChange={setMetric}
        shell={shell}
        accent="#fbbf24"
      />

      {filtered.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucun contenu THE LOOP publié pour ce pays.</Text>
      ) : (
        paged.map((item, index) => (
          <View key={`${item.kind}-${item.id}`} style={adminCardStyle(shell)}>
            <Text style={[styles.rank, { color: ADMIN_THEME.accent }]}>#{page * ADMIN_LIST_PAGE_SIZE + index + 1}</Text>
            <Text style={[styles.title, { color: shell.pageTitle }]} numberOfLines={2}>{item.title}</Text>
            <Text style={[styles.meta, { color: shell.pageKicker }]}>
              {item.kind === 'event'
                ? `${item.favorites} favori${item.favorites > 1 ? 's' : ''} · ${item.clicks} clic${item.clicks > 1 ? 's' : ''}`
                : `${item.favorites} favori${item.favorites > 1 ? 's' : ''} · ${item.clicks} clic${item.clicks > 1 ? 's' : ''} · ${item.stars}★ · ${formatRatingMeta(item.ratingAvg, item.ratingCount)}`}
            </Text>
          </View>
        ))
      )}
      <AdminListPager
        page={page}
        total={filtered.length}
        pageSize={ADMIN_LIST_PAGE_SIZE}
        onPageChange={setPage}
        shell={shell}
        label="contenus"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  note: { fontSize: 12, marginBottom: 12, fontStyle: 'italic', lineHeight: 17 },
  rank: { fontSize: 11, fontWeight: '800', marginBottom: 4 },
  title: { fontSize: 15, fontWeight: '700' },
  meta: { marginTop: 6, fontSize: 11, lineHeight: 16 },
  empty: { fontSize: 13, fontStyle: 'italic' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
