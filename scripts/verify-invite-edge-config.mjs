/**
 * Vérifie que INVITE_REQUIRE_EMAIL_CODE est bien enregistré (nom + date).
 * Supabase ne renvoie jamais la valeur en clair — c’est normal.
 *
 * Usage : SUPABASE_ACCESS_TOKEN=sbp_… node scripts/verify-invite-edge-config.mjs
 * Windows : même token que configure-invite-require-email-code.cmd
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const projectRef = 'eeyhtulpixvftvhppinz';
const SECRET_NAME = 'INVITE_REQUIRE_EMAIL_CODE';

function readToken() {
  const fromEnv = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const envPath = join(root, 'server', '.env');
  if (!existsSync(envPath)) return null;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}

const token = readToken();
if (!token) {
  console.error('Token manquant. SUPABASE_ACCESS_TOKEN ou server/.env');
  process.exit(1);
}

const listRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
  headers: { Authorization: `Bearer ${token}` },
});
const listText = await listRes.text();
if (!listRes.ok) {
  console.error('Liste secrets impossible', listRes.status, listText);
  process.exit(1);
}

/** @type {{ name: string; value?: string; updated_at?: string }[]} */
const secrets = JSON.parse(listText);
const row = secrets.find((s) => s.name === SECRET_NAME);

console.log('Projet:', projectRef);
console.log('Secrets Edge (noms):', secrets.map((s) => s.name).join(', ') || '(aucun)');

if (!row) {
  console.log('');
  console.log(`⚠ ${SECRET_NAME} : ABSENT`);
  console.log('→ node scripts/set-invite-require-email-code.mjs true');
  console.log('→ (Depuis PR #98, le code Edge considère aussi « absent » = true, après redeploy member-activate-invite)');
  process.exit(2);
}

console.log('');
console.log(`✓ ${SECRET_NAME} : présent`);
if (row.updated_at) console.log('  Dernière mise à jour:', row.updated_at);
if (row.value) {
  console.log('  Empreinte côté API (pas la valeur) :', row.value.slice(0, 16) + '…');
  const trueDigest = createHash('sha256').update('true').digest('hex');
  const falseDigest = createHash('sha256').update('false').digest('hex');
  if (row.value === trueDigest) console.log('  → correspond à la valeur « true »');
  else if (row.value === falseDigest) console.log('  → correspond à la valeur « false » (à corriger)');
  else console.log('  → empreinte non reconnue : ré-enregistrez avec set-invite-require-email-code.mjs true');
}

console.log('');
console.log('Redeploy recommandé après changement de code Edge :');
console.log('  node scripts/deploy-edge-invite-functions.mjs');
