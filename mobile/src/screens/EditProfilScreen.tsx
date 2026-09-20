import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthContext } from '@/context/AuthContext';
import { useContentCountries } from '@/context/ContentCountriesContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { CountrySelectField } from '@/components/CountrySelectField';
import { DateTimeField } from '@/components/DateTimeField';
import { GuineaLocationPicker } from '@/components/GuineaLocationPicker';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { DEFAULT_COUNTRY_CODE, type CountryCode } from '@/lib/countries';
import { canonicalizeGuineaLocationLabel } from '@/lib/guinea-locations';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfil'>;

export function EditProfilScreen({ navigation }: Props) {
  const { user, updateProfile } = useAuthContext();
  const { enabledCountries } = useContentCountries();
  const { shell } = useMemberTheme();
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [phone, setPhone] = useState(user?.phoneNumber ?? '');
  const [company, setCompany] = useState(user?.company ?? '');
  const [jobTitle, setJobTitle] = useState(user?.jobTitle ?? '');
  const [city, setCity] = useState(user?.city ? canonicalizeGuineaLocationLabel(user.city) : '');
  const [birthDate, setBirthDate] = useState(user?.birthDate ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
    setPhone(user?.phoneNumber ?? '');
    setCompany(user?.company ?? '');
    setJobTitle(user?.jobTitle ?? '');
    setCity(user?.city ? canonicalizeGuineaLocationLabel(user.city) : '');
    setBirthDate(user?.birthDate ?? '');
  }, [user]);

  const inputStyle = [
    styles.input,
    {
      backgroundColor: shell.filterInactiveBg,
      borderColor: shell.filterInactiveBorder,
      color: shell.pageTitle,
    },
  ];

  async function handleSaveProfile() {
    setSaving(true);
    try {
      await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
        city: city.trim(),
        birthDate: birthDate.trim() || null,
        company: company.trim() || undefined,
        jobTitle: jobTitle.trim() || undefined,
      });
      Alert.alert('Profil mis à jour', 'Vos informations ont été enregistrées.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Mise à jour impossible');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAwareFormScroll style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
      <Text style={[styles.kicker, { color: shell.pageKicker }]}>Profil</Text>
      <Text style={[styles.title, { color: shell.pageTitle }]}>Modifier mes informations</Text>

      <Text style={[styles.section, { color: shell.pageKicker }]}>Identité</Text>
      <TextInput style={inputStyle} value={firstName} onChangeText={setFirstName} placeholder="Prénom" placeholderTextColor={shell.pageKicker} />
      <TextInput style={inputStyle} value={lastName} onChangeText={setLastName} placeholder="Nom" placeholderTextColor={shell.pageKicker} />
      <TextInput
        style={[...inputStyle, styles.readonly]}
        value={user?.email ?? ''}
        editable={false}
        placeholder="E-mail"
        placeholderTextColor={shell.pageKicker}
      />
      <Text style={[styles.note, { color: shell.pageKicker }]}>L'e-mail ne peut pas être modifié ici.</Text>
      <Text style={[styles.fieldLabel, { color: shell.pageKicker }]}>Téléphone (optionnel)</Text>
      <TextInput style={inputStyle} value={phone} onChangeText={setPhone} placeholder="+224 620 00 00 00" placeholderTextColor={shell.pageKicker} keyboardType="phone-pad" />

      <CountrySelectField
        value={(user?.countryCode ?? DEFAULT_COUNTRY_CODE) as CountryCode}
        onChange={() => {}}
        shell={shell}
        label="Pays du compte"
        countries={enabledCountries}
        readOnly
      />
      <Text style={[styles.note, { color: shell.pageKicker }]}>
        Le pays du compte est défini à l'inscription et ne peut pas être modifié.
      </Text>

      <GuineaLocationPicker
        value={city}
        onChange={setCity}
        shell={shell}
        label="Localisation"
        countryCode={(user?.countryCode ?? DEFAULT_COUNTRY_CODE) as CountryCode}
        optional
        placeholder="Choisir commune et quartier"
      />

      <Text style={[styles.section, { color: shell.pageKicker }]}>Optionnel</Text>
      <DateTimeField
        value={birthDate}
        onChange={setBirthDate}
        placeholder="Date de naissance — offres anniversaire"
        dateOnly
        flat
        maximumDate={new Date()}
        shell={shell}
      />

      {user?.role === 'PARTNER' ? (
        <>
          <Text style={[styles.section, { color: shell.pageKicker }]}>Entreprise</Text>
          <TextInput style={inputStyle} value={company} onChangeText={setCompany} placeholder="Établissement" placeholderTextColor={shell.pageKicker} />
          <TextInput style={inputStyle} value={jobTitle} onChangeText={setJobTitle} placeholder="Fonction" placeholderTextColor={shell.pageKicker} />
        </>
      ) : null}

      <Pressable style={[styles.btnPrimary, { backgroundColor: shell.filterActiveBg }]} onPress={() => void handleSaveProfile()} disabled={saving}>
        <Text style={[styles.btnPrimaryText, { color: shell.filterActiveText }]}>{saving ? 'Enregistrement…' : 'Enregistrer le profil'}</Text>
      </Pressable>

      <Pressable
        style={[styles.btnOutline, { borderColor: shell.filterInactiveBorder }]}
        onPress={() => navigation.navigate('Settings')}
      >
        <Text style={[styles.btnOutlineText, { color: shell.pageTitle }]}>Mot de passe & paramètres avancés</Text>
      </Pressable>

      <Pressable style={styles.btnGhost} onPress={() => navigation.goBack()}>
        <Text style={[styles.btnGhostText, { color: shell.pageKicker }]}>Retour</Text>
      </Pressable>
    </KeyboardAwareFormScroll>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  title: { marginTop: 4, fontSize: 22, fontWeight: '700', marginBottom: 16 },
  section: { marginTop: 20, marginBottom: 8, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10, fontSize: 14 },
  readonly: { opacity: 0.7 },
  note: { fontSize: 10, marginBottom: 8 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 4, marginBottom: 6 },
  fieldHint: { fontSize: 11, lineHeight: 16, marginBottom: 8 },
  btnPrimary: { marginTop: 8, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnPrimaryText: { fontWeight: '700' },
  btnOutline: { marginTop: 8, borderWidth: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnOutlineText: { fontWeight: '700' },
  btnGhost: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  btnGhostText: { fontWeight: '600' },
});
