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
      'Vous avez été invité(e) à rejoindre <strong>THE LOOP</strong> (application mobile).<br /><br />' +
      '<strong>1.</strong> Installez THE LOOP (<a href="' +
      STORE_URL +
      '" style="color:#0a0a0a;">theloop-app.com</a> · Google Play / App Store).<br />' +
      '<strong>2.</strong> Ouvrez l’application → <strong>Connexion</strong>.<br />' +
      '<strong>3.</strong> Touchez <strong>« Activer un compte invité par l’équipe »</strong>.<br />' +
      '<strong>4.</strong> Saisissez <strong>cette adresse e-mail</strong>, prénom, nom et mot de passe.<br /><br />' +
      'Pas de lien d’activation : tout se fait dans l’application.',
    footer:
      'Compte déjà actif ? Utilisez « Mot de passe oublié » dans l’app. THE LOOP ne propose pas d’espace web grand public.',
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
    title: 'Nouveau mot de passe',
    body:
      "Vous avez demandé à réinitialiser votre mot de passe THE LOOP. Touchez le bouton : l'app s'ouvrira si elle est installée, sinon vous pourrez choisir un nouveau mot de passe sur le web.",
    buttonLabel: 'Choisir un mot de passe',
    actionHref: recoveryActionHref,
    showCopyLink: true,
    footer:
      "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail — votre mot de passe actuel reste inchangé.",
  });

  return {
    site_url: callbackUrl,
    mailer_subjects_invite: 'Invitation THE LOOP',
    mailer_templates_invite_content: inviteHtml,
    mailer_subjects_confirmation: 'Confirmez votre e-mail — THE LOOP',
    mailer_templates_confirmation_content: confirmationHtml,
    mailer_subjects_recovery: 'Réinitialisation mot de passe — THE LOOP',
    mailer_templates_recovery_content: recoveryHtml,
  };
}
