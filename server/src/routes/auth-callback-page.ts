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
  // Ne pas appeler /auth/v1/verify ici : un GET (aperçu mail, anti-virus) consumerait
  // le token_hash avant le clic réel. La validation se fait dans auth-callback.html (JS).
  const incompleteLink = !queryHasAuthParams(req);
  sendAuthCallbackPage(res, null, incompleteLink);
}

/** Page recovery / invite — shell HTML ; validation token_hash côté navigateur uniquement. */
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
