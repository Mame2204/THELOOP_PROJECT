import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://eeyhtulpixvftvhppinz.supabase.co',
  'sb_publishable_l78zClzs1ldqOElbaLVT0w__KrKrlZv',
);

const tables = [
  'locations',
  'event_categories',
  'establishment_categories',
  'events',
  'establishments',
  'establishment_photos',
  'event_speakers',
  'event_schedules',
  'partnership_requests',
  'partner_staff',
  'users',
];

for (const table of tables) {
  const { data, error } = await sb.from(table).select('*').limit(1);
  if (error) {
    console.log(`${table}: ERR ${error.message}`);
    continue;
  }
  if (!data?.length) {
    const { error: e2 } = await sb.from(table).select('*').limit(0);
    console.log(`${table}: empty (probe err: ${e2?.message ?? 'ok'})`);
    continue;
  }
  console.log(`${table}:`, Object.keys(data[0]).join(', '));
}
