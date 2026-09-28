import type { AppGates } from '@/lib/app-gates-store';
import { DEFAULT_APP_GATES } from '@/lib/app-gates-store';

/**
 * Visibilité UI achat PASS / Djomy.
 * Source de vérité : gate remote `app_gates.passPurchaseEnabled` (super admin).
 * Défaut OFF — activable sans rebuild une fois ce code embarqué.
 */
export function isPassPurchaseUiEnabled(gates?: Pick<AppGates, 'passPurchaseEnabled'> | null): boolean {
  return Boolean(gates?.passPurchaseEnabled ?? DEFAULT_APP_GATES.passPurchaseEnabled);
}

/** Privilèges affichés sur les fiches / cartes — gate `app_gates.privilegesVisible`, indépendant de l’achat PASS. */
export function isPrivilegesUiEnabled(gates?: Pick<AppGates, 'privilegesVisible'> | null): boolean {
  return Boolean(gates?.privilegesVisible ?? DEFAULT_APP_GATES.privilegesVisible);
}
