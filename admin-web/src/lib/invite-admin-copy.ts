/** Libellés admin-web / parcours activation invité (alignés app + e-mail). */

export const INVITE_ACTIVATE_LINK_LABEL = 'Activer un compte invité par THE LOOP';

export function formatInviteAdminFeedback(email: string, mailMode?: string | null): string {
  const e = email.trim();
  if (mailMode === 'invite_in_app') {
    return (
      `Invitation enregistrée pour ${e}. ` +
      `Aucun nouvel e-mail (adresse déjà connue). ` +
      `Demandez à la personne d’ouvrir THE LOOP → Connexion → « ${INVITE_ACTIVATE_LINK_LABEL} » avec cette adresse.`
    );
  }
  if (mailMode === 'recovery_resent') {
    return (
      `Invitation enregistrée pour ${e}. ` +
      `Un e-mail avec un code à 6 chiffres peut arriver (objet « Code de vérification — THE LOOP »). ` +
      `Si un autre message propose de réinitialiser le mot de passe sans demande, ignorez-le. ` +
      `Activation : THE LOOP → Connexion → « ${INVITE_ACTIVATE_LINK_LABEL} ».`
    );
  }
  return (
    `E-mail d’invitation THE LOOP envoyé à ${e}. ` +
    `La personne ouvre THE LOOP → Connexion → « ${INVITE_ACTIVATE_LINK_LABEL} » avec cette adresse. Pensez aux courriers indésirables.`
  );
}
