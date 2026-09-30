/**
 * Active ou désactive INVITE_REQUIRE_EMAIL_CODE sur les Edge Functions Supabase.
 * Windows : .\configure-invite-require-email-code.cmd
 * Env : SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)
 *
 * Usage :
 *   node scripts/set-invite-require-email-code.mjs true
 *   node scripts/set-invite-require-email-code.mjs false
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const projectRef = 'eeyhtulpixvftvhppinz';

function readToken() {
  const fromEnv = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const envPath = join(root, 'server', '.env');
  if (!existsSync(envPath)) return null;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}

const raw = (process.argv[2] ?? 'true').trim().toLowerCase();
const enabled = raw === 'true' || raw === '1' || raw === 'on';
const value = enabled ? 'true' : 'false';

const token = readToken();
if (!token) {
  console.error('Token manquant. Définissez SUPABASE_ACCESS_TOKEN ou ajoutez-le dans server/.env');
  process.exit(1);
}

const url = `https://api.supabase.com/v1/projects/${projectRef}/secrets`;
const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify([{ name: 'INVITE_REQUIRE_EMAIL_CODE', value }]),
});

const text = await res.text();
if (!res.ok) {
  console.error('Échec', res.status, text);
  if (res.status === 401 || res.status === 403) {
    console.error('');
    console.error('Token refusé : même Access Token que configure-auth-invite-email.cmd');
    console.error('(https://supabase.com/dashboard/account/tokens — sbp_…, pas anon/service_role).');
  }
  process.exit(1);
}

console.log(`OK — INVITE_REQUIRE_EMAIL_CODE=${value}`);
console.log('Effet immédiat sur member-activate-invite (sans redéploiement du secret).');
console.log('Vérifier (nom + date, pas la valeur) : node scripts/verify-invite-edge-config.mjs');
if (enabled) {
  console.log('Les invités doivent saisir le code reçu par e-mail (build 57+ · UX 2 étapes).');
  console.log('Redeploy Edge si besoin : node scripts/deploy-edge-invite-functions.mjs');
  console.log('Modèle e-mail recovery (code 6 chiffres) : .\\configure-auth-invite-email.cmd');
} else {
  console.log('ATTENTION : false désactive la protection — réservé rollback temporaire.');
}
