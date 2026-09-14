import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, StyleSheet, Switch, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { AdminPageHeader, ADMIN_THEME } from '@/components/admin/AdminShell';
import { AdminActionIcon } from '@/components/admin/AdminActionIcon';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import {
  archivePartnerMilestoneRule,
  listAllPartnerMilestoneRewards,
  listPartnerMilestoneGrantsForRule,
  listPartnerMilestoneRules,
  MILESTONE_METRIC_LABELS,
  MILESTONE_PERIOD_OPTIONS,
  MILESTONE_REWARD_LABELS,
  MILESTONE_STATUS_LABELS,
  getMilestonePeriodLabel,
  togglePartnerMilestoneRuleActive,
  upsertPartnerMilestoneRule,
  type PartnerMilestoneMetric,
  type PartnerMilestoneReward,
  type PartnerMilestoneRewardType,
  type PartnerMilestoneRule,
} from '@/lib/partner-milestone-store';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminPartnerMilestones'>;

const METRICS: PartnerMilestoneMetric[] = ['unique_members', 'validations'];
const REWARDS: PartnerMilestoneRewardType[] = ['featured_week', 'push_once'];

function explainMechanism(): string {
  return [
    '1. Vous définissez un palier : compteur + seuil + période + récompense.',
    '2. À chaque validation membre chez le partenaire, le compteur est recalculé sur la période.',
    '3. Seuil atteint → notification partenaire + récompense « À configurer ».',
    '4. Le partenaire choisit son contenu puis active (à la une ou push).',
    '5. Chaque palier est octroyé une fois par période (ex. 20 validations en juillet, 50 en juillet = 2 récompenses distinctes).',
  ].join('\n');
}

