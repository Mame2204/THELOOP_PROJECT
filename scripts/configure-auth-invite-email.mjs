/**
 * Configure Supabase Auth : templates invite / recovery / confirmation + redirect URLs.
 *
 * Usage: SUPABASE_ACCESS_TOKEN=xxx node scripts/configure-auth-invite-email.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAuthEmailTemplatePatch } from './auth-email-template-bodies.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const projectRef = 'eeyhtulpixvftvhppinz';
const callbackUrl = 'https://api.theloop-app.com/auth/callback';
const edgeCallbackUrl = `https://${projectRef}.supabase.co/functions/v1/auth-callback`;
const legacyCallbackUrl = 'https://admin.theloop-app.com/auth-callback.html';
const storageCallbackUrl = `https://${projectRef}.supabase.co/storage/v1/object/public/app-public/auth/auth-callback.html`;

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
  console.error('Token manquant : SUPABASE_ACCESS_TOKEN ou server/.env');
  console.error('https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

const body = {
  ...buildAuthEmailTemplatePatch(callbackUrl),
  uri_allow_list: [
    callbackUrl,
    edgeCallbackUrl,
    legacyCallbackUrl,
    storageCallbackUrl,
    'theloop://auth/callback',
    'theloop://**',
    'exp://**',
    'https://theloop-app.com/auth/callback',
    'https://www.theloop-app.com/auth/callback',
    'https://admin.theloop-app.com/auth-callback.html',
  ].join(','),
};

console.log('PATCH auth config…');
const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const text = await res.text();
if (!res.ok) {
  console.error('Echec', res.status, text);
  process.exit(1);
}

console.log('OK — templates invite / confirmation / recovery (liens token_hash)');
console.log('Site URL :', callbackUrl);
