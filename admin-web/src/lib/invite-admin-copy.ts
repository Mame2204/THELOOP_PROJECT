/** Libellés admin-web / parcours activation invité (alignés app + e-mail). */

export const INVITE_ACTIVATE_LINK_LABEL = 'Activer un compte invité par THE LOOP';

export function formatInviteAdminFeedback(email: string, mailMode?: string | null): string {
  const e = email.trim();
  if (mailMode === 'invite_in_app') {
    return (
      `Invitation enregistrée pour ${e}. ` +
      `Aucun nouvel e-mail envoyé (adresse déjà connue). ` +
      `Indiquez à l'invité : application THE LOOP → Connexion → « ${INVITE_ACTIVATE_LINK_LABEL} ».`
    );
  }
  if (mailMode === 'recovery_resent') {
    return (
      `Invitation enregistrée pour ${e}. ` +
      `Un e-mail « mot de passe oublié » a pu partir par erreur (ancien comportement) — ` +
      `l'invité doit utiliser l'app → Connexion → « ${INVITE_ACTIVATE_LINK_LABEL} », pas le lien de reset.`
    );
  }
  return (
    `E-mail d'invitation THE LOOP envoyé à ${e}. ` +
    `L'invité ouvre l'app → Connexion → « ${INVITE_ACTIVATE_LINK_LABEL} ». Vérifiez les spams.`
  );
}
