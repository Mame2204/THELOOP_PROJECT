/** Rafraîchir badge sidebar + compteurs hub Demandes (sans recharger toute la page). */
export const DEMANDES_COUNTS_EVENT = 'loop-admin-demandes-counts-changed';

export function notifyDemandesCountsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(DEMANDES_COUNTS_EVENT));
}
