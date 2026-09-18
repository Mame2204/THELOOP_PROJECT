import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { AdminPageHeader, ADMIN_THEME } from '@/components/admin/AdminShell';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import {
  loadReferralSettings,
  saveReferralSettings,
  type ReferralSettings,
} from '@/lib/referral-config-store';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminReferralSettings'>;

function parsePositiveInt(value: string): number | null {
  const n = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function AdminReferralSettingsScreen({ navigation }: Props) {
  const { role } = useAuthContext();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('referral_settings');
  const { shell } = useMemberTheme();

  const [referralsPerReward, setReferralsPerReward] = useState('10');
  const [rewardMonths, setRewardMonths] = useState('1');
  const [maxRewardMonthsPerYear, setMaxRewardMonthsPerYear] = useState('5');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const settings = await loadReferralSettings();
    setReferralsPerReward(String(settings.referralsPerReward));
    setRewardMonths(String(settings.rewardMonths));
    setMaxRewardMonthsPerYear(String(settings.maxRewardMonthsPerYear));
  }, []);

  useEffect(() => {
    if (role === 'ADMIN' && allowed) void load();
  }, [role, allowed, load]);

  async function handleSave() {
    const perReward = parsePositiveInt(referralsPerReward);
    const months = parsePositiveInt(rewardMonths);
    const maxYear = parsePositiveInt(maxRewardMonthsPerYear);

    if (perReward == null || months == null || maxYear == null) {
      Alert.alert('Valeurs invalides', 'Saisissez des nombres entiers strictement positifs.');
      return;
    }

    setSaving(true);
    try {
      const next: ReferralSettings = {
        referralsPerReward: perReward,
        rewardMonths: months,
        maxRewardMonthsPerYear: maxYear,
        updatedAt: new Date().toISOString(),
      };
      const result = await saveReferralSettings(next);
      if (!result.ok) {
        Alert.alert(
          'Erreur',
          result.error?.includes('admin_update_referral_settings')
            ? 'Migration Supabase manquante : appliquez 20260923_admin_update_referral_settings.sql'
            : result.error ?? 'Enregistrement impossible.',
        );
        return;
      }
      await load();
      Alert.alert(
        'Enregistré',
        `Récompense : ${perReward} filleul${perReward > 1 ? 's' : ''} → ${months} mois Prime · plafond ${maxYear} mois/an.`,
      );
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

  const perRewardPreview = parsePositiveInt(referralsPerReward) ?? 10;
  const monthsPreview = parsePositiveInt(rewardMonths) ?? 1;
  const maxYearPreview = parsePositiveInt(maxRewardMonthsPerYear) ?? 5;

  const inputStyle = [
    styles.input,
    {
      backgroundColor: shell.filterInactiveBg,
      borderColor: shell.filterInactiveBorder,
      color: shell.pageTitle,
    },
  ];

  return (
    <KeyboardAwareFormScroll style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
      <AdminPageHeader
        title="Parrainage"
        subtitle="Récompenses membres — filleuls et mois Prime offerts"
        shell={shell}
        onBack={() => navigation.goBack()}
      />

      <View style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
        <Text style={[styles.preview, { color: shell.pageTitle }]}>
          Tous les {perRewardPreview} comptes créés avec le code parrain → {monthsPreview} mois Prime gratuit
          {' · '}maximum {maxYearPreview} mois offerts par an.
        </Text>
        <Text style={[styles.hint, { color: shell.pageKicker }]}>
          Texte affiché sur l’écran Parrainage membre. Prise en compte immédiate sans rebuild app.
        </Text>
      </View>

      <Text style={[styles.label, { color: shell.pageKicker }]}>Filleuls pour 1 récompense *</Text>
      <TextInput
        style={inputStyle}
        value={referralsPerReward}
        onChangeText={setReferralsPerReward}
        keyboardType="number-pad"
        placeholder="10"
        placeholderTextColor={shell.pageKicker}
      />

      <Text style={[styles.label, { color: shell.pageKicker }]}>Mois Prime offerts *</Text>
      <TextInput
        style={inputStyle}
        value={rewardMonths}
        onChangeText={setRewardMonths}
        keyboardType="number-pad"
        placeholder="1"
        placeholderTextColor={shell.pageKicker}
      />

      <Text style={[styles.label, { color: shell.pageKicker }]}>Plafond mois offerts / an *</Text>
      <TextInput
        style={inputStyle}
        value={maxRewardMonthsPerYear}
        onChangeText={setMaxRewardMonthsPerYear}
        keyboardType="number-pad"
        placeholder="5"
        placeholderTextColor={shell.pageKicker}
      />

      <Pressable
        style={[styles.saveBtn, { backgroundColor: ADMIN_THEME.accent, opacity: saving ? 0.6 : 1 }]}
        disabled={saving}
        onPress={() => void handleSave()}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
      </Pressable>
    </KeyboardAwareFormScroll>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 18, gap: 8 },
  preview: { fontSize: 14, lineHeight: 21, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  saveBtn: { marginTop: 8, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
