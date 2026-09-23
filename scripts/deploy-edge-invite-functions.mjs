/**
 * Déploie auth-callback + admin-send-invite via Supabase Management API (sans supabase login).
 * Windows : .\deploy-edge-invite.cmd
 * Env : SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const projectRef = 'eeyhtulpixvftvhppinz';

const FUNCTIONS = [
  { slug: 'auth-callback', verify_jwt: false },
  { slug: 'admin-send-invite', verify_jwt: true },
];

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

async function deployOne(token, { slug, verify_jwt }) {
  const fnPath = join(root, 'supabase', 'functions', slug, 'index.ts');
  if (!existsSync(fnPath)) {
    console.error('Fichier introuvable:', fnPath);
    return false;
  }
  const source = readFileSync(fnPath);
  const metadata = JSON.stringify({
    name: slug,
    entrypoint_path: 'index.ts',
    verify_jwt,
  });
  const form = new FormData();
  form.append('metadata', metadata);
  form.append('file', new Blob([source], { type: 'application/typescript' }), 'index.ts');
  const deployUrl = `https://api.supabase.com/v1/projects/${projectRef}/functions/deploy?slug=${slug}`;
  console.log('Déploiement', slug, '…');
  const res = await fetch(deployUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('Échec', slug, res.status, text);
    return false;
  }
  const publicUrl = `https://${projectRef}.supabase.co/functions/v1/${slug}`;
  console.log('OK', publicUrl);
  return true;
}

const token = readToken();
if (!token) {
  console.error('Token manquant. Définissez SUPABASE_ACCESS_TOKEN ou ajoutez-le dans server/.env');
  console.error('Créez un token : https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

let ok = true;
for (const fn of FUNCTIONS) {
  const success = await deployOne(token, fn);
  if (!success) ok = false;
}

if (!ok) process.exit(1);

console.log('\nEnsuite (optionnel) : .\\configure-auth-invite-email.cmd pour synchroniser les modèles e-mail.');
console.log('Test : .\\test-auth-invite-urls.cmd');
