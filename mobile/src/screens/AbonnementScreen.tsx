import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { formatDateFr } from '@/lib/date-utils';
import { getProfileAccent } from '@/lib/profile-accent';
import {
  formatPassAmount,
  getActiveSubscription,
  getPastSubscriptions,
  getPendingSubscriptions,
  getPurchasedPassHistory,
  getUserFacingPrimePass,
  isAdminGrantedPass,
  isFreePass,
  isHeritagePass,
  passDisplayLabel,
  PASS_PAYMENT_LABELS,
  type SubscriptionRecord,
} from '@/lib/subscription-history';
import { hydrateAndSyncPassGrantsFromSupabase } from '@/lib/pass-admin-store';
import { isPassPurchaseUiEnabled } from '@/lib/pass-purchase-ui';
import { useAppGates } from '@/context/AppGatesContext';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Abonnement'>;

const STATUS_LABELS: Record<string, string> = {
  active: 'En cours',
  expired: 'Expiré',
  pending: 'En attente',
  suspended: 'Suspendu',
  none: 'Aucun',
};

function PassRow({
  record,
  shell,
  accent,
}: {
  record: SubscriptionRecord;
  shell: { pageTitle: string; pageKicker: string; filterInactiveBorder: string };
  accent?: string;
}) {
  return (
    <View style={[styles.row, { borderColor: shell.filterInactiveBorder }]}>
      <Text style={[styles.rowLabel, { color: shell.pageTitle }]}>{passDisplayLabel(record)}</Text>
      <Text style={[styles.rowMeta, { color: shell.pageKicker }]}>
        {STATUS_LABELS[record.status] ?? record.status}
        {isHeritagePass(record) ? ' · Offert' : ''}
        {!isHeritagePass(record) && record.amountGnf != null ? ` · ${formatPassAmount(record.amountGnf)}` : ''}
        {record.paymentMethod ? ` · ${PASS_PAYMENT_LABELS[record.paymentMethod]}` : ''}
      </Text>
      {record.status === 'active' ? (
        <Text style={[styles.rowMeta, { color: shell.pageKicker }]}>
          Depuis le {formatDateFr(record.startedAt)}
          {isHeritagePass(record)
            ? ' · Sans expiration'
            : record.expiresAt
              ? ` · Échéance ${formatDateFr(record.expiresAt)}`
              : ' · PASS à vie'}
        </Text>
      ) : null}
      {isHeritagePass(record) && record.grantNote ? (
        <Text style={[styles.rowMeta, { color: shell.pageKicker, fontStyle: 'italic' }]}>
          {record.grantNote}
        </Text>
      ) : null}
      {record.status === 'pending' ? (
        <Text style={[styles.rowHighlight, { color: accent ?? shell.pageKicker }]}>
          S'activera à l'usage dès que le PASS en cours expire ou est retiré
          {record.scheduledStartAt ? ` (estimé ${formatDateFr(record.scheduledStartAt)})` : ''}
        </Text>
      ) : null}
      {record.status === 'suspended' && record.expiresAt ? (
        <Text style={[styles.rowMeta, { color: shell.pageKicker }]}>
          Gelé · échéance conservée {formatDateFr(record.expiresAt)}
        </Text>
      ) : null}
      {record.status === 'expired' ? (
        <Text style={[styles.rowMeta, { color: shell.pageKicker }]}>
          {formatDateFr(record.startedAt)}
          {record.expiresAt ? ` → ${formatDateFr(record.expiresAt)}` : ''}
        </Text>
      ) : null}
    </View>
  );
}

