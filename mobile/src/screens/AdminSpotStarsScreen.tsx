import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AdminPageHeader } from '@/components/admin/AdminShell';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminCatalog } from '@/hooks/useAdminCatalog';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminPermissions } from '@/context/AdminPermissionsContext';
import { useAdminModuleAccess, useFilteredAdminTabs } from '@/hooks/useAdminModuleAccess';
import type { AdminPermissionId } from '@/lib/admin-permissions';
import { AdminTabMenu } from '@/components/admin/AdminTabMenu';
import {
  clearAdminStarOverride,
  computeEngagementScore,
  getSpotStarSettings,
  getTopSpotEngagementInsights,
  saveSpotStarSettings,
  scoreToStarCount,
  setAdminStarOverride,
  type SpotStarTier,
} from '@/lib/spot-stars-store';
import { filterSpotsOnly, filterTools } from '@/lib/location-kind-utils';
import { listAdminLoopWalks } from '@/lib/admin-accueil-store';
import type { LoopWalk } from '@/lib/loop-walks-store';
import type { HomeLocation } from '@/lib/demo-data';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminSpotStars'>;
type MenuTab = 'top' | 'grant' | 'settings';
type EntityTab = 'all' | 'spots' | 'tools' | 'walks';
type OverrideFilter = 'all' | 'admin' | 'auto';

type StarPatch = { starCount: number; starsSource: 'admin' | 'auto' };

interface StarGrantItem {
  id: string;
  name: string;
  clickCount: number;
  favoriteCount: number;
  ratingAvg?: number;
  ratingCount?: number;
  starCount?: number;
  starsSource?: 'auto' | 'admin';
  engagementScore?: number;
}

function locationToGrantItem(location: HomeLocation): StarGrantItem {
  return {
    id: location.id,
    name: location.name,
    clickCount: location.clickCount,
    favoriteCount: location.favoriteCount,
    ratingAvg: location.ratingAvg,
    ratingCount: location.ratingCount,
    starCount: location.starCount,
    starsSource: location.starsSource,
    engagementScore: location.engagementScore,
  };
}

function walkToGrantItem(walk: LoopWalk): StarGrantItem {
  return {
    id: walk.id,
    name: walk.title,
    clickCount: walk.clickCount ?? 0,
    favoriteCount: walk.favoriteCount ?? 0,
    ratingAvg: walk.ratingAvg ?? 0,
    ratingCount: walk.ratingCount ?? 0,
    starCount: walk.starCount ?? 0,
    starsSource: walk.starsSource ?? 'auto',
    engagementScore: walk.engagementScore ?? 0,
  };
}

function entitySearchPlaceholder(tab: EntityTab): string {
  switch (tab) {
    case 'tools':
      return 'Rechercher un outil…';
    case 'walks':
      return 'Rechercher un parcours…';
    case 'spots':
      return 'Rechercher un spot…';
    default:
      return 'Rechercher un spot, outil ou parcours…';
  }
}

