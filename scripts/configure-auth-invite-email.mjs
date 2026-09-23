/**
 * Configure Supabase Auth : templates invite / recovery / confirmation + redirect URLs.
 * Style blanc THE LOOP — aligné sur l'e-mail d'inscription (pas de titre doré).
 *
 * Usage: SUPABASE_ACCESS_TOKEN=xxx node scripts/configure-auth-invite-email.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const projectRef = 'eeyhtulpixvftvhppinz';
const callbackUrl = 'https://api.theloop-app.com/auth/callback';
const edgeCallbackUrl = `https://${projectRef}.supabase.co/functions/v1/auth-callback`;
const legacyCallbackUrl = 'https://admin.theloop-app.com/auth-callback.html';

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

/** Carte blanche — même ton visuel que l'e-mail de confirmation inscription. */
function loopEmailHtml({ title, body, buttonLabel, footer }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4fcfd;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4fcfd;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px 28px;border:1px solid rgba(10,10,10,0.08);">
        <tr><td style="color:#0a0a0a;">
          <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#636e72;">THE LOOP</p>
          <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0a0a0a;line-height:1.3;">${title}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#636e72;">${body}</p>
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 22px;background:#0a0a0a;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">${buttonLabel}</a>
          <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;">${footer}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const inviteHtml = loopEmailHtml({
  title: 'Invitation THE LOOP',
  body:
    'Vous avez été invité(e) à rejoindre THE LOOP. Touchez le bouton ci-dessous sur votre téléphone : si l\'application est installée, elle s\'ouvrira ; sinon, vous choisirez votre mot de passe sur une page web sécurisée, puis pourrez installer THE LOOP.',
  buttonLabel: 'Activer mon compte',
  footer:
    'Sur le web : après avoir choisi votre mot de passe, installez THE LOOP pour accéder à l\'agenda et à vos privilèges. Connectez-vous avec cet e-mail.',
});

const confirmationHtml = loopEmailHtml({
  title: 'Confirmez votre e-mail',
  body:
    'Bienvenue sur THE LOOP. Touchez le bouton pour confirmer votre adresse e-mail et finaliser la création de votre compte.',
  buttonLabel: 'Confirmer mon e-mail',
  footer:
    'Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet e-mail.',
});

const recoveryHtml = loopEmailHtml({
  title: 'Nouveau mot de passe',
  body:
    'Vous avez demandé à réinitialiser votre mot de passe THE LOOP. Touchez le bouton : l\'app s\'ouvrira si elle est installée, sinon vous pourrez choisir un nouveau mot de passe sur le web.',
  buttonLabel: 'Choisir un mot de passe',
  footer:
    'Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet e-mail — votre mot de passe actuel reste inchangé.',
});

const token = readToken();
if (!token) {
  console.error('Token manquant : SUPABASE_ACCESS_TOKEN ou server/.env');
  console.error('https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

const body = {
  site_url: callbackUrl,
  uri_allow_list: [
    callbackUrl,
    edgeCallbackUrl,
    legacyCallbackUrl,
    'theloop://auth/callback',
    'theloop://**',
    'exp://**',
    'https://theloop-app.com/auth/callback',
    'https://www.theloop-app.com/auth/callback',
    'https://admin.theloop-app.com/auth-callback.html',
  ].join(','),
  mailer_subjects_invite: 'Invitation THE LOOP',
  mailer_templates_invite_content: inviteHtml,
  mailer_subjects_confirmation: 'Confirmez votre e-mail — THE LOOP',
  mailer_templates_confirmation_content: confirmationHtml,
  mailer_subjects_recovery: 'Réinitialisation mot de passe — THE LOOP',
  mailer_templates_recovery_content: recoveryHtml,
};

console.log('PATCH auth config…');
const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const text = await res.text();
if (!res.ok) {
  console.error('Echec', res.status, text);
  process.exit(1);
}

console.log('OK — templates invite / confirmation / recovery (style blanc)');
console.log('Site URL :', callbackUrl);
