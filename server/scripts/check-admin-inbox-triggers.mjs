/**
 * Vérifie que la migration 20260927 (inbox admin par trigger) est appliquée.
 * Usage : node server/scripts/check-admin-inbox-triggers.mjs
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

const SENTINEL = '__smoke_inbox_trigger__';

async function main() {
  const { error } = await supabase.rpc('admin_inbox_broadcast', {
    p_notif_title: SENTINEL,
    p_message: SENTINEL,
    p_country_code: 'GN',
  });

  if (error) {
    console.log('admin_inbox_broadcast :', error.message);
    console.log('\n→ Migration absente. Exécuter supabase/migrations/20260927_admin_submission_inbox_triggers.sql dans le SQL Editor.');
    process.exit(1);
  }

  await supabase.from('user_notifications').delete().eq('title', SENTINEL);
  console.log('Migration 20260927 appliquée (admin_inbox_broadcast OK, notifs de test purgées).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
