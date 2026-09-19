/**
 * Vérifie que la migration 20260928 ferme réellement les deux élévations de
 * privilèges, en jouant l'attaque depuis une vraie session membre.
 *
 * Le script crée un compte jetable, tente les exploits, vérifie que les usages
 * légitimes passent toujours, puis supprime le compte.
 *
 * Usage (depuis la racine) :
 *   .\.tools\node\node.exe server\scripts\verify-privilege-lock.mjs
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

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Variables manquantes : mobile/.env (URL + ANON) et server/.env (SERVICE_ROLE).');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
const ok = (name, detail = '') => {
  results.push({ ok: true, name });
  console.log(`OK    ${name}${detail ? ` — ${detail}` : ''}`);
};
const ko = (name, detail = '') => {
  results.push({ ok: false, name });
  console.error(`ECHEC ${name}${detail ? ` — ${detail}` : ''}`);
};

const email = `verif-lock-${Date.now()}@theloop-test.invalid`;
const password = `Verif!${Math.random().toString(36).slice(2, 10)}A1`;
let userId = null;

async function main() {
  // --- Compte jetable --------------------------------------------------------
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: 'Verif',
      last_name: 'Lock',
      user_role: 'member',
      country_code: 'GN',
      phone_number: `+2246${String(Date.now()).slice(-8)}`,
    },
  });
  if (created.error) {
    ko('Création du compte de test', created.error.message);
    return;
  }
  userId = created.data.user.id;
  ok('Compte de test créé', email);

  const { data: profile } = await admin
    .from('users')
    .select('user_role')
    .eq('id', userId)
    .maybeSingle();
  if (profile?.user_role !== 'member') {
    ko('Le compte de test doit être un simple membre', `rôle = ${profile?.user_role}`);
  } else {
    ok('Le compte de test est bien un simple membre');
  }

  // --- Session membre réelle -------------------------------------------------
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) {
    ko('Connexion au compte de test', signIn.error.message);
    return;
  }
  ok('Connexion au compte de test');

  // --- EXPLOIT 1 : auto-promotion super admin --------------------------------
  const promote = await client
    .from('users')
    .update({ user_role: 'super_admin' })
    .eq('id', userId)
    .select('user_role');

  const { data: afterPromote } = await admin
    .from('users')
    .select('user_role')
    .eq('id', userId)
    .maybeSingle();

  if (afterPromote?.user_role === 'member') {
    ok('Exploit 1 bloqué — auto-promotion super admin', promote.error?.message ?? 'aucune ligne modifiée');
  } else {
    ko('Exploit 1 PASSE — le compte est devenu', String(afterPromote?.user_role));
  }

  // --- EXPLOIT 1bis : passage en prime ---------------------------------------
  await client.from('users').update({ user_role: 'prime' }).eq('id', userId);
  const { data: afterPrime } = await admin
    .from('users')
    .select('user_role')
    .eq('id', userId)
    .maybeSingle();
  if (afterPrime?.user_role === 'member') {
    ok('Exploit 1bis bloqué — passage en prime sans PASS');
  } else {
    ko('Exploit 1bis PASSE — rôle devenu', String(afterPrime?.user_role));
  }

  // --- EXPLOIT 2 : auto-octroi d'un avantage ---------------------------------
  const grant = await client.rpc('upsert_prime_benefit_grant', {
    p_local_id: `verif-lock-${Date.now()}`,
    p_user_id: userId,
    p_title: 'Avantage obtenu sans autorisation',
    p_description: 'Test de sécurité',
    p_partner_name: 'Test',
    p_status: 'active',
    p_granted_at: new Date().toISOString(),
    p_expires_at: null,
    p_used_at: null,
    p_grant_audience: 'individual',
    p_grant_country_code: 'GN',
    p_grant_city: null,
    p_catalog_local_id: null,
    p_role_entitlement: null,
  });
  if (grant.error) {
    ok('Exploit 2 bloqué — auto-octroi d\'avantage', grant.error.message);
  } else {
    ko('Exploit 2 PASSE — octroi créé', String(grant.data));
  }

  // --- EXPLOIT 2bis : identifiant conforme mais avantage non ouvert au rôle ---
  const { data: catalog } = await admin
    .from('benefit_catalog')
    .select('local_id')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (catalog?.local_id) {
    const crafted = await client.rpc('upsert_prime_benefit_grant', {
      p_local_id: `role-ben-${userId}-${catalog.local_id}-prime`,
      p_user_id: userId,
      p_title: 'Privilege Prime vole',
      p_description: 'Test',
      p_partner_name: 'Test',
      p_status: 'active',
      p_granted_at: new Date().toISOString(),
      p_expires_at: null,
      p_used_at: null,
      p_grant_audience: 'role',
      p_grant_country_code: 'GN',
      p_grant_city: null,
      p_catalog_local_id: catalog.local_id,
      p_role_entitlement: 'prime',
    });
    if (crafted.error) {
      ok('Exploit 2bis bloqué — un membre réclame un droit Prime', crafted.error.message);
    } else {
      ko('Exploit 2bis PASSE — droit Prime auto-octroyé');
    }
  }

  // --- REGRESSION 1 : modifier son profil doit toujours marcher --------------
  const profileUpdate = await client
    .from('users')
    .update({ city: 'Conakry', updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (profileUpdate.error) {
    ko('Régression — modification du profil refusée', profileUpdate.error.message);
  } else {
    ok('Régression OK — le membre modifie toujours son profil');
  }

  // --- REGRESSION 2 : la RPC de synchronisation de rôle répond ---------------
  const syncRole = await client.rpc('sync_my_pass_role', { p_desired: 'member' });
  if (syncRole.error) {
    ko('Régression — sync_my_pass_role en erreur', syncRole.error.message);
  } else {
    ok('Régression OK — sync_my_pass_role répond', String(syncRole.data));
  }

  // --- REGRESSION 3 : pas de promotion via la RPC sans PASS ------------------
  const syncPrime = await client.rpc('sync_my_pass_role', { p_desired: 'prime' });
  const { data: afterSync } = await admin
    .from('users')
    .select('user_role')
    .eq('id', userId)
    .maybeSingle();
  if (afterSync?.user_role === 'member') {
    ok('sync_my_pass_role refuse la promotion sans PASS', String(syncPrime.data));
  } else {
    ko('sync_my_pass_role a promu sans PASS', String(afterSync?.user_role));
  }

  await client.auth.signOut();
}

async function cleanup() {
  if (!userId) return;
  await admin.from('prime_benefit_grants').delete().eq('user_id', userId);
  await admin.from('users').delete().eq('id', userId);
  const del = await admin.auth.admin.deleteUser(userId);
  if (del.error) {
    console.error(`\nATTENTION : compte de test non supprimé (${userId}) — ${del.error.message}`);
  } else {
    console.log(`\nCompte de test supprimé (${email})`);
  }
}

main()
  .catch((e) => ko('Erreur inattendue', e?.message ?? String(e)))
  .finally(async () => {
    await cleanup();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} vérifications passées.`);
    process.exit(failed.length > 0 ? 1 : 0);
  });
