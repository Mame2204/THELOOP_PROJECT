import { StyleSheet, Text, View } from 'react-native';
import {
  DJOMY_COMMERCIAL_NOTES,
  DJOMY_FEE_GRID_DATE,
  DJOMY_PAY_IN_FEES,
  estimateDjomyPayInFee,
  formatGnf,
} from '@/lib/djomy-fees';

type Shell = {
  pageTitle: string;
  pageKicker: string;
  filterInactiveBorder: string;
  filterInactiveBg: string;
};

type Props = {
  amountGnf: number;
  paymentMethod?: string;
  shell: Shell;
  accentColor?: string;
  compact?: boolean;
};

export function DjomyFeeBreakdown({
  amountGnf,
  paymentMethod = 'all',
  shell,
  accentColor = '#12A8BC',
  compact = false,
}: Props) {
  const estimate = estimateDjomyPayInFee(amountGnf, paymentMethod);

  return (
    <View style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
      <Text style={[styles.kicker, { color: accentColor }]}>Frais Djomy (Pay In)</Text>
      <Text style={[styles.meta, { color: shell.pageKicker }]}>
        Grille en vigueur au {DJOMY_FEE_GRID_DATE.replace(/-/g, '/')} — estimatif, selon le moyen choisi sur le portail.
      </Text>

      {!compact ? (
        <View style={styles.table}>
          {DJOMY_PAY_IN_FEES.map((row) => (
            <View key={row.id} style={[styles.tableRow, { borderColor: shell.filterInactiveBorder }]}>
              <Text style={[styles.tableLabel, { color: shell.pageTitle }]}>{row.label}</Text>
              <Text style={[styles.tableValue, { color: row.available ? shell.pageTitle : shell.pageKicker }]}>
                {row.available && row.ratePercent != null
                  ? `${row.ratePercent.toLocaleString('fr-FR')} %`
                  : (row.note ?? '—')}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.estimateBox, { borderColor: shell.filterInactiveBorder }]}>
        <Text style={[styles.estimateLine, { color: shell.pageTitle }]}>
          Montant PASS : {formatGnf(amountGnf)}
        </Text>
        <Text style={[styles.estimateLine, { color: shell.pageKicker }]}>
          Commission Djomy : {estimate.rateLabel}
        </Text>
        {estimate.feeGnf != null && estimate.netGnf != null ? (
          <>
            <Text style={[styles.estimateLine, { color: shell.pageKicker }]}>
              Frais estimés : {formatGnf(estimate.feeGnf)}
            </Text>
            <Text style={[styles.estimateLine, { color: shell.pageTitle, fontWeight: '700' }]}>
              Net marchand estimé : {formatGnf(estimate.netGnf)}
            </Text>
          </>
        ) : estimate.feeRangeGnf ? (
          <Text style={[styles.estimateLine, { color: shell.pageTitle, fontWeight: '600' }]}>
            Frais estimés : {formatGnf(estimate.feeRangeGnf[0])} – {formatGnf(estimate.feeRangeGnf[1])}
          </Text>
        ) : null}
      </View>

      {!compact ? (
        <View style={styles.notes}>
          {DJOMY_COMMERCIAL_NOTES.map((note) => (
            <Text key={note} style={[styles.note, { color: shell.pageKicker }]}>
              · {note}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase' },
  meta: { fontSize: 11, lineHeight: 16 },
  table: { gap: 0 },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  tableLabel: { flex: 1, fontSize: 12 },
  tableValue: { fontSize: 12, fontWeight: '700' },
  estimateBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 4 },
  estimateLine: { fontSize: 12, lineHeight: 18 },
  notes: { gap: 2 },
  note: { fontSize: 10, lineHeight: 15 },
});