export function AdminPartnerMilestonesScreen({ navigation }: Props) {
  const { role } = useAuthContext();
  const { countryCode } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('partner_milestones');

  const [rules, setRules] = useState<PartnerMilestoneRule[]>([]);
  const [grants, setGrants] = useState<PartnerMilestoneReward[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Partial<PartnerMilestoneRule> | null>(null);
  const [detailsRule, setDetailsRule] = useState<PartnerMilestoneRule | null>(null);
  const [detailsGrants, setDetailsGrants] = useState<PartnerMilestoneReward[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    const [r, g] = await Promise.all([
      listPartnerMilestoneRules(countryCode, { includeArchived: true }),
      listAllPartnerMilestoneRewards(),
    ]);
    setRules(r);
    setGrants(g);
  }, [countryCode]);

  const { run } = useFocusLoad(
    async () => {
      await load();
    },
    { ttlMs: 90_000, enabled: role === 'ADMIN', resetKey: countryCode },
  );

  async function saveRule() {
    if (!editing?.name?.trim() || !editing.metricType || !editing.rewardType || !editing.threshold) {
      Alert.alert('Champs requis', 'Nom, compteur, seuil, période et récompense obligatoires.');
      return;
    }
    await upsertPartnerMilestoneRule({
      ...(editing.id ? { id: editing.id } : {}),
      name: editing.name.trim(),
      description: editing.description?.trim() || null,
      metricType: editing.metricType,
      threshold: Number(editing.threshold),
      rewardType: editing.rewardType,
      durationDays: Number(editing.durationDays ?? 7),
      validityDays: Number(editing.validityDays ?? 90),
      pushTitle: editing.pushTitle?.trim() || null,
      pushMessage: editing.pushMessage?.trim() || null,
      countryCode,
      isActive: editing.isActive ?? true,
      archived: editing.archived ?? false,
      periodMonths: Number(editing.periodMonths ?? 1),
      sortOrder: Number(editing.sortOrder ?? rules.length + 1),
    });
    setEditing(null);
    await load();
  }

  async function openDetails(rule: PartnerMilestoneRule) {
    setDetailsRule(rule);
    setDetailsGrants(await listPartnerMilestoneGrantsForRule(rule.id));
  }

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  const inputStyle = [
    styles.input,
    { borderColor: shell.filterInactiveBorder, color: shell.pageTitle, backgroundColor: shell.filterInactiveBg },
  ];
  const visibleRules = showArchived ? rules : rules.filter((r) => !r.archived);
  const activeGrants = grants.filter((g) => g.status !== 'expired');

  return (
    <>
      <KeyboardAwareFormScroll
        style={{ flex: 1, backgroundColor: shell.pageBg }}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void run(true).finally(() => setRefreshing(false));
            }}
            tintColor={ADMIN_THEME.accent}
          />
        }
      >
        <AdminPageHeader
          title="Paliers partenaires"
          subtitle="Validations & membres → récompenses automatiques"
          shell={shell}
          onBack={() => navigation.goBack()}
        />
        <AdminCountryBar shell={shell} />

        <View style={[styles.helpBox, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
          <Text style={[styles.helpTitle, { color: shell.pageTitle }]}>Comment ça marche ?</Text>
          <Text style={[styles.helpBody, { color: shell.pageKicker }]}>{explainMechanism()}</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={[styles.meta, { color: shell.pageKicker }]}>
            {visibleRules.length} palier(s) · {activeGrants.length} octroi(s) enregistré(s)
          </Text>
          <View style={styles.switchRow}>
            <Text style={{ color: shell.pageKicker, fontSize: 11 }}>Archivés</Text>
            <Switch value={showArchived} onValueChange={setShowArchived} />
          </View>
        </View>

        {visibleRules.map((rule) => (
          <View
            key={rule.id}
            style={[
              styles.card,
              {
                borderColor: rule.archived ? '#64748b' : shell.filterInactiveBorder,
                backgroundColor: shell.filterInactiveBg,
                opacity: rule.isActive && !rule.archived ? 1 : 0.75,
              },
            ]}
          >
            <View style={styles.cardTop}>
              <Text style={{ color: shell.pageTitle, fontWeight: '800', flex: 1 }}>{rule.name}</Text>
              <Switch
                value={rule.isActive && !rule.archived}
                disabled={rule.archived}
                onValueChange={(v) => void togglePartnerMilestoneRuleActive(rule.id, v).then(load)}
              />
            </View>
            {rule.archived ? (
              <Text style={[styles.badge, { color: '#94a3b8' }]}>ARCHIVÉ — conservé pour l'historique</Text>
            ) : null}
            <Text style={{ color: shell.pageKicker, fontSize: 12, marginTop: 6 }}>
              Compteur : {MILESTONE_METRIC_LABELS[rule.metricType]}
            </Text>
            <Text style={{ color: shell.pageKicker, fontSize: 12, marginTop: 2 }}>
              Seuil : ≥ {rule.threshold} sur {getMilestonePeriodLabel(rule.periodMonths)}
            </Text>
            <Text style={{ color: ADMIN_THEME.accent, fontSize: 12, marginTop: 2, fontWeight: '700' }}>
              Récompense : {MILESTONE_REWARD_LABELS[rule.rewardType]}
            </Text>

            <View style={styles.row}>
              <Pressable onPress={() => void openDetails(rule)}>
                <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Détails</Text>
              </Pressable>
              <AdminActionIcon action="edit" color={ADMIN_THEME.accent} onPress={() => setEditing(rule)} />
              {!rule.archived ? (
                <AdminActionIcon
                  action="archive"
                  onPress={() => {
                    Alert.alert('Archiver', `Archiver « ${rule.name} » ? Aucune donnée ne sera supprimée.`, [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Archiver', onPress: () => void archivePartnerMilestoneRule(rule.id).then(load) },
                    ]);
                  }}
                />
              ) : null}
            </View>
          </View>
        ))}

        <Pressable
          style={[styles.addBtn, { borderColor: ADMIN_THEME.accent }]}
          onPress={() =>
            setEditing({
              name: '',
              metricType: 'validations',
              rewardType: 'featured_week',
              threshold: 20,
              durationDays: 7,
              validityDays: 90,
              periodMonths: 1,
              isActive: true,
              archived: false,
            })
          }
        >
          <Text style={{ color: ADMIN_THEME.accent, fontWeight: '800' }}>+ Nouveau palier</Text>
        </Pressable>

        {editing ? (
          <View style={[styles.form, { borderColor: shell.filterInactiveBorder }]}>
            <Text style={[styles.formTitle, { color: shell.pageTitle }]}>
              {editing.id ? 'Modifier' : 'Nouveau'} palier
            </Text>
            <TextInput
              style={inputStyle}
              placeholder="Nom (ex. 20 validations ce mois)"
              placeholderTextColor={shell.pageKicker}
              value={editing.name ?? ''}
              onChangeText={(v) => setEditing((p) => ({ ...p, name: v }))}
            />
            <TextInput
              style={inputStyle}
              placeholder="Description pour les partenaires"
              placeholderTextColor={shell.pageKicker}
              value={editing.description ?? ''}
              onChangeText={(v) => setEditing((p) => ({ ...p, description: v }))}
            />
            <TextInput
              style={inputStyle}
              placeholder="Seuil (nombre à atteindre)"
              placeholderTextColor={shell.pageKicker}
              keyboardType="number-pad"
              value={String(editing.threshold ?? '')}
              onChangeText={(v) => setEditing((p) => ({ ...p, threshold: Number(v) || 0 }))}
            />

            <Text style={[styles.lbl, { color: shell.pageKicker }]}>Compteur (ce qui est mesuré)</Text>
            <View style={styles.chips}>
              {METRICS.map((m) => (
                <Pressable
                  key={m}
                  style={[styles.chip, editing.metricType === m && { backgroundColor: ADMIN_THEME.accent }]}
                  onPress={() => setEditing((p) => ({ ...p, metricType: m }))}
                >
                  <Text style={{ color: editing.metricType === m ? '#fff' : shell.pageTitle, fontSize: 10, fontWeight: '700' }}>
                    {MILESTONE_METRIC_LABELS[m]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.lbl, { color: shell.pageKicker }]}>Période du palier</Text>
            <View style={styles.chips}>
              {MILESTONE_PERIOD_OPTIONS.map((p) => (
                <Pressable
                  key={p.value}
                  style={[styles.chip, editing.periodMonths === p.value && { backgroundColor: ADMIN_THEME.accent }]}
                  onPress={() => setEditing((prev) => ({ ...prev, periodMonths: p.value }))}
                >
                  <Text
                    style={{
                      color: editing.periodMonths === p.value ? '#fff' : shell.pageTitle,
                      fontSize: 10,
                      fontWeight: '700',
                    }}
                  >
                    {p.short}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.lbl, { color: shell.pageKicker }]}>Récompense offerte</Text>
            <View style={styles.chips}>
              {REWARDS.map((r) => (
                <Pressable
                  key={r}
                  style={[styles.chip, editing.rewardType === r && { backgroundColor: ADMIN_THEME.accent }]}
                  onPress={() => setEditing((p) => ({ ...p, rewardType: r }))}
                >
                  <Text style={{ color: editing.rewardType === r ? '#fff' : shell.pageTitle, fontSize: 10, fontWeight: '700' }}>
                    {MILESTONE_REWARD_LABELS[r]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {editing.rewardType === 'featured_week' ? (
              <TextInput
                style={inputStyle}
                placeholder="Durée à la une (jours)"
                placeholderTextColor={shell.pageKicker}
                keyboardType="number-pad"
                value={String(editing.durationDays ?? 7)}
                onChangeText={(v) => setEditing((p) => ({ ...p, durationDays: Number(v) || 7 }))}
              />
            ) : (
              <>
                <TextInput
                  style={inputStyle}
                  placeholder="Titre push"
                  placeholderTextColor={shell.pageKicker}
                  value={editing.pushTitle ?? ''}
                  onChangeText={(v) => setEditing((p) => ({ ...p, pushTitle: v }))}
                />
                <TextInput
                  style={[...inputStyle, styles.area]}
                  placeholder="Message push"
                  placeholderTextColor={shell.pageKicker}
                  multiline
                  value={editing.pushMessage ?? ''}
                  onChangeText={(v) => setEditing((p) => ({ ...p, pushMessage: v }))}
                />
              </>
            )}

            <TextInput
              style={inputStyle}
              placeholder="Délai pour activer (jours après obtention)"
              placeholderTextColor={shell.pageKicker}
              keyboardType="number-pad"
              value={String(editing.validityDays ?? 90)}
              onChangeText={(v) => setEditing((p) => ({ ...p, validityDays: Number(v) || 90 }))}
            />

            <View style={styles.switchRow}>
              <Text style={{ color: shell.pageTitle }}>Palier actif</Text>
              <Switch value={editing.isActive ?? true} onValueChange={(v) => setEditing((p) => ({ ...p, isActive: v }))} />
            </View>

            <Pressable style={[styles.saveBtn, { backgroundColor: ADMIN_THEME.accent }]} onPress={() => void saveRule()}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Enregistrer</Text>
            </Pressable>
            <Pressable onPress={() => setEditing(null)} style={styles.cancel}>
              <Text style={{ color: shell.pageKicker }}>Annuler</Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAwareFormScroll>

      <Modal visible={Boolean(detailsRule)} transparent animationType="fade" onRequestClose={() => setDetailsRule(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDetailsRule(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]} onPress={() => {}}>
            {detailsRule ? (
              <>
                <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>{detailsRule.name}</Text>
                <Text style={{ color: shell.pageKicker, fontSize: 13, marginTop: 8 }}>
                  {detailsRule.description ?? '—'}
                </Text>
                <Text style={[styles.modalLine, { color: shell.pageTitle }]}>
                  Compteur : {MILESTONE_METRIC_LABELS[detailsRule.metricType]}
                </Text>
                <Text style={[styles.modalLine, { color: shell.pageTitle }]}>
                  Seuil : {detailsRule.threshold} · Période : {getMilestonePeriodLabel(detailsRule.periodMonths)}
                </Text>
                <Text style={[styles.modalLine, { color: ADMIN_THEME.accent }]}>
                  Récompense : {MILESTONE_REWARD_LABELS[detailsRule.rewardType]}
                </Text>
                <Text style={[styles.lbl, { color: shell.pageKicker, marginTop: 16 }]}>Octrois ({detailsGrants.length})</Text>
                {detailsGrants.length === 0 ? (
                  <Text style={{ color: shell.pageKicker, fontStyle: 'italic', fontSize: 12 }}>
                    Aucun partenaire n'a encore atteint ce palier.
                  </Text>
                ) : (
                  detailsGrants.slice(0, 8).map((g) => (
                    <Text key={g.id} style={{ color: shell.pageKicker, fontSize: 11, marginTop: 4 }}>
                      {g.partnerName} · {g.metricValue} · {MILESTONE_STATUS_LABELS[g.status]} · {g.periodKey}
                    </Text>
                  ))
                )}
                <Pressable style={styles.modalClose} onPress={() => setDetailsRule(null)}>
                  <Text style={{ color: ADMIN_THEME.accent, fontWeight: '800' }}>Fermer</Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  helpBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  helpTitle: { fontWeight: '800', fontSize: 13, marginBottom: 6 },
  helpBody: { fontSize: 11, lineHeight: 17 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  meta: { fontSize: 12, flex: 1 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { fontSize: 9, fontWeight: '800', marginTop: 4, letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 10 },
  addBtn: { borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 },
  form: { marginTop: 16, borderWidth: 1, borderRadius: 14, padding: 14 },
  formTitle: { fontWeight: '800', marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8, fontSize: 14 },
  area: { minHeight: 72, textAlignVertical: 'top' },
  lbl: { fontSize: 10, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#64748b' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 },
  saveBtn: { paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  cancel: { alignItems: 'center', marginTop: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { borderWidth: 1, borderRadius: 16, padding: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalLine: { fontSize: 13, marginTop: 6 },
  modalClose: { marginTop: 20, alignItems: 'center' },
});
