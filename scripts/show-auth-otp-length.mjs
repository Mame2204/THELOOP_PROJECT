/**
 * Affiche mailer_otp_length (Supabase Auth) pour diagnostiquer 6 vs 8 chiffres.
 * Usage : SUPABASE_ACCESS_TOKEN=… node scripts/show-auth-otp-length.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
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

const token = readToken();
if (!token) {
  console.error('Token manquant (SUPABASE_ACCESS_TOKEN ou server/.env)');
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
  headers: { Authorization: `Bearer ${token}` },
});
const text = await res.text();
if (!res.ok) {
  console.error('Échec', res.status, text);
  process.exit(1);
}
const cfg = JSON.parse(text);
console.log('mailer_otp_length:', cfg.mailer_otp_length ?? '(non renseigné)');
console.log('mailer_otp_exp:', cfg.mailer_otp_exp ?? '(non renseigné)');
