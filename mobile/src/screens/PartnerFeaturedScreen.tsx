import { useCallback, useMemo, useState } from 'react';

import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useFocusLoad } from '@/hooks/useFocusLoad';

import { FilterPills } from '@/components/FilterPills';

import { useAuthContext } from '@/context/AuthContext';

import { useContent } from '@/context/ContentContext';

import { useMemberTheme } from '@/hooks/useMemberTheme';

import { AdminPageHeader } from '@/components/admin/AdminShell';

import { isFeaturedWindowActive } from '@/lib/admin-content-store';

import { fetchLivePartnerCatalogIds } from '@/lib/partner-catalog-ids';

import { resolvePartnerWorkspaceContext } from '@/lib/partner-spot-auth';

import { isToolLocation } from '@/lib/location-kind-utils';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '@/navigation/types';



type Props = NativeStackScreenProps<RootStackParamList, 'PartnerFeatured'>;

type KindFilter = 'all' | 'event' | 'spot' | 'tool';



type FeaturedRow = {

  id: string;

  kind: 'event' | 'spot' | 'tool';

  title: string;

  subtitle?: string | null;

};



const KIND_FILTERS: { value: KindFilter; label: string }[] = [

  { value: 'all', label: 'Tous' },

  { value: 'event', label: 'Événements' },

  { value: 'spot', label: 'Spots' },

  { value: 'tool', label: 'Outils' },

];



export function PartnerFeaturedScreen({ navigation }: Props) {

  const { role, user } = useAuthContext();

  const { shell } = useMemberTheme();

  const { publicEvents, primeEvents, getHomeLocations, refresh } = useContent();

  const [featuredRows, setFeaturedRows] = useState<FeaturedRow[]>([]);

  const [refreshing, setRefreshing] = useState(false);

  const [kindFilter, setKindFilter] = useState<KindFilter>('all');



  const load = useCallback(async () => {
    if (!user || role !== 'PARTNER') return;
    const ctx = await resolvePartnerWorkspaceContext(user);
    const { effectiveUserId, partnerLabel } = ctx;
    const liveIds = await fetchLivePartnerCatalogIds(effectiveUserId, partnerLabel, 'workspace');
    const rows: FeaturedRow[] = [];
    const seen = new Set<string>();
    const pushRow = (row: FeaturedRow) => {
      if (seen.has(row.id)) return;
      seen.add(row.id);
      rows.push(row);
    };
    for (const event of [...publicEvents, ...primeEvents]) {
      if (!liveIds.has(event.id)) continue;
      if (
        !isFeaturedWindowActive(
          Boolean(event.catalogFeatured),
          event.featuredStartDate ?? null,
          event.featuredEndDate ?? null,
        )
      ) {
        continue;
      }
      pushRow({
        id: event.id,
        kind: 'event',
        title: event.title,
        subtitle: event.venueName ?? null,
      });
    }
    for (const loc of getHomeLocations()) {
      if (!liveIds.has(loc.id)) continue;
      if (
        !isFeaturedWindowActive(
          Boolean(loc.catalogFeatured),
          loc.featuredStartDate ?? null,
          loc.featuredEndDate ?? null,
        )
      ) {
        continue;
      }
      pushRow({
        id: loc.id,
        kind: isToolLocation(loc) ? 'tool' : 'spot',
        title: loc.name,
        subtitle: loc.subtitle ?? loc.district ?? null,
      });
    }
    rows.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    setFeaturedRows(rows);
  }, [user?.id, user?.company, user?.fullName, role, publicEvents, primeEvents, getHomeLocations]);

  const { run } = useFocusLoad(
    async () => {
      await load();
    },
    { ttlMs: 90_000, enabled: role === 'PARTNER' && Boolean(user?.id) },
  );

  const mine = useMemo(() => {
    if (kindFilter === 'all') return featuredRows;
    return featuredRows.filter((row) => row.kind === kindFilter);
  }, [featuredRows, kindFilter]);



  if (role !== 'PARTNER') {

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

      refreshControl={(

        <RefreshControl

          refreshing={refreshing}

          onRefresh={() => {

            setRefreshing(true);

            void Promise.all([refresh(), run(true)]).finally(() => setRefreshing(false));

          }}

          tintColor={shell.tabIndicator}

        />

      )}

    >

      <AdminPageHeader

        title="À la une"

        subtitle="Vos contenus actuellement mis en avant sur THE LOOP"

        shell={shell}

        embedded={false}

        onBack={() => navigation.goBack()}

      />



      <FilterPills

        options={KIND_FILTERS}

        active={kindFilter}

        onChange={setKindFilter}

        activeBg={shell.filterActiveBg}

        activeText={shell.filterActiveText}

        inactiveBg={shell.filterInactiveBg}

        inactiveText={shell.filterInactiveText}

        inactiveBorder={shell.filterInactiveBorder}

      />



      {mine.map((row) => {

        const kindLabel = row.kind === 'event' ? 'Événement' : row.kind === 'tool' ? 'Outil' : 'Spot';

        return (

          <View

            key={row.id}

            style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}

          >

            <Text style={[styles.title, { color: shell.pageTitle }]}>{row.title}</Text>

            {row.subtitle ? <Text style={[styles.meta, { color: shell.pageKicker }]}>{row.subtitle}</Text> : null}

            <Text style={[styles.meta, { color: shell.pageKicker }]}>

              {kindLabel} · mise en avant active

            </Text>

          </View>

        );

      })}



      {mine.length === 0 ? (

        <Text style={[styles.empty, { color: shell.pageKicker }]}>

          Aucune mise en avant active pour ce filtre. THE LOOP gère les mises « À la une » depuis la console admin.

        </Text>

      ) : null}



      {mine.length > 0 ? (

        <Text style={[styles.empty, { color: shell.pageKicker, marginTop: 12 }]}>

          Lecture seule — pas de modification depuis l'espace partenaire.

        </Text>

      ) : null}

    </ScrollView>

  );

}



const styles = StyleSheet.create({

  container: { paddingHorizontal: 16, paddingBottom: 40 },

  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },

  title: { fontWeight: '700' },

  meta: { marginTop: 4, fontSize: 11 },

  empty: { textAlign: 'center', marginTop: 24, lineHeight: 20, paddingHorizontal: 8 },

  denied: { flex: 1, alignItems: 'center', justifyContent: 'center' },

});


