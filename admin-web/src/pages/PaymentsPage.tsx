import { useCallback, useEffect, useState } from 'react';
import { ListPager } from '../components/ListPager';
import {
  downloadPaymentCsv,
  fetchPaymentAnalytics,
  fetchPaymentIntents,
  reconcilePayment,
  type PaymentAnalytics,
  type PaymentIntent,
  type PaymentSummary,
} from '../lib/api';
import { formatWhen, statusBadge } from '../lib/format';
import { billingPeriodLabel, paymentMethodLabel } from '../lib/payment-labels';
import { canReconcilePaymentIntent, reconcileDisabledReason } from '../lib/payment-reconcile';
import {
  paymentIntentStatusLabel,
  resyncHintForIntent,
} from '../lib/payment-intent-display';
import { useAdminCountry } from '../context/AdminCountryContext';
import { Link } from 'react-router-dom';

const PAGE = 20;
const PERIOD_OPTIONS = [7, 30, 90] as const;

type PayFilter = 'all' | 'incidents';

export function PaymentsPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const [payments, setPayments] = useState<PaymentIntent[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [analytics, setAnalytics] = useState<PaymentAnalytics | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState<(typeof PERIOD_OPTIONS)[number]>(30);
  const [error, setError] = useState<string | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<PayFilter>('all');

  const load = useCallback(async () => {
    const res = await fetchPaymentIntents({
      limit: PAGE,
      offset: page * PAGE,
      countryCode,
      fulfillment: filter === 'incidents' ? 'failed' : undefined,
    });
    setError(res.error ?? null);
    setPayments(res.intents);
    setSummary(res.summary ?? null);
    setTotal(res.total ?? res.intents.length);
  }, [page, countryCode, filter]);

  const loadAnalytics = useCallback(async () => {
    const res = await fetchPaymentAnalytics({ countryCode, days: analyticsDays });
    setAnalyticsError(res.error ?? null);
    setAnalytics(res.analytics ?? null);
  }, [countryCode, analyticsDays]);

  useEffect(() => {
    setPage(0);
  }, [countryCode, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  async function handleExport() {
    setExportBusy(true);
    const res = await downloadPaymentCsv({
      countryCode,
      days: analyticsDays,
      fulfillment: filter === 'incidents' ? 'failed' : undefined,
    });
    setExportBusy(false);
    if (!res.ok) window.alert(res.error ?? 'Export impossible.');
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">PASS</p>
          <h2>Paiements Djomy</h2>
          <p className="meta">
            Intents filtrés pour {countryLabel}. Frais Djomy appliqués par moyen de paiement.{' '}
            <Link to="/compta">Compta →</Link> pour les virements et le reste à percevoir.
          </p>
        </div>
        <div className="edit-actions">
          <Link to="/compta" className="btn small ghost">
            Compta
          </Link>
          <button type="button" className="btn small ghost" onClick={() => void load()}>
            Actualiser
          </button>
          <button
            type="button"
            className="btn small"
            disabled={exportBusy}
            onClick={() => void handleExport()}
          >
            {exportBusy ? 'Export…' : 'Export CSV'}
          </button>
        </div>
      </header>

      {summary ? (
        <div className="kpi-row">
          <div className="kpi">
            <strong>{summary.paid}</strong>
            <span>Payés (total)</span>
          </div>
          <div className="kpi">
            <strong>{summary.pending}</strong>
            <span>En cours</span>
          </div>
          <div className="kpi">
            <strong>{summary.failed}</strong>
            <span>Échoués</span>
          </div>
          <div className="kpi">
            <strong>{summary.paidVolumeGnf.toLocaleString('fr-FR')}</strong>
            <span>GNF (total)</span>
          </div>
          {summary.fulfillmentFailed != null && summary.fulfillmentFailed > 0 ? (
            <div className="kpi">
              <strong>{summary.fulfillmentFailed}</strong>
              <span>Incidents PASS</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>Revenus PASS — analytics</h3>
            <p className="meta" style={{ margin: '4px 0 0' }}>
              Période glissante · alertes admin automatiques si PASS non activé après paiement Djomy
            </p>
          </div>
          <div className="tabs">
            {PERIOD_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`tab ${analyticsDays === d ? 'active' : ''}`}
                onClick={() => setAnalyticsDays(d)}
              >
                {d} j
              </button>
            ))}
          </div>
        </div>

        {analyticsError ? <p className="error-text">{analyticsError}</p> : null}

        {analytics ? (
          <>
            {analytics.stuckPending > 0 ? (
              <p className="error-text" style={{ marginBottom: 12 }}>
                <strong>{analytics.stuckPending}</strong> paiement(s) Djomy confirmé(s) bloqué(s) (&gt;
                5 min sans PASS) — le cron tente une réconciliation ; vérifiez la liste ci-dessous.
              </p>
            ) : null}

            <div className="kpi-row" style={{ marginBottom: 12 }}>
              <div className="kpi">
                <strong>{analytics.revenue.paidCount}</strong>
                <span>Payés ({analytics.periodDays} j)</span>
              </div>
              <div className="kpi">
                <strong>{analytics.revenue.totalVolumeGnf.toLocaleString('fr-FR')}</strong>
                <span>GNF encaissés</span>
              </div>
              <div className="kpi">
                <strong>{analytics.revenue.averageTicketGnf.toLocaleString('fr-FR')}</strong>
                <span>Panier moyen</span>
              </div>
              <div className="kpi">
                <strong>{analytics.funnel.fulfilled}</strong>
                <span>PASS activés</span>
              </div>
            </div>

            <div className="split-pane" style={{ gap: 16 }}>
              <div>
                <h4>Par période d’abonnement</h4>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Période</th>
                      <th>Nb</th>
                      <th>Volume GNF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.byBillingPeriod.map((row) => (
                      <tr key={row.key}>
                        <td>{billingPeriodLabel(row.key)}</td>
                        <td>{row.count}</td>
                        <td>{row.volumeGnf.toLocaleString('fr-FR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {analytics.byBillingPeriod.length === 0 ? (
                  <p className="muted">Aucun paiement sur la période.</p>
                ) : null}
              </div>

              <div>
                <h4>Par moyen de paiement</h4>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Moyen</th>
                      <th>Nb</th>
                      <th>Volume GNF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.byPaymentMethod.map((row) => (
                      <tr key={row.key}>
                        <td>{paymentMethodLabel(row.key)}</td>
                        <td>{row.count}</td>
                        <td>{row.volumeGnf.toLocaleString('fr-FR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {analytics.byPaymentMethod.length === 0 ? (
                  <p className="muted">Aucun paiement sur la période.</p>
                ) : null}
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <h4>Entonnoir ({analytics.periodDays} j)</h4>
              <p className="meta">
                Créés {analytics.funnel.created} · Portail {analytics.funnel.redirected} · Payés{' '}
                {analytics.funnel.paid} · PASS activés {analytics.funnel.fulfilled} · Incidents{' '}
                {analytics.funnel.fulfillmentFailed} · Paiements échoués{' '}
                {analytics.funnel.paymentFailed}
              </p>
            </div>

            {analytics.dailyVolume.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <h4>Encaissements par jour</h4>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Nb payés</th>
                      <th>Volume GNF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.dailyVolume.slice(-14).map((row) => (
                      <tr key={row.date}>
                        <td>{row.date}</td>
                        <td>{row.count}</td>
                        <td>{row.volumeGnf.toLocaleString('fr-FR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={`tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          Tous
        </button>
        <button
          type="button"
          className={`tab ${filter === 'incidents' ? 'active' : ''}`}
          onClick={() => setFilter('incidents')}
        >
          Incidents fulfillment
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Membre</th>
              <th>Références (revendication)</th>
              <th>Période</th>
              <th>Montant</th>
              <th>Moyen</th>
              <th>Commission</th>
              <th>Frais</th>
              <th>Net</th>
              <th>Statut</th>
              <th>Vérifié Djomy</th>
              <th>Créé</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.userName || p.userEmail || '—'}</strong>
                  <div className="meta">{p.userEmail}</div>
                  <div className="meta">{p.payerPhone ? `Tél. ${p.payerPhone}` : null}</div>
                </td>
                <td className="activity-cell">
                  <div>
                    <span className="meta">Marchand</span>
                    <br />
                    <strong style={{ fontSize: 12, wordBreak: 'break-all' }}>
                      {p.merchantReference || '—'}
                    </strong>
                    {p.merchantReference ? (
                      <button
                        type="button"
                        className="btn ghost small"
                        style={{ marginLeft: 6, padding: '2px 8px' }}
                        onClick={() => void navigator.clipboard.writeText(p.merchantReference!)}
                      >
                        Copier
                      </button>
                    ) : null}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <span className="meta">Tx Djomy</span>
                    <br />
                    <strong style={{ fontSize: 12, wordBreak: 'break-all' }}>
                      {p.djomyTransactionId || '—'}
                    </strong>
                    {p.djomyTransactionId ? (
                      <button
                        type="button"
                        className="btn ghost small"
                        style={{ marginLeft: 6, padding: '2px 8px' }}
                        onClick={() => void navigator.clipboard.writeText(p.djomyTransactionId!)}
                      >
                        Copier
                      </button>
                    ) : null}
                  </div>
                  {p.djomyProviderReference ? (
                    <div style={{ marginTop: 8 }}>
                      <span className="meta">Ref opérateur (OM/PayCard)</span>
                      <br />
                      <strong style={{ fontSize: 12, wordBreak: 'break-all' }}>
                        {p.djomyProviderReference}
                      </strong>
                      <button
                        type="button"
                        className="btn ghost small"
                        style={{ marginLeft: 6, padding: '2px 8px' }}
                        onClick={() =>
                          void navigator.clipboard.writeText(p.djomyProviderReference!)
                        }
                      >
                        Copier
                      </button>
                    </div>
                  ) : null}
                </td>
                <td>{billingPeriodLabel(p.billingPeriod)}</td>
                <td>
                  {(p.djomyPaidAmount ?? p.amountGnf).toLocaleString('fr-FR')} GNF
                  {p.djomyPaidAmount != null && p.djomyPaidAmount !== p.amountGnf ? (
                    <div className="meta">Intent : {p.amountGnf.toLocaleString('fr-FR')} GNF</div>
                  ) : null}
                </td>
                <td>{paymentMethodLabel(p.paymentMethod ?? 'all')}</td>
                <td>{p.feeRateLabel ?? '—'}</td>
                <td>{p.feeGnf != null ? `${p.feeGnf.toLocaleString('fr-FR')} GNF` : '—'}</td>
                <td>{p.netGnf != null ? `${p.netGnf.toLocaleString('fr-FR')} GNF` : '—'}</td>
                <td>
                  <span className={`badge ${statusBadge(p.status)}`}>
                    {paymentIntentStatusLabel(p.status)}
                  </span>
                  <div className="meta">
                    PASS {p.fulfillmentStatus} · Djomy {p.djomyStatus ?? '—'}
                  </div>
                </td>
                <td>
                  {p.lastCheckedAt ? (
                    formatWhen(p.lastCheckedAt)
                  ) : (
                    <span className="meta">Jamais (cliquez Resync)</span>
                  )}
                </td>
                <td>{formatWhen(p.createdAt)}</td>
                <td>
                  {canReconcilePaymentIntent(p) ? (
                    <>
                      <button
                        type="button"
                        className="btn small ghost"
                        onClick={() => {
                          void reconcilePayment(p.id).then((r) => {
                            if (!r.ok) {
                              window.alert(r.error ?? 'Erreur');
                              return;
                            }
                            window.alert(r.summary ?? 'Vérification Djomy terminée.');
                            void load();
                          });
                        }}
                      >
                        Resync Djomy
                      </button>
                      <div className="meta" style={{ marginTop: 4, maxWidth: 200 }}>
                        {resyncHintForIntent(p)}
                      </div>
                    </>
                  ) : (
                    <div className="meta" style={{ maxWidth: 140 }}>
                      {reconcileDisabledReason(p) ?? '—'}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && !error ? (
          <p className="muted" style={{ padding: 16 }}>
            Aucun paiement.
          </p>
        ) : null}
      </div>

      <ListPager page={page} total={total} pageSize={PAGE} onPageChange={setPage} label="paiements" />
    </section>
  );
}
