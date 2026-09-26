/** Prénom / nom affichés quand l’admin n’a pas renseigné l’identité à l’invitation. */
export function defaultInviteFirstName(userRole?: string | null): string {
  const role = (userRole ?? 'member').toLowerCase();
  if (role === 'partner') return 'Partenaire';
  if (role === 'admin') return 'Administrateur';
  return 'Membre';
}

export const DEFAULT_INVITE_LAST_NAME = 'THE LOOP';

export function resolveInviteDisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  userRole?: string | null;
}): { firstName: string; lastName: string } {
  const first = input.firstName?.trim() || defaultInviteFirstName(input.userRole);
  const last = input.lastName?.trim() || DEFAULT_INVITE_LAST_NAME;
  return { firstName: first, lastName: last };
}
