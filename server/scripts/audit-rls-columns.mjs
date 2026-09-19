/**
 * Detail des anomalies remontees par audit-rls.mjs : quelles COLONNES fuient
 * reellement, et vers qui.
 *
 * Les valeurs personnelles ne sont jamais affichees : on ne montre que le nom
 * de la colonne et si elle est renseignee.
 *
 * Usage (depuis la racine) :
 *   .\.tools\node\node.exe server\scripts\audit-rls-columns.mjs
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

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Colonnes dont la fuite est un probleme de vie privee ou de securite. */
const PII = new Set([
  'email', 'phone', 'phone_number', 'birth_date', 'full_name', 'first_name', 'last_name',
  'address', 'latitude', 'longitude', 'push_token', 'device_id', 'ip_address',
  'password', 'secret', 'token', 'api_key',
]);

function describe(row) {
  return Object.entries(row).map(([k, v]) => {
    const filled = v !== null && v !== undefined && v !== '';
    const flag = PII.has(k) ? ' <-- DONNEE PERSONNELLE' : '';
    return `    ${k.padEnd(28)} ${filled ? 'renseigne' : 'vide'}${flag}`;
  });
}

async function probe(label, client, table, limit = 1) {
  const { data, error } = await client.from(table).select('*').limit(limit);
  console.log(`\n  [${label}] ${table}`);
  if (error) {
    console.log(`    bloque — ${error.code ?? ''} ${error.message.slice(0, 80)}`);
    return null;
  }
  if (!data?.length) {
    console.log('    aucune ligne visible');
    return [];
  }
  console.log(`    ${data.length} ligne(s) lisible(s), colonnes :`);
  describe(data[0]).forEach((l) => console.log(l));
  return data;
}

async function main() {
  const email = `audit-col-${Date.now()}@theloop-test.invalid`;
  const password = `Audit!${Math.random().toString(36).slice(2, 10)}A1`;
  const created = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { first_name: 'Audit', last_name: 'Col', country_code: 'GN' },
  });
  if (created.error) { console.error(created.error.message); process.exit(1); }
  const userId = created.data.user.id;

  const member = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await member.auth.signInWithPassword({ email, password });

  console.log('=== 1. Table users — que lit un membre lambda ? ===');
  const others = await member
    .from('users')
    .select('*')
    .neq('id', userId)
    .limit(1);
  if (others.error) {
    console.log(`  bloque — ${others.error.message.slice(0, 80)}`);
  } else if (!others.data?.length) {
    console.log('  Un membre ne voit que sa propre ligne.');
  } else {
    console.log(`  FUITE : un membre lit la fiche d'AUTRES comptes. Colonnes exposees :`);
    describe(others.data[0]).forEach((l) => console.log(l));
  }

  console.log('\n=== 2. app_settings — que lit un visiteur anonyme ? ===');
  const settings = await anon.from('app_settings').select('*');
  if (settings.error) {
    console.log(`  bloque — ${settings.error.message.slice(0, 80)}`);
  } else {
    console.log(`  ${settings.data.length} cle(s) lisible(s) sans aucun compte :`);
    for (const row of settings.data) {
      const key = row.key ?? row.setting_key ?? row.id ?? '?';
      const raw = JSON.stringify(row.value ?? row.setting_value ?? row);
      console.log(`    ${String(key).padEnd(34)} ${raw.length} octets`);
    }
  }

  console.log('\n=== 3. partnership_requests — pourquoi un membre en voit-il ? ===');
  await probe('membre', member, 'partnership_requests', 2);

  console.log('\n=== 4. home_poll_votes — les votes sont-ils nominatifs ? ===');
  await probe('anonyme', anon, 'home_poll_votes', 1);

  console.log('\n=== 5. Contenu public : un visiteur non connecte voit-il le catalogue ? ===');
  for (const t of ['events', 'establishments', 'tools']) {
    const { count, error } = await anon.from(t).select('*', { count: 'exact', head: true });
    console.log(`  ${t.padEnd(18)} ${error ? `bloque (${error.code})` : `${count} ligne(s)`}`);
  }

  await admin.auth.admin.deleteUser(userId);
  console.log('\nCompte de test supprime.');
}

main().catch((e) => { console.error(e); process.exit(1); });
