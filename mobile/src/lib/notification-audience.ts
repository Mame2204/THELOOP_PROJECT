/** Types audience partagés (évite import circulaire notifications ↔ admin-notifications). */

export type NotificationAudience =
  | 'all'
  | 'everyone'
  | 'guests_phone'
  | 'members'
  | 'prime'
  | 'prime_members'
  | 'partner'
  | 'admin'
  | 'favorites'
  | 'birthday'
  | 'individual';

export const AUDIENCE_LABELS: Record<NotificationAudience, string> = {
  all: 'Comptes (tous rôles)',
  everyone: 'Tous les comptes',
  guests_phone: 'Sans compte (téléphones)',
  members: 'Membres',
  prime: 'Prime',
  prime_members: 'Prime + Membres',
  partner: 'Partenaires',
  admin: 'Administrateurs',
  favorites: 'Favoris par catégorie',
  birthday: 'Anniversaires du mois',
  individual: 'Numéros ciblés',
};
