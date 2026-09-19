/**
 * Expiration des PASS — aperçu puis vérification.
 *
 * Sans argument, le script ne modifie rien : il affiche ce que le premier
 * passage de la tâche changerait en production.
 *
 * Avec --apply, il crée deux comptes jetables, exécute réellement
 * expire_due_pass_grants et contrôle le comportement attendu. Attention :
 * l'exécution traite aussi les abonnements réellement échus.
 *
 * Usage (depuis la racine) :
 *   .\.tools\node\node.exe server\scripts\verify-pass-expiry.mjs
 *   .\.tools\node\node.exe server\scripts\verify-pass-expiry.mjs --apply
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

const APPLY = process.argv.includes('--apply');
const results = [];
const ok = (name, detail = '') => {
  results.push({ ok: true, name });
  console.log(`OK    ${name}${detail ? ` — ${detail}` : ''}`);
};
const ko = (name, detail = '') => {
  results.push({ ok: false, name });
  console.error(`ECHEC ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Miroir de pass_grant_never_expires, pour l'aperçu en lecture seule. */
function neverExpires(g) {
  const label = String(g.label ?? '');
  const catalog = String(g.pass_catalog_id ?? '');
  const kind = String(g.pass_kind ?? '');
  if (g.frozen_pass_snapshot) return false;
  if (/intermediaire/i.test(catalog)) return false;
  if (/interm[eé]diaire/i.test(label) && g.granted_by) return false;
  if (kind === 'intermediate') return false;
  if (g.payment_method) return false;
  if (Number(g.amount_gnf ?? 0) > 0) return false;
  return (
    kind === 'heritage' ||
    kind === 'bonus' ||
    /heritage/i.test(label) ||
    /affinit/i.test(label) ||
    (/bonus/i.test(label) && /pass/i.test(label))
  );
}

async function preview() {
  const nowIso = new Date().toISOString();

  const { data: grants, error } = await admin
    .from('user_pass_grants')
    .select(
      'id, user_id, label, status, expires_at, pass_kind, pass_catalog_id, payment_method, amount_gnf, frozen_pass_snapshot, granted_by',
    )
    .in('status', ['active', 'suspended'])
    .not('expires_at', 'is', null)
    .lte('expires_at', nowIso);

  if (error) {
    console.error(`Lecture impossible : ${error.message}`);
    return;
  }

  const due = (grants ?? []).filter((g) => !neverExpires(g));
  const preserved = (grants ?? []).length - due.length;

  console.log('=== Aperçu du premier passage (aucune modification) ===\n');
  console.log(`PASS échus à expirer            : ${due.length}`);
  console.log(`PASS Heritage préservés         : ${preserved}`);

  const { data: primeUsers } = await admin
    .from('users')
    .select('id, email, first_name, last_name')
    .eq('user_role', 'prime');

  const primeIds = (primeUsers ?? []).map((u) => String(u.id));
  const { data: primeGrants } = primeIds.length
    ? await admin
        .from('user_pass_grants')
        .select('id, user_id, status, expires_at')
        .in('user_id', primeIds)
    : { data: [] };

  const dueIds = new Set(due.map((g) => String(g.id)));
  const byUser = new Map();
  for (const g of primeGrants ?? []) {
    const key = String(g.user_id);
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(g);
  }

  // On rejoue l'ordre de la tâche : expiration, puis démarrage du PASS suivant,
  // puis rétrogradation des comptes restés sans PASS actif.
  const demotable = [];
  for (const u of primeUsers ?? []) {
    const rows = byUser.get(String(u.id)) ?? [];
    if (rows.length === 0) continue;

    const holdsSlot = rows.some(
      (r) =>
        !dueIds.has(String(r.id)) &&
        (r.status === 'active' || r.status === 'suspended') &&
        (!r.expires_at || new Date(r.expires_at) > new Date()),
    );
    const hasPending = rows.some((r) => r.status === 'pending');
    if (holdsSlot || hasPending) continue;
    demotable.push(u);
  }

  console.log(`Comptes « prime » concernés     : ${(primeUsers ?? []).length}`);
  console.log(`Comptes qui repasseraient membre: ${demotable.length}`);
  if (demotable.length) {
    console.log('\nDétail des comptes rétrogradés :');
    for (const u of demotable) {
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
      console.log(`  - ${u.email ?? u.id}${name ? ` (${name})` : ''}`);
    }
  }

  const { count: pendingCount } = await admin
    .from('user_pass_grants')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  console.log(`\nPASS en file d'attente          : ${pendingCount ?? 0}`);
}

const stamp = Date.now();
const createdUsers = [];

async function makeMember(suffix) {
  const email = `verif-exp-${stamp}-${suffix}@theloop-test.invalid`;
  const password = `Verif!${Math.random().toString(36).slice(2, 10)}A1`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: 'Verif',
      last_name: 'Expiry',
      user_role: 'member',
      country_code: 'GN',
      phone_number: `+2246${String(stamp).slice(-7)}${suffix}`,
    },
  });
  if (created.error) throw new Error(created.error.message);
  const id = created.data.user.id;
  createdUsers.push({ id, email, password });
  return { id, email, password };
}

async function grantRow(userId, row) {
  const { error } = await admin.from('user_pass_grants').insert({
    user_id: userId,
    pass_catalog_id: 'prime-annual',
    pass_kind: 'standard',
    started_at: new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString(),
    ...row,
  });
  if (error) throw new Error(error.message);
}

