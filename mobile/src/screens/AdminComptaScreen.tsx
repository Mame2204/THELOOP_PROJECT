import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { AdminPageHeader, ADMIN_THEME, adminCardStyle } from '@/components/admin/AdminShell';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useAdminCountry } from '@/context/AdminCountryContext';
import {
  createAccountingSettlement,
  fetchAccountingBalance,
  fetchAccountingPeriod,
  fetchAccountingSettlements,
  type AccountingBalance,
  type AccountingPeriodSummary,
  type AccountingSettlement,
} from '@/lib/admin-payments-store';
import { DJOMY_COMMERCIAL_NOTES, DJOMY_PAY_IN_FEES, formatGnf } from '@/lib/djomy-fees';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminCompta'>;

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  orange_money: 'Orange Money',
  mtn_momo: 'MTN MoMo',
  paycard: 'PayCard',
  card: 'Carte bancaire',
  kulu: 'Kulu',
  soutra_money: 'Soutra Money',
};

function monthStartIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AdminComptaScreen({ navigation }: Props) {
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('pass_payments');
  const { countryCode, countryLabel } = useAdminCountry();
  const { shell } = useMemberTheme();
  const [periodStart, setPeriodStart] = useState(monthStartIso);
  const [periodEnd, setPeriodEnd] = useState(todayIso);
  const [balance, setBalance] = useState<AccountingBalance | null>(null);
  const [period, setPeriod] = useState<AccountingPeriodSummary | null>(null);
  const [settlements, setSettlements] = useState<AccountingSettlement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wiredAmount, setWiredAmount] = useState('');
  const [payoutDate, setPayoutDate] = useState(todayIso);
  const [bankReference, setBankReference] = useState('');
  const [notes, setNotes] = useState('');

  const reload = useCallback(async () => {
    setError(null);
    const [balRes, periodRes, settRes] = await Promise.all([
      fetchAccountingBalance({ countryCode }),
      fetchAccountingPeriod({ periodStart, periodEnd, countryCode }),
      fetchAccountingSettlements(),
    ]);
    if (balRes.error) setError(balRes.error);
    else if (periodRes.error) setError(periodRes.error);
    else if (settRes.error) setError(settRes.error);
    setBalance(balRes.balance ?? null);
    setPeriod(periodRes.summary ?? null);
    setSettlements(settRes.settlements ?? []);
  }, [countryCode, periodEnd, periodStart]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  async function handleRecordSettlement() {
    const amount = Number(wiredAmount.replace(/\s/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Compta', 'Montant viré invalide.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
      Alert.alert('Compta', 'Dates de période au format AAAA-MM-JJ.');
      return;
    }
    setBusy(true);
    const res = await createAccountingSettlement({
      periodStart,
      periodEnd,
      wiredAmountGnf: amount,
      payoutDate,
      bankReference: bankReference.trim() || null,
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (!res.ok) {
      Alert.alert('Compta', res.error ?? 'Enregistrement impossible.');
      return;
    }
    Alert.alert('Compta', 'Virement enregistré.');
    setWiredAmount('');
    setBankReference('');
    setNotes('');
    void reload();
  }

  if (!allowed && !isLoading) {
    return (
      <AdminModuleDenied
        shell={shell}
        moduleLabel={permissionLabel}
        onBack={() => navigation.goBack()}
      />
    );
  }

  const feeLegend = DJOMY_PAY_IN_FEES.filter((r) => r.available)
    .map((r) => `${r.label} : ${r.ratePercent} %`)
    .join(' · ');

  return (
    <KeyboardAwareFormScroll
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={ADMIN_THEME.accent} />
      }
    >
      <AdminPageHeader
        title="Compta PASS"
        subtitle={`Virements Djomy · ${countryLabel} · reste à percevoir`}
        shell={shell}
        onBack={() => navigation.goBack()}
      />

      <Pressable
        style={[styles.linkBtn, { borderColor: ADMIN_THEME.accent }]}
        onPress={() => navigation.navigate('AdminPayments')}
      >
        <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700', fontSize: 13 }}>
          Voir les paiements →
        </Text>
      </Pressable>

      {error ? <Text style={[styles.error, { color: '#ef4444' }]}>{error}</Text> : null}

      {balance ? (
        <View style={[styles.kpiRow, { borderColor: shell.filterInactiveBorder }]}>
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiValue, { color: shell.pageTitle }]}>{formatGnf(balance.grossGnf)}</Text>
            <Text style={[styles.kpiLabel, { color: shell.pageKicker }]}>Brut</Text>
          </View>
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiValue, { color: shell.pageTitle }]}>{formatGnf(balance.feeGnf)}</Text>
            <Text style={[styles.kpiLabel, { color: shell.pageKicker }]}>Frais</Text>
          </View>
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiValue, { color: '#16a34a' }]}>{formatGnf(balance.netExpectedGnf)}</Text>
            <Text style={[styles.kpiLabel, { color: shell.pageKicker }]}>Net attendu</Text>
          </View>
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiValue, { color: shell.pageTitle }]}>{formatGnf(balance.wiredTotalGnf)}</Text>
            <Text style={[styles.kpiLabel, { color: shell.pageKicker }]}>Viré</Text>
          </View>
          <View style={[styles.kpiItem, { width: '100%' }]}>
            <Text
              style={[
                styles.kpiValue,
                { color: balance.remainingOwedGnf > 0 ? '#b45309' : '#16a34a', fontSize: 16 },
              ]}
            >
              {formatGnf(balance.remainingOwedGnf)}
            </Text>
            <Text style={[styles.kpiLabel, { color: shell.pageKicker }]}>Reste à percevoir</Text>
          </View>
        </View>
      ) : null}

      <View style={[adminCardStyle(shell), styles.card]}>
        <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>Grille frais Pay In</Text>
        <Text style={[styles.meta, { color: shell.pageKicker }]}>{feeLegend}</Text>
        {DJOMY_COMMERCIAL_NOTES.map((note) => (
          <Text key={note} style={[styles.meta, { color: shell.pageKicker }]}>
            · {note}
          </Text>
        ))}
      </View>

      <View style={[adminCardStyle(shell), styles.card]}>
        <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>Période comptable</Text>
        <Text style={[styles.label, { color: shell.pageKicker }]}>Du (AAAA-MM-JJ)</Text>
        <TextInput
          style={[styles.input, { borderColor: shell.filterInactiveBorder, color: shell.pageTitle }]}
          value={periodStart}
          onChangeText={setPeriodStart}
          placeholder="2026-09-01"
          autoCapitalize="none"
        />
        <Text style={[styles.label, { color: shell.pageKicker }]}>Au (AAAA-MM-JJ)</Text>
        <TextInput
          style={[styles.input, { borderColor: shell.filterInactiveBorder, color: shell.pageTitle }]}
          value={periodEnd}
          onChangeText={setPeriodEnd}
          placeholder="2026-09-16"
          autoCapitalize="none"
        />
        <Pressable
          style={[styles.actionBtn, { borderColor: ADMIN_THEME.accent }]}
          onPress={() => void reload()}
        >
          <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700' }}>Calculer la période</Text>
        </Pressable>

        {period ? (
          <>
            <View style={[styles.kpiRow, { borderColor: shell.filterInactiveBorder, marginTop: 12 }]}>
              <View style={styles.kpiItem}>
                <Text style={[styles.kpiValue, { color: shell.pageTitle }]}>{period.paidCount}</Text>
                <Text style={[styles.kpiLabel, { color: shell.pageKicker }]}>Payés</Text>
              </View>
              <View style={styles.kpiItem}>
                <Text style={[styles.kpiValue, { color: shell.pageTitle }]}>{formatGnf(period.grossGnf)}</Text>
                <Text style={[styles.kpiLabel, { color: shell.pageKicker }]}>Encaissé</Text>
              </View>
              <View style={styles.kpiItem}>
                <Text style={[styles.kpiValue, { color: shell.pageTitle }]}>{formatGnf(period.feeGnf)}</Text>
                <Text style={[styles.kpiLabel, { color: shell.pageKicker }]}>Frais</Text>
              </View>
              <View style={styles.kpiItem}>
                <Text style={[styles.kpiValue, { color: '#16a34a' }]}>{formatGnf(period.netGnf)}</Text>
                <Text style={[styles.kpiLabel, { color: shell.pageKicker }]}>Net</Text>
              </View>
            </View>

            {period.byPaymentMethod.map((row) => (
              <Text key={row.paymentMethod} style={[styles.meta, { color: shell.pageKicker }]}>
                {PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod} · {row.paidCount} · brut{' '}
                {formatGnf(row.grossGnf)} · net {formatGnf(row.netGnf)}
              </Text>
            ))}

            <Text style={[styles.meta, { color: shell.pageTitle, fontWeight: '700', marginTop: 8 }]}>
              Reste sur période : {formatGnf(period.remainingInPeriodGnf)}
            </Text>
          </>
        ) : null}

        <Text style={[styles.cardTitle, { color: shell.pageTitle, marginTop: 16 }]}>
          Virement reçu (cette période)
        </Text>
        <Text style={[styles.label, { color: shell.pageKicker }]}>Montant viré (GNF)</Text>
        <TextInput
          style={[styles.input, { borderColor: shell.filterInactiveBorder, color: shell.pageTitle }]}
          value={wiredAmount}
          onChangeText={setWiredAmount}
          keyboardType="numeric"
          placeholder={period ? String(period.netGnf) : '850000'}
        />
        <Text style={[styles.label, { color: shell.pageKicker }]}>Date virement (AAAA-MM-JJ)</Text>
        <TextInput
          style={[styles.input, { borderColor: shell.filterInactiveBorder, color: shell.pageTitle }]}
          value={payoutDate}
          onChangeText={setPayoutDate}
          placeholder="2026-09-18"
          autoCapitalize="none"
        />
        <Text style={[styles.label, { color: shell.pageKicker }]}>Référence bancaire</Text>
        <TextInput
          style={[styles.input, { borderColor: shell.filterInactiveBorder, color: shell.pageTitle }]}
          value={bankReference}
          onChangeText={setBankReference}
          placeholder="VIR-DJOMY-…"
        />
        <Text style={[styles.label, { color: shell.pageKicker }]}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textArea, { borderColor: shell.filterInactiveBorder, color: shell.pageTitle }]}
          value={notes}
          onChangeText={setNotes}
          multiline
        />
        <Pressable
          style={[styles.actionBtn, styles.primaryBtn, { backgroundColor: ADMIN_THEME.accent, opacity: busy ? 0.6 : 1 }]}
          disabled={busy}
          onPress={() => void handleRecordSettlement()}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>
            {busy ? 'Enregistrement…' : 'Enregistrer le virement'}
          </Text>
        </Pressable>
      </View>

      {settlements.length ? (
        <View style={[adminCardStyle(shell), styles.card]}>
          <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>Historique virements</Text>
          {settlements.map((s) => (
            <View key={s.id} style={styles.settlementRow}>
              <Text style={[styles.meta, { color: shell.pageTitle, fontWeight: '700' }]}>
                {s.periodStart} → {s.periodEnd}
              </Text>
              <Text style={[styles.meta, { color: shell.pageKicker }]}>
                Viré {formatGnf(s.wiredAmountGnf)} · net attendu {formatGnf(s.expectedNetGnf)} · écart{' '}
                {formatGnf(s.periodDeltaGnf)}
              </Text>
              <Text style={[styles.meta, { color: shell.pageKicker }]}>
                {s.payoutDate} · {s.bankReference ?? '—'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </KeyboardAwareFormScroll>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40, gap: 10 },
  linkBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  error: { fontSize: 13 },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  kpiItem: { width: '50%', alignItems: 'center', paddingVertical: 6 },
  kpiValue: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  kpiLabel: { fontSize: 9, fontWeight: '600', marginTop: 2, textTransform: 'uppercase' },
  card: { gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: '800' },
  meta: { fontSize: 11, lineHeight: 16 },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: { minHeight: 64, textAlignVertical: 'top' },
  actionBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtn: { borderWidth: 0 },
  settlementRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
    marginTop: 8,
    gap: 2,
  },
});
