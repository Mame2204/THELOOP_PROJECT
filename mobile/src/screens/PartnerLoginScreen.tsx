import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { useAuthContext } from '@/context/AuthContext';
import { COMMUNITY_PARTNERSHIP_CTA } from '@/lib/community-copy';
import { resetToAccueil } from '@/lib/navigation-utils';
import { colors } from '@/theme/colors';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerLogin'>;

export function PartnerLoginScreen({ navigation }: Props) {
  const { signInWithPartnerToken } = useAuthContext();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    const result = await signInWithPartnerToken(code.trim().toUpperCase());
    setLoading(false);
    if (result.ok) {
      resetToAccueil(navigation);
    } else {
      Alert.alert('Connexion Pro impossible', result.error);
    }
  }

  return (
    <KeyboardAwareFormScroll
      style={styles.scroll}
      contentContainerStyle={styles.container}
    >
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Retour</Text>
      </Pressable>
      <Text style={styles.title}>Connexion Pro</Text>
      <Text style={styles.subtitle}>
        Code SPOT figurant sur votre carte partenaire — pas votre mot de passe membre.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="SPOT-XXXX-2026"
        placeholderTextColor="#6ee7b7"
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
      />
      <Pressable style={styles.btn} onPress={() => void handleSubmit()} disabled={loading}>
        <Text style={styles.btnText}>{loading ? 'Vérification…' : 'Accéder à mon espace Pro'}</Text>
      </Pressable>
      <Pressable onPress={() => navigation.navigate('PartnerApply')}>
        <Text style={styles.link}>{COMMUNITY_PARTNERSHIP_CTA}</Text>
      </Pressable>
    </KeyboardAwareFormScroll>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#022c22' },
  container: { flexGrow: 1, padding: 20, paddingBottom: 40 },
  back: { color: '#34d399', fontSize: 12, marginBottom: 16 },
  title: { marginTop: 8, fontSize: 28, fontWeight: '800', color: '#34d399' },
  subtitle: { marginTop: 8, fontSize: 13, color: 'rgba(167,243,208,0.8)' },
  input: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.4)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    padding: 14,
    color: colors.white,
    textAlign: 'center',
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  btn: { marginTop: 16, backgroundColor: '#20C997', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnText: { fontWeight: '700', color: colors.white },
  link: { marginTop: 24, textAlign: 'center', color: '#6ee7b7', fontSize: 13 },
});
