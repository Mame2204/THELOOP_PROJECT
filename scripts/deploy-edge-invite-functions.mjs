/**
 * Déploie auth-callback + admin-send-invite + member-activate-invite via Supabase Management API.
 * Windows : .\deploy-edge-invite.cmd
 * Une seule fonction : node scripts/deploy-edge-invite-functions.mjs member-activate-invite
 * Env : SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const projectRef = 'eeyhtulpixvftvhppinz';

const ESM_IMPORT = "from 'https://esm.sh/@supabase/supabase-js@2.49.1'";
const NPM_IMPORT = "from 'npm:@supabase/supabase-js@2.49.1'";

const FUNCTIONS = [
  { slug: 'auth-callback', verify_jwt: false },
  { slug: 'admin-send-invite', verify_jwt: true },
  { slug: 'member-activate-invite', verify_jwt: false },
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Payload uploadé : npm: au lieu de esm.sh (bundler Supabase plus fiable). */
function prepareDeploySource(fnPath) {
  const raw = readFileSync(fnPath, 'utf8');
  return raw.replace(ESM_IMPORT, NPM_IMPORT);
}

async function deployOne(token, { slug, verify_jwt }) {
  const fnPath = join(root, 'supabase', 'functions', slug, 'index.ts');
  if (!existsSync(fnPath)) {
    console.error('Fichier introuvable:', fnPath);
    return false;
  }
  const bundleCheck = spawnSync(
    'npx',
    ['esbuild', fnPath, '--bundle', '--platform=neutral', '--log-level=error'],
    { encoding: 'utf8' },
  );
  if (bundleCheck.status !== 0) {
    console.error('Syntaxe / bundle invalide pour', slug);
    console.error(bundleCheck.stderr || bundleCheck.stdout);
    return false;
  }
  const source = prepareDeploySource(fnPath);
  const metadata = JSON.stringify({
    name: slug,
    entrypoint_path: 'index.ts',
    verify_jwt,
  });
  const deployUrl = `https://api.supabase.com/v1/projects/${projectRef}/functions/deploy?slug=${slug}`;
  const retryDelaysMs = [0, 3000, 8000, 15000];

  for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
    if (retryDelaysMs[attempt] > 0) {
      console.log('Nouvelle tentative', slug, `(dans ${retryDelaysMs[attempt] / 1000}s)…`);
      await sleep(retryDelaysMs[attempt]);
    }
    const form = new FormData();
    form.append('metadata', metadata);
    form.append('file', new Blob([source], { type: 'application/typescript' }), 'index.ts');
    console.log('Déploiement', slug, attempt === 0 ? '…' : `(essai ${attempt + 1})…`);
    const res = await fetch(deployUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const text = await res.text();
    if (res.ok) {
      const publicUrl = `https://${projectRef}.supabase.co/functions/v1/${slug}`;
      console.log('OK', publicUrl);
      return true;
    }
    const retryable = res.status >= 500 || res.status === 429;
    console.error('Échec', slug, res.status, text.slice(0, 500));
    if (!retryable || attempt === retryDelaysMs.length - 1) {
      if (res.status >= 500) {
        console.error(
          '\nErreur serveur Supabase (souvent temporaire). Réessayez dans 2–3 min, ou :',
        );
        console.error('  node scripts/deploy-edge-invite-functions.mjs', slug);
        console.error(
          '  Dashboard → Edge Functions →',
          slug,
          '→ redeploy / supabase functions deploy',
          slug,
        );
      }
      return false;
    }
  }
  return false;
}

const onlySlug = process.argv[2]?.trim();
const toDeploy = onlySlug ? FUNCTIONS.filter((f) => f.slug === onlySlug) : FUNCTIONS;
if (onlySlug && toDeploy.length === 0) {
  console.error('Fonction inconnue:', onlySlug);
  console.error('Slugs:', FUNCTIONS.map((f) => f.slug).join(', '));
  process.exit(1);
}

const token = readToken();
if (!token) {
  console.error('Token manquant. Définissez SUPABASE_ACCESS_TOKEN ou ajoutez-le dans server/.env');
  console.error('Créez un token : https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

let ok = true;
for (const fn of toDeploy) {
  const success = await deployOne(token, fn);
  if (!success) ok = false;
}

if (!ok) process.exit(1);

console.log('\nEnsuite :');
console.log('  .\\configure-auth-invite-email.cmd — modèles e-mail (code {{ .Token }} dans recovery)');
console.log('  .\\configure-invite-require-email-code.cmd — activer INVITE_REQUIRE_EMAIL_CODE (build 54+)');
console.log('  .\\test-auth-invite-urls.cmd');
