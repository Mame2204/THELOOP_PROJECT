import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, Share, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { AdminPageHeader, ADMIN_THEME, adminCardStyle } from '@/components/admin/AdminShell';
import { AdminTabMenu } from '@/components/admin/AdminTabMenu';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useAdminCountry } from '@/context/AdminCountryContext';
import {
  fetchAdminPaymentAnalytics,
  fetchAdminPaymentCsv,
  listAdminPaymentIntents,
  canReconcilePaymentIntent,
  reconcileDisabledReason,
  reconcileAdminPaymentIntent,
  type AdminPaymentAnalytics,
  type AdminPaymentIntent,
  type AdminPaymentSummary,
} from '@/lib/admin-payments-store';
import { formatDateFr } from '@/lib/date-utils';
import { resyncHintForIntent } from '@/lib/payment-intent-display';
import { formatGnf } from '@/lib/djomy-fees';
import { primePlanLabel, type PrimeBillingPeriod } from '@/lib/prime-plans';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminPayments'>;

type StatusFilter = 'all' | 'paid' | 'pending' | 'failed' | 'incidents';

const PERIOD_LABELS: Record<string, string> = {
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  annual: 'Annuel',
  lifetime: 'À vie',
};

function formatDateTimeFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return formatDateFr(iso);
  }
}

function statusTone(status: string): { bg: string; color: string; label: string } {
  switch (status) {
    case 'paid':
      return { bg: 'rgba(34,197,94,0.15)', color: '#16a34a', label: 'Payé' };
    case 'failed':
      return { bg: 'rgba(239,68,68,0.15)', color: '#dc2626', label: 'Échoué' };
    case 'cancelled':
      return { bg: 'rgba(107,114,128,0.2)', color: '#6b7280', label: 'Annulé' };
    case 'redirected':
      return { bg: 'rgba(245,158,11,0.18)', color: '#b45309', label: 'Portail ouvert' };
    case 'created':
      return { bg: 'rgba(59,130,246,0.15)', color: '#2563eb', label: 'Créé' };
    default:
      return { bg: 'rgba(107,114,128,0.15)', color: '#6b7280', label: status };
  }
}

function matchesFilter(intent: AdminPaymentIntent, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'incidents') return intent.fulfillmentStatus === 'failed';
  if (filter === 'paid') return intent.status === 'paid' || intent.fulfillmentStatus === 'fulfilled';
  if (filter === 'failed') return intent.status === 'failed' || intent.status === 'cancelled';
  return intent.status !== 'paid' && intent.fulfillmentStatus !== 'fulfilled' && intent.status !== 'failed' && intent.status !== 'cancelled';
}

const PAGE_SIZE = 30;
const ANALYTICS_DAYS = [7, 30, 90] as const;

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  orange_money: 'Orange Money',
  mtn_momo: 'MTN MoMo',
  card: 'Carte bancaire',
};

