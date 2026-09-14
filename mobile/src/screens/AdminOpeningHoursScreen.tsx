import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AdminPageHeader, ADMIN_THEME } from '@/components/admin/AdminShell';
import { OpeningHoursPresetBuilder } from '@/components/OpeningHoursPresetBuilder';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import {
  createEmptyPreset,
  defaultOpeningHoursSettings,
  getOpeningHoursSettings,
  invalidateOpeningHoursSettingsCache,
  saveOpeningHoursSettings,
  type OpeningHoursSettings,
} from '@/lib/opening-hours-settings-store';
import type { HoursMode } from '@/lib/opening-hours';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminOpeningHours'>;

const MODE_ORDER: HoursMode[] = ['always_open', 'by_appointment', 'weekly'];

export function AdminOpeningHoursScreen({ navigation }: Props) {
  const { role } = useAuthContext();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('opening_hours');
  const { shell } = useMemberTheme();
  const [settings, setSettings] = useState<OpeningHoursSettings>(defaultOpeningHoursSettings());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setSettings(await getOpeningHoursSettings());
  }, []);

  useEffect(() => {
    if (role === 'ADMIN' && allowed) void load();
  }, [role, allowed, load]);

  const inputStyle = [
    styles.input,
    { backgroundColor: shell.filterInactiveBg, borderColor: shell.filterInactiveBorder, color: shell.pageTitle },
  ];

  function updateMode(mode: HoursMode, patch: Partial<OpeningHoursSettings['modes'][HoursMode]>) {
    setSettings((prev) => ({
      ...prev,
      modes: { ...prev.modes, [mode]: { ...prev.modes[mode], ...patch } },
    }));
  }

  function updatePreset(id: string, patch: Partial<OpeningHoursSettings['presets'][number]>) {
    setSettings((prev) => ({
      ...prev,
      presets: prev.presets.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }

  function addPreset() {
    setSettings((prev) => ({
      ...prev,
      presets: [...prev.presets, createEmptyPreset(prev)],
    }));
  }

  function removePreset(id: string) {
    setSettings((prev) => ({
      ...prev,
      presets: prev.presets.filter((p) => p.id !== id),
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      invalidateOpeningHoursSettingsCache();
      await saveOpeningHoursSettings(settings);
      Alert.alert(
        'Enregistré',
        'Les modes et raccourcis horaires sont disponibles dans le formulaire spot (partenaire et admin).',
      );
    } catch {
      Alert.alert('Erreur', 'Impossible d\'enregistrer. Vérifiez la connexion Supabase.');
    } finally {
      setSaving(false);
    }
  }

  if (role !== 'ADMIN' || (!allowed && !isLoading)) {
    return (
      <AdminModuleDenied
        shell={shell}
        moduleLabel={permissionLabel}
        onBack={() => navigation.goBack()}
      />
    );
  }

  if (role !== 'ADMIN' || !allowed) {
    return <View style={{ flex: 1, backgroundColor: shell.pageBg }} />;
  }

  return (
    <KeyboardAwareFormScroll style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
      <AdminPageHeader
        title="Horaires spots"
        subtitle="Créez les modes et raccourcis affichés dans le champ Horaires du formulaire spot"
        shell={shell}
        onBack={() => navigation.goBack()}
      />

      <Text style={[styles.section, { color: shell.pageKicker }]}>Modes d'ouverture</Text>
      <Text style={[styles.help, { color: shell.pageKicker }]}>
        Ces boutons apparaissent en haut du champ Horaires (ex. Toujours ouvert, Sur RDV, Plages horaires).
      </Text>
      {MODE_ORDER.map((mode) => (
        <View key={mode} style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
          <View style={styles.row}>
            <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>{mode}</Text>
            <Switch
              value={settings.modes[mode].enabled}
              onValueChange={(enabled) => updateMode(mode, { enabled })}
              trackColor={{ false: shell.filterInactiveBorder, true: '#10b981' }}
              thumbColor="#fff"
            />
          </View>
          <Text style={[styles.label, { color: shell.pageKicker }]}>Texte enregistré / affiché</Text>
          <TextInput
            style={inputStyle}
            value={settings.modes[mode].label}
            onChangeText={(label) => updateMode(mode, { label })}
            placeholderTextColor={shell.pageKicker}
          />
        </View>
      ))}

      <Text style={[styles.section, { color: shell.pageKicker }]}>Raccourcis horaires</Text>
      <Text style={[styles.help, { color: shell.pageKicker }]}>
        Chaque raccourci devient un bouton dans le formulaire spot. Le partenaire clique dessus pour appliquer jours et heures.
      </Text>

      {settings.presets.map((preset) => (
        <OpeningHoursPresetBuilder
          key={preset.id}
          preset={preset}
          settings={settings}
          shell={shell}
          canDelete={settings.presets.length > 1}
          onChange={(patch) => updatePreset(preset.id, patch)}
          onDelete={() => removePreset(preset.id)}
        />
      ))}

      <Pressable
        style={[styles.addBtn, { borderColor: shell.filterInactiveBorder }]}
        onPress={addPreset}
      >
        <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700' }}>+ Ajouter un raccourci</Text>
      </Pressable>

      <Text style={[styles.section, { color: shell.pageKicker }]}>Heures par défaut</Text>
      <Text style={[styles.help, { color: shell.pageKicker }]}>
        Utilisées pour les nouveaux raccourcis et l'édition manuelle dans le formulaire.
      </Text>
      <View style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
        <Text style={[styles.label, { color: shell.pageKicker }]}>Ouverture</Text>
        <TextInput style={inputStyle} value={settings.defaultOpenTime} onChangeText={(v) => setSettings((p) => ({ ...p, defaultOpenTime: v }))} placeholder="12:00" placeholderTextColor={shell.pageKicker} />
        <Text style={[styles.label, { color: shell.pageKicker }]}>Fermeture</Text>
        <TextInput style={inputStyle} value={settings.defaultCloseTime} onChangeText={(v) => setSettings((p) => ({ ...p, defaultCloseTime: v }))} placeholder="23:00" placeholderTextColor={shell.pageKicker} />
        <Text style={[styles.label, { color: shell.pageKicker }]}>Ouverture dimanche (legacy)</Text>
        <TextInput style={inputStyle} value={settings.defaultSunOpenTime} onChangeText={(v) => setSettings((p) => ({ ...p, defaultSunOpenTime: v }))} placeholder="12:00" placeholderTextColor={shell.pageKicker} />
        <Text style={[styles.label, { color: shell.pageKicker }]}>Fermeture dimanche (legacy)</Text>
        <TextInput style={inputStyle} value={settings.defaultSunCloseTime} onChangeText={(v) => setSettings((p) => ({ ...p, defaultSunCloseTime: v }))} placeholder="20:00" placeholderTextColor={shell.pageKicker} />
      </View>

      <Pressable style={[styles.save, { backgroundColor: shell.tabIndicator }]} onPress={() => void handleSave()} disabled={saving}>
        <Text style={styles.saveText}>{saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}</Text>
      </Pressable>
    </KeyboardAwareFormScroll>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  section: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 16, marginBottom: 4 },
  help: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontWeight: '700', fontSize: 13, flex: 1 },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8, fontSize: 14 },
  addBtn: { borderWidth: 1, borderRadius: 12, borderStyle: 'dashed', paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  save: { marginTop: 16, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700' },
});
