/** Corps HTML des e-mails Auth Supabase (invite / confirmation / recovery). */

/** URL fixe API Render — ne pas utiliser {{ .SiteURL }} (souvent Edge / Storage Supabase). */
const API_AUTH_CALLBACK = 'https://api.theloop-app.com/auth/callback';
export const inviteActionHref = `${API_AUTH_CALLBACK}?token_hash={{ .TokenHash }}&type=invite`;
export const signupActionHref = `${API_AUTH_CALLBACK}?token_hash={{ .TokenHash }}&type=signup`;
export const recoveryActionHref = `${API_AUTH_CALLBACK}?token_hash={{ .TokenHash }}&type=recovery`;

const STORE_URL = 'https://www.theloop-app.com/';

export function loopEmailHtml({
  title,
  body,
  buttonLabel,
  footer,
  actionHref,
  alternateHint,
  showCopyLink = false,
  showActionButton = true,
}) {
  const copyLinkBlock = showCopyLink
    ? `<p style="margin:16px 0 0;font-size:11px;line-height:1.45;color:#9ca3af;word-break:break-all;">Si le bouton ne répond pas, copiez ce lien dans Safari ou Chrome : ${actionHref}</p>`
    : '';
  const alternateBlock = alternateHint
    ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#636e72;">${alternateHint}</p>`
    : '';
  const buttonBlock =
    showActionButton && actionHref && buttonLabel
      ? `<a href="${actionHref}" style="display:inline-block;padding:14px 22px;background:#0a0a0a;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">${buttonLabel}</a>`
      : '';
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
          ${buttonBlock}
          ${copyLinkBlock}
          ${alternateBlock}
          <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;">${footer}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildAuthEmailTemplatePatch(callbackUrl) {
  const inviteHtml = loopEmailHtml({
    title: 'Invitation THE LOOP',
    showActionButton: false,
    body:
      'Vous avez été invité(e) sur <strong>THE LOOP</strong>.<br /><br />' +
      '1. Installez l’application : <a href="' +
      STORE_URL +
      '" style="color:#0a0a0a;">theloop-app.com</a><br />' +
      '2. Ouvrez <strong>Connexion</strong> → <strong>« Activer un compte invité par THE LOOP »</strong><br />' +
      '3. Saisissez <strong>cette adresse e-mail</strong> et suivez les étapes (code à 6 chiffres, puis mot de passe).',
    footer:
      'Compte déjà actif ? Connectez-vous dans l’app. Mot de passe oublié ? Utilisez « Mot de passe oublié » sur l’écran Connexion.',
  });

  const confirmationHtml = loopEmailHtml({
    title: 'Confirmez votre e-mail',
    body:
      'Bienvenue sur THE LOOP. Touchez le bouton pour confirmer votre adresse e-mail et finaliser la création de votre compte.',
    buttonLabel: 'Confirmer mon e-mail',
    actionHref: signupActionHref,
    footer: "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
  });

  const recoveryHtml = loopEmailHtml({
    title: 'Code de vérification',
    body:
      'Voici votre code à <strong>6 chiffres</strong> pour THE LOOP. Saisissez-le dans l’application lors de l’activation de compte invité ou à l’étape « Code reçu par e-mail ». ' +
      'Ce code n’est pas votre mot de passe.<br /><br />' +
      '<strong style="font-size:22px;letter-spacing:0.2em;color:#0a0a0a;">{{ .Token }}</strong><br /><br />' +
      'Votre compte est déjà actif et vous souhaitez un nouveau mot de passe ? Utilisez le bouton ci-dessous (ignorez le code dans ce cas).',
    buttonLabel: 'Choisir un mot de passe',
    actionHref: recoveryActionHref,
    showCopyLink: false,
    footer: "Vous n'êtes pas à l'origine de cette demande ? Ignorez cet e-mail.",
  });

  return {
    site_url: callbackUrl,
    mailer_subjects_invite: 'Invitation THE LOOP',
    mailer_templates_invite_content: inviteHtml,
    mailer_subjects_confirmation: 'Confirmez votre e-mail — THE LOOP',
    mailer_templates_confirmation_content: confirmationHtml,
    mailer_subjects_recovery: 'Code de vérification — THE LOOP',
    mailer_templates_recovery_content: recoveryHtml,
  };
}
