import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { AdminPageHeader, ADMIN_THEME } from '@/components/admin/AdminShell';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { getLegalContent, updateLegalContent, type LegalContentKey } from '@/lib/legal-content-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminLegal'>;

const TABS: { id: LegalContentKey; label: string }[] = [
  { id: 'cgu', label: 'CGU membres' },
  { id: 'privacy_policy', label: 'Confidentialité' },
  { id: 'conditions_pass_prime', label: 'PASS Prime' },
  { id: 'partner_terms', label: 'Partenaires' },
  { id: 'politique_cookies', label: 'Cookies' },
  { id: 'mentions_legales', label: 'Mentions légales' },
];

export function AdminLegalScreen({ navigation }: Props) {
  const { role } = useAuthContext();
  const { shell } = useMemberTheme();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('legal');

  const [tab, setTab] = useState<LegalContentKey>('cgu');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    // Cache-first : force réseau uniquement si l’éditeur a besoin d’un pull explicite.
    const doc = await getLegalContent(tab);
    setTitle(doc.title);
    setBody(doc.body);
    setUpdatedAt(doc.updatedAt);
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    if (!body.trim()) {
      Alert.alert('Contenu requis', 'Le texte ne peut pas être vide.');
      return;
    }
    setSaving(true);
    try {
      const doc = await updateLegalContent(tab, { title, body });
      setUpdatedAt(doc.updatedAt);
      Alert.alert('Enregistré', 'Le contenu légal a été mis à jour.');
    } finally {
      setSaving(false);
    }
  }

  if (role !== 'ADMIN') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle }}>Accès réservé</Text>
      </View>
    );
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: shell.filterInactiveBorder,
    backgroundColor: shell.filterInactiveBg,
    color: shell.pageTitle,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    fontSize: 14,
  } as const;

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  return (
    <KeyboardAwareFormScroll style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
      <AdminPageHeader title="Contenus légaux" subtitle="CGU, confidentialité, partenaires & mentions" shell={shell} onBack={() => navigation.goBack()} />

      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.tab, tab === t.id && { backgroundColor: ADMIN_THEME.accent }]}
            onPress={() => setTab(t.id)}
          >
            <Text style={{ color: tab === t.id ? '#fff' : shell.pageTitle, fontWeight: '700', fontSize: 11 }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <TextInput style={inputStyle} value={title} onChangeText={setTitle} placeholder="Titre" placeholderTextColor={shell.pageKicker} />
      <TextInput
        style={[inputStyle, styles.multiline]}
        value={body}
        onChangeText={setBody}
        multiline
        placeholder="Contenu"
        placeholderTextColor={shell.pageKicker}
      />
      {updatedAt ? <Text style={[styles.meta, { color: shell.pageKicker }]}>Dernière mise à jour : {new Date(updatedAt).toLocaleString('fr-FR')}</Text> : null}

      <Pressable style={[styles.save, { backgroundColor: ADMIN_THEME.accent }]} onPress={() => void handleSave()} disabled={saving}>
        <Text style={styles.saveText}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
      </Pressable>
    </KeyboardAwareFormScroll>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  multiline: { minHeight: 220, textAlignVertical: 'top' },
  meta: { fontSize: 11, marginBottom: 12 },
  save: { marginTop: 8, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveText: { fontWeight: '800', color: '#000' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
