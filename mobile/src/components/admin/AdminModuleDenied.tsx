import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ADMIN_THEME } from '@/components/admin/AdminShell';
import type { ShellTheme } from '@/lib/member-grade-theme';

interface Props {
  shell: ShellTheme;
  moduleLabel?: string;
  onBack?: () => void;
}

/** Écran refus — module admin non autorisé pour cet utilisateur. */
export function AdminModuleDenied({ shell, moduleLabel, onBack }: Props) {
  return (
    <View style={[styles.wrap, { backgroundColor: shell.pageBg }]}>
      <Text style={[styles.title, { color: shell.pageTitle }]}>Module non autorisé</Text>
      <Text style={[styles.body, { color: shell.pageKicker }]}>
        {moduleLabel
          ? `Vous n'avez pas accès au module « ${moduleLabel} ». Contactez le super admin.`
          : 'Vous n\'avez pas accès à ce module admin. Contactez le super admin.'}
      </Text>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700' }}>← Retour</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  backBtn: { marginTop: 20 },
});
