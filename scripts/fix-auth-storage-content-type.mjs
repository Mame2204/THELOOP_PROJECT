/**
 * Corrige app-public/auth/auth-callback.html servi en text/plain (HTML visible en brut).
 * Usage (Render shell ou local) :
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/fix-auth-storage-content-type.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUCKET = 'app-public';
const OBJECT = 'auth/auth-callback.html';

const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceKey) {
  console.error('Variables requises : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const htmlPath = join(__dirname, '../server/assets/auth-callback-storage-redirect.html');
const html = readFileSync(htmlPath, 'utf8');

const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${OBJECT}`;
const head = await fetch(publicUrl, { method: 'HEAD' });
console.log('Avant — Content-Type:', head.headers.get('content-type') ?? '(absent)');

const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET}/${OBJECT}`;
const res = await fetch(uploadUrl, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    'Content-Type': 'text/html; charset=utf-8',
    'x-upsert': 'true',
    'cache-control': 'no-cache',
  },
  body: html,
});

if (!res.ok) {
  console.error('Upload échoué:', res.status, await res.text());
  process.exit(1);
}

const headAfter = await fetch(publicUrl, { method: 'HEAD' });
const typeAfter = headAfter.headers.get('content-type');
console.log('Après — Content-Type:', typeAfter ?? '(absent)');

if (!typeAfter?.toLowerCase().includes('text/html')) {
  console.error('Le type MIME n’est toujours pas text/html — vérifiez le bucket Storage.');
  process.exit(1);
}

console.log('OK — les anciens liens Storage afficheront une page HTML (redirection vers api.theloop-app.com).');
