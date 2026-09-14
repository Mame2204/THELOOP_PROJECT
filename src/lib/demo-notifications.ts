export interface AppNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export const DEMO_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n-1',
    title: 'Nouvel événement à la une',
    body: 'Forum Leaders & Finance — places limitées pour les membres.',
    createdAt: '2026-07-01T09:00:00+00:00',
    read: false,
  },
  {
    id: 'n-2',
    title: 'Rappel favori',
    body: 'Nuit Étoilée — Fally Ipupa commence dans 3 jours.',
    createdAt: '2026-06-30T18:30:00+00:00',
    read: false,
  },
  {
    id: 'n-3',
    title: 'Spots mis à jour',
    body: 'L\'Avenue ajoute de nouvelles photos et horaires.',
    createdAt: '2026-06-28T11:00:00+00:00',
    read: true,
  },
];

export function formatNotificationDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
