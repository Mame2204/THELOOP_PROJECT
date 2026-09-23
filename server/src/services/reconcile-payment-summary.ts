import type { PaymentIntentRow } from '../lib/supabase-admin.js';

/** Statuts Djomy = portail ouvert, débit jamais confirmé (verify). */
export function isDjomyAbandonedStatus(status: string | undefined): boolean {
  const normalized = String(status ?? '').trim().toUpperCase();
  return (
    normalized === 'REDIRECTED' ||
    normalized === 'EXPIRED' ||
    normalized === 'CREATED' ||
    normalized === 'INITIATED' ||
    normalized === 'INIT'
  );
}

export function isDjomyPaidStatus(status: string | undefined): boolean {
  const normalized = String(status ?? '').trim().toUpperCase();
  return normalized === 'SUCCESS' || normalized === 'CAPTURED';
}

/** Paiement mobile money encore en cours côté opérateur. */
export function isDjomyInFlightStatus(status: string | undefined): boolean {
  const normalized = String(status ?? '').trim().toUpperCase();
  return (
    normalized === 'PENDING' ||
    normalized === 'PROCESSING' ||
    normalized === 'IN_PROGRESS' ||
    normalized === 'AWAITING_CONFIRMATION'
  );
}

/** Commande sans débit confirmé — ne doit pas compter comme « bloquée PASS ». */
export function isTerminalWithoutPass(intent: Pick<PaymentIntentRow, 'status' | 'djomy_status'>): boolean {
  if (intent.status === 'cancelled' || intent.status === 'failed') return true;
  return isDjomyAbandonedStatus(intent.djomy_status ?? undefined);
}

/** Débit Djomy confirmé mais PASS pas encore activé. */
export function isPaidButPassPending(
  intent: Pick<PaymentIntentRow, 'status' | 'fulfillment_status' | 'djomy_status'>,
): boolean {
  if (intent.fulfillment_status !== 'pending') return false;
  if (intent.status === 'paid') return true;
  return isDjomyPaidStatus(intent.djomy_status ?? undefined);
}

/** Intent payé côté Djomy, PASS pending, sans activité depuis plus de 5 min (analytics + cron). */
export function isStuckPendingFulfillment(
  intent: Pick<
    PaymentIntentRow,
    'status' | 'fulfillment_status' | 'djomy_status' | 'djomy_transaction_id' | 'updated_at'
  >,
  updatedBeforeIso: string,
): boolean {
  const tx = intent.djomy_transaction_id?.trim() ?? '';
  if (!tx || tx.startsWith('sandbox-force-')) return false;
  if (!intent.updated_at || intent.updated_at >= updatedBeforeIso) return false;
  if (!isPaidButPassPending(intent)) return false;
  if (isTerminalWithoutPass(intent)) return false;
  return true;
}

export function buildReconcileSummary(
  before: Pick<PaymentIntentRow, 'status' | 'fulfillment_status' | 'djomy_status'>,
  after: Pick<
    PaymentIntentRow,
    'status' | 'fulfillment_status' | 'djomy_status' | 'last_checked_at' | 'paid_at'
  >,
): string {
  const djomy = (after.djomy_status ?? before.djomy_status ?? '').trim() || '—';

  if (after.fulfillment_status === 'fulfilled' && before.fulfillment_status !== 'fulfilled') {
    return `PASS activé. Djomy : ${djomy}.`;
  }

  if (after.fulfillment_status === 'failed' && before.fulfillment_status !== 'failed') {
    return `Paiement reçu mais activation PASS en échec. Djomy : ${djomy}. Voir incidents fulfillment.`;
  }

  if (after.status === 'paid' && before.status !== 'paid') {
    return `Paiement confirmé côté Djomy (${djomy}). Activation PASS en cours ou terminée.`;
  }

  if (
    (after.status === 'cancelled' || after.status === 'failed') &&
    before.status !== after.status
  ) {
    return `Aucun débit confirmé pour cette commande. Djomy : ${djomy}.`;
  }

  if (isDjomyAbandonedStatus(after.djomy_status ?? undefined)) {
    return `Paiement non finalisé (Djomy : ${djomy}) — aucun débit. Si vous avez payé ailleurs, ouvrez l’autre ligne (date / n° transaction).`;
  }

  if (isDjomyInFlightStatus(after.djomy_status ?? undefined)) {
    return `Paiement encore en cours côté Djomy (${djomy}). Réessayez le resync dans quelques minutes.`;
  }

  if (after.last_checked_at) {
    return `Vérification Djomy effectuée. Statut Djomy : ${djomy}. Aucun changement côté PASS (déjà à jour ou non payé).`;
  }

  return `Statut Djomy : ${djomy}.`;
}
