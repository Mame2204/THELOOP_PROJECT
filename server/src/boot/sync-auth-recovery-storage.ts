import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const STORAGE_BUCKET = 'app-public';
const STORAGE_OBJECT = 'auth/auth-callback.html';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** HTML léger : réécrit hash/query Supabase vers la page Render (text/html garanti). */
function loadStorageRedirectHtml(): string {
  const candidates = [
    join(__dirname, '../../assets/auth-callback-storage-redirect.html'),
    join(__dirname, '../../../public/auth-callback.html'),
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      /* essai suivant */
    }
  }
  throw new Error('auth-callback redirect HTML introuvable dans l’image Docker.');
}

let lastStorageSyncAt = 0;
const STORAGE_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function headStorageContentType(): Promise<string | null> {
  const publicUrl = `${config.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${STORAGE_BUCKET}/${STORAGE_OBJECT}`;
  try {
    const res = await fetch(publicUrl, { method: 'HEAD' });
    if (!res.ok) return null;
    return res.headers.get('content-type');
  } catch {
    return null;
  }
}

async function uploadStorageRedirectHtml(html: string): Promise<void> {
  const base = config.supabaseUrl.replace(/\/$/, '');
  const key = config.supabaseServiceRoleKey;
  const headers = {
    Authorization: `Bearer ${key}`,
    apikey: key,
  };

  const uploadUrl = `${base}/storage/v1/object/${STORAGE_BUCKET}/${STORAGE_OBJECT}`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'text/html; charset=utf-8',
      'x-upsert': 'true',
      'cache-control': 'no-cache',
    },
    body: html,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload Storage auth-callback: ${res.status} ${text.slice(0, 200)}`);
  }
}

/**
 * Corrige l’objet Storage legacy (text/plain → HTML rendu).
 * Les anciens e-mails Supabase pointent parfois encore vers ce fichier.
 */
export async function syncAuthRecoveryStorageIfNeeded(force = false): Promise<void> {
  if (!parseBool(process.env.ENABLE_AUTH_STORAGE_SYNC, true)) return;

  const now = Date.now();
  if (!force && now - lastStorageSyncAt < STORAGE_SYNC_INTERVAL_MS) return;

  const currentType = await headStorageContentType();
  const needsFix = !currentType || !currentType.toLowerCase().includes('text/html');
  if (!needsFix && !force) {
    lastStorageSyncAt = now;
    return;
  }

  const html = loadStorageRedirectHtml();
  await uploadStorageRedirectHtml(html);

  const after = await headStorageContentType();
  if (!after || !after.toLowerCase().includes('text/html')) {
    throw new Error(`Storage auth-callback toujours sans text/html (type=${after ?? 'null'})`);
  }

  lastStorageSyncAt = now;
  console.log('[auth-sync] Storage auth-callback.html → text/html (redirect vers API)');
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'yes') return true;
  return fallback;
}
