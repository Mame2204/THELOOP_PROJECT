/**
 * Audit RLS en lecture — table par table, sur la base reelle.
 *
 * Pour chaque table exposee par PostgREST, on compte les lignes visibles :
 *   - en visiteur anonyme (cle anon, aucune session)
 *   - avec une vraie session membre jetable
 *   - en service_role (verite terrain)
 *
 * Seuls des COUNT sont emis (head: true) : aucune donnee n'est transferee,
 * aucune ecriture n'est tentee.
 *
 * Usage (depuis la racine) :
 *   .\.tools\node\node.exe server\scripts\audit-rls.mjs
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
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, eq).trim()] = v;
  }
  return out;
}

const mobileEnv = loadEnvFile('mobile/.env');
const serverEnv = loadEnvFile('server/.env');

const SUPABASE_URL = mobileEnv.EXPO_PUBLIC_SUPABASE_URL || serverEnv.SUPABASE_URL;
const ANON_KEY = mobileEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = serverEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Variables manquantes : mobile/.env (URL + ANON) et server/.env (SERVICE_ROLE).');
  process.exit(1);
}

/**
 * Tables dont le contenu est personnel, financier ou sensible : toute lecture
 * anonyme y est une fuite, et une lecture membre doit rester limitee a ses
 * propres lignes.
 */
const SENSITIVE = new Set([
  'users',
  'user_pass_grants',
  'prime_benefit_grants',
  'payment_intents',
  'payment_transactions',
  'user_notifications',
  'user_favorites',
  'user_devices',
  'push_tokens',
  'referrals',
  'referral_rewards',
  'admin_invitations',
  'admin_audit_log',
  'partner_tokens',
  'admin_automation_jobs',
]);

// app_settings est volontairement public : tarifs, catalogue PASS et libelles
// doivent etre lisibles avant toute connexion. Verifie cle par cle, aucun secret.

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function listTables() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const spec = await res.json();
  return Object.keys(spec.definitions ?? {}).sort();
}

/** Compte les lignes visibles, sans rapatrier de donnees. */
async function visibleCount(client, table) {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
  if (error) return { blocked: true, reason: error.code || error.message.slice(0, 40), count: 0 };
  return { blocked: false, count: count ?? 0 };
}

function cell(r) {
  if (r.blocked) return 'bloque';
  return r.count === 0 ? '0' : String(r.count);
}

async function main() {
  const tables = await listTables();
  console.log(`=== Audit RLS en lecture — ${tables.length} tables exposees ===\n`);

  // --- Session membre jetable -------------------------------------------------
  const email = `audit-rls-${Date.now()}@theloop-test.invalid`;
  const password = `Audit!${Math.random().toString(36).slice(2, 10)}A1`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: 'Audit', last_name: 'RLS', country_code: 'GN' },
  });
  if (created.error) {
    console.error('Impossible de creer le compte de test :', created.error.message);
    process.exit(1);
  }
  const userId = created.data.user.id;

  const member = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await member.auth.signInWithPassword({ email, password });
  if (signIn.error) {
    console.error('Connexion du compte de test impossible :', signIn.error.message);
    await admin.auth.admin.deleteUser(userId);
    process.exit(1);
  }

  const leaks = [];
  const rows = [];

  for (const table of tables) {
    const truth = await visibleCount(admin, table);
    const a = await visibleCount(anon, table);
    const m = await visibleCount(member, table);

    rows.push({ table, truth, a, m });

    const total = truth.count;
    const sensitive = SENSITIVE.has(table);

    if (sensitive && !a.blocked && a.count > 0) {
      leaks.push({ level: 'CRITIQUE', table, detail: `visiteur anonyme lit ${a.count} ligne(s) sur ${total}` });
    } else if (sensitive && !m.blocked && m.count > 1) {
      // Un membre peut legitimement voir sa propre ligne ; au-dela c'est suspect.
      leaks.push({ level: 'A VERIFIER', table, detail: `membre lambda lit ${m.count} ligne(s) sur ${total}` });
    }
  }

  const pad = Math.max(...rows.map((r) => r.table.length)) + 2;
  console.log(`${'TABLE'.padEnd(pad)}${'TOTAL'.padStart(8)}${'ANON'.padStart(10)}${'MEMBRE'.padStart(10)}   SENSIBLE`);
  console.log('-'.repeat(pad + 40));
  for (const r of rows) {
    console.log(
      `${r.table.padEnd(pad)}${cell(r.truth).padStart(8)}${cell(r.a).padStart(10)}${cell(r.m).padStart(10)}   ${SENSITIVE.has(r.table) ? 'oui' : ''}`,
    );
  }

  console.log('\n=== Anomalies ===\n');
  if (!leaks.length) {
    console.log('Aucune fuite de lecture detectee sur les tables sensibles.');
  } else {
    for (const l of leaks) console.log(`[${l.level}] ${l.table} — ${l.detail}`);
  }

  // --- Tables non sensibles entierement ouvertes en ecriture ? ----------------
  console.log('\n=== Tables ouvertes en lecture anonyme ===\n');
  const openToAnon = rows.filter((r) => !r.a.blocked && r.a.count > 0).map((r) => r.table);
  console.log(openToAnon.length ? openToAnon.join(', ') : 'aucune');

  await admin.auth.admin.deleteUser(userId);
  console.log('\nCompte de test supprime.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
