import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCallback, useState } from 'react';
import { AdminFeaturedPanel } from '@/components/admin/AdminFeaturedPanel';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { AdminPageHeader, ADMIN_THEME } from '@/components/admin/AdminShell';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { useAuthContext } from '@/context/AuthContext';
import { useContent } from '@/context/ContentContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminFeatured'>;

/** Redirigé depuis Accueil — la gestion principale est l’onglet Accueil → À la une. */
export function AdminFeaturedScreen({ navigation }: Props) {
  const { role } = useAuthContext();
  const { shell } = useMemberTheme();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('featured');
  const { refresh } = useContent();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (role !== 'ADMIN') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle }}>Accès réservé</Text>
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
        title="À la une"
        subtitle="Carousel Accueil — aussi disponible dans Accueil → onglet À la une"
        shell={shell}
        onBack={() => navigation.goBack()}
      />
      <AdminCountryBar shell={shell} compact />
      <AdminFeaturedPanel enabled />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
