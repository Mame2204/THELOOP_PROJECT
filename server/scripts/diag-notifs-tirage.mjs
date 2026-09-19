/**
 * Diagnostic : inbox admin (soumissions partenaires) + octrois de tirage.
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

function show(label, { data, error }) {
  console.log(`\n=== ${label} ===`);
  if (error) {
    console.log('ERREUR:', error.message);
    return [];
  }
  console.log(JSON.stringify(data, null, 2));
  return data ?? [];
}

async function main() {
  const admins = show(
    'Admins',
    await supabase.from('users').select('id, email, user_role, country_code, is_active').in('user_role', ['admin', 'super_admin']),
  );

  show(
    'Dernieres notifs admin (audience=admin)',
    await supabase
      .from('user_notifications')
      .select('id, user_id, title, message, sent_at')
      .eq('audience', 'admin')
      .order('sent_at', { ascending: false })
      .limit(15),
  );

  show(
    'Soumissions spots recentes',
    await supabase
      .from('partner_spot_submissions')
      .select('local_id, name, sub_category, status, partner_name, partner_user_id, country_code, published_establishment_id, published_tool_id, updated_at')
      .order('updated_at', { ascending: false })
      .limit(15),
  );

  show(
    'Soumissions events recentes',
    await supabase
      .from('partner_event_submissions')
      .select('local_id, title, status, partner_name, partner_user_id, country_code, published_event_id, updated_at')
      .order('updated_at', { ascending: false })
      .limit(10),
  );

  const draws = show(
    'Derniers tirages',
    await supabase
      .from('admin_benefit_draws')
      .select('id, catalog_id, catalog_title, winner_count, winners, country_code, drawn_at')
      .order('drawn_at', { ascending: false })
      .limit(3),
  );

  const winnerIds = [
    ...new Set(
      (draws ?? []).flatMap((d) => (Array.isArray(d.winners) ? d.winners.map((w) => w.userId) : [])),
    ),
  ].filter(Boolean);

  if (winnerIds.length) {
    show(
      'Octrois des gagnants',
      await supabase
        .from('prime_benefit_grants')
        .select('local_id, user_id, title, status, granted_at, expires_at, grant_audience, grant_country_code, catalog_local_id, role_entitlement')
        .in('user_id', winnerIds)
        .order('granted_at', { ascending: false })
        .limit(20),
    );

    show(
      'Notifs des gagnants',
      await supabase
        .from('user_notifications')
        .select('user_id, title, message, sent_at')
        .in('user_id', winnerIds)
        .order('sent_at', { ascending: false })
        .limit(10),
    );

    show(
      'Tokens push gagnants',
      await supabase.from('user_push_tokens').select('user_id, expo_token, updated_at').in('user_id', winnerIds),
    );
  }

  const catalogIds = [...new Set((draws ?? []).map((d) => d.catalog_id).filter(Boolean))];
  if (catalogIds.length) {
    show(
      'Items catalogue tires',
      await supabase
        .from('benefit_catalog')
        .select('local_id, title, is_active, country_code, benefit_kind, validity_ends_at, offering_partners')
        .in('local_id', catalogIds),
    );
  }

  if (admins.length) {
    show(
      'Tokens push admins',
      await supabase
        .from('user_push_tokens')
        .select('user_id, updated_at')
        .in('user_id', admins.map((a) => a.id)),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
