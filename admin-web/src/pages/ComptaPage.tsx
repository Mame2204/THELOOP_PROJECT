import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createAccountingSettlement,
  fetchAccountingBalance,
  fetchAccountingPeriod,
  fetchAccountingSettlements,
  type AccountingBalance,
  type AccountingPeriodSummary,
  type AccountingSettlement,
} from '../lib/api';
import { useAdminCountry } from '../context/AdminCountryContext';
import { paymentMethodLabel } from '../lib/payment-labels';
import { DJOMY_COMMERCIAL_NOTES, DJOMY_PAY_IN_FEES } from '../lib/djomy-fees';

function formatGnf(value: number): string {
  return `${value.toLocaleString('fr-FR')} GNF`;
}

function monthStartIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ComptaPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const [periodStart, setPeriodStart] = useState(monthStartIso);
  const [periodEnd, setPeriodEnd] = useState(todayIso);
  const [balance, setBalance] = useState<AccountingBalance | null>(null);
  const [period, setPeriod] = useState<AccountingPeriodSummary | null>(null);
  const [settlements, setSettlements] = useState<AccountingSettlement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wiredAmount, setWiredAmount] = useState('');
  const [payoutDate, setPayoutDate] = useState(todayIso);
  const [bankReference, setBankReference] = useState('');
  const [notes, setNotes] = useState('');
  const [success, setSuccess] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const [balRes, periodRes, settRes] = await Promise.all([
      fetchAccountingBalance({ countryCode }),
      fetchAccountingPeriod({ periodStart, periodEnd, countryCode }),
      fetchAccountingSettlements(),
    ]);
    if (balRes.error) setError(balRes.error);
    if (periodRes.error) setError(periodRes.error);
    if (settRes.error && !balRes.error && !periodRes.error) setError(settRes.error);
    setBalance(balRes.balance ?? null);
    setPeriod(periodRes.summary ?? null);
    setSettlements(settRes.settlements ?? []);
  }, [countryCode, periodEnd, periodStart]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const feeLegend = useMemo(
    () => DJOMY_PAY_IN_FEES.filter((r) => r.available).map((r) => `${r.label} : ${r.ratePercent} %`).join(' · '),
    [],
  );

  async function handleRecordSettlement(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSuccess(null);
    setError(null);
    const amount = Number(wiredAmount.replace(/\s/g, ''));
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
      setError(res.error ?? 'Enregistrement impossible.');
      return;
    }
    setSuccess('Virement enregistré.');
    setWiredAmount('');
    setBankReference('');
    setNotes('');
    void reload();
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">PASS · Djomy Pay In</p>
          <h2>Compta</h2>
          <p className="meta">
            Encaissements PASS ({countryLabel}) · frais Djomy appliqués par moyen de paiement · suivi des
            virements bancaires et du <strong>reste à percevoir</strong>.
          </p>
        </div>
        <div className="edit-actions">
          <Link to="/payments" className="btn small ghost">
            Paiements →
          </Link>
          <button type="button" className="btn small ghost" onClick={() => void reload()}>
            Actualiser
          </button>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {success ? <p className="meta" style={{ color: '#047857' }}>{success}</p> : null}

      {balance ? (
        <div className="kpi-row" style={{ marginBottom: 16 }}>
          <div className="kpi">
            <strong>{formatGnf(balance.grossGnf)}</strong>
            <span>Encaissé (brut)</span>
          </div>
          <div className="kpi">
            <strong>{formatGnf(balance.feeGnf)}</strong>
            <span>Frais Djomy (est.)</span>
          </div>
          <div className="kpi">
            <strong>{formatGnf(balance.netExpectedGnf)}</strong>
            <span>Net attendu</span>
          </div>
          <div className="kpi">
            <strong>{formatGnf(balance.wiredTotalGnf)}</strong>
            <span>Déjà viré</span>
          </div>
          <div className="kpi">
            <strong style={{ color: balance.remainingOwedGnf > 0 ? '#b45309' : '#047857' }}>
              {formatGnf(balance.remainingOwedGnf)}
            </strong>
            <span>Reste à percevoir</span>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 8px' }}>Grille frais Pay In</h3>
        <p className="meta" style={{ margin: '0 0 8px' }}>{feeLegend}</p>
        <ul className="meta" style={{ margin: 0, paddingLeft: 18 }}>
          {DJOMY_COMMERCIAL_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>Période comptable</h3>
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <label>
            Du
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </label>
          <label>
            Au
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </label>
          <button type="button" className="btn small" onClick={() => void reload()}>
            Calculer
          </button>
        </div>

        {period ? (
          <>
            <div className="kpi-row" style={{ marginBottom: 12 }}>
              <div className="kpi">
                <strong>{period.paidCount}</strong>
                <span>Paiements</span>
              </div>
              <div className="kpi">
                <strong>{formatGnf(period.grossGnf)}</strong>
                <span>Encaissé période</span>
              </div>
              <div className="kpi">
                <strong>{formatGnf(period.feeGnf)}</strong>
                <span>Frais période</span>
              </div>
              <div className="kpi">
                <strong>{formatGnf(period.netGnf)}</strong>
                <span>Net période</span>
              </div>
              <div className="kpi">
                <strong>{formatGnf(period.remainingInPeriodGnf)}</strong>
                <span>Reste période</span>
              </div>
            </div>

            {period.byPaymentMethod.length ? (
              <div className="table-wrap" style={{ marginBottom: 16 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Moyen</th>
                      <th>Paiements</th>
                      <th>Brut</th>
                      <th>Frais</th>
                      <th>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {period.byPaymentMethod.map((row) => (
                      <tr key={row.paymentMethod}>
                        <td>{paymentMethodLabel(row.paymentMethod)}</td>
                        <td>{row.paidCount}</td>
                        <td>{formatGnf(row.grossGnf)}</td>
                        <td>{formatGnf(row.feeGnf)}</td>
                        <td>{formatGnf(row.netGnf)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="meta">Aucun paiement confirmé sur cette période.</p>
            )}
          </>
        ) : null}

        <h4 style={{ margin: '16px 0 8px' }}>Enregistrer un virement reçu (cette période)</h4>
        <form onSubmit={(e) => void handleRecordSettlement(e)}>
          <div className="form-grid">
            <label>
              Montant viré sur compte (GNF)
              <input
                type="number"
                min={1}
                required
                value={wiredAmount}
                onChange={(e) => setWiredAmount(e.target.value)}
                placeholder={period ? String(period.netGnf) : '850000'}
              />
            </label>
            <label>
              Date du virement
              <input type="date" value={payoutDate} onChange={(e) => setPayoutDate(e.target.value)} required />
            </label>
            <label>
              Référence bancaire
              <input
                type="text"
                value={bankReference}
                onChange={(e) => setBankReference(e.target.value)}
                placeholder="VIR-DJOMY-…"
              />
            </label>
          </div>
          <label style={{ display: 'block', marginTop: 12 }}>
            Notes
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {period ? (
            <p className="meta" style={{ marginTop: 8 }}>
              Net attendu sur {periodStart} → {periodEnd} : <strong>{formatGnf(period.netGnf)}</strong>
              {period.wiredInPeriodGnf > 0
                ? ` · Déjà enregistré : ${formatGnf(period.wiredInPeriodGnf)}`
                : ''}
            </p>
          ) : null}
          <button type="submit" className="btn small" style={{ marginTop: 12 }} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer le virement'}
          </button>
        </form>
      </div>

      {settlements.length ? (
        <div className="card">
          <h3 style={{ margin: '0 0 12px' }}>Historique des virements</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Période</th>
                  <th>Date virement</th>
                  <th>Montant viré</th>
                  <th>Net attendu</th>
                  <th>Écart</th>
                  <th>Réf.</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.periodStart} → {s.periodEnd}
                    </td>
                    <td>{s.payoutDate}</td>
                    <td>{formatGnf(s.wiredAmountGnf)}</td>
                    <td>{formatGnf(s.expectedNetGnf)}</td>
                    <td style={{ color: s.periodDeltaGnf < 0 ? '#b45309' : undefined }}>
                      {formatGnf(s.periodDeltaGnf)}
                    </td>
                    <td>{s.bankReference ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
