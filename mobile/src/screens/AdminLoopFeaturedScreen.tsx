import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useAdminCatalog } from '@/hooks/useAdminCatalog';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { AdminPageHeader, ADMIN_THEME, adminCardStyle } from '@/components/admin/AdminShell';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { listTeamFeaturedFromCatalog } from '@/lib/admin-content-store';
import { isTeamContentOrigin } from '@/lib/content-origin';
import { matchesAdminCountry } from '@/lib/admin-country';
import { isToolLocation } from '@/lib/location-kind-utils';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminLoopFeatured'>;

export function AdminLoopFeaturedScreen({ navigation }: Props) {
  const { role } = useAuthContext();
  const { countryLabel, countryCode } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { publicEvents, primeEvents, getHomeLocations, featuredBanners, featuredSpotBanners, refresh } =
    useAdminCatalog();
  const [refreshing, setRefreshing] = useState(false);
  const [featuredTitles, setFeaturedTitles] = useState<
    Array<{ id: string; title: string; kindLabel: string; source: string }>
  >([]);

  const load = useCallback(async () => {
    const teamEvents = [...publicEvents, ...primeEvents].filter(
      (e) => isTeamContentOrigin(e.contentOrigin) && matchesAdminCountry(e.countryCode, countryCode),
    );
    const teamLocations = getHomeLocations().filter(
      (l) => isTeamContentOrigin(l.contentOrigin) && matchesAdminCountry(l.countryCode, countryCode),
    );
    const teamIds = new Set([...teamEvents.map((e) => e.id), ...teamLocations.map((s) => s.id)]);

    const flagged = listTeamFeaturedFromCatalog(teamEvents, teamLocations, countryCode);

    const carouselEvents = featuredBanners
      .filter((b) => teamIds.has(b.targetId))
      .map((b) => ({ id: b.id, title: b.title, kindLabel: 'Événement', source: 'Carousel Accueil' }));

    const carouselSpots = featuredSpotBanners
      .filter((b) => teamIds.has(b.targetId))
      .map((b) => {
        const loc = teamLocations.find((s) => s.id === b.targetId);
        return {
          id: b.id,
          title: b.title,
          kindLabel: loc && isToolLocation(loc) ? 'Outil' : 'Spot',
          source: 'Carousel Accueil',
        };
      });

    const merged = [...flagged];
    for (const row of [...carouselEvents, ...carouselSpots]) {
      if (!merged.some((m) => m.title === row.title && m.kindLabel === row.kindLabel)) merged.push(row);
    }
    setFeaturedTitles(merged);
  }, [publicEvents, primeEvents, getHomeLocations, featuredBanners, featuredSpotBanners, countryCode]);

  const { run } = useFocusLoad(
    async (force) => {
      if (force) await refresh();
      await load();
    },
    { ttlMs: 90_000, enabled: role === 'ADMIN', resetKey: countryCode },
  );

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
            void run(true).finally(() => setRefreshing(false));
          }}
          tintColor={ADMIN_THEME.accent}
        />
      }
    >
      <AdminPageHeader
        title="À la une"
        subtitle={`Contenus THE LOOP · ${countryLabel}`}
        shell={shell}
        onBack={() => navigation.goBack()}
      />
      <AdminCountryBar shell={shell} compact />
      <Text style={[styles.hint, { color: shell.pageKicker }]}>
        Mises en avant actives pour les contenus publiés par THE LOOP (aligné admin-web). Gestion : Accueil admin → À la une.
      </Text>
      {featuredTitles.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucun contenu THE LOOP n'est à la une pour ce pays.</Text>
      ) : (
        featuredTitles.map((item) => (
          <View key={`${item.id}-${item.source}`} style={adminCardStyle(shell)}>
            <Text style={[styles.title, { color: shell.pageTitle }]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={[styles.meta, { color: shell.pageKicker }]}>
              {item.kindLabel} · {item.source}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 12, fontStyle: 'italic' },
  title: { fontSize: 15, fontWeight: '700' },
  meta: { marginTop: 4, fontSize: 11 },
  empty: { fontSize: 13, fontStyle: 'italic' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
