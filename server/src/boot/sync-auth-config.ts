const PROJECT_REF = 'eeyhtulpixvftvhppinz';
const CALLBACK_URL = 'https://api.theloop-app.com/auth/callback';
const EDGE_CALLBACK = `https://${PROJECT_REF}.supabase.co/functions/v1/auth-callback`;

let lastAuthConfigSyncAt = 0;
const AUTH_CONFIG_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Aligne site_url + redirect URLs Supabase Auth (Management API).
 * Nécessite SUPABASE_ACCESS_TOKEN sur Render — sans token, no-op.
 */
export async function syncSupabaseAuthConfigIfNeeded(force = false): Promise<void> {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) return;
  if (!parseBool(process.env.ENABLE_AUTH_CONFIG_SYNC, true)) return;

  const now = Date.now();
  if (!force && now - lastAuthConfigSyncAt < AUTH_CONFIG_SYNC_INTERVAL_MS) return;

  const uriAllowList = [
    CALLBACK_URL,
    EDGE_CALLBACK,
    'https://admin.theloop-app.com/auth-callback.html',
    'https://eeyhtulpixvftvhppinz.supabase.co/storage/v1/object/public/app-public/auth/auth-callback.html',
    'theloop://auth/callback',
    'theloop://**',
    'exp://**',
  ].join(',');

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      site_url: CALLBACK_URL,
      uri_allow_list: uriAllowList,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.warn('[auth-sync] PATCH auth config échoué:', res.status, text.slice(0, 300));
    return;
  }

  lastAuthConfigSyncAt = now;
  console.log('[auth-sync] Supabase Auth site_url →', CALLBACK_URL);
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'yes') return true;
  return fallback;
}
