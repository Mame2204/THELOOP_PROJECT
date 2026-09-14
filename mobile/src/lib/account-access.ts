import { SUPPORT_PHONE_DISPLAY } from '@/lib/support-contact';

export type AccountAccessStatus = 'active' | 'suspended' | 'archived' | 'deleted';

export function resolveAccountAccessStatus(row: {
  account_status?: string | null;
  is_active?: boolean | null;
}): AccountAccessStatus {
  const raw = String(row.account_status ?? '').trim().toLowerCase();
  if (raw === 'deleted') return 'deleted';
  if (raw === 'archived') return 'archived';
  if (raw === 'suspended') return 'suspended';
  if (row.is_active === false) return 'suspended';
  return 'active';
}

export function accountLoginBlockedMessage(status: AccountAccessStatus): string {
  switch (status) {
    case 'suspended':
      return [
        'Votre compte THE LOOP est suspendu.',
        '',
        'Vous ne pouvez plus vous connecter ni accéder à l’application tant que la suspension est active.',
        '',
        `Pour contester ou demander une réactivation, contactez le service clientèle via WhatsApp : ${SUPPORT_PHONE_DISPLAY}.`,
      ].join('\n');
    case 'archived':
      return `Votre compte est archivé. Contactez le service clientèle THE LOOP via WhatsApp : ${SUPPORT_PHONE_DISPLAY}.`;
    case 'deleted':
      return "Compte introuvable. Créez un compte d'abord.";
    default:
      return '';
  }
}

export function accountStatusLabel(status: AccountAccessStatus): string {
  switch (status) {
    case 'active':
      return 'Actif';
    case 'suspended':
      return 'Suspendu';
    case 'archived':
      return 'Archivé';
    case 'deleted':
      return 'Supprimé';
  }
}
