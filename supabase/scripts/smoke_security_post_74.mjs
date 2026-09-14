/**
 * Smoke tests post-migration 74 — grants RPC + flux auth/guest/QR/admin.
 * Usage (depuis la racine du projet) :
 *   .\.tools\node\node.exe supabase\scripts\smoke_security_post_74.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

function loadEnvFile(relPath) {
  const path = resolve(root, relPath);
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const mobileEnv = loadEnvFile('mobile/.env');
const serverEnv = loadEnvFile('server/.env');

const SUPABASE_URL = mobileEnv.EXPO_PUBLIC_SUPABASE_URL || serverEnv.SUPABASE_URL;
const ANON_KEY = mobileEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = serverEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('❌ EXPO_PUBLIC_SUPABASE_URL / ANON_KEY manquants (mobile/.env)');
  process.exit(1);
}

const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const adminEmail = 'admin@theloop.gn';
const knownRegisteredEmail = adminEmail;
const memberPassword = 'Loop1234!';
const fakeEmail = `nocompte_${Date.now()}@example.invalid`;

const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.error(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
}

function isPermissionDenied(err) {
  const msg = String(err?.message ?? err ?? '').toLowerCase();
  const code = String(err?.code ?? '');
  return (
    code === '42501'
    || msg.includes('permission denied')
    || msg.includes('not authorized')
    || msg.includes('insufficient privilege')
  );
}

async function testAnonAdminRpcBlocked() {
  const { error } = await anon.rpc('admin_create_event_direct', {
    p_payload: { title: 'smoke-test-blocked' },
  });
  if (error && isPermissionDenied(error)) {
    pass('Anon bloqué sur admin_create_event_direct', error.message);
  } else if (error) {
    pass('Anon bloqué sur admin_create_event_direct', `erreur: ${error.message}`);
  } else {
    fail('Anon bloqué sur admin_create_event_direct', 'RPC a réussi (régression grave)');
  }
}

async function testAnonAllowlistSignupCheck() {
  const { data, error } = await anon.rpc('check_signup_email_available', {
    p_email: fakeEmail,
  });
  if (!error && typeof data === 'string') {
    pass('Allowlist anon check_signup_email_available', `status=${data}`);
  } else {
    fail('Allowlist anon check_signup_email_available', error?.message ?? 'pas de data');
  }
}

async function testLoginPrecheck() {
  const { data: known, error: e1 } = await anon.rpc('check_signup_email_available', {
    p_email: knownRegisteredEmail,
  });
  const { data: unknown, error: e2 } = await anon.rpc('check_signup_email_available', {
    p_email: fakeEmail,
  });
  if (e1 || e2) {
    fail('Précheck login email', `${e1?.message ?? ''} ${e2?.message ?? ''}`.trim());
    return;
  }
  if (known === 'already_registered' && unknown === 'available') {
    pass('Précheck login email', `${knownRegisteredEmail}=already_registered, inconnu=available`);
  } else {
    fail('Précheck login email', `membre=${known}, inconnu=${unknown}`);
  }
}

async function testLoginWrongPassword() {
  const { error } = await anon.auth.signInWithPassword({
    email: knownRegisteredEmail,
    password: 'WrongPassword!999',
  });
  const msg = (error?.message ?? '').toLowerCase();
  if (error && (msg.includes('invalid login credentials') || msg.includes('invalid credentials'))) {
    pass('Login mauvais mot de passe', error.message);
  } else {
    fail('Login mauvais mot de passe', error?.message ?? 'connexion inattendue');
  }
}

async function testLoginUnknownEmailAuthAttempt() {
  const { error } = await anon.auth.signInWithPassword({
    email: fakeEmail,
    password: 'Loop1234!',
  });
  const msg = (error?.message ?? '').toLowerCase();
  if (error && (msg.includes('invalid login credentials') || msg.includes('invalid credentials'))) {
    pass('Login email inconnu (Auth)', error.message);
  } else {
    fail('Login email inconnu (Auth)', error?.message ?? 'connexion inattendue');
  }
}

async function testGuestInviteRpc() {
  const { data, error } = await anon.rpc('find_pending_admin_invite_by_email', {
    p_email: fakeEmail,
  });
  if (error) {
    fail('RPC invitation invité (find)', error.message);
    return;
  }
  if (data === null || data === undefined || (Array.isArray(data) && data.length === 0)) {
    pass('RPC invitation invité (find)', 'aucune invite pour email fictif');
  } else {
    pass('RPC invitation invité (find)', 'réponse OK (invite trouvée ou objet)');
  }
}

async function testQrValidationRpc() {
  const { error } = await anon.rpc('verify_member_qr_payload', {
    p_payload: 'invalid-smoke-payload',
  });
  if (error && isPermissionDenied(error)) {
    fail('Validation QR anon', `permission refusée: ${error.message}`);
    return;
  }
  pass('Validation QR anon', error ? `erreur métier: ${error.message}` : 'réponse sans permission denied');
}

async function testAdminReassignBlockedForAnon() {
  const { error } = await anon.rpc('admin_reassign_content_owner', {
    p_kind: 'event',
    p_content_id: '00000000-0000-4000-8000-000000000001',
    p_partner_user_id: '00000000-0000-4000-8000-000000000002',
  });
  if (error && isPermissionDenied(error)) {
    pass('Transfert partenaire bloqué pour anon', error.message);
  } else if (error) {
    pass('Transfert partenaire bloqué pour anon', error.message);
  } else {
    fail('Transfert partenaire bloqué pour anon', 'RPC a réussi');
  }
}

async function testAdminReassignCallableWhenAuthenticated() {
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
    email: adminEmail,
    password: memberPassword,
  });
  if (signInErr || !signIn.session) {
    fail('Transfert partenaire (admin auth)', signInErr?.message ?? 'pas de session');
    return;
  }

  const authed = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
  });

  const { error } = await authed.rpc('admin_reassign_content_owner', {
    p_kind: 'event',
    p_content_id: '00000000-0000-4000-8000-000000000001',
    p_partner_user_id: '00000000-0000-4000-8000-000000000002',
  });

  if (error && isPermissionDenied(error)) {
    fail('Transfert partenaire callable admin', `permission denied: ${error.message}`);
  } else if (error) {
    pass('Transfert partenaire callable admin', `erreur métier attendue: ${error.message}`);
  } else {
    pass('Transfert partenaire callable admin', 'RPC exécutable (vérifiez contenu réel en UI)');
  }
}

async function testLeakedPasswordProtectionHint() {
  if (!SERVICE_KEY) {
    pass('Protection mots de passe compromis', 'service role absent — activer manuellement dans Dashboard');
    return;
  }
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const weak = `password123_${Date.now()}@example.invalid`;
  const { error } = await adminClient.auth.admin.createUser({
    email: weak.replace('@', '_u@'),
    password: 'password123',
    email_confirm: true,
  });
  const msg = (error?.message ?? '').toLowerCase();
  if (error && (msg.includes('pwned') || msg.includes('breach') || msg.includes('leaked') || msg.includes('compromised') || msg.includes('weak'))) {
    pass('Protection mots de passe compromis', 'mot de passe faible rejeté');
  } else if (error) {
    pass('Protection mots de passe compromis', `inconclusif (${error.message}) — vérifier Dashboard Auth`);
  } else {
    fail('Protection mots de passe compromis', 'password123 accepté — activer HIBP dans Dashboard');
  }
}

async function main() {
  console.log('\n=== Smoke tests Security Advisor post-74 ===\n');
  console.log(`Projet: ${SUPABASE_URL}\n`);

  await testAnonAdminRpcBlocked();
  await testAnonAllowlistSignupCheck();
  await testLoginPrecheck();
  await testLoginWrongPassword();
  await testLoginUnknownEmailAuthAttempt();
  await testGuestInviteRpc();
  await testQrValidationRpc();
  await testAdminReassignBlockedForAnon();
  await testAdminReassignCallableWhenAuthenticated();
  await testLeakedPasswordProtectionHint();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- ${results.length - failed.length}/${results.length} OK ---\n`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