export function AbonnementScreen({ navigation }: Props) {
  const { user, role } = useAuthContext();
  const { gates } = useAppGates();
  const passPurchaseEnabled = isPassPurchaseUiEnabled(gates);
  const { shell, grade, theme } = useMemberTheme();
  const [history, setHistory] = useState<SubscriptionRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const planType = role === 'PARTNER' ? 'partner' : 'prime';
  const accent = getProfileAccent(role, shell, grade, theme);
  const cardAccent = planType === 'partner' ? theme.colors.accent : accent.accent;

  const load = useCallback(async () => {
    if (!user?.id) return;
    const synced = await hydrateAndSyncPassGrantsFromSupabase(user.id);
    setHistory(synced);
  }, [user?.id]);

  const { run } = useFocusLoad(load, {
    ttlMs: 90_000,
    enabled: Boolean(user?.id),
    resetKey: user?.id ?? null,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await run(true);
    setRefreshing(false);
  }, [run]);

  const heritageInHistory = history.find((r) => r.type === planType && isHeritagePass(r) && r.status === 'active');
  const facing = planType === 'prime' ? getUserFacingPrimePass(history) : getActiveSubscription(history, planType);
  const active =
    facing ??
    heritageInHistory ??
    (user?.subscriptionStatus === 'active' && planType === 'prime' && user.userRole === 'prime'
      ? {
          id: 'current',
          type: planType,
          status: 'active' as const,
          startedAt: user.createdAt,
          expiresAt: user.subscriptionExpiresAt ?? null,
          label: user.subscriptionExpiresAt ? 'PASS Prime' : 'PASS',
          passKind: 'standard' as const,
        }
      : planType === 'partner' && user?.subscriptionStatus === 'active'
        ? {
            id: 'current',
            type: 'partner' as const,
            status: 'active' as const,
            startedAt: user.createdAt,
            expiresAt: user.subscriptionExpiresAt ?? null,
            label: 'Partenariat THE LOOP',
          }
        : undefined);

  const pending = getPendingSubscriptions(history, planType);
  const past = getPastSubscriptions(history, planType, active, pending);
  const purchasedHistory = getPurchasedPassHistory(history, planType).filter(
    (r) => r.status !== 'pending' && r.id !== active?.id,
  );
  const historyRows = purchasedHistory.length > 0 ? purchasedHistory : past;
  const adminGrantedActive = Boolean(active && isAdminGrantedPass(active));
  const freePassActive = Boolean(active && isFreePass(active));
  const showBuyOrRenew = passPurchaseEnabled && planType === 'prime' && !freePassActive;

  function activePassTypeLabel(): string {
    if (!active) return '';
    return passDisplayLabel(active);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={shell.tabIndicator} />}
    >
      <Text style={[styles.kicker, { color: shell.pageKicker }]}>
        {planType === 'partner' ? 'Partenariat' : 'Loop Prime'}
      </Text>
      <Text style={[styles.title, { color: shell.pageTitle }]}>
        {planType === 'partner' ? 'Mon partenariat' : 'Mon PASS'}
      </Text>
      <Text style={[styles.meta, { color: shell.pageKicker }]}>{user?.fullName ?? user?.email}</Text>

      <View style={[styles.card, { borderColor: cardAccent, backgroundColor: shell.filterInactiveBg }]}>
        <Text style={[styles.cardKicker, { color: shell.pageKicker }]}>
          {planType === 'partner' ? 'Partenariat en cours' : 'PASS en cours'}
        </Text>
        {active ? (
          <>
            <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>
              {passDisplayLabel(active)}
            </Text>
            <Text style={[styles.cardMeta, { color: accent.accent, fontWeight: '700' }]}>
              Pass en cours : {activePassTypeLabel()}
              {freePassActive ? ' · Gratuit' : ''}
            </Text>
            <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
              Statut : {STATUS_LABELS.active}
              {adminGrantedActive ? ' · Offert' : ''}
            </Text>
            <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
              Depuis le {formatDateFr(active.startedAt)}
            </Text>
            <Text style={[styles.cardExpiry, { color: planType === 'partner' ? '#34d399' : accent.accent }]}>
              {freePassActive || adminGrantedActive
                ? 'Sans expiration — jusqu’à annulation éventuelle'
                : active.expiresAt
                  ? `Échéance : ${formatDateFr(active.expiresAt)}`
                  : planType === 'partner'
                    ? 'Partenariat actif'
                    : 'PASS à vie'}
            </Text>
            {adminGrantedActive && active.grantNote ? (
              <Text style={[styles.cardMeta, { color: shell.pageKicker, fontStyle: 'italic' }]}>
                {active.grantNote}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
            {planType === 'partner' ? 'Aucun partenariat actif.' : 'Aucun PASS actif.'}
          </Text>
        )}
      </View>

      {pending.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: shell.pageKicker }]}>En attente ({pending.length})</Text>
          <Text style={[styles.sectionHint, { color: shell.pageKicker }]}>
            Ces PASS prendront le relais automatiquement à l'expiration du PASS en cours.
          </Text>
          {pending.map((record) => (
            <PassRow key={record.id} record={record} shell={shell} accent={accent.accent} />
          ))}
        </View>
      ) : null}

      {historyRows.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: shell.pageKicker }]}>Historique des PASS achetés</Text>
          <Text style={[styles.sectionHint, { color: shell.pageKicker }]}>
            PASS terminés ou remplacés — montant et dates de validité.
          </Text>
          {historyRows.map((record) => (
            <PassRow key={record.id} record={record} shell={shell} />
          ))}
        </View>
      ) : null}

      {showBuyOrRenew ? (
        <Pressable style={[styles.btnGold, { backgroundColor: accent.accent }]} onPress={() => navigation.navigate('Prime')}>
          <Text style={styles.btnGoldText}>
            {active ? 'Acheter un autre PASS' : 'Devenir Loop Prime'}
          </Text>
        </Pressable>
      ) : null}

      {freePassActive ? (
        <Text style={[styles.heritageNote, { color: shell.pageKicker }]}>
          Votre PASS gratuit est actif — aucun achat ni renouvellement n'est nécessaire.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  title: { marginTop: 4, fontSize: 22, fontWeight: '700' },
  meta: { marginTop: 4, fontSize: 14 },
  card: { marginTop: 20, borderWidth: 1, borderRadius: 16, padding: 16 },
  cardKicker: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  cardTitle: { marginTop: 8, fontSize: 18, fontWeight: '700' },
  cardMeta: { marginTop: 6, fontSize: 13 },
  cardExpiry: { marginTop: 10, fontSize: 14, fontWeight: '700' },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 },
  sectionHint: { fontSize: 12, marginBottom: 8, fontStyle: 'italic' },
  row: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  rowLabel: { fontWeight: '700', fontSize: 14 },
  rowMeta: { marginTop: 4, fontSize: 12 },
  rowHighlight: { marginTop: 6, fontSize: 12, fontWeight: '700' },
  btnGold: { marginTop: 24, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnGoldText: { fontWeight: '700', color: '#000' },
  heritageNote: { marginTop: 20, fontSize: 13, textAlign: 'center', lineHeight: 18, fontStyle: 'italic' },
});