export function AdminPaymentsScreen({ navigation }: Props) {
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('pass_payments');
  const { countryCode } = useAdminCountry();
  const { shell } = useMemberTheme();
  const [intents, setIntents] = useState<AdminPaymentIntent[]>([]);
  const [summary, setSummary] = useState<AdminPaymentSummary | null>(null);
  const [analytics, setAnalytics] = useState<AdminPaymentAnalytics | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState<(typeof ANALYTICS_DAYS)[number]>(30);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listAdminPaymentIntents({
      limit: filter === 'all' || filter === 'paid' ? PAGE_SIZE : 80,
      offset: filter === 'all' || filter === 'paid' ? page * PAGE_SIZE : 0,
      countryCode,
      ...(filter === 'paid' ? { status: 'paid' } : {}),
      ...(filter === 'incidents' ? { fulfillment: 'failed' } : {}),
    });
    setLoadError(res.error ?? null);
    setSummary(res.summary ?? null);
    setTotal(res.total ?? res.intents.length);
    setIntents(
      filter === 'all' || filter === 'paid'
        ? res.intents
        : res.intents.filter((i) => matchesFilter(i, filter)),
    );
  }, [filter, page, countryCode]);

  const loadAnalytics = useCallback(async () => {
    const res = await fetchAdminPaymentAnalytics({ countryCode, days: analyticsDays });
    setAnalyticsError(res.error ?? null);
    setAnalytics(res.analytics ?? null);
  }, [countryCode, analyticsDays]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    setPage(0);
  }, [filter, countryCode]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), loadAnalytics()]);
    setRefreshing(false);
  }, [load, loadAnalytics]);

  async function handleExportCsv() {
    setExportBusy(true);
    try {
      const res = await fetchAdminPaymentCsv({
        countryCode,
        days: analyticsDays,
        fulfillment: filter === 'incidents' ? 'failed' : undefined,
      });
      if (res.error || !res.csv) {
        Alert.alert('Export', res.error ?? 'Export impossible.');
        return;
      }
      await Share.share({
        message: res.csv,
        title: `loop-paiements-${new Date().toISOString().slice(0, 10)}.csv`,
      });
    } finally {
      setExportBusy(false);
    }
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = intents;

  async function handleReconcile(intent: AdminPaymentIntent) {
    setBusyId(intent.id);
    try {
      const res = await reconcileAdminPaymentIntent(intent.id);
      if (!res.ok) {
        Alert.alert('Resync', res.error ?? 'Échec');
        return;
      }
      Alert.alert(
        'Resync Djomy',
        res.summary ??
          `Statut : ${res.intent?.status ?? '—'} · Fulfillment : ${res.intent?.fulfillmentStatus ?? '—'} · Djomy : ${res.intent?.djomyStatus ?? '—'}`,
      );
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <KeyboardAwareFormScroll
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={ADMIN_THEME.accent} />
      }
    >
      <AdminPageHeader
        title="Paiements PASS"
        subtitle={`${filtered.length} affichée${filtered.length > 1 ? 's' : ''} · frais Djomy par moyen`}
        shell={shell}
        onBack={() => navigation.goBack()}
      />

      <Pressable
        style={[styles.comptaLink, { borderColor: ADMIN_THEME.accent }]}
        onPress={() => navigation.navigate('AdminCompta')}
      >
        <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700', fontSize: 13 }}>
          Compta · virements & reste à percevoir →
        </Text>
      </Pressable>

      {summary ? (
        <View style={[styles.kpiRow, { borderColor: shell.filterInactiveBorder }]}>
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiValue, { color: '#16a34a' }]}>{summary.paid}</Text>
            <Text style={[styles.kpiLabel, { color: shell.pageKicker }]}>Payés</Text>
          </View>
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiValue, { color: '#b45309' }]}>{summary.pending}</Text>
            <Text style={[styles.kpiLabel, { color: shell.pageKicker }]}>En cours</Text>
          </View>
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiValue, { color: '#dc2626' }]}>{summary.failed}</Text>
            <Text style={[styles.kpiLabel, { color: shell.pageKicker }]}>Échoués</Text>
          </View>
          {summary.fulfillmentFailed != null && summary.fulfillmentFailed > 0 ? (
            <View style={styles.kpiItem}>
              <Text style={[styles.kpiValue, { color: '#c2410c' }]}>{summary.fulfillmentFailed}</Text>
              <Text style={[styles.kpiLabel, { color: shell.pageKicker }]}>Incidents PASS</Text>
            </View>
          ) : null}
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiValue, { color: shell.pageTitle }]}>
              {summary.paidVolumeGnf.toLocaleString('fr-FR')}
            </Text>
            <Text style={[styles.kpiLabel, { color: shell.pageKicker }]}>GNF encaissés</Text>
          </View>
        </View>
      ) : null}

      <View style={[adminCardStyle(shell), styles.analyticsCard]}>
        <View style={styles.analyticsHeader}>
          <Text style={[styles.analyticsTitle, { color: shell.pageTitle }]}>Revenus PASS</Text>
          <Pressable
            style={[styles.exportBtn, { borderColor: ADMIN_THEME.accent, opacity: exportBusy ? 0.6 : 1 }]}
            disabled={exportBusy}
            onPress={() => void handleExportCsv()}
          >
            <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700', fontSize: 11 }}>
              {exportBusy ? 'Export…' : 'CSV'}
            </Text>
          </Pressable>
        </View>

        <AdminTabMenu
          tabs={ANALYTICS_DAYS.map((d) => ({ id: String(d), label: `${d} j` }))}
          active={String(analyticsDays)}
          onChange={(id) => setAnalyticsDays(Number(id) as (typeof ANALYTICS_DAYS)[number])}
          shell={shell}
          accent={ADMIN_THEME.accent}
        />

        {analyticsError ? (
          <Text style={[styles.error, { color: '#ef4444' }]}>{analyticsError}</Text>
        ) : null}

        {analytics ? (
          <>
            {analytics.stuckPending > 0 ? (
              <Text style={[styles.stuckAlert, { color: '#c2410c' }]}>
                {analytics.stuckPending} paiement(s) bloqué(s) (&gt; 5 min sans PASS) — alerte admin envoyée.
              </Text>
            ) : null}
            <View style={styles.kpiRow}>
              <View style={styles.kpiItem}>
                <Text style={[styles.kpiValue, { color: '#16a34a' }]}>{analytics.revenue.paidCount}</Text>
                <Text style={[styles.kpiLabel, { color: shell.pageKicker }]}>Payés</Text>
              </View>
              <View style={styles.kpiItem}>
                <Text style={[styles.kpiValue, { color: shell.pageTitle }]}>
                  {analytics.revenue.totalVolumeGnf.toLocaleString('fr-FR')}
                </Text>
                <Text style={[styles.kpiLabel, { color: shell.pageKicker }]}>GNF</Text>
              </View>
              <View style={styles.kpiItem}>
                <Text style={[styles.kpiValue, { color: shell.pageTitle }]}>
                  {analytics.revenue.averageTicketGnf.toLocaleString('fr-FR')}
                </Text>
                <Text style={[styles.kpiLabel, { color: shell.pageKicker }]}>Moyenne</Text>
              </View>
              <View style={styles.kpiItem}>
                <Text style={[styles.kpiValue, { color: '#2563eb' }]}>{analytics.funnel.fulfilled}</Text>
                <Text style={[styles.kpiLabel, { color: shell.pageKicker }]}>Activés</Text>
              </View>
            </View>

            {analytics.byBillingPeriod.slice(0, 4).map((row) => (
              <Text key={row.key} style={[styles.breakdownLine, { color: shell.pageKicker }]}>
                {PERIOD_LABELS[row.key] ?? row.key} · {row.count} · {row.volumeGnf.toLocaleString('fr-FR')} GNF
              </Text>
            ))}

            {analytics.byPaymentMethod.slice(0, 3).map((row) => (
              <Text key={row.key} style={[styles.breakdownLine, { color: shell.pageKicker }]}>
                {PAYMENT_METHOD_LABELS[row.key] ?? row.key} · {row.count} ·{' '}
                {row.volumeGnf.toLocaleString('fr-FR')} GNF
              </Text>
            ))}

            <Text style={[styles.funnelLine, { color: shell.pageKicker }]}>
              Entonnoir : créés {analytics.funnel.created} · portail {analytics.funnel.redirected} · payés{' '}
              {analytics.funnel.paid} · incidents {analytics.funnel.fulfillmentFailed}
            </Text>
          </>
        ) : null}
      </View>

      <Text style={[styles.hint, { color: shell.pageKicker }]}>
        Suivi applicatif THE LOOP. Dashboard Djomy = source bancaire.
      </Text>

      <AdminTabMenu
        tabs={[
          { id: 'all', label: 'Tous' },
          { id: 'pending', label: 'En cours' },
          { id: 'paid', label: 'Payés' },
          { id: 'failed', label: 'Échoués' },
          { id: 'incidents', label: 'Incidents' },
        ]}
        active={filter}
        onChange={setFilter}
        shell={shell}
      />

      {loadError ? (
        <Text style={[styles.error, { color: '#ef4444' }]}>{loadError}</Text>
      ) : null}

      {filtered.length === 0 && !loadError ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucune transaction pour ce filtre.</Text>
      ) : null}

      {filtered.map((intent) => {
        const tone = statusTone(intent.status);
        const expanded = expandedId === intent.id;
        const period =
          PERIOD_LABELS[intent.billingPeriod] ??
          (['monthly', 'quarterly', 'annual', 'lifetime'].includes(intent.billingPeriod)
            ? primePlanLabel(intent.billingPeriod as PrimeBillingPeriod)
            : intent.billingPeriod);

        return (
          <Pressable
            key={intent.id}
            style={adminCardStyle(shell)}
            onPress={() => setExpandedId(expanded ? null : intent.id)}
          >
            <View style={styles.cardTop}>
              <Text style={[styles.name, { color: shell.pageTitle }]} numberOfLines={1}>
                {intent.userName || intent.userEmail || 'Utilisateur'}
              </Text>
              <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                <Text style={{ color: tone.color, fontSize: 9, fontWeight: '800' }}>{tone.label}</Text>
              </View>
            </View>
            <Text style={[styles.meta, { color: shell.pageKicker }]}>
              {period} · {(intent.djomyPaidAmount ?? intent.amountGnf).toLocaleString('fr-FR')} GNF
              {intent.feeGnf != null ? ` · frais ${formatGnf(intent.feeGnf)}` : ''}
              {intent.netGnf != null ? ` · net ${formatGnf(intent.netGnf)}` : ''}
              {' · '}
              {formatDateTimeFr(intent.createdAt)}
            </Text>
            <Text style={[styles.meta, { color: shell.pageKicker }]} numberOfLines={1}>
              {intent.userEmail ?? intent.userId}
            </Text>
            <Text style={[styles.meta, { color: shell.pageTitle, fontWeight: '600' }]} numberOfLines={1}>
              Ref : {intent.merchantReference || '—'}
            </Text>
            <Text style={[styles.meta, { color: shell.pageKicker }]} numberOfLines={1}>
              Tx Djomy : {intent.djomyTransactionId ?? '—'}
            </Text>
            <Text style={[styles.meta, { color: shell.pageKicker }]} numberOfLines={2}>
              Vérifié Djomy : {formatDateTimeFr(intent.lastCheckedAt)}
            </Text>

            {expanded ? (
              <View style={styles.detail}>
                <Text style={[styles.detailLine, { color: shell.pageTitle }]}>
                  Méthode app : {intent.paymentMethod} · Payeur : {intent.payerPhone || '—'}
                </Text>
                <Text style={[styles.detailLine, { color: shell.pageKicker }]}>
                  Ref marchand : {intent.merchantReference}
                </Text>
                <Text style={[styles.detailLine, { color: shell.pageKicker }]}>
                  Tx Djomy : {intent.djomyTransactionId ?? '—'}
                </Text>
                <Text style={[styles.detailLine, { color: shell.pageKicker }]}>
                  Statut Djomy : {intent.djomyStatus ?? '—'} · Ref opérateur :{' '}
                  {intent.djomyProviderReference ?? '—'}
                </Text>
                <Text style={[styles.detailLine, { color: shell.pageKicker }]}>
                  Fulfillment : {intent.fulfillmentStatus} · PASS : {intent.passGrantStatus ?? '—'}
                </Text>
                <Text style={[styles.detailLine, { color: shell.pageKicker }]}>
                  Payé le : {formatDateTimeFr(intent.paidAt)} · Montant confirmé :{' '}
                  {intent.djomyPaidAmount != null
                    ? `${intent.djomyPaidAmount.toLocaleString('fr-FR')} GNF`
                    : '—'}
                </Text>
                <Text style={[styles.detailLine, { color: shell.pageKicker }]}>
                  Commission Djomy ({intent.feeRateLabel ?? '—'}) :{' '}
                  {intent.feeGnf != null ? formatGnf(intent.feeGnf) : '—'}
                  {intent.netGnf != null ? ` · Net : ${formatGnf(intent.netGnf)}` : ''}
                </Text>
                <Text style={[styles.detailLine, { color: shell.pageKicker }]}>
                  Dernier verify : {formatDateTimeFr(intent.lastCheckedAt)}
                </Text>
                <Text style={[styles.detailLine, { color: shell.pageKicker }]}>
                  Webhook : {intent.lastWebhookEvent ?? 'aucun'} ·{' '}
                  {formatDateTimeFr(intent.lastWebhookAt)}
                </Text>

                {canReconcilePaymentIntent(intent) ? (
                  <>
                    <Pressable
                      style={[styles.resyncBtn, { borderColor: ADMIN_THEME.accent, opacity: busyId === intent.id ? 0.6 : 1 }]}
                      disabled={busyId === intent.id}
                      onPress={() => void handleReconcile(intent)}
                    >
                      <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700', fontSize: 12 }}>
                        {busyId === intent.id ? 'Resync…' : 'Resynchroniser avec Djomy'}
                      </Text>
                    </Pressable>
                    <Text style={[styles.tapHint, { color: shell.pageKicker, marginTop: 6 }]}>
                      {resyncHintForIntent(intent)}
                    </Text>
                  </>
                ) : (
                  <Text style={[styles.tapHint, { color: shell.pageKicker, marginTop: 8 }]}>
                    {reconcileDisabledReason(intent) ?? 'Resync non nécessaire'}
                  </Text>
                )}
              </View>
            ) : (
              <Text style={[styles.tapHint, { color: shell.pageKicker }]}>Toucher pour le détail</Text>
            )}
          </Pressable>
        );
      })}

      {(filter === 'all' || filter === 'paid') && total > PAGE_SIZE ? (
        <View style={styles.pagerRow}>
          <Pressable
            style={[styles.pagerBtn, { borderColor: shell.filterInactiveBorder, opacity: page <= 0 ? 0.4 : 1 }]}
            disabled={page <= 0}
            onPress={() => setPage((p) => Math.max(0, p - 1))}
          >
            <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Précédent</Text>
          </Pressable>
          <Text style={{ color: shell.pageKicker, fontSize: 12 }}>
            Page {page + 1}/{totalPages}
          </Text>
          <Pressable
            style={[
              styles.pagerBtn,
              { borderColor: shell.filterInactiveBorder, opacity: page + 1 >= totalPages ? 0.4 : 1 },
            ]}
            disabled={page + 1 >= totalPages}
            onPress={() => setPage((p) => p + 1)}
          >
            <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Suivant</Text>
          </Pressable>
        </View>
      ) : null}
    </KeyboardAwareFormScroll>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40, gap: 10 },
  comptaLink: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 4,
  },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginBottom: 4,
  },
  kpiItem: { width: '25%', alignItems: 'center', paddingVertical: 4 },
  kpiValue: { fontSize: 13, fontWeight: '800' },
  kpiLabel: { fontSize: 9, fontWeight: '600', marginTop: 2, textTransform: 'uppercase' },
  analyticsCard: { gap: 8 },
  analyticsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  analyticsTitle: { fontSize: 14, fontWeight: '800' },
  exportBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  stuckAlert: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  breakdownLine: { fontSize: 11, lineHeight: 16 },
  funnelLine: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 4 },
  error: { fontSize: 13, marginVertical: 8 },
  empty: { textAlign: 'center', marginTop: 24, fontSize: 13 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: '800' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  meta: { marginTop: 4, fontSize: 12 },
  tapHint: { marginTop: 8, fontSize: 11, fontStyle: 'italic' },
  detail: { marginTop: 12, gap: 4 },
  detailLine: { fontSize: 11, lineHeight: 16 },
  resyncBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  pagerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  pagerBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
});
