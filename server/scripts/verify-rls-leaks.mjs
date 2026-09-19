/**
 * Verifie que la migration 20260932 ferme les trois fuites de lecture, sans
 * casser les acces legitimes (profil personnel, console admin, scan QR).
 *
 * Deux comptes jetables sont crees (un membre, un admin) puis supprimes.
 *
 * Usage (depuis la racine) :
 *   .\.tools\node\node.exe server\scripts\verify-rls-leaks.mjs
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

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
const ok = (name, detail = '') => {
  results.push(true);
  console.log(`OK    ${name}${detail ? ` — ${detail}` : ''}`);
};
const ko = (name, detail = '') => {
  results.push(false);
  console.error(`ECHEC ${name}${detail ? ` — ${detail}` : ''}`);
};

const stamp = Date.now();
const created = [];

async function makeAccount(role) {
  const email = `verif-rls-${role}-${stamp}@theloop-test.invalid`;
  const password = `Verif!${Math.random().toString(36).slice(2, 10)}A1`;
  const res = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: 'Verif', last_name: role, country_code: 'GN' },
  });
  if (res.error) throw new Error(`creation ${role} : ${res.error.message}`);
  const id = res.data.user.id;
  created.push(id);

  if (role !== 'member') {
    const up = await admin.from('users').update({ user_role: role }).eq('id', id);
    if (up.error) throw new Error(`promotion ${role} : ${up.error.message}`);
  }

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`connexion ${role} : ${signIn.error.message}`);
  return { id, client };
}

async function main() {
  const member = await makeAccount('member');
  const adminUser = await makeAccount('admin');

  // --- 1. users : fuite de fiches et du secret QR -----------------------------
  const others = await member.client.from('users').select('id').neq('id', member.id);
  if (others.error || (others.data ?? []).length === 0) {
    ok('users — un membre ne lit plus les autres fiches');
  } else {
    ko('users — FUITE PERSISTANTE', `${others.data.length} fiche(s) tierce(s) lisibles`);
  }

  const token = await member.client
    .from('users')
    .select('id, qr_code_token')
    .neq('id', member.id)
    .not('qr_code_token', 'is', null);
  if (token.error || (token.data ?? []).length === 0) {
    ok('users — le secret du QR tournant n\'est plus lisible');
  } else {
    ko('users — SECRET QR EXPOSE', `${token.data.length} jeton(s) lisibles — usurpation possible`);
  }

  const own = await member.client.from('users').select('id, qr_code_token').eq('id', member.id).maybeSingle();
  if (!own.error && own.data?.id === member.id && own.data.qr_code_token) {
    ok('users — le membre lit toujours son propre profil et son QR');
  } else {
    ko('users — profil personnel casse', own.error?.message ?? 'ligne ou jeton absent');
  }

  const asAdmin = await adminUser.client.from('users').select('id', { count: 'exact', head: true });
  if (!asAdmin.error && (asAdmin.count ?? 0) > 1) {
    ok('users — la console admin garde la vue complete', `${asAdmin.count} fiches`);
  } else {
    ko('users — console admin cassee', asAdmin.error?.message ?? 'aucune fiche visible');
  }

  // --- 2. home_poll_votes : numeros de telephone ------------------------------
  const votesAnon = await anon.from('home_poll_votes').select('voter_phone');
  if (votesAnon.error || (votesAnon.data ?? []).length === 0) {
    ok('home_poll_votes — plus lisible sans compte');
  } else {
    ko('home_poll_votes — FUITE PERSISTANTE', `${votesAnon.data.length} vote(s) lisibles en anonyme`);
  }

  const votesMember = await member.client.from('home_poll_votes').select('voter_phone');
  const foreign = (votesMember.data ?? []).length;
  if (votesMember.error || foreign === 0) {
    ok('home_poll_votes — un membre ne lit pas les votes des autres');
  } else {
    ko('home_poll_votes — votes tiers lisibles', `${foreign} ligne(s)`);
  }

  // --- 3. Le sondage fonctionne toujours via l'agregat ------------------------
  const { data: poll } = await admin
    .from('home_polls')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!poll?.id) {
    console.log('INFO  aucun sondage actif — agregat non testable');
  } else {
    const agg = await anon.rpc('get_home_poll_results', { p_poll_id: poll.id, p_phone_id: null });
    if (agg.error) {
      ko('get_home_poll_results — appel anonyme', agg.error.message);
    } else if (agg.data && typeof agg.data === 'object' && 'counts' in agg.data) {
      ok('get_home_poll_results — resultats agreges accessibles', `total ${agg.data.total}`);
    } else {
      ko('get_home_poll_results — reponse inattendue', JSON.stringify(agg.data).slice(0, 80));
    }

    const aggSelf = await member.client.rpc('get_home_poll_results', { p_poll_id: poll.id });
    if (!aggSelf.error && aggSelf.data && 'userOptionId' in aggSelf.data) {
      ok('get_home_poll_results — vote personnel resolu cote serveur');
    } else {
      ko('get_home_poll_results — session membre', aggSelf.error?.message ?? 'champ manquant');
    }
  }

  // --- 4. partnership_requests ------------------------------------------------
  const reqMember = await member.client.from('partnership_requests').select('email');
  if (reqMember.error || (reqMember.data ?? []).length === 0) {
    ok('partnership_requests — ferme aux membres');
  } else {
    ko('partnership_requests — FUITE PERSISTANTE', `${reqMember.data.length} candidature(s) lisibles`);
  }

  const reqAdmin = await adminUser.client.from('partnership_requests').select('id', { count: 'exact', head: true });
  if (!reqAdmin.error) {
    ok('partnership_requests — l\'administration garde l\'acces', `${reqAdmin.count} candidature(s)`);
  } else {
    ko('partnership_requests — acces admin casse', reqAdmin.error.message);
  }

  // --- 5. Scan QR : la voie serveur reste complete ----------------------------
  const scan = await anon.rpc('verify_member_qr_partner', { p_payload: 'LOOP-AAAAAAAA-1-BBBBBBBBBB' });
  if (scan.error) {
    ko('verify_member_qr_partner — fonction indisponible', scan.error.message);
  } else {
    ok('verify_member_qr_partner — toujours appelable sans lire la table');
  }

  for (const id of created) await admin.auth.admin.deleteUser(id);
  console.log('\nComptes de test supprimes.');

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} verifications reussies.`);
  if (failed) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err);
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => {});
  process.exit(1);
});
