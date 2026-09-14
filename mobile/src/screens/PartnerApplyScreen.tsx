import { useLayoutEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { authIdentifierHint, isPhoneIdentifier, normalizePhone } from '@/lib/otp-auth';
import { submitPartnershipRequest } from '@/lib/partnership-store';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerApply'>;

function FieldLabel({
  children,
  required,
  color,
}: {
  children: string;
  required?: boolean;
  color: string;
}) {
  return (
    <Text style={[styles.fieldLabel, { color }]}>
      {children}
      {required ? <Text style={styles.required}> *</Text> : null}
    </Text>
  );
}

export function PartnerApplyScreen({ navigation }: Props) {
  const { shell } = useMemberTheme();
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: shell.pageBg },
      headerTintColor: shell.tabIndicator,
      headerTitleStyle: { color: shell.pageTitle },
    });
  }, [navigation, shell]);

  async function handleSubmit() {
    if (!companyName.trim() || !email.trim()) {
      Alert.alert('Champs requis', 'Indiquez le nom de l\'établissement et un email professionnel.');
      return;
    }
    if (!phone.trim() || !isPhoneIdentifier(phone)) {
      Alert.alert('Téléphone requis', 'Indiquez un numéro WhatsApp valide (+224 6XX XX XX XX).');
      return;
    }

    setLoading(true);
    const result = await submitPartnershipRequest({
      companyName: companyName.trim(),
      email: email.trim(),
      phone: normalizePhone(phone),
      activityType: 'restaurant',
      message: message.trim(),
    });
    setLoading(false);
    if (!result.ok) {
      Alert.alert('Erreur', result.error ?? 'Envoi impossible');
      return;
    }
    Alert.alert(
      'Merci',
      'Votre demande a été transmise. Nous vous recontacterons sur WhatsApp ou par email.',
      [{ text: 'OK', onPress: () => navigation.goBack() }],
    );
  }

  const inputStyle = [
    styles.input,
    {
      backgroundColor: shell.filterInactiveBg,
      borderColor: shell.filterInactiveBorder,
      color: shell.pageTitle,
    },
  ];

  return (
    <KeyboardAwareFormScroll
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={styles.container}
    >
      <Text style={[styles.kicker, { color: '#10b981' }]}>Partenariat</Text>
      <Text style={[styles.title, { color: shell.pageTitle }]}>Demande de partenariat</Text>
      <Text style={[styles.subtitle, { color: shell.pageKicker }]}>
        Proposez votre établissement ou vos événements à THE LOOP.
      </Text>

      <FieldLabel required color={shell.pageKicker}>Nom de l'établissement</FieldLabel>
      <TextInput
        style={inputStyle}
        placeholder="Ex. L'Avenue Restaurant"
        placeholderTextColor={shell.pageKicker}
        value={companyName}
        onChangeText={setCompanyName}
      />

      <FieldLabel required color={shell.pageKicker}>Email professionnel</FieldLabel>
      <TextInput
        style={inputStyle}
        placeholder="contact@etablissement.gn"
        placeholderTextColor={shell.pageKicker}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <FieldLabel required color={shell.pageKicker}>Téléphone / WhatsApp</FieldLabel>
      <TextInput
        style={inputStyle}
        placeholder={authIdentifierHint()}
        placeholderTextColor={shell.pageKicker}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />

      <FieldLabel color={shell.pageKicker}>Votre projet</FieldLabel>
      <TextInput
        style={[...inputStyle, styles.textarea]}
        placeholder="Décrivez votre activité et votre projet"
        placeholderTextColor={shell.pageKicker}
        value={message}
        onChangeText={setMessage}
        multiline
        numberOfLines={5}
      />

      <Pressable
        style={[styles.btn, { backgroundColor: '#10b981' }]}
        onPress={() => void handleSubmit()}
        disabled={loading}
      >
        <Text style={styles.btnText}>{loading ? 'Envoi…' : 'Envoyer ma demande'}</Text>
      </Pressable>
    </KeyboardAwareFormScroll>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  title: { marginTop: 8, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 13, lineHeight: 20, marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  required: { color: '#ef4444' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    fontSize: 14,
  },
  textarea: { minHeight: 120, textAlignVertical: 'top' },
  btn: { marginTop: 8, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnText: { fontWeight: '700', color: '#ffffff', fontSize: 14 },
});
