import { mapAuthEmailSyncError } from '@/lib/auth-login';
import { supabase } from '@/lib/supabase';

/** API backend THE LOOP (admin, sync profil…) — distincte du flux paiement. */
const BACKEND_API_URL = (
  process.env.EXPO_PUBLIC_BACKEND_API_URL ??
  process.env.EXPO_PUBLIC_PAYMENT_API_URL ??
  ''
).replace(/\/$/, '');

export function isAdminBackendConfigured(): boolean {
  return Boolean(BACKEND_API_URL && !BACKEND_API_URL.includes('your-payment-api'));
}

async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Synchronise auth.users quand l'admin modifie l'e-mail d'un membre. */
export async function syncUserEmailViaBackend(
  userId: string,
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isAdminBackendConfigured()) {
    return { ok: false, error: 'Backend admin non configuré (EXPO_PUBLIC_BACKEND_API_URL).' };
  }

  const token = await getAccessToken();
  if (!token) {
    return { ok: false, error: 'Session administrateur requise.' };
  }

  let response: Response;
  try {
    response = await fetch(`${BACKEND_API_URL}/api/admin/sync-user-email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, email }),
    });
  } catch {
    return { ok: false, error: 'Impossible de joindre le backend THE LOOP.' };
  }

  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    const code = typeof body.error === 'string' ? body.error : 'Échec synchronisation Auth.';
    return { ok: false, error: mapAuthEmailSyncError(code) };
  }

  return { ok: true };
}
