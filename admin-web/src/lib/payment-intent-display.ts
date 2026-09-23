/** Aligné sur server/src/services/reconcile-payment-summary.ts */
export function isDjomyAbandonedStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? '').trim().toUpperCase();
  return (
    normalized === 'REDIRECTED' ||
    normalized === 'EXPIRED' ||
    normalized === 'CREATED' ||
    normalized === 'INITIATED' ||
    normalized === 'INIT'
  );
}

export function isDjomyPaidStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? '').trim().toUpperCase();
  return normalized === 'SUCCESS' || normalized === 'CAPTURED';
}

/** Texte sous le bouton Resync — selon le cas réel, pas un message générique. */
export function resyncHintForIntent(intent: {
  status: string;
  djomyStatus?: string | null;
}): string {
  const dj = intent.djomyStatus?.trim() ?? '';

  if (isDjomyAbandonedStatus(dj)) {
    return 'Portail quitté sans paiement — aucun débit. Resync confirme chez Djomy et met la ligne à jour.';
  }

  if (isDjomyPaidStatus(dj)) {
    return 'Débit confirmé côté Djomy — resync sert à activer ou vérifier le PASS.';
  }

  if (intent.status === 'cancelled' || intent.status === 'failed') {
    return 'Commande sans débit confirmé.';
  }

  if (intent.status === 'redirected' && !dj) {
    return 'Portail ouvert — resync interroge Djomy (abandon ou paiement en cours).';
  }

  return 'Interroge Djomy pour actualiser le statut de cette commande.';
}

export type PaymentAttemptKind =
  | 'completed'
  | 'abandoned'
  | 'awaiting_operator'
  | 'awaiting_fulfillment'
  | 'in_progress'
  | 'incident';

export function classifyPaymentAttempt(intent: {
  status: string;
  fulfillmentStatus?: string | null;
  djomyStatus?: string | null;
}): PaymentAttemptKind {
  if (intent.fulfillmentStatus === 'fulfilled') return 'completed';
  if (intent.fulfillmentStatus === 'failed') return 'incident';
  if (intent.status === 'cancelled' || intent.status === 'failed') return 'abandoned';
  if (isDjomyAbandonedStatus(intent.djomyStatus)) return 'abandoned';
  if (isDjomyPaidStatus(intent.djomyStatus)) return 'awaiting_fulfillment';
  const dj = String(intent.djomyStatus ?? '').toUpperCase();
  if (dj === 'PENDING' || dj === 'PROCESSING') return 'awaiting_operator';
  if (intent.status === 'redirected' || intent.status === 'created') return 'in_progress';
  return 'in_progress';
}

export function paymentAttemptBadgeLabel(kind: PaymentAttemptKind): string {
  switch (kind) {
    case 'completed':
      return 'PASS activé';
    case 'abandoned':
      return 'Sans débit';
    case 'awaiting_fulfillment':
      return 'Payé · sync PASS';
    case 'awaiting_operator':
      return 'Paiement en cours';
    case 'incident':
      return 'Incident PASS';
    default:
      return 'En cours';
  }
}

export function isAbandonedPaymentAttempt(intent: {
  status: string;
  fulfillmentStatus?: string | null;
  djomyStatus?: string | null;
}): boolean {
  return classifyPaymentAttempt(intent) === 'abandoned';
}

export function paymentIntentStatusLabel(status: string): string {
  switch (status) {
    case 'redirected':
      return 'Portail ouvert';
    case 'cancelled':
      return 'Annulé / non finalisé';
    case 'paid':
      return 'Payé';
    case 'failed':
      return 'Échoué';
    case 'created':
      return 'Créé';
    default:
      return status;
  }
}
