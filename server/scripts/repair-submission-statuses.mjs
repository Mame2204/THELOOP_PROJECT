/**
 * Répare les soumissions partenaires dont le statut ne correspond plus à la publication :
 * - status 'pending' alors qu'un contenu publié existe  -> 'approved' (fantômes invisibles en modération)
 * - status 'rejected' alors qu'un contenu publié existe -> dépublication + statut conservé
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, '..', '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const apply = process.argv.includes('--apply');

async function repairEvents() {
  const { data, error } = await supabase
    .from('partner_event_submissions')
    .select('local_id, title, status, published_event_id')
    .eq('status', 'pending')
    .not('published_event_id', 'is', null);
  if (error) throw error;

  for (const row of data ?? []) {
    console.log(`[event] ${row.local_id} « ${row.title} » pending + publié -> approved`);
    if (apply) {
      await supabase
        .from('partner_event_submissions')
        .update({ status: 'approved', rejection_reason: null, updated_at: new Date().toISOString() })
        .eq('local_id', row.local_id);
    }
  }
  return (data ?? []).length;
}

async function repairSpots() {
  const { data, error } = await supabase
    .from('partner_spot_submissions')
    .select('local_id, name, status, published_establishment_id, published_tool_id')
    .eq('status', 'pending')
    .or('published_establishment_id.not.is.null,published_tool_id.not.is.null');
  if (error) throw error;

  for (const row of data ?? []) {
    console.log(`[spot] ${row.local_id} « ${row.name} » pending + publié -> approved`);
    if (apply) {
      await supabase
        .from('partner_spot_submissions')
        .update({ status: 'approved', rejection_reason: null, updated_at: new Date().toISOString() })
        .eq('local_id', row.local_id);
    }
  }
  return (data ?? []).length;
}

async function repairRejectedButPublished() {
  const { data: evts } = await supabase
    .from('partner_event_submissions')
    .select('local_id, published_event_id')
    .eq('status', 'rejected')
    .not('published_event_id', 'is', null);
  for (const row of evts ?? []) {
    console.log(`[event] ${row.local_id} refusé mais publié -> dépublication`);
    if (apply) {
      await supabase.from('events').delete().eq('id', row.published_event_id);
      await supabase
        .from('partner_event_submissions')
        .update({ published_event_id: null, updated_at: new Date().toISOString() })
        .eq('local_id', row.local_id);
    }
  }

  const { data: spots } = await supabase
    .from('partner_spot_submissions')
    .select('local_id, published_establishment_id, published_tool_id')
    .eq('status', 'rejected')
    .or('published_establishment_id.not.is.null,published_tool_id.not.is.null');
  for (const row of spots ?? []) {
    console.log(`[spot] ${row.local_id} refusé mais publié -> dépublication`);
    if (apply) {
      if (row.published_tool_id) await supabase.from('tools').delete().eq('id', row.published_tool_id);
      if (row.published_establishment_id) {
        await supabase.from('establishments').delete().eq('id', row.published_establishment_id);
      }
      await supabase
        .from('partner_spot_submissions')
        .update({
          published_establishment_id: null,
          published_tool_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('local_id', row.local_id);
    }
  }
  return (evts ?? []).length + (spots ?? []).length;
}

async function main() {
  const e = await repairEvents();
  const s = await repairSpots();
  const r = await repairRejectedButPublished();
  console.log(`\n${apply ? 'Appliqué' : 'Simulation'} — events:${e} spots:${s} refusés-publiés:${r}`);
  if (!apply) console.log('Relancer avec --apply pour écrire.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
