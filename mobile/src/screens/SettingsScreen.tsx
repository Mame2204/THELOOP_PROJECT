import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CloseAccountSheet } from '@/components/CloseAccountSheet';
import { CountrySelectField } from '@/components/CountrySelectField';
import { LegalPreviewModal } from '@/components/LegalPreviewModal';
import { useAuthContext } from '@/context/AuthContext';
import { useContentCountries } from '@/context/ContentCountriesContext';
import { useViewingCountry } from '@/context/ViewingCountryContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { COMMUNITY_CLOSE_ACCOUNT_CTA } from '@/lib/community-copy';
import { DEFAULT_COUNTRY_CODE, getCountryLabel, type CountryCode } from '@/lib/countries';
import { formatLegalBodyForDisplay } from '@/lib/legal-display';
import { getLegalContent, type LegalContentKey } from '@/lib/legal-content-store';
import { isSuperAdminAccount } from '@/lib/role-benefit-eligibility';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const LEGAL_LINKS: { key: LegalContentKey; label: string }[] = [
  { key: 'cgu', label: 'Conditions générales d’utilisation' },
  { key: 'privacy_policy', label: 'Politique de confidentialité' },
  { key: 'mentions_legales', label: 'Mentions légales' },
];

export function SettingsScreen({ navigation }: Props) {
  const { user } = useAuthContext();
  const { shell } = useMemberTheme();
  const { enabledCountries } = useContentCountries();
  const {
    viewingCountryCode,
    setViewingCountryCode,
    countries,
    isExploringOtherCountry,
  } = useViewingCountry();
  const [saving, setSaving] = useState(false);
  const [closeAccountOpen, setCloseAccountOpen] = useState(false);
  const [legalPreview, setLegalPreview] = useState<{ title: string; body: string } | null>(null);

  const isLoggedIn = Boolean(user && user.id !== 'anonymous');
  const canRequestDeletion = Boolean(user && isLoggedIn && !isSuperAdminAccount(user));
  const accountCountry = (user?.countryCode ?? DEFAULT_COUNTRY_CODE) as CountryCode;
  const exploreEnabled = isExploringOtherCountry;
  const multiCountry = countries.length > 1;
  const interestCountries = countries.filter((c) => c !== accountCountry);

  const handleToggleExplore = useCallback(async (enabled: boolean) => {
    setSaving(true);
    try {
      if (!enabled) {
        await setViewingCountryCode(accountCountry);
        return;
      }
      const fallback = interestCountries[0] ?? countries[0];
      if (fallback) await setViewingCountryCode(fallback);
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  }, [accountCountry, countries, interestCountries, setViewingCountryCode]);

  const handleInterestChange = useCallback(async (code: CountryCode) => {
    setSaving(true);
    try {
      await setViewingCountryCode(code);
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  }, [setViewingCountryCode]);

  const openLegalDoc = useCallback(async (key: LegalContentKey) => {
    try {
      const content = await getLegalContent(key, { force: true });
      setLegalPreview({ title: content.title, body: formatLegalBodyForDisplay(content.body) });
    } catch {
      Alert.alert('Erreur', 'Impossible de charger ce document. Réessayez.');
    }
  }, []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
      <Text style={[styles.kicker, { color: shell.pageKicker }]}>Compte</Text>
      <Text style={[styles.title, { color: shell.pageTitle }]}>Paramètres</Text>

      <Text style={[styles.section, { color: shell.pageKicker }]}>Pays & contenu</Text>

      <CountrySelectField
        value={accountCountry}
        onChange={() => {}}
        shell={shell}
        label="Pays du compte"
        countries={enabledCountries}
        readOnly
      />
      <Text style={[styles.note, { color: shell.pageKicker }]}>
        Votre pays de vie, lié à votre compte à l'inscription. Il ne peut pas être modifié.
      </Text>

      {isLoggedIn ? (
        <View style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={[styles.cardLabel, { color: shell.pageKicker }]}>Explorer un autre pays THE LOOP</Text>
              <Text style={[styles.cardHint, { color: shell.pageKicker, marginTop: 4 }]}>
                Vacances ou déplacement : contenu et privilèges du pays choisi (membre, PASS, partenaire). Votre statut de compte reste valable partout.
              </Text>
            </View>
            <Switch
              value={exploreEnabled}
              onValueChange={(v) => void handleToggleExplore(v)}
              disabled={saving || !multiCountry || interestCountries.length === 0}
              trackColor={{ false: shell.filterInactiveBorder, true: shell.tabIndicator }}
            />
          </View>

          {!multiCountry || interestCountries.length === 0 ? (
            <Text style={[styles.cardHint, { color: shell.pageKicker, marginTop: 8 }]}>
              Un seul pays activé pour le moment — le switch sera disponible dès qu'un second pays sera activé dans Control Tower.
            </Text>
          ) : null}

          {exploreEnabled && multiCountry && interestCountries.length > 0 ? (
            <CountrySelectField
              value={viewingCountryCode}
              onChange={(code) => void handleInterestChange(code)}
              shell={shell}
              label="Pays d'intérêt"
              countries={interestCountries}
            />
          ) : (
            <Text style={[styles.cardValue, { color: shell.pageTitle, marginTop: 8 }]}>
              Contenu affiché : {getCountryLabel(viewingCountryCode)}
            </Text>
          )}
        </View>
      ) : (
        <View style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
          <Text style={[styles.cardLabel, { color: shell.pageKicker }]}>Contenu affiché</Text>
          <Text style={[styles.cardValue, { color: shell.pageTitle }]}>{getCountryLabel(viewingCountryCode)}</Text>
        </View>
      )}

      {canRequestDeletion ? (
        <>
          <Text style={[styles.section, { color: shell.pageKicker, marginTop: 16 }]}>Mon compte</Text>
          <Pressable
            style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
            onPress={() => setCloseAccountOpen(true)}
          >
            <Text style={styles.deleteText}>{COMMUNITY_CLOSE_ACCOUNT_CTA}</Text>
            <Text style={[styles.cardHint, { color: shell.pageKicker, marginTop: 4 }]}>
              Demander la suppression de votre compte et de vos données.
            </Text>
          </Pressable>
        </>
      ) : null}

      <Text style={[styles.section, { color: shell.pageKicker, marginTop: 16 }]}>Informations légales</Text>
      <View style={[styles.card, styles.legalCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
        {LEGAL_LINKS.map((link, index) => (
          <Pressable
            key={link.key}
            style={[
              styles.legalRow,
              index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: shell.filterInactiveBorder } : null,
            ]}
            onPress={() => void openLegalDoc(link.key)}
            accessibilityRole="button"
          >
            <Text style={[styles.legalLabel, { color: shell.pageTitle }]}>{link.label}</Text>
            <Text style={[styles.legalChevron, { color: shell.pageKicker }]}>›</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.btnGhost} onPress={() => navigation.goBack()}>
        <Text style={[styles.btnGhostText, { color: shell.pageKicker }]}>Retour</Text>
      </Pressable>

      <CloseAccountSheet visible={closeAccountOpen} onClose={() => setCloseAccountOpen(false)} />
      <LegalPreviewModal
        visible={legalPreview != null}
        title={legalPreview?.title ?? ''}
        body={legalPreview?.body ?? ''}
        onClose={() => setLegalPreview(null)}
        accentBg={shell.filterActiveBg}
        accentText={shell.filterActiveText}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  title: { marginTop: 4, fontSize: 22, fontWeight: '700', marginBottom: 16 },
  section: { marginTop: 8, marginBottom: 8, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  note: { fontSize: 10, marginBottom: 12 },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  cardValue: { marginTop: 6, fontSize: 16, fontWeight: '700' },
  cardHint: { marginTop: 8, fontSize: 12, lineHeight: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchText: { flex: 1 },
  legalCard: { paddingVertical: 0 },
  legalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  legalLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  legalChevron: { fontSize: 20, fontWeight: '600' },
  deleteText: { fontSize: 15, fontWeight: '700', color: '#D14343' },
  btnGhost: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  btnGhostText: { fontWeight: '600' },
});
