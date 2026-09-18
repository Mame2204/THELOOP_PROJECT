/**
 * Nettoyage prod : soumissions refusées mais catalogue encore live.
 * Usage : node scripts/run-supabase-cleanup.mjs (depuis server/)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');

function loadEnv() {
  const raw = readFileSync(envPath, 'utf8');
  const out = {};
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const env = loadEnv();
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans server/.env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function cleanupRejectedEvents() {
  const { data, error } = await supabase
    .from('partner_event_submissions')
    .select('local_id, published_event_id')
    .eq('status', 'rejected')
    .not('published_event_id', 'is', null);
  if (error) throw error;
  let n = 0;
  for (const row of data ?? []) {
    const eventId = row.published_event_id;
    if (eventId) {
      await supabase.from('events').delete().eq('id', eventId);
    }
    await supabase
      .from('partner_event_submissions')
      .update({ published_event_id: null, updated_at: new Date().toISOString() })
      .eq('local_id', row.local_id);
    n += 1;
  }
  return n;
}

async function cleanupRejectedSpots() {
  const { data, error } = await supabase
    .from('partner_spot_submissions')
    .select('local_id, published_establishment_id, published_tool_id, sub_category')
    .eq('status', 'rejected');
  if (error) throw error;
  let n = 0;
  for (const row of data ?? []) {
    if (row.published_tool_id) {
      await supabase.from('tools').delete().eq('id', row.published_tool_id);
    } else if (row.published_establishment_id) {
      await supabase.from('establishments').delete().eq('id', row.published_establishment_id);
    } else {
      continue;
    }
    await supabase
      .from('partner_spot_submissions')
      .update({
        published_tool_id: null,
        published_establishment_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('local_id', row.local_id);
    n += 1;
  }
  return n;
}

async function fixPendingGhostSubmissions() {
  const ev = await supabase
    .from('partner_event_submissions')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('status', 'pending')
    .not('published_event_id', 'is', null)
    .select('local_id');
  if (ev.error) throw ev.error;

  const sp = await supabase
    .from('partner_spot_submissions')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('status', 'pending')
    .or('published_establishment_id.not.is.null,published_tool_id.not.is.null')
    .select('local_id');
  if (sp.error) throw sp.error;

  return { events: ev.data?.length ?? 0, spots: sp.data?.length ?? 0 };
}

async function cleanupOrphanWithdrawals() {
  const ev = await supabase
    .from('partner_event_submissions')
    .delete()
    .eq('status', 'withdrawal_requested')
    .is('published_event_id', null)
    .select('local_id');
  if (ev.error) throw ev.error;

  const sp = await supabase
    .from('partner_spot_submissions')
    .delete()
    .eq('status', 'withdrawal_requested')
    .is('published_establishment_id', null)
    .is('published_tool_id', null)
    .select('local_id');
  if (sp.error) throw sp.error;

  return { events: ev.data?.length ?? 0, spots: sp.data?.length ?? 0 };
}

async function verify() {
  const checks = [];
  const ev = await supabase
    .from('partner_event_submissions')
    .select('local_id', { count: 'exact', head: true })
    .eq('status', 'rejected')
    .not('published_event_id', 'is', null);
  checks.push({ name: 'rejected_with_published_event', n: ev.count ?? 0 });

  const sp = await supabase
    .from('partner_spot_submissions')
    .select('local_id', { count: 'exact', head: true })
    .eq('status', 'rejected')
    .or('published_establishment_id.not.is.null,published_tool_id.not.is.null');
  checks.push({ name: 'rejected_with_published_spot', n: sp.count ?? 0 });

  return checks;
}

async function main() {
  console.log('Nettoyage Supabase…');
  const rejectedEvents = await cleanupRejectedEvents();
  const rejectedSpots = await cleanupRejectedSpots();
  const ghosts = await fixPendingGhostSubmissions();
  const orphans = await cleanupOrphanWithdrawals();
  const checks = await verify();

  console.log(JSON.stringify({ rejectedEvents, rejectedSpots, ghosts, orphans, checks }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
