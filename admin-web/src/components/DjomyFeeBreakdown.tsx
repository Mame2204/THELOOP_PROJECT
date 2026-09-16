import {
  DJOMY_COMMERCIAL_NOTES,
  DJOMY_FEE_GRID_DATE,
  DJOMY_PAY_IN_FEES,
  estimateDjomyPayInFee,
  formatGnf,
} from '../lib/djomy-fees';

type Props = {
  amountGnf: number;
  paymentMethod?: string;
  compact?: boolean;
};

export function DjomyFeeBreakdown({
  amountGnf,
  paymentMethod = 'all',
  compact = false,
}: Props) {
  const estimate = estimateDjomyPayInFee(amountGnf, paymentMethod);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <p className="brand-kicker" style={{ margin: '0 0 4px' }}>
        Frais Djomy (Pay In)
      </p>
      <p className="meta" style={{ margin: '0 0 12px' }}>
        Grille en vigueur au {DJOMY_FEE_GRID_DATE.replace(/-/g, '/')} — estimatif selon le moyen
        choisi sur le portail Djomy.
      </p>

      {!compact ? (
        <div className="table-wrap" style={{ marginBottom: 12 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Moyen de paiement</th>
                <th>Commission Pay In</th>
              </tr>
            </thead>
            <tbody>
              {DJOMY_PAY_IN_FEES.map((row) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td>
                    {row.available && row.ratePercent != null
                      ? `${row.ratePercent.toLocaleString('fr-FR')} %`
                      : (row.note ?? '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div style={{ borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: 10 }}>
        <p style={{ margin: '0 0 4px' }}>
          <strong>Montant PASS :</strong> {formatGnf(amountGnf)}
        </p>
        <p className="meta" style={{ margin: '0 0 4px' }}>
          Commission Djomy : {estimate.rateLabel}
        </p>
        {estimate.feeGnf != null && estimate.netGnf != null ? (
          <>
            <p className="meta" style={{ margin: '0 0 4px' }}>
              Frais estimés : {formatGnf(estimate.feeGnf)}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Net marchand estimé :</strong> {formatGnf(estimate.netGnf)}
            </p>
          </>
        ) : estimate.feeRangeGnf ? (
          <p style={{ margin: 0 }}>
            <strong>Frais estimés :</strong> {formatGnf(estimate.feeRangeGnf[0])} –{' '}
            {formatGnf(estimate.feeRangeGnf[1])}
          </p>
        ) : null}
      </div>

      {!compact ? (
        <ul className="meta" style={{ margin: '12px 0 0', paddingLeft: 18 }}>
          {DJOMY_COMMERCIAL_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function formatPaymentFeeSummary(
  amountGnf: number,
  paymentMethod: string | null | undefined,
): { feeLabel: string; netLabel: string } {
  const paid = Math.max(0, Math.round(amountGnf));
  const fee = estimateDjomyPayInFee(paid, paymentMethod ?? 'all');
  if (fee.feeGnf != null && fee.netGnf != null) {
    return {
      feeLabel: `${formatGnf(fee.feeGnf)} (${fee.rateLabel})`,
      netLabel: formatGnf(fee.netGnf),
    };
  }
  if (fee.feeRangeGnf) {
    return {
      feeLabel: `${formatGnf(fee.feeRangeGnf[0])} – ${formatGnf(fee.feeRangeGnf[1])}`,
      netLabel: '—',
    };
  }
  return { feeLabel: '—', netLabel: '—' };
}
