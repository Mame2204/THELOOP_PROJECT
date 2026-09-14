import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FormTextInput } from '@/components/FormTextInput';
import { LoopLogo } from '@/components/LoopLogo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { SystemUnavailableBanner } from '@/components/SystemUnavailableBanner';
import { isNetworkOnline } from '@/lib/offline-store';
import { findPartnerByValidationCode, normalizePartnerValidationCode } from '@/lib/partner-validation-code-store';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerValidationCode'>;

const SHEET_BG = '#FFFFFF';

function FieldLabel({
  children,
  color,
}: {
  children: string;
  color: string;
}) {
  return (
    <Text style={[styles.fieldLabel, { color }]}>
      {children}
    </Text>
  );
}

export function PartnerValidationCodeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { shell } = useMemberTheme();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [offlineBlocked, setOfflineBlocked] = useState(false);

  async function handleContinue() {
    const normalized = normalizePartnerValidationCode(code);
    if (!/^CODE-[A-Z0-9]{5}$/.test(normalized)) {
      Alert.alert('Code invalide', 'Saisissez un code partenaire au format CODE-XXXXX.');
      return;
    }
    setLoading(true);
    try {
      if (!(await isNetworkOnline())) {
        setOfflineBlocked(true);
        Alert.alert('Hors ligne', 'Connexion internet requise pour valider un code partenaire.');
        return;
      }
      setOfflineBlocked(false);
      const partner = await findPartnerByValidationCode(normalized);
      if (!partner) {
        Alert.alert(
          'Code introuvable',
          'Aucun partenaire ne correspond à ce code. Vérifiez la saisie (format CODE-XXXXX) ou demandez au partenaire de rouvrir son profil THE LOOP pour afficher le code à jour.',
        );
        return;
      }
      navigation.replace('PartnerBenefitScan', {
        partnerId: partner.partnerId,
        partnerName: partner.partnerName,
        partnerCode: partner.code,
      });
    } catch {
      Alert.alert(
        'Erreur',
        'La vérification du code a échoué. Vérifiez votre connexion et réessayez.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <Pressable
        style={styles.backdropTap}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Fermer"
      />

      <KeyboardAvoidingView
        style={styles.centerWrap}
        pointerEvents="box-none"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <View
          pointerEvents="auto"
          style={[
            styles.sheet,
            {
              marginBottom: Math.max(insets.bottom, 16),
              marginTop: Math.max(insets.top, 16),
              borderColor: shell.filterInactiveBorder,
            },
          ]}
        >
          <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ color: shell.pageKicker, fontSize: 18, fontWeight: '600' }}>✕</Text>
          </Pressable>

          <View style={styles.brandHero}>
            <LoopLogo variant="app" size="md" stacked />
          </View>

          <Text style={[styles.kicker, { color: shell.tabIndicator }]}>Validation partenaire</Text>
          <Text style={[styles.title, { color: shell.pageTitle }]}>Code établissement</Text>
          <Text style={[styles.body, { color: shell.pageKicker }]}>
            Saisissez le code unique de votre établissement pour identifier un membre THE LOOP ou valider un avantage.
          </Text>

          {offlineBlocked ? <SystemUnavailableBanner shell={shell} compact /> : null}

          <FieldLabel color={shell.pageKicker}>Code partenaire</FieldLabel>
          <FormTextInput
            shell={shell}
            accentColor={shell.filterActiveBg}
            value={code}
            onChangeText={setCode}
            placeholder="CODE-XXXXX"
            placeholderTextColor={shell.pageKicker}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
          />

          <Pressable
            style={[styles.btn, { backgroundColor: shell.filterActiveBg, opacity: loading ? 0.65 : 1 }]}
            onPress={() => void handleContinue()}
            disabled={loading}
          >
            <Text style={[styles.btnText, { color: shell.filterActiveText }]}>
              {loading ? 'Vérification…' : 'Continuer'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  backdropTap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    zIndex: 1,
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 2,
  },
  sheet: {
    backgroundColor: SHEET_BG,
    borderWidth: 1,
    borderRadius: 20,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 20,
    shadowColor: '#0D7A8C',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
  closeBtn: { position: 'absolute', top: 14, right: 14, zIndex: 3 },
  brandHero: { alignItems: 'center', marginBottom: 16 },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  body: { fontSize: 13, lineHeight: 20, marginBottom: 4 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1.2,
    minHeight: 48,
    marginBottom: 4,
  },
  btn: {
    marginTop: 12,
    minHeight: 48,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontWeight: '700', fontSize: 15 },
});
