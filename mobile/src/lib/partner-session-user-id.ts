import { loadPartnerSpotSession } from '@/lib/partner-session-store';
import { resolvePartnerUserIdForSync } from '@/lib/partner-user-resolve';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function resolveTargetPartnerUserId(
  partnerId?: string | null,
  partnerName?: string | null,
): Promise<string | null> {
  const session = await loadPartnerSpotSession();
  const rawId = partnerId?.trim() || session?.user?.id?.trim() || '';
  const name =
    partnerName?.trim()
    || session?.user?.company?.trim()
    || session?.user?.fullName?.trim()
    || '';

  const resolved = await resolvePartnerUserIdForSync(rawId || null, name || null);
  if (resolved && isUuid(resolved)) return resolved;
  if (rawId && isUuid(rawId)) return rawId;
  return null;
}

/**
 * UUID effectif pour l'espace Pro partenaire (compte connecté e-mail / mot de passe ou session SPOT legacy).
 */
export async function resolveEffectivePartnerUserId(
  partnerId?: string | null,
  partnerName?: string | null,
): Promise<string | null> {
  const session = await loadPartnerSpotSession();
  const targetFromParams = await resolveTargetPartnerUserId(partnerId, partnerName);

  if (isSupabaseConfigured() && supabase) {
    const { data: authData } = await supabase.auth.getUser();
    const authId = authData.user?.id;

    if (authId && isUuid(authId)) {
      // Connexion e-mail / mot de passe : auth.uid() prime toujours
      if (!session?.tokenCode) {
        return authId;
      }
      if (targetFromParams && targetFromParams !== authId) {
        return targetFromParams;
      }
      return authId;
    }
  }

  return targetFromParams;
}

/** Résolution explicite d'un partenaire cible (admin, catalogue, pickers) — jamais auth.uid() par défaut. */
export async function resolveExplicitPartnerUserId(
  partnerId: string,
  partnerName?: string | null,
): Promise<string | null> {
  return resolveTargetPartnerUserId(partnerId, partnerName);
}
