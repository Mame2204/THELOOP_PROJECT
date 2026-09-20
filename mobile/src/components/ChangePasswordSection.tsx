import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { PasswordInput } from '@/components/PasswordInput';
import { useAuthContext } from '@/context/AuthContext';
import type { ShellTheme } from '@/lib/member-grade-theme';

interface ChangePasswordSectionProps {
  shell: ShellTheme;
  labels?: {
    current: string;
    next: string;
    confirm: string;
    action: string;
    saving: string;
  };
}

const DEFAULT_LABELS = {
  current: 'Mot de passe actuel',
  next: 'Nouveau mot de passe',
  confirm: 'Confirmer le mot de passe',
  action: 'Changer le mot de passe',
  saving: 'Enregistrement…',
};

export function ChangePasswordSection({ shell, labels = DEFAULT_LABELS }: ChangePasswordSectionProps) {
  const { changePassword } = useAuthContext();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleChangePassword() {
    if (newPassword.length < 8) {
      Alert.alert('Mot de passe', 'Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mot de passe', 'Les mots de passe ne correspondent pas.');
      return;
    }
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Mot de passe modifié', 'Votre mot de passe a été mis à jour.');
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Modification impossible');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <PasswordInput
        shell={shell}
        value={currentPassword}
        onChangeText={setCurrentPassword}
        placeholder={labels.current}
        placeholderTextColor={shell.pageKicker}
      />
      <PasswordInput
        shell={shell}
        value={newPassword}
        onChangeText={setNewPassword}
        placeholder={labels.next}
        placeholderTextColor={shell.pageKicker}
      />
      <PasswordInput
        shell={shell}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder={labels.confirm}
        placeholderTextColor={shell.pageKicker}
      />
      <Pressable
        style={[styles.btnOutline, { borderColor: shell.tabIndicator }]}
        onPress={() => void handleChangePassword()}
        disabled={saving}
      >
        <Text style={[styles.btnOutlineText, { color: shell.tabIndicator }]}>
          {saving ? labels.saving : labels.action}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  btnOutline: { marginTop: 4, borderWidth: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnOutlineText: { fontWeight: '700' },
});
