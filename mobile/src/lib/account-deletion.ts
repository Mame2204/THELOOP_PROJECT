import { Linking } from 'react-native';
import { SUPPORT_EMAIL } from '@/lib/support-contact';

export function buildAccountDeletionMailUrl(input: {
  email?: string | null;
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const name = [input.firstName, input.lastName].filter(Boolean).join(' ').trim() || '—';
  const subject = encodeURIComponent('Demande de suppression de compte THE LOOP');
  const body = encodeURIComponent(
    [
      'Bonjour,',
      '',
      'Je souhaite supprimer définitivement mon compte THE LOOP conformément au RGPD.',
      '',
      `Nom : ${name}`,
      `E-mail : ${input.email ?? '—'}`,
      `Identifiant : ${input.id ?? '—'}`,
      '',
      'Merci de confirmer la prise en charge de ma demande.',
    ].join('\n'),
  );
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

export async function openAccountDeletionRequest(input: {
  email?: string | null;
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): Promise<boolean> {
  const url = buildAccountDeletionMailUrl(input);
  return Linking.canOpenURL(url).then((ok) => {
    if (!ok) return false;
    return Linking.openURL(url).then(() => true).catch(() => false);
  });
}
