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
    return [
      'Djomy indique que ce paiement n’a pas été finalisé (portail ouvert, pas de débit).',
      `Statut Djomy : ${djomy}.`,
      'Ce n’est pas la ligne à resync si vous avez payé sur une autre tentative — comparez la date et l’ID transaction Djomy.',
    ].join(' ');
  }

  if (isDjomyInFlightStatus(after.djomy_status ?? undefined)) {
    return `Paiement encore en cours côté Djomy (${djomy}). Réessayez le resync dans quelques minutes.`;
  }

  if (after.last_checked_at) {
    return `Vérification Djomy effectuée. Statut Djomy : ${djomy}. Aucun changement côté PASS (déjà à jour ou non payé).`;
  }

  return `Statut Djomy : ${djomy}.`;
}
