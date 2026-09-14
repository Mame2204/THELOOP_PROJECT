import { useCallback, useEffect, useState } from 'react';
import {
  fetchPaymentIntents,
  reconcilePayment,
  type PaymentIntent,
  type PaymentSummary,
} from '../lib/api';
import { formatWhen, statusBadge } from '../lib/format';
import { useAdminCountry } from '../context/AdminCountryContext';

const PAGE = 20;

export function PaymentsPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const [payments, setPayments] = useState<PaymentIntent[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const res = await fetchPaymentIntents({
      limit: PAGE,
      offset: page * PAGE,
      countryCode,
    });
    setError(res.error ?? null);
    setPayments(res.intents);
    setSummary(res.summary ?? null);
    setTotal(res.total ?? res.intents.length);
  }, [page, countryCode]);

  useEffect(() => {
    setPage(0);
  }, [countryCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">PASS</p>
          <h2>Paiements Djomy</h2>
          <p className="meta">Intents filtrés pour {countryLabel} (via pays du membre).</p>
        </div>
        <button type="button" className="btn small ghost" onClick={() => void load()}>
          Actualiser
        </button>
      </header>

      {summary ? (
        <div className="kpi-row">
          <div className="kpi">
            <strong>{summary.paid}</strong>
            <span>Payés</span>
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
            <span>GNF</span>
          </div>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Membre</th>
              <th>Période</th>
              <th>Montant</th>
              <th>Statut</th>
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
                  <div className="meta">Tx {p.djomyTransactionId ?? '—'}</div>
                </td>
                <td>{p.billingPeriod}</td>
                <td>{p.amountGnf.toLocaleString('fr-FR')} GNF</td>
                <td>
                  <span className={`badge ${statusBadge(p.status)}`}>{p.status}</span>
                  <div className="meta">
                    {p.fulfillmentStatus} · {p.djomyStatus ?? '—'}
                  </div>
                </td>
                <td>{formatWhen(p.createdAt)}</td>
                <td>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => {
                      void reconcilePayment(p.id).then((r) => {
                        if (!r.ok) window.alert(r.error ?? 'Erreur');
                        else void load();
                      });
                    }}
                  >
                    Resync
                  </button>
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

      {total > PAGE ? (
        <div className="pager">
          <button
            type="button"
            className="btn ghost"
            disabled={page <= 0}
            onClick={() => setPage((x) => x - 1)}
          >
            Précédent
          </button>
          <span className="muted">
            Page {page + 1}/{pages}
          </span>
          <button
            type="button"
            className="btn ghost"
            disabled={page + 1 >= pages}
            onClick={() => setPage((x) => x + 1)}
          >
            Suivant
          </button>
        </div>
      ) : null}
    </section>
  );
}
