/**
 * Upload public/auth-callback.html vers Storage avec Content-Type: text/html.
 * Usage: node scripts/upload-auth-callback.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const htmlPath = join(root, 'public', 'auth-callback.html');
const envPath = join(root, 'server', '.env');

function readEnv(path, key) {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`));
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}

const supabaseUrl = (readEnv(envPath, 'SUPABASE_URL') || '').replace(/\/$/, '');
const serviceKey = readEnv(envPath, 'SUPABASE_SERVICE_ROLE_KEY');
const bucket = 'app-public';
const objectPath = 'auth/auth-callback.html';

if (!supabaseUrl || !serviceKey || serviceKey.includes('your-service')) {
  console.error('Configurez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans server/.env');
  process.exit(1);
}

if (!existsSync(htmlPath)) {
  console.error('Fichier manquant:', htmlPath);
  process.exit(1);
}

const html = readFileSync(htmlPath);
const headers = {
  Authorization: `Bearer ${serviceKey}`,
  apikey: serviceKey,
};

async function ensureBucket() {
  const get = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucket}`, { headers });
  if (get.ok) {
    await fetch(`${supabaseUrl}/storage/v1/bucket/${bucket}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        public: true,
        file_size_limit: 1048576,
        allowed_mime_types: ['text/html', 'text/plain', 'application/json'],
      }),
    });
    return;
  }
  const create = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: true,
      file_size_limit: 1048576,
      allowed_mime_types: ['text/html', 'text/plain', 'application/json'],
    }),
  });
  if (!create.ok) {
    console.error('Bucket:', await create.text());
    process.exit(1);
  }
}

async function deleteOld() {
  await fetch(`${supabaseUrl}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [objectPath] }),
  });
}

async function upload() {
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'text/html',
      'x-upsert': 'true',
      'cache-control': '3600',
    },
    body: html,
  });
  if (!res.ok) {
    console.error('Upload échoué:', res.status, await res.text());
    process.exit(1);
  }
}

await ensureBucket();
await deleteOld();
await upload();

const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
const check = await fetch(publicUrl, { method: 'HEAD' });
const ct = check.headers.get('content-type');
console.log('OK', publicUrl);
console.log('Content-Type:', ct);
if (!ct || !ct.includes('text/html')) {
  console.error('ATTENTION: Content-Type incorrect — le navigateur affichera le code source.');
  process.exit(2);
}
