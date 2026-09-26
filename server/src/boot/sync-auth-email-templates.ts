const PROJECT_REF = 'eeyhtulpixvftvhppinz';
const CALLBACK_URL = 'https://api.theloop-app.com/auth/callback';

let lastEmailTemplateSyncAt = 0;
const EMAIL_TEMPLATE_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Aligne les templates invite / recovery / confirmation (liens token_hash → auth-callback).
 * Nécessite SUPABASE_ACCESS_TOKEN sur Render.
 */
export async function syncAuthEmailTemplatesIfNeeded(force = false): Promise<void> {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) return;
  if (!parseBool(process.env.ENABLE_AUTH_EMAIL_TEMPLATE_SYNC, true)) return;

  const now = Date.now();
  if (!force && now - lastEmailTemplateSyncAt < EMAIL_TEMPLATE_SYNC_INTERVAL_MS) return;

  const { dirname, join } = await import('node:path');
  const { fileURLToPath, pathToFileURL } = await import('node:url');
  const modulePath = join(dirname(fileURLToPath(import.meta.url)), '../../../scripts/auth-email-template-bodies.mjs');
  const { buildAuthEmailTemplatePatch } = await import(pathToFileURL(modulePath).href);
  const body = buildAuthEmailTemplatePatch(CALLBACK_URL);

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.warn('[auth-sync] PATCH e-mail templates échoué:', res.status, text.slice(0, 300));
    return;
  }

  lastEmailTemplateSyncAt = now;
  console.log('[auth-sync] Templates Auth (invite token_hash) synchronisés');
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'yes') return true;
  return fallback;
}
