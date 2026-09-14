import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { createAdminUserInvite } from '@/lib/admin-invite-store';
import { USER_ROLE_LABELS, ADMIN_ASSIGNABLE_ROLES, type AdminAssignableRole } from '@/lib/admin-types';
import { useAuthContext } from '@/context/AuthContext';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { useAdminPermissions } from '@/context/AdminPermissionsContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { AdminPageHeader, ADMIN_THEME } from '@/components/admin/AdminShell';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { InternationalPhoneField } from '@/components/InternationalPhoneField';
import { GuineaLocationPicker } from '@/components/GuineaLocationPicker';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { validateSignupEmail } from '@/lib/email-auth';
import { DEFAULT_COUNTRY_CODE, type CountryCode, type PhoneDialCode } from '@/lib/countries';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminCreateUser'>;

const ROLES = ADMIN_ASSIGNABLE_ROLES;

export function AdminCreateUserScreen({ navigation }: Props) {
  const { user } = useAuthContext();
  const { isSuperAdmin } = useAdminPermissions();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('users');
  const assignableRoles = isSuperAdmin
    ? [...ROLES]
    : ROLES.filter((r) => r !== 'admin' && r !== 'super_admin');
  const { countryCode: adminCountry } = useAdminCountry();
  const { shell } = useMemberTheme();
  const [phone, setPhone] = useState('');
  const [phoneDialCode, setPhoneDialCode] = useState<PhoneDialCode>(DEFAULT_COUNTRY_CODE);
  const [countryCode, setCountryCode] = useState<CountryCode>(adminCountry);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [city, setCity] = useState('');
  const [userRole, setUserRole] = useState<AdminAssignableRole>('member');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCountryCode(adminCountry);
  }, [adminCountry]);

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  const inputStyle = [styles.input, { backgroundColor: shell.filterInactiveBg, borderColor: shell.filterInactiveBorder, color: shell.pageTitle }];

  async function handleCreate() {
    const emailCheck = validateSignupEmail(email);
    if (!emailCheck.ok) {
      Alert.alert('E-mail requis', emailCheck.message);
      return;
    }
    setSaving(true);
    try {
      const invite = await createAdminUserInvite({
        email: emailCheck.email,
        phone: phone.trim() || undefined,
        phoneDialCode,
        countryCode,
        city: city.trim() || undefined,
        userRole,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        createdByAdminId: user?.id ?? 'admin',
      });
      Alert.alert(
        'Invitation créée',
        `Un e-mail d'activation sera envoyé à ${invite.email}.\n\nLa personne ouvre Connexion → « Activer un compte invité », saisit cet e-mail et définit son mot de passe.\n\nRôle : ${USER_ROLE_LABELS[userRole]}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Création impossible');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAwareFormScroll style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
      <AdminPageHeader
        title="Créer un compte"
        subtitle="Invitation par e-mail — la personne définit son mot de passe à l'activation"
        shell={shell}
        onBack={() => navigation.goBack()}
      />

      <AdminCountryBar shell={shell} compact />

      <Text style={[styles.label, { color: shell.pageKicker }]}>E-mail du compte *</Text>
      <TextInput
        style={inputStyle}
        value={email}
        onChangeText={setEmail}
        placeholder="email@exemple.gn"
        placeholderTextColor={shell.pageKicker}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <InternationalPhoneField
        dialCode={phoneDialCode}
        onDialCodeChange={setPhoneDialCode}
        phone={phone}
        onPhoneChange={setPhone}
        shell={shell}
        label="Téléphone (optionnel)"
        hint="Peut être complété plus tard dans le profil."
      />

      <Text style={[styles.label, { color: shell.pageKicker }]}>Prénom / Nom (optionnel)</Text>
      <View style={styles.row}>
        <TextInput style={[...inputStyle, styles.half]} value={firstName} onChangeText={setFirstName} placeholder="Prénom" placeholderTextColor={shell.pageKicker} />
        <TextInput style={[...inputStyle, styles.half]} value={lastName} onChangeText={setLastName} placeholder="Nom" placeholderTextColor={shell.pageKicker} />
      </View>

      <GuineaLocationPicker
        value={city}
        onChange={setCity}
        shell={shell}
        label="Localisation"
        countryCode={countryCode}
        optional
        allowCommuneOnly
      />

      <Text style={[styles.label, { color: shell.pageKicker }]}>Rôle</Text>
      <View style={styles.roleRow}>
        {assignableRoles.map((r) => (
          <Pressable
            key={r}
            style={[styles.roleBtn, { borderColor: shell.filterInactiveBorder }, userRole === r && { backgroundColor: ADMIN_THEME.accent, borderColor: ADMIN_THEME.accent }]}
            onPress={() => setUserRole(r)}
          >
            <Text style={{ color: userRole === r ? '#fff' : shell.pageTitle, fontSize: 11, fontWeight: '700' }}>
              {USER_ROLE_LABELS[r]}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.hintBox, { backgroundColor: ADMIN_THEME.glow, borderColor: ADMIN_THEME.accent + '44' }]}>
        <Text style={[styles.hintText, { color: shell.pageTitle }]}>
          Le pays du compte (barre ci-dessus) détermine le catalogue affiché. L'e-mail sert à la connexion et à la sécurité du compte.
        </Text>
      </View>

      <Pressable style={[styles.submit, { backgroundColor: ADMIN_THEME.accent }]} onPress={() => void handleCreate()} disabled={saving}>
        <Text style={styles.submitText}>{saving ? 'Envoi…' : 'Envoyer l\'invitation'}</Text>
      </Pressable>
    </KeyboardAwareFormScroll>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8, fontSize: 14 },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  roleBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  hintBox: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 8 },
  hintText: { fontSize: 12, lineHeight: 18 },
  submit: { marginTop: 20, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
