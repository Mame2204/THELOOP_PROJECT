import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, '../../static/auth-callback.html');

const TITLE_LOADING = '<h1 id="title">Chargement…</h1>';
const MESSAGE_LOADING = '<p id="message">Validation du lien…</p>';
const CHOICE_HIDDEN = '<div id="choice" class="choice">';

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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function translateVerifyError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('invalid') || lower.includes('expired') || lower.includes('otp_expired')) {
    return 'Ce lien est invalide ou expiré. Demandez un nouvel e-mail d’invitation depuis l’admin THE LOOP.';
  }
  return raw;
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
    return { verifyError: translateVerifyError(msg) };
  }

  if (!body.access_token || !body.refresh_token) {
    return { verifyError: 'Session invalide après validation du lien.' };
  }

  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

function patchVisibleShell(
  html: string,
  title: string,
  message: string,
  options?: { showChoice?: boolean },
): string {
  let out = html
    .replace(TITLE_LOADING, `<h1 id="title">${escapeHtml(title)}</h1>`)
    .replace(MESSAGE_LOADING, `<p id="message">${escapeHtml(message)}</p>`);
  if (options?.showChoice) {
    out = out.replace(
      CHOICE_HIDDEN,
      '<div id="choice" class="choice" style="display:block;margin-top:20px">',
    );
  }
  return out;
}

function renderAuthCallbackPage(preboot: AuthCallbackPreboot, incompleteLink: boolean): string {
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

  let html = loadTemplate()
    .replace('window.__SUPABASE_ANON__', JSON.stringify(anon))
    .replace('window.__SUPABASE_URL__', JSON.stringify(config.supabaseUrl))
    .replace('window.__PREBOOT_SESSION__ = null;', `window.__PREBOOT_SESSION__ = ${prebootJson};`);

  if (preboot && 'verifyError' in preboot) {
    html = patchVisibleShell(html, 'Lien invalide ou expiré', preboot.verifyError);
  } else if (preboot && 'accessToken' in preboot) {
    html = patchVisibleShell(
      html,
      'Activer votre compte',
      'THE LOOP est installée ? Ouvrez l’application. Sinon, continuez sur le web pour choisir votre mot de passe.',
      { showChoice: true },
    );
  } else if (incompleteLink) {
    html = patchVisibleShell(
      html,
      'Lien incomplet',
      'Ce lien ne contient pas les codes attendus. Depuis le mail : ⋯ → Ouvrir dans Safari ou Chrome. Sinon renvoyez l’invitation depuis l’admin.',
    );
  }

  return html;
}

export const authCallbackPageRouter = Router();

function sendAuthCallbackPage(
  res: import('express').Response,
  preboot: AuthCallbackPreboot,
  incompleteLink: boolean,
): void {
  const html = renderAuthCallbackPage(preboot, incompleteLink);
  res
    .set({
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'inline; filename="auth-callback.html"',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    })
    .send(html);
}

function queryHasAuthParams(req: import('express').Request): boolean {
  const q = req.query;
  return Boolean(
    q.token_hash
    || q.token
    || q.code
    || q.access_token
    || q.error
    || q.error_description,
  );
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

  const incompleteLink = !preboot && !queryHasAuthParams(req);
  sendAuthCallbackPage(res, preboot, incompleteLink);
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
