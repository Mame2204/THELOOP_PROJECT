import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AdminPageHeader, ADMIN_THEME } from '@/components/admin/AdminShell';
import { TogglePill } from '@/components/admin/TogglePill';
import { useAuthContext } from '@/context/AuthContext';
import { useContentCountries } from '@/context/ContentCountriesContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { COUNTRY_LABELS, DEFAULT_COUNTRY_CODE, LOOP_COUNTRIES, type CountryCode } from '@/lib/countries';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminContentCountries'>;

export function AdminContentCountriesScreen({ navigation }: Props) {
  const { role } = useAuthContext();
  const { shell } = useMemberTheme();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('content_countries');

  const { enabledCountries, refresh, toggleCountry } = useContentCountries();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  async function handleToggle(code: CountryCode, next: boolean) {
    if (code === DEFAULT_COUNTRY_CODE && !next) {
      Alert.alert('Guinée requise', 'La Guinée doit rester activée pour le contenu.');
      return;
    }
    if (!next && enabledCountries.length <= 1) {
      Alert.alert('Au moins un pays', 'Au moins un pays doit rester actif pour le contenu.');
      return;
    }
    await toggleCountry(code, next);
  }

  if (role !== 'ADMIN') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Accès réservé aux administrateurs</Text>
      </View>
    );
  }

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={ADMIN_THEME.accent} />}
    >
      <AdminPageHeader
        title="Pays du contenu"
        subtitle="Activez les pays proposés aux membres (inscription et catalogue)."
        shell={shell}
        onBack={() => navigation.goBack()}
      />

      <Text style={[styles.intro, { color: shell.pageKicker }]}>
        Par défaut, seule la Guinée est proposée. Activez d'autres pays pour étendre le contenu affiché aux membres de ces pays.
        L'indicatif téléphonique reste indépendant du pays de contenu.
      </Text>

      {LOOP_COUNTRIES.map((c) => {
        const enabled = enabledCountries.includes(c.code);
        const locked = c.code === DEFAULT_COUNTRY_CODE;
        return (
          <View
            key={c.code}
            style={[styles.row, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
          >
            <Text style={{ fontSize: 22 }}>{c.flag}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.countryName, { color: shell.pageTitle }]}>{COUNTRY_LABELS[c.code]}</Text>
              <Text style={[styles.countryMeta, { color: shell.pageKicker }]}>
                {c.code}
                {locked ? ' · toujours actif' : ''}
              </Text>
            </View>
            <TogglePill
              value={enabled}
              onChange={(next) => void handleToggle(c.code, next)}
              activeLabel="Actif"
              inactiveLabel="Off"
              activeColor="#10b981"
              shell={shell}
            />
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  intro: { fontSize: 12, lineHeight: 18, marginBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  countryName: { fontSize: 15, fontWeight: '700' },
  countryMeta: { fontSize: 11, marginTop: 2 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
