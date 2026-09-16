import { useCallback, useEffect, useState } from 'react';
import {
  createBankPayout,
  fetchBankPayoutReconciliation,
  fetchBankPayouts,
  type BankPayoutRecord,
  type PayoutReconciliationSummary,
} from '../lib/api';
import { paymentMethodLabel } from '../lib/payment-labels';
import { DJOMY_PAY_IN_FEES } from '../lib/djomy-fees';

const METHOD_OPTIONS = [
  { id: 'all', label: 'Tous moyens (lot global)' },
  ...DJOMY_PAY_IN_FEES.filter((row) => row.available).map((row) => ({
    id: row.id,
    label: row.label,
  })),
];

type LineDraft = {
  paymentMethod: string;
  wiredAmountGnf: string;
  periodStart: string;
  periodEnd: string;
};

function emptyLine(): LineDraft {
  return { paymentMethod: 'orange_money', wiredAmountGnf: '', periodStart: '', periodEnd: '' };
}

function formatGnf(value: number): string {
  return `${value.toLocaleString('fr-FR')} GNF`;
}

type Props = {
  countryCode: string;
  analyticsDays: number;
};

export function PaymentPayoutPanel({ countryCode, analyticsDays }: Props) {
  const [payoutDate, setPayoutDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bankReference, setBankReference] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [payouts, setPayouts] = useState<BankPayoutRecord[]>([]);
  const [reconciliation, setReconciliation] = useState<PayoutReconciliationSummary | null>(null);

  const reload = useCallback(async () => {
    const [payoutRes, reconRes] = await Promise.all([
      fetchBankPayouts(),
      fetchBankPayoutReconciliation({ countryCode, days: analyticsDays }),
    ]);
    if (payoutRes.payouts) setPayouts(payoutRes.payouts);
    if (reconRes.summary) setReconciliation(reconRes.summary);
  }, [analyticsDays, countryCode]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);

    const payloadLines = lines
      .map((line) => ({
        paymentMethod: line.paymentMethod,
        wiredAmountGnf: Number(line.wiredAmountGnf.replace(/\s/g, '')),
        periodStart: line.periodStart || null,
        periodEnd: line.periodEnd || null,
      }))
      .filter((line) => line.wiredAmountGnf > 0);

    const res = await createBankPayout({
      payoutDate,
      bankReference: bankReference.trim() || null,
      notes: notes.trim() || null,
      lines: payloadLines,
    });

    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Enregistrement impossible.');
      return;
    }

    setSuccess('Versement bancaire enregistré.');
    setBankReference('');
    setNotes('');
    setLines([emptyLine()]);
    void reload();
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 4px' }}>Versements bancaires Djomy (Retrait / virement)</h3>
      <p className="meta" style={{ margin: '0 0 16px' }}>
        Pay In = collecte PASS côté client · Retrait = virement sur votre compte (J+2). Saisissez ici
        le montant réellement viré pour réconcilier avec le net estimé par moyen de paiement.
      </p>

      {reconciliation ? (
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Moyen</th>
                <th>Encaissé (brut)</th>
                <th>Frais est.</th>
                <th>Net est.</th>
                <th>Viré (saisi)</th>
                <th>Écart</th>
              </tr>
            </thead>
            <tbody>
              {reconciliation.byPaymentMethod.map((row) => (
                <tr key={row.paymentMethod}>
                  <td>{paymentMethodLabel(row.paymentMethod)}</td>
                  <td>{formatGnf(row.grossVolumeGnf)}</td>
                  <td>{formatGnf(row.estimatedFeeGnf)}</td>
                  <td>{formatGnf(row.estimatedNetGnf)}</td>
                  <td>{row.wiredRecordedGnf ? formatGnf(row.wiredRecordedGnf) : '—'}</td>
                  <td style={{ color: row.deltaGnf < 0 ? '#b45309' : row.deltaGnf > 0 ? '#047857' : undefined }}>
                    {row.wiredRecordedGnf ? formatGnf(row.deltaGnf) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Total ({reconciliation.periodDays} j)</th>
                <th>{formatGnf(reconciliation.totals.grossVolumeGnf)}</th>
                <th>{formatGnf(reconciliation.totals.estimatedFeeGnf)}</th>
                <th>{formatGnf(reconciliation.totals.estimatedNetGnf)}</th>
                <th>{formatGnf(reconciliation.totals.wiredRecordedGnf)}</th>
                <th>{formatGnf(reconciliation.totals.deltaGnf)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}

      <form onSubmit={(e) => void handleSubmit(e)}>
        <div className="form-grid" style={{ marginBottom: 12 }}>
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
              placeholder="Ex. VIR-DJOMY-2026-09"
            />
          </label>
        </div>

        {lines.map((line, index) => (
          <div key={index} className="form-grid" style={{ marginBottom: 8, alignItems: 'end' }}>
            <label>
              Moyen de paiement
              <select
                value={line.paymentMethod}
                onChange={(e) => updateLine(index, { paymentMethod: e.target.value })}
              >
                {METHOD_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Montant viré (GNF)
              <input
                type="number"
                min={1}
                step={1}
                value={line.wiredAmountGnf}
                onChange={(e) => updateLine(index, { wiredAmountGnf: e.target.value })}
                placeholder="850000"
                required={index === 0}
              />
            </label>
            <label>
              Période début
              <input
                type="date"
                value={line.periodStart}
                onChange={(e) => updateLine(index, { periodStart: e.target.value })}
              />
            </label>
            <label>
              Période fin
              <input
                type="date"
                value={line.periodEnd}
                onChange={(e) => updateLine(index, { periodEnd: e.target.value })}
              />
            </label>
            {lines.length > 1 ? (
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
              >
                Retirer
              </button>
            ) : null}
          </div>
        ))}

        <div className="edit-actions" style={{ marginBottom: 12 }}>
          <button type="button" className="btn ghost small" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
            + Ligne (autre moyen)
          </button>
        </div>

        <label style={{ display: 'block', marginBottom: 12 }}>
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Ex. Versement hebdo Djomy — lot du 10/09"
          />
        </label>

        {error ? <p className="error-text">{error}</p> : null}
        {success ? <p className="meta" style={{ color: '#047857' }}>{success}</p> : null}

        <button type="submit" className="btn small" disabled={busy}>
          {busy ? 'Enregistrement…' : 'Enregistrer le virement'}
        </button>
      </form>

      {payouts.length ? (
        <div style={{ marginTop: 20 }}>
          <h4 style={{ margin: '0 0 8px' }}>Historique des virements saisis</h4>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Réf.</th>
                  <th>Détail par moyen</th>
                  <th>Total viré</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout.id}>
                    <td>{payout.payoutDate}</td>
                    <td>{payout.bankReference ?? '—'}</td>
                    <td>
                      {payout.lines.map((line) => (
                        <div key={line.id} className="meta">
                          {paymentMethodLabel(line.paymentMethod)} : {formatGnf(line.wiredAmountGnf)}
                        </div>
                      ))}
                    </td>
                    <td>{formatGnf(payout.totalWiredGnf)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