async function statusOf(localId) {
  const { data } = await admin
    .from('user_pass_grants')
    .select('status, expires_at')
    .eq('local_id', localId)
    .maybeSingle();
  return data ?? {};
}

async function roleOf(userId) {
  const { data } = await admin.from('users').select('user_role').eq('id', userId).maybeSingle();
  return data?.user_role ?? null;
}

async function verify() {
  console.log('\n=== Vérification sur comptes jetables ===\n');

  const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // Compte 1 : PASS échu + PASS en file d'attente.
  const queued = await makeMember('a');
  await grantRow(queued.id, {
    label: 'PASS annuel échu',
    status: 'active',
    expires_at: past,
    local_id: `exp-a-actif-${stamp}`,
    amount_gnf: 250000,
    payment_method: 'orange_money',
    billing_period: 'annual',
  });
  await grantRow(queued.id, {
    label: 'PASS annuel en attente',
    status: 'pending',
    expires_at: null,
    local_id: `exp-a-file-${stamp}`,
    amount_gnf: 250000,
    payment_method: 'orange_money',
    billing_period: 'annual',
    paid_at: new Date().toISOString(),
  });
  await admin.from('users').update({ user_role: 'prime' }).eq('id', queued.id);

  // Compte 2 : PASS échu seul + PASS Heritage échu (ne doit pas bouger).
  const lapsed = await makeMember('b');
  await grantRow(lapsed.id, {
    label: 'PASS mensuel échu',
    status: 'active',
    expires_at: past,
    local_id: `exp-b-actif-${stamp}`,
    amount_gnf: 50000,
    payment_method: 'orange_money',
    billing_period: 'monthly',
  });
  await grantRow(lapsed.id, {
    label: 'PASS Heritage',
    pass_kind: 'heritage',
    pass_catalog_id: 'pass-heritage-builtin',
    status: 'suspended',
    expires_at: past,
    local_id: `exp-b-heritage-${stamp}`,
    amount_gnf: 0,
  });
  await admin.from('users').update({ user_role: 'prime' }).eq('id', lapsed.id);

  // Un membre ordinaire ne doit pas pouvoir déclencher la tâche.
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.auth.signInWithPassword({ email: lapsed.email, password: lapsed.password });
  const forbidden = await client.rpc('expire_due_pass_grants', { p_limit: 10 });
  if (forbidden.error) ok('Tâche inaccessible à un membre', forbidden.error.message);
  else ko('Tâche accessible à un membre');
  await client.auth.signOut();

  const { data, error } = await admin.rpc('expire_due_pass_grants', { p_limit: 500 });
  if (error) {
    ko('Exécution de la tâche', error.message);
    return;
  }
  console.log(`\nRésultat : ${JSON.stringify(data)}\n`);

  const expiredA = await statusOf(`exp-a-actif-${stamp}`);
  if (expiredA.status === 'expired') ok('PASS échu marqué expiré');
  else ko('PASS échu non expiré', String(expiredA.status));

  const queuedA = await statusOf(`exp-a-file-${stamp}`);
  if (queuedA.status === 'active' && queuedA.expires_at && new Date(queuedA.expires_at) > new Date()) {
    ok('PASS en file démarré', `échéance ${String(queuedA.expires_at).slice(0, 10)}`);
  } else {
    ko('PASS en file non démarré', JSON.stringify(queuedA));
  }

  const roleA = await roleOf(queued.id);
  if (roleA === 'prime') ok('Compte avec PASS suivant conservé en Prime');
  else ko('Compte rétrogradé à tort', String(roleA));

  const expiredB = await statusOf(`exp-b-actif-${stamp}`);
  if (expiredB.status === 'expired') ok('Second PASS échu marqué expiré');
  else ko('Second PASS échu non expiré', String(expiredB.status));

  const heritage = await statusOf(`exp-b-heritage-${stamp}`);
  if (heritage.status === 'suspended') ok('PASS Heritage préservé malgré sa date');
  else ko('PASS Heritage altéré', String(heritage.status));

  const roleB = await roleOf(lapsed.id);
  if (roleB === 'member') ok('Compte sans PASS actif repassé en membre');
  else ko('Compte non rétrogradé', String(roleB));

  const { count: notifCount } = await admin
    .from('user_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', lapsed.id);
  if ((notifCount ?? 0) > 0) ok('Membre notifié de l\'expiration');
  else ko('Aucune notification envoyée');
}

async function main() {
  await preview();
  if (!APPLY) {
    console.log(
      '\nAucune modification effectuée. Relancer avec --apply pour exécuter la tâche et vérifier.',
    );
    return;
  }
  await verify();
}

main()
  .catch((e) => ko('Erreur inattendue', e?.message ?? String(e)))
  .finally(async () => {
    for (const u of createdUsers) {
      await admin.from('user_pass_grants').delete().eq('user_id', u.id);
      await admin.from('user_notifications').delete().eq('user_id', u.id);
      await admin.from('users').delete().eq('id', u.id);
      await admin.auth.admin.deleteUser(u.id);
    }
    if (createdUsers.length) console.log(`\n${createdUsers.length} compte(s) de test supprimé(s).`);
    if (results.length) {
      const failed = results.filter((r) => !r.ok);
      console.log(`\n${results.length - failed.length}/${results.length} vérifications passées.`);
      process.exit(failed.length > 0 ? 1 : 0);
    }
  });
