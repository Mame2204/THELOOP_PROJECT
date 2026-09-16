/** Grille tarifaire Djomy Pay In (collecte) — document juin 2026. */

export const DJOMY_FEE_GRID_DATE = '2026-06-03';

export interface DjomyPayInFeeRow {
  id: string;
  label: string;
  ratePercent: number | null;
  available: boolean;
  note?: string;
}

/** Tarifs Pay In applicables aux achats PASS THE LOOP. */
export const DJOMY_PAY_IN_FEES: DjomyPayInFeeRow[] = [
  { id: 'orange_money', label: 'Orange Money', ratePercent: 1.5, available: true },
  { id: 'paycard', label: 'PayCard', ratePercent: 1.5, available: true },
  { id: 'mtn_momo', label: 'MTN MoMo', ratePercent: 1.5, available: true },
  { id: 'kulu', label: 'Kulu', ratePercent: 1.5, available: true },
  { id: 'soutra_money', label: 'Soutra Money', ratePercent: 1.5, available: true },
  { id: 'wave', label: 'Wave', ratePercent: null, available: false, note: 'Bientôt disponible' },
  { id: 'ks_wallet', label: 'KS Wallet', ratePercent: null, available: false, note: 'Bientôt disponible' },
  { id: 'card', label: 'Carte bancaire (Visa, Mastercard)', ratePercent: 1.8, available: true },
];

export const DJOMY_COMMERCIAL_NOTES = [
  'Aucun frais d’activation, d’abonnement ni d’intégration API.',
  'Frais facturés uniquement sur les transactions réussies (Pay In).',
  'Versement marchand : J+2 ouvré max., virement bancaire gratuit.',
] as const;

const WALLET_RATE = 1.5;
const CARD_RATE = 1.8;

export function resolveDjomyPayInRatePercent(paymentMethod: string): number | null {
  const method = paymentMethod.trim().toLowerCase();
  if (!method || method === 'all') return null;
  if (method === 'card') return CARD_RATE;
  if (
    method === 'orange_money'
    || method === 'mtn_momo'
    || method === 'paycard'
    || method === 'soutra_money'
    || method === 'kulu'
  ) {
    return WALLET_RATE;
  }
  return WALLET_RATE;
}

export function mapDjomyGatewayMethodToApp(method: string | undefined | null): string | null {
  if (!method?.trim()) return null;
  const m = method.trim().toUpperCase();
  if (m === 'OM') return 'orange_money';
  if (m === 'MOMO') return 'mtn_momo';
  if (m === 'SOUTRA_MONEY') return 'soutra_money';
  if (m === 'PAYCARD') return 'paycard';
  if (m === 'CARD') return 'card';
  return method.toLowerCase();
}

export interface DjomyFeeEstimate {
  ratePercent: number | null;
  rateLabel: string;
  feeGnf: number | null;
  netGnf: number | null;
  feeRangeGnf: [number, number] | null;
}

export function estimateDjomyPayInFee(amountGnf: number, paymentMethod: string): DjomyFeeEstimate {
  const amount = Math.max(0, Math.round(amountGnf));
  const rate = resolveDjomyPayInRatePercent(paymentMethod);
  if (rate == null) {
    const low = Math.round(amount * WALLET_RATE / 100);
    const high = Math.round(amount * CARD_RATE / 100);
    return {
      ratePercent: null,
      rateLabel: '1,5 % – 1,8 % (selon moyen choisi sur Djomy)',
      feeGnf: null,
      netGnf: null,
      feeRangeGnf: [low, high],
    };
  }
  const feeGnf = Math.round(amount * rate / 100);
  return {
    ratePercent: rate,
    rateLabel: `${rate.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`,
    feeGnf,
    netGnf: amount - feeGnf,
    feeRangeGnf: null,
  };
}

export function formatGnf(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} GNF`;
}
