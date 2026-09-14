import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { AdminPageHeader, ADMIN_THEME, adminCardStyle } from '@/components/admin/AdminShell';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useAdminPermissions } from '@/context/AdminPermissionsContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import {
  DEFAULT_SECTIONS,
  getAppSections,
  setCatalogTabVisible,
  setPartnerProBlock,
  setPartnerProSpaceVisible,
  type AppSectionsConfig,
  type PartnerProBlocksConfig,
} from '@/lib/app-sections-store';
import type { AdminPanelParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AdminPanelParamList, 'AdminRubrique'>;

const USER_TABS: Array<{ key: 'agenda' | 'spots' | 'outils'; label: string; icon: string }> = [
  { key: 'agenda', label: 'Agenda', icon: '📅' },
  { key: 'spots', label: 'Spots', icon: '📍' },
  { key: 'outils', label: 'Outils', icon: '🛠️' },
];

const PARTNER_BLOCKS: Array<{ key: keyof PartnerProBlocksConfig; label: string }> = [
  { key: 'content', label: 'Mon contenu' },
  { key: 'benefits', label: 'Privilèges offerts' },
  { key: 'featured', label: 'À la une' },
  { key: 'rewards', label: 'Récompenses' },
  { key: 'stats', label: 'Performances' },
];

export function AdminRubriqueScreen({ navigation, route }: Props) {
  const rubrique = route.params.rubrique;
  const { role } = useAuthContext();
  const { countryCode } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { allowed: rubriqueAllowed, isLoading: rubriqueLoading, permissionLabel: rubriqueLabel } =
    useAdminModuleAccess('rubrique');
  const { allowed: contentAllowed, isLoading: contentLoading, permissionLabel: contentLabel } =
    useAdminModuleAccess('content');
  const { allowed: partnerAllowed, isLoading: partnerLoading, permissionLabel: partnerLabel } =
    useAdminModuleAccess('partnerships');
  const { hasSubPermission } = useAdminPermissions();
  const [refreshing, setRefreshing] = useState(false);
  const [sections, setSections] = useState<AppSectionsConfig>(DEFAULT_SECTIONS);

  const allowed =
    rubrique === 'visibility'
      ? rubriqueAllowed || contentAllowed || partnerAllowed
      : contentAllowed;
  const isLoading =
    rubrique === 'visibility' ? rubriqueLoading || contentLoading || partnerLoading : contentLoading;
  const permissionLabel =
    rubrique === 'visibility'
      ? rubriqueAllowed
        ? rubriqueLabel
        : contentAllowed
          ? contentLabel
          : partnerLabel
      : contentLabel;
  const canMemberTabs = hasSubPermission('rubrique', 'rubrique_member_tabs') || contentAllowed;
  const canPartnerBlocks = hasSubPermission('rubrique', 'rubrique_partner_blocks') || partnerAllowed;

  const load = useCallback(async () => {
    setSections(await getAppSections(countryCode));
  }, [countryCode]);

  const { run } = useFocusLoad(
    async () => {
      await load();
    },
    { ttlMs: 90_000, enabled: role === 'ADMIN', resetKey: countryCode },
  );

  async function toggleUserTab(tab: 'agenda' | 'spots' | 'outils') {
    const next = await setCatalogTabVisible(countryCode, tab, !sections[tab].tabVisible);
    setSections(next);
  }

  async function togglePartnerSpace() {
    const next = await setPartnerProSpaceVisible(countryCode, !sections.partnerPro.spaceVisible);
    setSections(next);
  }

  async function togglePartnerBlock(key: keyof PartnerProBlocksConfig) {
    if (key === 'spaceVisible') {
      await togglePartnerSpace();
      return;
    }
    const next = await setPartnerProBlock(countryCode, key, !sections.partnerPro[key]);
    setSections(next);
  }

  if (role !== 'ADMIN') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle }}>Accès réservé aux administrateurs.</Text>
      </View>
    );
  }

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  if (rubrique !== 'visibility') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle }}>Rubrique non disponible.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#ffffff' }}
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
        title="Onglets & Espace Pro"
        subtitle="Visibilité des onglets app · modules partenaire"
        shell={shell}
        onBack={() => navigation.goBack()}
      />
      <AdminCountryBar shell={shell} compact />

      {canMemberTabs ? (
        <View style={styles.section}>
          <View style={[styles.card, adminCardStyle(shell)]}>
            <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>Onglets utilisateurs</Text>
            <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
              Masquer un onglet le retire de la barre de navigation basse (Agenda, Spots, Outils).
            </Text>
            {USER_TABS.map((row) => (
              <Pressable
                key={row.key}
                onPress={() => void toggleUserTab(row.key)}
                style={[styles.toggleRow, { borderColor: shell.filterInactiveBorder, marginTop: 8 }]}
              >
                <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>
                  {row.icon} {row.label}
                </Text>
                <Text
                  style={{
                    color: sections[row.key].tabVisible ? ADMIN_THEME.accent : '#ef4444',
                    fontWeight: '800',
                  }}
                >
                  {sections[row.key].tabVisible ? 'Visible' : 'Masqué'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {canPartnerBlocks ? (
        <View style={styles.section}>
          <View style={[styles.card, adminCardStyle(shell)]}>
            <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>Espace Pro partenaire</Text>
            <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
              Contrôlez l'accès à l'onglet Pro et les modules visibles dans l'espace partenaire.
            </Text>
            <Pressable
              onPress={() => void togglePartnerSpace()}
              style={[styles.toggleRow, { borderColor: shell.filterInactiveBorder, marginTop: 8 }]}
            >
              <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>🏢 Onglet Espace Pro</Text>
              <Text
                style={{
                  color: sections.partnerPro.spaceVisible ? ADMIN_THEME.accent : '#ef4444',
                  fontWeight: '800',
                }}
              >
                {sections.partnerPro.spaceVisible ? 'Visible' : 'Masqué'}
              </Text>
            </Pressable>
            {PARTNER_BLOCKS.map((row) => (
              <Pressable
                key={row.key}
                onPress={() => void togglePartnerBlock(row.key)}
                style={[styles.toggleRow, { borderColor: shell.filterInactiveBorder, marginTop: 8 }]}
              >
                <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>{row.label}</Text>
                <Text
                  style={{
                    color: sections.partnerPro[row.key] ? ADMIN_THEME.accent : '#ef4444',
                    fontWeight: '800',
                  }}
                >
                  {sections.partnerPro[row.key] ? 'ON' : 'OFF'}
                </Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.btn, { backgroundColor: ADMIN_THEME.accent, marginTop: 12 }]}
              onPress={() => navigation.navigate('AdminPartnerships')}
            >
              <Text style={styles.btnText}>Ouvrir Partenaires</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 12, paddingBottom: 40 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  section: { gap: 8, marginTop: 8 },
  card: { marginBottom: 4 },
  cardTitle: { fontSize: 14, fontWeight: '800' },
  cardMeta: { marginTop: 4, fontSize: 12, lineHeight: 16 },
  btn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
});
