/**
 * Configure Supabase Auth : templates invite/recovery + redirect URLs.
 * Usage: SUPABASE_ACCESS_TOKEN=xxx node scripts/configure-auth-invite-email.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const projectRef = 'eeyhtulpixvftvhppinz';
const callbackUrl = 'https://admin.theloop-app.com/auth-callback.html';
const legacyCallbackUrl = `https://${projectRef}.supabase.co/functions/v1/auth-callback`;

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
  console.error('Token manquant : SUPABASE_ACCESS_TOKEN ou server/.env');
  console.error('https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

const inviteLink = `${callbackUrl}?token_hash={{ .TokenHash }}&type=invite`;
const recoveryLink = `${callbackUrl}?token_hash={{ .TokenHash }}&type=recovery`;

const body = {
  site_url: callbackUrl,
  uri_allow_list: [
    callbackUrl,
    legacyCallbackUrl,
    'theloop://auth/callback',
    'theloop://**',
    'exp://**',
    'https://theloop-app.com/auth/callback',
    'https://www.theloop-app.com/auth/callback',
  ].join(','),
  mailer_subjects_invite: 'Invitation THE LOOP',
  mailer_templates_invite_content: `<!DOCTYPE html>
<html lang="fr"><body style="font-family:system-ui,sans-serif;color:#0a0a0a;">
<h2 style="color:#c9a84c;">THE LOOP</h2>
<p>Vous avez été invité(e) à rejoindre THE LOOP.</p>
<p>Cliquez ci-dessous pour choisir votre mot de passe et activer votre compte :</p>
<p><a href="${inviteLink}" style="display:inline-block;padding:14px 22px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:12px;font-weight:700;">Accepter l'invitation</a></p>
<p style="color:#636e72;font-size:13px;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/>${inviteLink.replace('{{ .TokenHash }}', '[token]')}</p>
</body></html>`,
  mailer_subjects_recovery: 'Réinitialisation mot de passe — THE LOOP',
  mailer_templates_recovery_content: `<!DOCTYPE html>
<html lang="fr"><body style="font-family:system-ui,sans-serif;color:#0a0a0a;">
<h2 style="color:#c9a84c;">THE LOOP</h2>
<p>Demande de réinitialisation de mot de passe.</p>
<p><a href="${recoveryLink}" style="display:inline-block;padding:14px 22px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:12px;font-weight:700;">Choisir un nouveau mot de passe</a></p>
</body></html>`,
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

console.log('OK — templates invite/recovery + redirect URLs');
console.log('Site URL     :', callbackUrl);
console.log('Invite link  :', inviteLink);
