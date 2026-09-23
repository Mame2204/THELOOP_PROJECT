import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, '../../static/auth-callback.html');

let cachedTemplate: string | null = null;

export type AuthCallbackPreboot =
  | { kind: string; accessToken: string; refreshToken: string }
  | { verifyError: string }
  | null;

function loadTemplate(): string {
  if (cachedTemplate) return cachedTemplate;
  cachedTemplate = readFileSync(templatePath, 'utf8');
  return cachedTemplate;
}

function otpVerifyType(kind: string): string {
  if (kind === 'recovery') return 'recovery';
  if (kind === 'signup' || kind === 'email') return 'signup';
  return 'invite';
}

async function verifyTokenHashOnServer(
  tokenHash: string,
  kind: string,
): Promise<{ accessToken: string; refreshToken: string } | { verifyError: string }> {
  const anon = config.supabaseAnonKey;
  const base = config.supabaseUrl.replace(/\/$/, '');
  if (!anon) {
    return { verifyError: 'Configuration serveur incomplète (clé anon).' };
  }

  const res = await fetch(`${base}/auth/v1/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon },
    body: JSON.stringify({ type: otpVerifyType(kind), token_hash: tokenHash }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    msg?: string;
    error_description?: string;
    message?: string;
  };

  if (!res.ok) {
    const msg =
      body.error_description
      ?? body.msg
      ?? body.message
      ?? 'Ce lien est invalide ou expiré.';
    return { verifyError: msg };
  }

  if (!body.access_token || !body.refresh_token) {
    return { verifyError: 'Session invalide après validation du lien.' };
  }

  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

function renderAuthCallbackPage(preboot: AuthCallbackPreboot): string {
  const anon = config.supabaseAnonKey;
  if (!anon) {
    throw new Error('SUPABASE_ANON_KEY manquant pour la page auth-callback.');
  }

  const prebootJson = preboot
    ? JSON.stringify(
        'verifyError' in preboot
          ? { verifyError: preboot.verifyError }
          : {
              kind: preboot.kind,
              accessToken: preboot.accessToken,
              refreshToken: preboot.refreshToken,
            },
      )
    : 'null';

  return loadTemplate()
    .replace('window.__SUPABASE_ANON__', JSON.stringify(anon))
    .replace('window.__SUPABASE_URL__', JSON.stringify(config.supabaseUrl))
    .replace('window.__PREBOOT_SESSION__ = null;', `window.__PREBOOT_SESSION__ = ${prebootJson};`);
}

export const authCallbackPageRouter = Router();

function sendAuthCallbackPage(res: import('express').Response, preboot: AuthCallbackPreboot): void {
  const html = renderAuthCallbackPage(preboot);
  res
    .set({
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'inline; filename="auth-callback.html"',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    })
    .send(html);
}

async function handleAuthCallback(req: import('express').Request, res: import('express').Response): Promise<void> {
  const rawHash = req.query.token_hash ?? req.query.token;
  const tokenHash = typeof rawHash === 'string' ? rawHash.trim() : '';
  const kind = String(req.query.type ?? 'invite').toLowerCase();

  let preboot: AuthCallbackPreboot = null;
  if (tokenHash) {
    const verified = await verifyTokenHashOnServer(tokenHash, kind);
    if ('verifyError' in verified) {
      preboot = verified;
    } else {
      preboot = { kind, accessToken: verified.accessToken, refreshToken: verified.refreshToken };
    }
  }

  sendAuthCallbackPage(res, preboot);
}

/** Page recovery / invite — validation token_hash côté serveur (navigateur mail sans fetch JS). */
authCallbackPageRouter.get('/auth/callback', (req, res) => {
  void handleAuthCallback(req, res).catch((err) => {
    const message = err instanceof Error ? err.message : 'Page indisponible.';
    res.status(500).type('text/plain').send(message);
  });
});

authCallbackPageRouter.get('/auth/callback.html', (req, res) => {
  void handleAuthCallback(req, res).catch((err) => {
    const message = err instanceof Error ? err.message : 'Page indisponible.';
    res.status(500).type('text/plain').send(message);
  });
});
