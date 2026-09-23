import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, '../../static/auth-callback.html');

let cachedTemplate: string | null = null;

function loadTemplate(): string {
  if (cachedTemplate) return cachedTemplate;
  cachedTemplate = readFileSync(templatePath, 'utf8');
  return cachedTemplate;
}

function renderAuthCallbackPage(): string {
  const anon = config.supabaseAnonKey;
  if (!anon) {
    throw new Error('SUPABASE_ANON_KEY manquant pour la page auth-callback.');
  }
  return loadTemplate()
    .replace('window.__SUPABASE_ANON__', JSON.stringify(anon))
    .replace('window.__SUPABASE_URL__', JSON.stringify(config.supabaseUrl));
}

export const authCallbackPageRouter = Router();

function sendAuthCallbackPage(res: import('express').Response): void {
  const html = renderAuthCallbackPage();
  res
    .set({
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'inline; filename="auth-callback.html"',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    })
    .send(html);
}

/** Page recovery / invite — même contenu que l’Edge Function, Content-Type garanti. */
authCallbackPageRouter.get('/auth/callback', (_req, res) => {
  try {
    sendAuthCallbackPage(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Page indisponible.';
    res.status(500).type('text/plain').send(message);
  }
});

authCallbackPageRouter.get('/auth/callback.html', (_req, res) => {
  try {
    sendAuthCallbackPage(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Page indisponible.';
    res.status(500).type('text/plain').send(message);
  }
});
