import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthContext } from '@/context/AuthContext';
import { useContent } from '@/context/ContentContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { usePartnerContentScopes } from '@/hooks/usePartnerContentScopes';
import { AdminPageHeader } from '@/components/admin/AdminShell';
import { PartnerRewardSelectModal, type PartnerContentPick } from '@/components/PartnerRewardSelectModal';
import { getOrCreatePartnerValidationCode } from '@/lib/partner-validation-code-store';
import { listPartnerEvents, listPartnerSpots } from '@/lib/partner-staging-store';
import { partnerApprovedContentPicks } from '@/lib/partner-published-content';
import { invalidateContentCache } from '@/lib/content-store';
import {
  activatePartnerReward,
  filterVisiblePartnerPaliers,
  getPartnerMilestoneProgress,
  getMilestonePeriodLabel,
  MILESTONE_METRIC_LABELS,
  MILESTONE_REWARD_LABELS,
  MILESTONE_STATUS_LABELS,
  selectPartnerRewardContent,
  type PartnerMilestoneReward,
  type PartnerRuleProgress,
} from '@/lib/partner-milestone-store';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerRewards'>;

const PRO_ACCENT = '#20C997';

export function PartnerRewardsScreen({ navigation }: Props) {
  const { role, user } = useAuthContext();
  const { shell } = useMemberTheme();
  const { refresh } = useContent();
  const { canManageEvents, canManageSpots, canManageTools } = usePartnerContentScopes();
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState({ uniqueMembers: 0, validations: 0 });
  const [monthMetrics, setMonthMetrics] = useState({ uniqueMembers: 0, validations: 0 });
  const [rewards, setRewards] = useState<PartnerMilestoneReward[]>([]);
  const [rules, setRules] = useState<PartnerRuleProgress[]>([]);
  const [selectReward, setSelectReward] = useState<PartnerMilestoneReward | null>(null);
  const [contentPicks, setContentPicks] = useState<PartnerContentPick[]>([]);
  const [thanks, setThanks] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const label = user.company ?? user.fullName ?? 'Partenaire';
    const codeEntry = await getOrCreatePartnerValidationCode(user.id, label);
    const progress = await getPartnerMilestoneProgress(
      user.id,
      codeEntry.partnerId,
      label,
      user.countryCode ?? undefined,
    );
    setMetrics(progress.metrics);
    setMonthMetrics(progress.monthMetrics);
    setRules(progress.rules);
    setRewards(progress.rewards);

    const partnerLabel = user.company ?? user.fullName ?? 'Partenaire';
    const [ev, sp] = await Promise.all([
      listPartnerEvents(user.id, partnerLabel),
      listPartnerSpots(user.id, partnerLabel),
    ]);
    setContentPicks(
      partnerApprovedContentPicks(ev, sp, {
        events: canManageEvents,
        spots: canManageSpots,
        tools: canManageTools,
      }),
    );
  }, [user?.id, user?.company, user?.fullName, user?.countryCode, canManageEvents, canManageSpots, canManageTools]);

  const { run } = useFocusLoad(
    async () => {
      await load();
    },
    { ttlMs: 90_000, enabled: Boolean(user?.id) },
  );

  async function handlePick(item: PartnerContentPick) {
    if (!user || !selectReward) return;
    const updated = await selectPartnerRewardContent(selectReward.id, user.id, {
      kind: item.kind,
      id: item.id,
      title: item.title,
    });
    setSelectReward(null);
    if (!updated) return;
    setThanks(
      `Merci ! « ${item.title} » est enregistré. Activez votre récompense quand vous le souhaitez depuis cette page.`,
    );
    await load();
  }

  async function handleActivate(reward: PartnerMilestoneReward) {
    if (!user) return;
    if (reward.status === 'earned') {
      setSelectReward(reward);
      return;
    }
    if (reward.status !== 'configured') return;

    Alert.alert(
      'Activer la récompense',
      reward.rewardType === 'featured_week'
        ? `Mettre « ${reward.contentTitle} » à la une pendant ${reward.durationDays} jours ? Le décompte commence maintenant.`
        : `Envoyer le push pour « ${reward.contentTitle} » ? Cette action est définitive.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Activer',
          onPress: () => {
            void activatePartnerReward(reward.id, user.id).then((res) => {
              if (!res.ok) {
                Alert.alert('Erreur', res.error ?? 'Activation impossible');
                return;
              }
              invalidateContentCache();
              void Promise.all([refresh(), load()]);
            });
          },
        },
      ],
    );
  }

  if (role !== 'PARTNER') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle }}>Accès réservé aux partenaires.</Text>
      </View>
    );
  }

  const visibleRules = filterVisiblePartnerPaliers(rules);

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: shell.pageBg }}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void run(true).finally(() => setRefreshing(false)); }} tintColor={PRO_ACCENT} />
        }
      >
        <AdminPageHeader
          title="Récompenses THE LOOP"
          subtitle="Validations & paliers"
          shell={shell}
          embedded={false}
          onBack={() => navigation.goBack()}
        />

        <View style={[styles.kpiRow, { borderColor: shell.filterInactiveBorder }]}>
          <View style={styles.kpi}>
            <Text style={[styles.kpiVal, { color: shell.pageTitle }]}>{monthMetrics.uniqueMembers}</Text>
            <Text style={[styles.kpiLbl, { color: shell.pageKicker }]}>Membres ce mois</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={[styles.kpiVal, { color: shell.pageTitle }]}>{monthMetrics.validations}</Text>
            <Text style={[styles.kpiLbl, { color: shell.pageKicker }]}>Validations ce mois</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={[styles.kpiVal, { color: shell.pageTitle }]}>{metrics.uniqueMembers}</Text>
            <Text style={[styles.kpiLbl, { color: shell.pageKicker }]}>Membres total</Text>
          </View>
        </View>

        <View style={[styles.howBox, { borderColor: shell.filterInactiveBorder }]}>
          <Text style={[styles.howTitle, { color: shell.pageTitle }]}>Comment obtenir une récompense ?</Text>
          <Text style={[styles.howBody, { color: shell.pageKicker }]}>
            Validez les avantages des membres avec votre code. Quand un palier est atteint sur la période définie, vous recevez une notification. Choisissez votre contenu puis activez (à la une ou push).
          </Text>
        </View>

        <Text style={[styles.section, { color: shell.pageKicker }]}>Progression des paliers</Text>
        {visibleRules.length === 0 ? (
          <Text style={[styles.empty, { color: shell.pageKicker }]}>
            {rules.length === 0
              ? 'Aucun palier actif pour votre pays.'
              : 'Les paliers apparaissent dès la première validation, puis au seuil atteint (ex. 50).'}
          </Text>
        ) : (
          visibleRules.map(({ rule, current, periodLabel }) => {
            const pct = Math.min(100, Math.round((current / rule.threshold) * 100));
            return (
              <View key={rule.id} style={[styles.ruleCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
                <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>{rule.name}</Text>
                <Text style={{ color: shell.pageKicker, fontSize: 11, marginTop: 4 }}>
                  {MILESTONE_METRIC_LABELS[rule.metricType]} · {getMilestonePeriodLabel(rule.periodMonths)} · {MILESTONE_REWARD_LABELS[rule.rewardType]}
                </Text>
                <Text style={{ color: shell.pageKicker, fontSize: 11, marginTop: 2 }}>
                  {current} / {rule.threshold} ({periodLabel})
                </Text>
                <View style={[styles.track, { backgroundColor: shell.pageBg }]}>
                  <View style={[styles.fill, { width: `${pct}%`, backgroundColor: PRO_ACCENT }]} />
                </View>
              </View>
            );
          })
        )}

        <Text style={[styles.section, { color: shell.pageKicker }]}>Mes récompenses</Text>
        {thanks ? <Text style={[styles.thanks, { color: PRO_ACCENT }]}>{thanks}</Text> : null}

        {rewards.length === 0 ? (
          <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucune récompense pour l'instant. Continuez les validations !</Text>
        ) : (
          rewards.map((r) => (
            <View key={r.id} style={[styles.rewardCard, { borderColor: shell.filterInactiveBorder }]}>
              <Text style={{ color: PRO_ACCENT, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>
                {MILESTONE_REWARD_LABELS[r.rewardType].toUpperCase()}
              </Text>
              <Text style={{ color: shell.pageTitle, fontWeight: '800', marginTop: 6 }}>{r.ruleName}</Text>
              <Text style={{ color: shell.pageKicker, fontSize: 12, marginTop: 4 }}>
                {MILESTONE_STATUS_LABELS[r.status]}
                {r.contentTitle ? ` · ${r.contentTitle}` : ''}
                {r.periodKey !== 'all' ? ` · ${r.periodKey}` : ''}
              </Text>
              {(r.status === 'earned' || r.status === 'configured') ? (
                <Pressable style={[styles.btn, { backgroundColor: PRO_ACCENT }]} onPress={() => void handleActivate(r)}>
                  <Text style={styles.btnText}>
                    {r.status === 'earned' ? 'Choisir mon contenu' : 'Activer maintenant'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>

      <PartnerRewardSelectModal
        visible={Boolean(selectReward)}
        rewardLabel={selectReward ? MILESTONE_REWARD_LABELS[selectReward.rewardType] : ''}
        items={contentPicks}
        onClose={() => setSelectReward(null)}
        onPick={(item) => void handlePick(item)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  kpiRow: { flexDirection: 'row', gap: 6, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8 },
  kpi: { flex: 1, alignItems: 'center' },
  kpiVal: { fontSize: 20, fontWeight: '900' },
  kpiLbl: { fontSize: 9, marginTop: 4, textAlign: 'center' },
  howBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 4 },
  howTitle: { fontWeight: '800', fontSize: 12 },
  howBody: { fontSize: 11, lineHeight: 16, marginTop: 6 },
  section: { marginTop: 20, marginBottom: 8, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  ruleCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  track: { height: 6, borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  rewardCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  btn: { marginTop: 12, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  empty: { fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginTop: 8 },
  thanks: { fontSize: 12, lineHeight: 18, marginBottom: 12, textAlign: 'center' },
});
