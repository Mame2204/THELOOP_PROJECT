/**
 * Vérifie que les URLs d’activation pointent bien vers l’API Render (pas l’Edge bloquée).
 * Usage: node scripts/test-auth-invite-urls.mjs
 */
const API = 'https://api.theloop-app.com/auth/callback';
const EDGE = 'https://eeyhtulpixvftvhppinz.supabase.co/functions/v1/auth-callback';
const STORAGE =
  'https://eeyhtulpixvftvhppinz.supabase.co/storage/v1/object/public/app-public/auth/auth-callback.html';

async function check(label, url, expect) {
  const res = await fetch(url, { redirect: 'manual' });
  const text = res.status >= 300 && res.status < 400 ? '' : await res.text();
  const location = res.headers.get('location') ?? '';
  let ok = false;
  let detail = `HTTP ${res.status}`;
  if (expect === 'redirect-api') {
    ok = res.status >= 300 && res.status < 400 && location.startsWith(API);
    detail = ok ? `302 → ${location.slice(0, 80)}…` : `attendu redirect ${API}, got ${location || res.status}`;
  }
  if (expect === 'api-incomplet') {
    ok = text.includes('Lien incomplet') && !text.includes('<h1 id="title">Chargement…</h1>');
    detail = ok ? 'HTML « Lien incomplet » (API à jour)' : 'HTML API obsolète ou erreur';
  }
  if (expect === 'api-preboot') {
    ok = text.includes('PREBOOT_SESSION') || text.includes('Activer votre compte');
    detail = ok ? 'preboot / activation OK' : 'pas de preboot serveur';
  }
  console.log(ok ? 'PASS' : 'FAIL', label, '—', detail);
  return ok;
}

let pass = 0;
const total = 4;
if (await check('API sans params', API, 'api-incomplet')) pass += 1;
if (await check('API token_hash fake', `${API}?token_hash=fake&type=invite`, 'api-preboot')) pass += 1;
if (await check('Edge → redirect API', `${EDGE}?token_hash=x&type=invite`, 'redirect-api')) pass += 1;
if (await check('Storage redirect', `${STORAGE}?token_hash=x&type=invite`, 'redirect-api')) pass += 1;

console.log(`\n${pass}/${total} checks OK`);
process.exit(pass === total ? 0 : 1);
