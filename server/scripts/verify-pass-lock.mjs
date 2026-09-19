/**
 * Vérifie que la migration 20260930 empêche un membre de s'offrir un PASS,
 * sans casser les écritures légitimes (gel de rôle, octroi administrateur,
 * fulfillment serveur).
 *
 * Le script crée un compte membre jetable, joue les scénarios depuis sa vraie
 * session, puis supprime le compte.
 *
 * Usage (depuis la racine) :
 *   .\.tools\node\node.exe server\scripts\verify-pass-lock.mjs
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

const results = [];
const ok = (name, detail = '') => {
  results.push({ ok: true, name });
  console.log(`OK    ${name}${detail ? ` — ${detail}` : ''}`);
};
const ko = (name, detail = '') => {
  results.push({ ok: false, name });
  console.error(`ECHEC ${name}${detail ? ` — ${detail}` : ''}`);
};

const stamp = Date.now();
const email = `verif-pass-${stamp}@theloop-test.invalid`;
const password = `Verif!${Math.random().toString(36).slice(2, 10)}A1`;
let userId = null;

const future = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
const now = () => new Date().toISOString();

function grantPayload(overrides) {
  return {
    p_user_id: userId,
    p_pass_catalog_id: 'prime-annual',
    p_label: 'PASS de test',
    p_pass_kind: 'custom',
    p_status: 'active',
    p_started_at: now(),
    p_expires_at: future,
    p_granted_by: null,
    p_grant_note: 'Test',
    p_local_id: `verif-${stamp}`,
    p_amount_gnf: 0,
    p_payment_method: null,
    p_paid_at: null,
    p_billing_period: 'annual',
    p_scheduled_start_at: null,
    p_frozen_pass_snapshot: null,
    p_role_freeze_intermediate_id: null,
    ...overrides,
  };
}

async function setRole(role) {
  await admin.from('users').update({ user_role: role }).eq('id', userId);
}

async function statusOf(localId) {
  const { data } = await admin
    .from('user_pass_grants')
    .select('status')
    .eq('local_id', localId)
    .maybeSingle();
  return data?.status ?? null;
}

async function main() {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: 'Verif',
      last_name: 'Pass',
      user_role: 'member',
      country_code: 'GN',
      phone_number: `+2246${String(stamp).slice(-8)}`,
    },
  });
  if (created.error) {
    ko('Création du compte de test', created.error.message);
    return;
  }
  userId = created.data.user.id;
  ok('Compte membre de test créé');

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) {
    ko('Connexion au compte de test', signIn.error.message);
    return;
  }

  // --- La console admin doit pouvoir appeler la RPC sans ambiguïté ---------
  const adminStyle = await admin.rpc('upsert_user_pass_grant_admin', {
    p_user_id: userId,
    p_pass_catalog_id: 'prime-annual',
    p_label: 'Octroi console admin',
    p_pass_kind: 'custom',
    p_status: 'active',
    p_started_at: now(),
    p_expires_at: future,
    p_granted_by: null,
    p_grant_note: 'Octroi console',
    p_local_id: `verif-console-${stamp}`,
    p_amount_gnf: 0,
    p_payment_method: null,
    p_paid_at: null,
    p_billing_period: 'annual',
    p_scheduled_start_at: null,
    p_frozen_pass_snapshot: null,
  });
  if (adminStyle.error) {
    ko('Octroi administrateur (signature console)', adminStyle.error.message);
  } else {
    ok('Octroi administrateur (signature console) rétabli');
    await admin.from('user_pass_grants').delete().eq('local_id', `verif-console-${stamp}`);
  }

  // --- Exploit A : auto-octroi d'un PASS actif -----------------------------
  const selfGrant = await client.rpc('upsert_user_pass_grant_admin', grantPayload({}));
  if (selfGrant.error) {
    ok('Auto-octroi d\'un PASS actif bloqué', selfGrant.error.message);
  } else {
    ko('Auto-octroi d\'un PASS actif PASSE', String(selfGrant.data));
  }

  // --- Exploit A bis : déclarer un paiement --------------------------------
  const fakePaid = await client.rpc(
    'upsert_user_pass_grant_admin',
    grantPayload({
      p_local_id: `verif-paid-${stamp}`,
      p_status: 'suspended',
      p_amount_gnf: 250000,
      p_paid_at: now(),
      p_payment_method: 'orange_money',
    }),
  );
  if (fakePaid.error) {
    ok('Déclaration de paiement depuis le client bloquée', fakePaid.error.message);
  } else {
    ko('Déclaration de paiement depuis le client PASSE');
  }

  // --- Exploit B : commande impayée promue en actif ------------------------
  const pendingId = `verif-pending-${stamp}`;
  const seed = await admin.from('user_pass_grants').insert({
    user_id: userId,
    pass_catalog_id: 'prime-annual',
    label: 'Commande non payée',
    pass_kind: 'standard',
    status: 'pending',
    started_at: now(),
    expires_at: future,
    local_id: pendingId,
  });
  if (seed.error) {
    ko('Préparation de la commande témoin', seed.error.message);
  } else {
    const bulk = await client.rpc('bulk_update_user_pass_grants', {
      p_user_id: userId,
      p_new_status: 'active',
      p_match_statuses: ['pending'],
      p_exclude_catalog_id: null,
      p_only_catalog_id: null,
      p_only_unexpired: false,
    });
    const after = await statusOf(pendingId);
    if (bulk.error && after === 'pending') {
      ok('Commande impayée non activable', bulk.error.message);
    } else {
      ko('Commande impayée activée', `statut = ${after}`);
    }
  }

  // --- Régression 1 : écriture technique du gel de rôle --------------------
  const freezeId = `verif-freeze-${stamp}`;
  const freeze = await client.rpc(
    'upsert_user_pass_grant_admin',
    grantPayload({ p_local_id: freezeId, p_status: 'suspended', p_grant_note: 'Gel rôle membre' }),
  );
  if (freeze.error) {
    ko('Régression — gel de rôle refusé', freeze.error.message);
  } else {
    ok('Régression OK — le gel de rôle s\'écrit toujours');
  }

  // --- Régression 2 : restauration refusée tant que le rôle est membre -----
  const restoreAsMember = await client.rpc('bulk_update_user_pass_grants', {
    p_user_id: userId,
    p_new_status: 'active',
    p_match_statuses: ['suspended', 'revoked'],
    p_exclude_catalog_id: null,
    p_only_catalog_id: null,
    p_only_unexpired: true,
  });
  if (restoreAsMember.error && (await statusOf(freezeId)) === 'suspended') {
    ok('Restauration refusée tant que l\'administration n\'a pas reclassé le compte');
  } else {
    ko('Restauration acceptée sans décision administrateur');
  }

  // --- Régression 3 : restauration acceptée une fois le compte en prime ----
  await setRole('prime');
  const restoreAsPrime = await client.rpc('bulk_update_user_pass_grants', {
    p_user_id: userId,
    p_new_status: 'active',
    p_match_statuses: ['suspended', 'revoked'],
    p_exclude_catalog_id: null,
    p_only_catalog_id: null,
    p_only_unexpired: true,
  });
  if (restoreAsPrime.error) {
    ko('Régression — restauration Prime refusée', restoreAsPrime.error.message);
  } else if ((await statusOf(freezeId)) === 'active') {
    ok('Régression OK — PASS gelé restauré après décision administrateur');
  } else {
    ko('Régression — PASS gelé non restauré');
  }
  await setRole('member');

  await client.auth.signOut();
}

main()
  .catch((e) => ko('Erreur inattendue', e?.message ?? String(e)))
  .finally(async () => {
    if (userId) {
      await admin.from('user_pass_grants').delete().eq('user_id', userId);
      await admin.from('prime_benefit_grants').delete().eq('user_id', userId);
      await admin.from('users').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
      console.log(`\nCompte de test supprimé (${email}).`);
    }
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} vérifications passées.`);
    process.exit(failed.length > 0 ? 1 : 0);
  });
