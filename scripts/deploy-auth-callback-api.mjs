/**
 * Deploie auth-callback via Supabase Management API (sans supabase login).
 * Usage (Windows) : .\deploy-auth-callback.cmd  (auth-callback seul)
 * Usage (Windows, les deux fonctions invite) : .\deploy-edge-invite.cmd
 * Usage (Linux/mac) : node scripts/deploy-auth-callback-api.mjs
 * Env: SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const projectRef = 'eeyhtulpixvftvhppinz';
const slug = 'auth-callback';
const fnPath = join(root, 'supabase', 'functions', 'auth-callback', 'index.ts');

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
  console.error('Token manquant. Definissez SUPABASE_ACCESS_TOKEN ou ajoutez-le dans server/.env');
  console.error('Creez un token : https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

if (!existsSync(fnPath)) {
  console.error('Fichier introuvable:', fnPath);
  process.exit(1);
}

const source = readFileSync(fnPath);
const metadata = JSON.stringify({
  name: 'auth-callback',
  entrypoint_path: 'index.ts',
  verify_jwt: false,
});

const form = new FormData();
form.append('metadata', metadata);
form.append('file', new Blob([source], { type: 'application/typescript' }), 'index.ts');

const deployUrl = `https://api.supabase.com/v1/projects/${projectRef}/functions/deploy?slug=${slug}`;
console.log('Deploiement', slug, '...');

const res = await fetch(deployUrl, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});

const text = await res.text();
if (!res.ok) {
  console.error('Echec', res.status, text);
  process.exit(1);
}

const publicUrl = `https://${projectRef}.supabase.co/functions/v1/${slug}`;
console.log('OK', publicUrl);

const check = await fetch(publicUrl, { method: 'GET' });
console.log('Test GET', check.status, check.headers.get('content-type'));
if (!check.ok) {
  console.warn('La fonction repond', check.status, '- attendez quelques secondes puis retestez.');
}