export function AdminSpotStarsScreen({ navigation, route }: Props) {
  const { role, user } = useAuthContext();
  const { countryCode } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('spot_stars');

  const { getHomeLocations, refresh } = useAdminCatalog();
  const allLocations = getHomeLocations();
  const [walks, setWalks] = useState<LoopWalk[]>([]);

  const settingsOnly = route.params?.settingsOnly === true;
  const initialTab = route.params?.tab ?? (settingsOnly ? 'settings' : 'grant');

  const [entityTab, setEntityTab] = useState<EntityTab>('all');
  const spotLocations = useMemo(() => filterSpotsOnly(allLocations), [allLocations]);
  const toolLocations = useMemo(() => filterTools(allLocations), [allLocations]);

  const entities = useMemo((): StarGrantItem[] => {
    if (entityTab === 'tools') return toolLocations.map(locationToGrantItem);
    if (entityTab === 'spots') return spotLocations.map(locationToGrantItem);
    if (entityTab === 'walks') return walks.map(walkToGrantItem);
    return [
      ...spotLocations.map(locationToGrantItem),
      ...toolLocations.map(locationToGrantItem),
      ...walks.map(walkToGrantItem),
    ];
  }, [entityTab, spotLocations, toolLocations, walks]);

  const locationEntitiesForTop = useMemo((): HomeLocation[] => {
    if (entityTab === 'walks') return [];
    if (entityTab === 'tools') return toolLocations;
    if (entityTab === 'spots') return spotLocations;
    return [...spotLocations, ...toolLocations];
  }, [entityTab, spotLocations, toolLocations]);

  const visibleMenuTabs = useFilteredAdminTabs('spot_stars', [
    { id: 'grant' as const, label: 'Octroi manuel', permission: 'spot_stars_grant' },
    { id: 'top' as const, label: 'Top étoilés', permission: 'spot_stars_top' },
  ]);
  const { hasSubPermission } = useAdminPermissions();
  const canSettings = hasSubPermission('spot_stars', 'spot_stars_settings');

  const [menuTab, setMenuTab] = useState<MenuTab>(initialTab);

  useEffect(() => {
    if (settingsOnly) return;
    if (visibleMenuTabs.length && !visibleMenuTabs.some((t) => t.id === menuTab)) {
      setMenuTab(visibleMenuTabs[0].id);
    }
  }, [visibleMenuTabs, menuTab, settingsOnly]);
  const [topSpots, setTopSpots] = useState<Awaited<ReturnType<typeof getTopSpotEngagementInsights>>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [overrideFilter, setOverrideFilter] = useState<OverrideFilter>('all');
  const [starPatches, setStarPatches] = useState<Record<string, StarPatch>>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const [clickWeight, setClickWeight] = useState('1');
  const [favoriteWeight, setFavoriteWeight] = useState('5');
  const [ratingWeight, setRatingWeight] = useState('10');
  const [tiers, setTiers] = useState<SpotStarTier[]>([]);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    const settings = await getSpotStarSettings(countryCode);
    setClickWeight(String(settings.clickWeight));
    setFavoriteWeight(String(settings.favoriteWeight));
    setRatingWeight(String(settings.ratingWeight ?? 10));
    setTiers(settings.tiers);
  }, [countryCode]);

  const loadWalks = useCallback(async () => {
    setWalks(await listAdminLoopWalks(countryCode));
  }, [countryCode]);

  const loadTopSpots = useCallback(async () => {
    const locationTop = locationEntitiesForTop.length
      ? await getTopSpotEngagementInsights(locationEntitiesForTop, countryCode, 10)
      : [];
    const walkTop = entityTab === 'spots' || entityTab === 'tools'
      ? []
      : walks
          .map((walk) => {
            const item = walkToGrantItem(walk);
            const resolved = computeEngagementScore(
              item.clickCount,
              item.favoriteCount,
              item.ratingAvg ?? 0,
              { clickWeight: Number(clickWeight) || 1, favoriteWeight: Number(favoriteWeight) || 5, ratingWeight: Number(ratingWeight) || 10 },
            );
            return {
              id: item.id,
              kind: 'spot' as const,
              title: item.name,
              clickCount: item.clickCount,
              favoriteCount: item.favoriteCount,
              engagementScore: item.engagementScore ?? resolved,
              starCount: item.starCount ?? scoreToStarCount(resolved, tiers),
              starsSource: item.starsSource ?? 'auto',
              ratingAvg: item.ratingAvg ?? 0,
              ratingCount: item.ratingCount ?? 0,
            };
          })
          .sort(
            (a, b) =>
              b.engagementScore - a.engagementScore
              || b.favoriteCount - a.favoriteCount
              || b.clickCount - a.clickCount,
          )
          .slice(0, 10);

    const merged = [...locationTop, ...walkTop]
      .sort(
        (a, b) =>
          b.starCount - a.starCount
          || b.engagementScore - a.engagementScore
          || b.favoriteCount - a.favoriteCount,
      )
      .slice(0, 10);
    setTopSpots(merged);
  }, [
    countryCode,
    locationEntitiesForTop,
    walks,
    entityTab,
    clickWeight,
    favoriteWeight,
    ratingWeight,
    tiers,
  ]);

  useEffect(() => {
    if (role === 'ADMIN') void loadWalks();
  }, [role, loadWalks]);

  useEffect(() => {
    if (role === 'ADMIN') void loadSettings();
  }, [role, loadSettings]);

  useEffect(() => {
    if (!settingsOnly && menuTab === 'settings') setMenuTab('grant');
  }, [settingsOnly, menuTab]);

  useEffect(() => {
    if (role === 'ADMIN' && menuTab === 'top') void loadTopSpots();
  }, [role, menuTab, loadTopSpots]);

  const cw = Number(clickWeight) || 1;
  const fw = Number(favoriteWeight) || 5;
  const rw = Number(ratingWeight) || 10;

  const resolveSpotStars = useCallback(
    (item: StarGrantItem) => {
      const patch = starPatches[item.id];
      const score = computeEngagementScore(
        item.clickCount,
        item.favoriteCount,
        item.ratingAvg ?? 0,
        { clickWeight: cw, favoriteWeight: fw, ratingWeight: rw },
      );
      const autoStars = scoreToStarCount(score, tiers);
      const starsSource = patch?.starsSource ?? item.starsSource ?? 'auto';
      const starCount = patch?.starCount ?? item.starCount ?? autoStars;
      return { score, autoStars, starsSource, starCount };
    },
    [starPatches, cw, fw, rw, tiers],
  );

  const filteredGrantSpots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entities.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q)) return false;
      const { starsSource } = resolveSpotStars(item);
      if (overrideFilter === 'admin' && starsSource !== 'admin') return false;
      if (overrideFilter === 'auto' && starsSource === 'admin') return false;
      return true;
    });
  }, [entities, searchQuery, overrideFilter, resolveSpotStars]);

  if (role !== 'ADMIN') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle }}>Accès réservé</Text>
      </View>
    );
  }

  const inputStyle = [styles.input, { backgroundColor: shell.filterInactiveBg, borderColor: shell.filterInactiveBorder, color: shell.pageTitle }];

  async function handleSaveSettings() {
    setSaving(true);
    try {
      const settings = await getSpotStarSettings(countryCode);
      await saveSpotStarSettings({
        ...settings,
        countryCode,
        clickWeight: Number(clickWeight) || 1,
        favoriteWeight: Number(favoriteWeight) || 5,
        ratingWeight: Number(ratingWeight) || 10,
        tiers,
      });
      Alert.alert('Enregistré', 'Paramètres de calcul des étoiles mis à jour.');
    } finally {
      setSaving(false);
    }
  }

  function updateTier(index: number, field: keyof SpotStarTier, value: string) {
    setTiers((prev) => {
      const next = [...prev];
      const tier = { ...next[index] };
      if (field === 'starCount') tier.starCount = Math.min(5, Math.max(1, Number(value) || 1));
      else if (field === 'minScore') tier.minScore = Math.max(0, Number(value) || 0);
      else if (field === 'maxScore') tier.maxScore = value.trim() === '' ? null : Math.max(0, Number(value) || 0);
      next[index] = tier;
      return next;
    });
  }

  function applyPatch(spotId: string, patch: StarPatch) {
    setStarPatches((prev) => ({ ...prev, [spotId]: patch }));
  }

  async function handleGrantStars(spotId: string, stars: number) {
    applyPatch(spotId, { starCount: stars, starsSource: 'admin' });
    setPendingIds((prev) => new Set(prev).add(spotId));
    try {
      await setAdminStarOverride(spotId, stars, user?.id ?? 'admin');
      await loadWalks();
    } catch {
      setStarPatches((prev) => {
        const next = { ...prev };
        delete next[spotId];
        return next;
      });
      Alert.alert('Erreur', 'Impossible d\'enregistrer l\'octroi manuel.');
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(spotId);
        return next;
      });
    }
  }

  async function handleClearOverride(item: StarGrantItem) {
    setPendingIds((prev) => new Set(prev).add(item.id));
    try {
      const result = await clearAdminStarOverride(item.id, countryCode, {
        ratingAverage: item.ratingAvg ?? 0,
        clickCount: item.clickCount,
        favoriteCount: item.favoriteCount,
      });
      applyPatch(item.id, { starCount: result.starCount, starsSource: 'auto' });
      await Promise.all([refresh(), loadWalks()]);
    } catch {
      setStarPatches((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      Alert.alert('Erreur', 'Impossible de recalculer les étoiles.');
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  if (settingsOnly && !canSettings) {
    return <AdminModuleDenied shell={shell} moduleLabel="Réglages étoiles" onBack={() => navigation.goBack()} />;
  }

  return (
    <KeyboardAwareFormScroll style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
      <AdminPageHeader
        title="Étoiles"
        subtitle={settingsOnly ? 'Poids engagement et paliers' : 'Octroi rapide · recherche · calcul auto 1×/jour'}
        shell={shell}
        onBack={() => navigation.goBack()}
      />
      <AdminCountryBar shell={shell} compact />

      {!settingsOnly ? (
        <>
          <AdminTabMenu
            tabs={[
              { id: 'all', label: 'Tous' },
              { id: 'spots', label: 'Spots' },
              { id: 'tools', label: 'Outils' },
              { id: 'walks', label: 'Parcours' },
            ]}
            active={entityTab}
            onChange={setEntityTab}
            shell={shell}
            accent="#10b981"
          />

          <AdminTabMenu
            tabs={visibleMenuTabs}
            active={menuTab === 'settings' ? 'grant' : menuTab}
            onChange={setMenuTab}
            shell={shell}
            accent="#fbbf24"
          />
        </>
      ) : null}

      {menuTab === 'top' ? (
        <>
          {topSpots
            .sort((a, b) => b.starCount - a.starCount)
            .map((spot, index) => (
              <View key={spot.id} style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
                <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>#{index + 1} {spot.title}</Text>
                <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
                  {spot.starCount}★ · {spot.clickCount} clics · {spot.favoriteCount} favoris
                  {(spot.ratingCount ?? 0) > 0
                    ? ` · note ${Number(spot.ratingAvg ?? 0).toFixed(1)}/5`
                    : ''}
                  {' · '}score {spot.engagementScore}
                  {spot.starsSource === 'admin' ? ' (admin)' : ''}
                </Text>
              </View>
            ))}
          {topSpots.length === 0 ? <Text style={[styles.hint, { color: shell.pageKicker }]}>Pas encore de données.</Text> : null}
        </>
      ) : null}

      {menuTab === 'settings' ? (
        <>
      <Text style={[styles.section, { color: shell.pageKicker }]}>Formule de calcul</Text>
      <Text style={[styles.hint, { color: shell.pageKicker }]}>
        score = (clics × {cw}) + (favoris × {fw}) + (moyenne notes × {rw}) — recalcul quotidien si pas d'override admin
      </Text>
      <Text style={[styles.label, { color: shell.pageKicker }]}>Poids clic</Text>
      <TextInput style={inputStyle} value={clickWeight} onChangeText={setClickWeight} keyboardType="numeric" placeholderTextColor={shell.pageKicker} />
      <Text style={[styles.label, { color: shell.pageKicker }]}>Poids favori</Text>
      <TextInput style={inputStyle} value={favoriteWeight} onChangeText={setFavoriteWeight} keyboardType="numeric" placeholderTextColor={shell.pageKicker} />
      <Text style={[styles.label, { color: shell.pageKicker }]}>Poids note (moyenne /5)</Text>
      <TextInput style={inputStyle} value={ratingWeight} onChangeText={setRatingWeight} keyboardType="numeric" placeholderTextColor={shell.pageKicker} />
      <Text style={[styles.hint, { color: shell.pageKicker }]}>
        Exemple : moyenne 4,2 → contribution {Math.round(4.2 * rw)} au score.
      </Text>

      <Text style={[styles.section, { color: shell.pageKicker }]}>Paliers score → étoiles</Text>
      {tiers.map((tier, index) => (
        <View key={index} style={[styles.tierRow, { borderColor: shell.filterInactiveBorder }]}>
          <TextInput
            style={[styles.tierInput, inputStyle]}
            value={String(tier.minScore)}
            onChangeText={(v) => updateTier(index, 'minScore', v)}
            keyboardType="numeric"
            placeholder="Min"
            placeholderTextColor={shell.pageKicker}
          />
          <Text style={{ color: shell.pageKicker }}>→</Text>
          <TextInput
            style={[styles.tierInput, inputStyle]}
            value={tier.maxScore == null ? '' : String(tier.maxScore)}
            onChangeText={(v) => updateTier(index, 'maxScore', v)}
            keyboardType="numeric"
            placeholder="∞"
            placeholderTextColor={shell.pageKicker}
          />
          <Text style={{ color: shell.pageKicker }}>=</Text>
          <TextInput
            style={[styles.tierInput, inputStyle]}
            value={String(tier.starCount)}
            onChangeText={(v) => updateTier(index, 'starCount', v)}
            keyboardType="numeric"
            placeholderTextColor={shell.pageKicker}
          />
          <Text style={{ color: '#fbbf24', fontWeight: '700' }}>★</Text>
        </View>
      ))}

      <Pressable style={[styles.submit, { backgroundColor: shell.tabIndicator }]} onPress={() => void handleSaveSettings()} disabled={saving}>
        <Text style={styles.submitText}>{saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}</Text>
      </Pressable>
        </>
      ) : null}

      {menuTab === 'grant' ? (
        <>
      <TextInput
        style={[styles.searchInput, inputStyle]}
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={entitySearchPlaceholder(entityTab)}
        placeholderTextColor={shell.pageKicker}
      />
      <View style={styles.filterRow}>
        {(['all', 'admin', 'auto'] as const).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, overrideFilter === f && { backgroundColor: shell.tabIndicator }]}
            onPress={() => setOverrideFilter(f)}
          >
            <Text style={{ color: overrideFilter === f ? '#fff' : shell.pageTitle, fontSize: 11, fontWeight: '700' }}>
              {f === 'all' ? 'Tous' : f === 'admin' ? 'Admin' : 'Auto'}
            </Text>
          </Pressable>
        ))}
        <Text style={[styles.countLabel, { color: shell.pageKicker }]}>
          {filteredGrantSpots.length}/{entities.length}
        </Text>
      </View>

      {filteredGrantSpots.map((item) => {
        const { autoStars, starsSource, starCount } = resolveSpotStars(item);
        const isPending = pendingIds.has(item.id);

        return (
          <View key={item.id} style={[styles.grantRow, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg, opacity: isPending ? 0.6 : 1 }]}>
            <View style={styles.grantInfo}>
              <Text style={[styles.grantName, { color: shell.pageTitle }]} numberOfLines={1}>{item.name}</Text>
              <Text style={[styles.grantMeta, { color: starsSource === 'admin' ? shell.tabIndicator : shell.pageKicker }]}>
                {starCount}★ {starsSource === 'admin' ? '(admin)' : `(auto ${autoStars}★)`}
                {(item.ratingCount ?? 0) > 0 ? ` · note ${Number(item.ratingAvg ?? 0).toFixed(1)}` : ''}
              </Text>
            </View>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((n) => {
                const filled = n <= starCount;
                return (
                  <Pressable
                    key={n}
                    hitSlop={4}
                    onPress={() => void handleGrantStars(item.id, n)}
                    disabled={isPending}
                    accessibilityLabel={`Octroyer ${n} étoiles`}
                  >
                    <Text style={[styles.grantStar, { color: filled ? '#fbbf24' : 'rgba(148,163,184,0.35)' }]}>★</Text>
                  </Pressable>
                );
              })}
              {starsSource === 'admin' ? (
                <Pressable
                  style={styles.resetBtn}
                  onPress={() => void handleClearOverride(item)}
                  disabled={isPending}
                >
                  <Text style={styles.resetBtnText}>Réinit.</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
      {filteredGrantSpots.length === 0 ? (
        <Text style={[styles.hint, { color: shell.pageKicker }]}>Aucun résultat pour cette recherche.</Text>
      ) : null}
        </>
      ) : null}
    </KeyboardAwareFormScroll>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  section: { marginTop: 20, marginBottom: 8, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 8 },
  hint: { fontSize: 11, marginBottom: 8, lineHeight: 16 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8, fontSize: 14 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, borderWidth: 1, borderRadius: 10, padding: 8 },
  tierInput: { flex: 1, marginBottom: 0, padding: 8, fontSize: 12, textAlign: 'center' },
  submit: { marginTop: 12, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitText: { fontWeight: '800', color: '#000' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  cardMeta: { marginTop: 4, fontSize: 11 },
  starRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, alignItems: 'center' },
  grantStar: { fontSize: 22, fontWeight: '700', lineHeight: 26 },
  resetBtn: {
    marginLeft: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  resetBtnText: { color: '#ef4444', fontSize: 10, fontWeight: '800' },
  searchInput: { marginBottom: 8 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(148,163,184,0.2)' },
  countLabel: { marginLeft: 'auto', fontSize: 11 },
  grantRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6, gap: 8 },
  grantInfo: { flex: 1, minWidth: 0 },
  grantName: { fontSize: 13, fontWeight: '700' },
  grantMeta: { fontSize: 10, marginTop: 2 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
