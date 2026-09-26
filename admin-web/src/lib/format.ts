/** Bandeau admin : « Prénom Nom · e-mail » ou e-mail seul. */
export function formatAdminIdentity(profile: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const name = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim();
  const email = profile.email.trim();
  if (name && email) return `${name} · ${email}`;
  return name || email || 'Administrateur';
}

export function formatWhen(iso: string | null): string {
  if (!iso) return 'Jamais';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function statusBadge(status: string): string {
  if (status === 'paid') return 'ok';
  if (status === 'failed' || status === 'cancelled') return 'err';
  return 'warn';
}
