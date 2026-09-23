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
