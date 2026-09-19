/**
 * Mesure la consommation reelle de bande passante :
 * poids des images stockees et poids des requetes catalogue.
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

const ko = (bytes) => `${(bytes / 1024).toFixed(0)} Ko`;
const mo = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} Mo`;

async function walkBucket(bucket, prefix = '', depth = 0) {
  const files = [];
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return files;
  for (const entry of data) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null && depth < 3) {
      files.push(...(await walkBucket(bucket, path, depth + 1)));
    } else if (entry.metadata?.size != null) {
      files.push({ path, size: Number(entry.metadata.size), type: entry.metadata.mimetype });
    }
  }
  return files;
}

async function storageReport() {
  console.log('=== Images stockees ===\n');
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) {
    console.log(`Lecture des buckets impossible : ${error.message}`);
    return;
  }

  for (const b of buckets ?? []) {
    const files = await walkBucket(b.name);
    if (!files.length) {
      console.log(`${b.name} (${b.public ? 'public' : 'prive'}) : vide\n`);
      continue;
    }
    const total = files.reduce((s, f) => s + f.size, 0);
    const sorted = [...files].sort((a, b2) => b2.size - a.size);
    const over500 = files.filter((f) => f.size > 500 * 1024).length;
    const over1mo = files.filter((f) => f.size > 1024 * 1024).length;

    console.log(`${b.name} (${b.public ? 'public' : 'prive'})`);
    console.log(`  fichiers          : ${files.length}`);
    console.log(`  poids total       : ${mo(total)}`);
    console.log(`  poids moyen       : ${ko(total / files.length)}`);
    console.log(`  au-dessus de 500 Ko: ${over500}`);
    console.log(`  au-dessus de 1 Mo : ${over1mo}`);
    console.log('  les plus lourdes  :');
    for (const f of sorted.slice(0, 5)) {
      console.log(`    ${ko(f.size).padStart(8)}  ${f.path}`);
    }
    console.log('');
  }
}

async function measureQuery(label, path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const started = Date.now();
  const res = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const text = await res.text();
  const ms = Date.now() - started;
  const bytes = Buffer.byteLength(text, 'utf8');
  let rows = 0;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      rows = parsed.length;
    } else {
      console.log(`${label.padEnd(34)} reponse inattendue : ${text.slice(0, 160)}`);
      return 0;
    }
  } catch {
    console.log(`${label.padEnd(34)} reponse illisible`);
    return 0;
  }
  console.log(
    `${label.padEnd(34)} ${ko(bytes).padStart(9)}  ${String(rows).padStart(4)} lignes  ${ms} ms`,
  );
  return bytes;
}

async function queryReport() {
  console.log('=== Poids des requetes catalogue ===\n');
  let total = 0;
  total += await measureQuery('events (toutes colonnes)', 'events?select=*');
  total += await measureQuery('establishments (toutes colonnes)', 'establishments?select=*');
  total += await measureQuery('tools (toutes colonnes)', 'tools?select=*');
  total += await measureQuery('benefit_catalog', 'benefit_catalog?select=*');
  total += await measureQuery('categories', 'categories?select=*');
  console.log(`\nTotal d'un chargement complet      : ${ko(total)}`);
  console.log(`Pour 100 ouvertures d'application  : ${mo(total * 100)}`);
  console.log(`Pour 1000 ouvertures               : ${mo(total * 1000)}`);
}

await storageReport();
await queryReport();
