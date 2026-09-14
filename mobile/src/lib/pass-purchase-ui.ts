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
