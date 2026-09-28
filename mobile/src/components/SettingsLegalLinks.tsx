import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LegalContentKey } from '@/lib/legal-content-store';
import type { ShellTheme } from '@/lib/member-grade-theme';

export const SETTINGS_LEGAL_LINKS: { key: LegalContentKey; label: string }[] = [
  { key: 'cgu', label: 'Conditions générales d’utilisation' },
  { key: 'privacy_policy', label: 'Politique de confidentialité' },
  { key: 'mentions_legales', label: 'Mentions légales' },
  { key: 'conditions_pass_prime', label: 'Conditions du PASS Loop Prime' },
];

type Props = {
  shell: ShellTheme;
  onOpen: (key: LegalContentKey) => void;
};

/** Liens légaux Paramètres / Profil (stores Apple & Google). */
export function SettingsLegalLinks({ shell, onOpen }: Props) {
  return (
    <View style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
      {SETTINGS_LEGAL_LINKS.map((link, index) => (
        <Pressable
          key={link.key}
          style={[
            styles.row,
            index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: shell.filterInactiveBorder } : null,
          ]}
          onPress={() => onOpen(link.key)}
          accessibilityRole="button"
        >
          <Text style={[styles.label, { color: shell.pageTitle }]}>{link.label}</Text>
          <Text style={[styles.chevron, { color: shell.pageKicker }]}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 0,
    marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14 },
  label: { flex: 1, fontSize: 14, fontWeight: '600' },
  chevron: { fontSize: 20, fontWeight: '600' },
});
