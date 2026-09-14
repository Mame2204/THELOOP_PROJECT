import { useLayoutEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormTextInput } from '@/components/FormTextInput';
import { GuineaLocationPicker } from '@/components/GuineaLocationPicker';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { useAppSettings } from '@/context/AppSettingsContext';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';
import { authIdentifierHint, isPhoneIdentifier, normalizePhone } from '@/lib/otp-auth';
import {
  submitCommunitySuggestion,
  SUGGESTION_TYPE_LABELS,
  type SuggestionType,
} from '@/lib/suggestions-store';
import type { RootStackParamList } from '@/navigation/types';
import { isAuthenticated } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Suggestion'>;

const TYPES: SuggestionType[] = ['improvement', 'event', 'spot', 'tool', 'other'];

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

export function SuggestionScreen({ navigation }: Props) {
  const { user, role } = useAuthContext();
  const { shell } = useMemberTheme();
  const { settings } = useAppSettings();
  const isLoggedIn = Boolean(user && isAuthenticated(role));
  const [suggestionType, setSuggestionType] = useState<SuggestionType>('spot');
  const [title, setTitle] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [description, setDescription] = useState('');
  const [contactName, setContactName] = useState(
    user ? [user.firstName, user.lastName].filter(Boolean).join(' ').trim() : '',
  );
  const [contactEmail, setContactEmail] = useState(user?.email ?? '');
  const [contactPhone, setContactPhone] = useState(user?.phoneNumber ?? '');
  const [loading, setLoading] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: shell.pageBg },
      headerTintColor: shell.tabIndicator,
      headerTitleStyle: { color: shell.pageTitle },
    });
  }, [navigation, shell]);

  useLayoutEffect(() => {
    if (!settings.showCommunitySuggestion && role !== 'ADMIN') {
      navigation.goBack();
    }
  }, [navigation, role, settings.showCommunitySuggestion]);

  async function handleSubmit() {
    if (!description.trim()) {
      Alert.alert('Description requise', 'Décrivez votre idée, le spot ou l\'événement à tester.');
      return;
    }

    if (!isLoggedIn && contactPhone.trim() && !isPhoneIdentifier(contactPhone)) {
      Alert.alert('Téléphone invalide', 'Utilisez un numéro au format international (+224…).');
      return;
    }

    setLoading(true);
    const result = await submitCommunitySuggestion({
      suggestionType,
      title: title.trim() || undefined,
      placeName: placeName.trim() || undefined,
      description: description.trim(),
      contactName: isLoggedIn
        ? [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || undefined
        : contactName.trim() || undefined,
      contactEmail: isLoggedIn ? (user?.email ?? undefined) : contactEmail.trim() || undefined,
      contactPhone: isLoggedIn
        ? (user?.phoneNumber ?? undefined)
        : contactPhone.trim()
          ? normalizePhone(contactPhone)
          : undefined,
      countryCode: user?.countryCode ?? undefined,
      userId: isLoggedIn && user ? user.id : null,
    });
    setLoading(false);

    if (!result.ok) {
      Alert.alert('Erreur', result.error ?? 'Envoi impossible');
      return;
    }

    Alert.alert(
      'Merci !',
      'Votre suggestion a été transmise à l\'équipe THE LOOP. On en prend bonne note.',
      [{ text: 'OK', onPress: () => navigation.goBack() }],
    );
  }

  const showPlace = suggestionType === 'event' || suggestionType === 'spot' || suggestionType === 'tool';

  return (
    <KeyboardAwareFormScroll
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={styles.container}
    >
      <Text style={[styles.kicker, { color: shell.tabIndicator }]}>Communauté</Text>
      <Text style={[styles.title, { color: shell.pageTitle }]}>Proposer une idée</Text>
      <Text style={[styles.subtitle, { color: shell.pageKicker }]}>
        Suggérez une amélioration, un événement, un spot ou un outil à tester et à ajouter dans THE LOOP.
      </Text>

      <FieldLabel required color={shell.pageKicker}>Type de suggestion</FieldLabel>
      <View style={styles.typeRow}>
        {TYPES.map((type) => {
          const active = suggestionType === type;
          return (
            <Pressable
              key={type}
              style={[
                styles.typeChip,
                { borderColor: shell.filterInactiveBorder },
                active && { backgroundColor: shell.filterActiveBg, borderColor: shell.tabIndicator },
              ]}
              onPress={() => setSuggestionType(type)}
            >
              <Text
                style={[
                  styles.typeChipText,
                  { color: active ? shell.filterActiveText : shell.pageTitle },
                ]}
              >
                {SUGGESTION_TYPE_LABELS[type]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FieldLabel color={shell.pageKicker}>
        {suggestionType === 'improvement' ? 'Titre de l\'idée' : 'Nom'}
      </FieldLabel>
      <FormTextInput
        shell={shell}
        placeholder={
          suggestionType === 'improvement'
            ? 'Ex. Filtrer les événements par quartier'
            : 'Ex. Festival des arts de Conakry'
        }
        placeholderTextColor={shell.pageKicker}
        value={title}
        onChangeText={setTitle}
      />

      {showPlace ? (
        <GuineaLocationPicker
          value={placeName}
          onChange={setPlaceName}
          shell={shell}
          label="Lieu / quartier"
          placeholder="Choisir commune et quartier…"
          countryCode={user?.countryCode ?? DEFAULT_COUNTRY_CODE}
          optional
        />
      ) : null}

      <FieldLabel required color={shell.pageKicker}>Votre message</FieldLabel>
      <FormTextInput
        shell={shell}
        style={styles.textarea}
        placeholder="Pourquoi ce contenu ou cette amélioration serait utile pour la communauté THE LOOP ?"
        placeholderTextColor={shell.pageKicker}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={6}
      />

      {!isLoggedIn ? (
        <View style={[styles.contactCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
          <Text style={[styles.contactTitle, { color: shell.pageTitle }]}>Contact</Text>
          <Text style={[styles.contactOptional, { color: shell.pageKicker }]}>
            Optionnel — laissez vos coordonnées si vous souhaitez être recontacté.
          </Text>

          <FieldLabel color={shell.pageKicker}>Votre nom</FieldLabel>
          <FormTextInput
            shell={shell}
            placeholder="Prénom ou pseudo"
            placeholderTextColor={shell.pageKicker}
            value={contactName}
            onChangeText={setContactName}
          />

          <FieldLabel color={shell.pageKicker}>Email</FieldLabel>
          <FormTextInput
            shell={shell}
            placeholder="vous@email.com"
            placeholderTextColor={shell.pageKicker}
            value={contactEmail}
            onChangeText={setContactEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <FieldLabel color={shell.pageKicker}>WhatsApp</FieldLabel>
          <FormTextInput
            shell={shell}
            placeholder={authIdentifierHint()}
            placeholderTextColor={shell.pageKicker}
            value={contactPhone}
            onChangeText={setContactPhone}
            keyboardType="phone-pad"
          />
        </View>
      ) : (
        <Text style={[styles.loggedHint, { color: shell.pageKicker }]}>
          Envoyé depuis votre compte THE LOOP — nous vous recontacterons via vos coordonnées enregistrées.
        </Text>
      )}

      <Pressable
        style={[styles.btn, { backgroundColor: shell.filterActiveBg }]}
        onPress={() => void handleSubmit()}
        disabled={loading}
      >
        <Text style={[styles.btnText, { color: shell.filterActiveText }]}>
          {loading ? 'Envoi…' : 'Envoyer ma suggestion'}
        </Text>
      </Pressable>
    </KeyboardAwareFormScroll>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  title: { marginTop: 8, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 13, lineHeight: 20, marginBottom: 16 },
  section: { marginTop: 8, marginBottom: 8, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  contactCard: { marginTop: 8, marginBottom: 12, borderWidth: 1, borderRadius: 16, padding: 16 },
  contactTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  contactOptional: { fontSize: 13, lineHeight: 20, marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  required: { color: '#ef4444' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  typeChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  typeChipText: { fontSize: 11, fontWeight: '700' },
  textarea: { minHeight: 130, textAlignVertical: 'top' },
  loggedHint: { marginTop: 4, marginBottom: 8, fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
  btn: { marginTop: 8, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnText: { fontWeight: '700', fontSize: 14 },
});
