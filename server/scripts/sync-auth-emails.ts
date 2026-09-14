#!/usr/bin/env npx tsx
/**
 * Rattrapage Auth ↔ public.users (sans SQL Editor Supabase).
 * Usage : depuis server/ → npx tsx scripts/sync-auth-emails.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !serviceKey) {
  console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans server/.env');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isSyntheticLoopEmail(email: string): boolean {
  return /^[0-9]+@theloop\.gn$/.test(email);
}

async function main(): Promise<void> {
  const { data: profiles, error } = await supabase
    .from('users')
    .select('id, email')
    .not('email', 'is', null);

  if (error) {
    console.error('Lecture public.users:', error.message);
    process.exit(1);
  }

  let synced = 0;
  let skipped = 0;

  for (const row of profiles ?? []) {
    const email = normalizeEmail(String(row.email ?? ''));
    if (!email || isSyntheticLoopEmail(email)) {
      skipped += 1;
      continue;
    }

    const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(row.id);
    if (authErr || !authUser.user) {
      console.warn(`Ignoré ${row.id}: Auth introuvable`);
      skipped += 1;
      continue;
    }

    const authEmail = normalizeEmail(authUser.user.email ?? '');
    if (authEmail === email) {
      skipped += 1;
      continue;
    }

    const { error: updateErr } = await supabase.auth.admin.updateUserById(row.id, {
      email,
      email_confirm: true,
    });

    if (updateErr) {
      console.warn(`Échec ${row.id} (${email}):`, updateErr.message);
      skipped += 1;
      continue;
    }

    console.log(`OK ${row.id}: ${authEmail || '(vide)'} → ${email}`);
    synced += 1;
  }

  console.log(`Terminé — ${synced} synchronisé(s), ${skipped} ignoré(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
