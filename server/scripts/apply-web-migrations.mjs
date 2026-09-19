/**
 * Vérifie / signale migrations 20260925-26 (DDL nécessite SQL Editor si absentes).
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

async function checkDrawCityColumn() {
  const { error } = await supabase.from('admin_benefit_draws').select('draw_city').limit(1);
  return !error;
}

async function checkRejectRpc() {
  const { error } = await supabase.rpc('reject_partner_event_submission', {
    p_local_id: '__smoke_check__',
    p_reason: 'test',
  });
  if (!error) return true;
  if (error.message.includes('Could not find the function') || error.code === 'PGRST202') {
    return false;
  }
  return true;
}

async function main() {
  const drawCity = await checkDrawCityColumn();
  const rejectRpc = await checkRejectRpc();
  console.log(JSON.stringify({ drawCityColumn: drawCity, rejectRpc, ready: drawCity && rejectRpc }, null, 2));
  if (!drawCity || !rejectRpc) {
    console.log('\n→ Exécuter supabase/migrations/20260925_*.sql et 20260926_*.sql dans SQL Editor.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
