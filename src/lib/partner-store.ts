import type { PartnerWorkspace } from '@/types/partner';

const PARTNER_STORE_KEY = 'loop_partner_workspace';

function defaultWorkspace(): PartnerWorkspace {
  return {
    addresses: [
      {
        id: 'addr-1',
        name: 'L\'Avenue — Kaloum',
        address: 'Rue du Commerce, Kaloum',
        city: 'Conakry',
        status: 'pending',
        stagingId: null,
      },
      {
        id: 'addr-2',
        name: 'L\'Avenue — Terrasse',
        address: 'Corniche Nord',
        city: 'Conakry',
        status: 'pending',
        stagingId: null,
      },
    ],
    events: [
      {
        id: 'pevt-1',
        title: 'Brunch Business — Édition VIP',
        description: 'Brunch networking pour décideurs et partenaires.',
        program: '11h00 Accueil · 12h00 Brunch · 14h00 Networking',
        category: 'gastronomie',
        startsAt: '2026-08-10T11:00:00+00:00',
        endsAt: '2026-08-10T14:00:00+00:00',
        addressId: 'addr-1',
        venueName: 'L\'Avenue — Kaloum',
        venueAddress: 'Rue du Commerce, Kaloum, Conakry',
        entryPrice: 120000,
        currency: 'GNF',
        speakers: 'Chef Amadou Sylla',
        status: 'pending',
        stagingId: null,
        createdAt: '2026-07-01T10:00:00+00:00',
      },
    ],
    categories: [
      { id: 'pcat-1', label: 'Fine Dining', emoji: '🍽️' },
      { id: 'pcat-2', label: 'Corporate Lunch', emoji: '💼' },
    ],
  };
}

export function loadPartnerWorkspace(partnerId: string): PartnerWorkspace {
  try {
    const raw = localStorage.getItem(`${PARTNER_STORE_KEY}_${partnerId}`);
    if (!raw) return defaultWorkspace();
    return JSON.parse(raw) as PartnerWorkspace;
  } catch {
    return defaultWorkspace();
  }
}

export function savePartnerWorkspace(partnerId: string, workspace: PartnerWorkspace): void {
  localStorage.setItem(`${PARTNER_STORE_KEY}_${partnerId}`, JSON.stringify(workspace));
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
