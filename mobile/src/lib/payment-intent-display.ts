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

export function resyncHintForIntent(intent: {
  status: string;
  djomyStatus?: string | null;
}): string {
  const dj = intent.djomyStatus?.trim() ?? '';

  if (isDjomyAbandonedStatus(dj)) {
    return 'Portail quitté sans paiement — aucun débit. Resync confirme chez Djomy.';
  }

  if (isDjomyPaidStatus(dj)) {
    return 'Débit confirmé côté Djomy — resync active ou vérifie le PASS.';
  }

  if (intent.status === 'cancelled' || intent.status === 'failed') {
    return 'Commande sans débit confirmé.';
  }

  if (intent.status === 'redirected' && !dj) {
    return 'Portail ouvert — resync interroge Djomy.';
  }

  return 'Interroge Djomy pour actualiser le statut.';
}
