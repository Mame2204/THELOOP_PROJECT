/** Initiales Prénom + Nom. Placeholder neutre si données absentes ou en chargement. */
export function getUserInitials(
  firstName?: string | null,
  lastName?: string | null,
  options?: { loading?: boolean },
): string {
  if (options?.loading) return '··';
  const first = firstName?.trim();
  const last = lastName?.trim();
  if (first && last) return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
  if (first) return first.slice(0, 2).toUpperCase();
  if (last) return last.slice(0, 2).toUpperCase();
  return '··';
}

export function formatDisplayName(firstName?: string | null, lastName?: string | null): string {
  return `${firstName ?? ''} ${lastName ?? ''}`.trim();
}

const DB_USER_ROLE_LABELS: Record<string, string> = {
  member: 'Membre',
  admin: 'Administrateur',
  partner: 'Partenaire',
  prime: 'Loop Prime',
};

/** Libellé affiché pour users.user_role (valeur brute en base). */
export function formatDbUserRole(userRole?: string | null): string {
  if (!userRole) return 'Membre';
  const key = userRole.toLowerCase();
  return DB_USER_ROLE_LABELS[key] ?? userRole.charAt(0).toUpperCase() + userRole.slice(1);
}
