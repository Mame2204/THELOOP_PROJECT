import type { EventCategory } from '@/types';

export interface PartnerAddress {
  id: string;
  name: string;
  address: string;
  city: string;
  status: PartnerAddressStatus;
  stagingId: string | null;
}

export interface PartnerCustomCategory {
  id: string;
  label: string;
  emoji: string;
}

export type PartnerEventStatus = 'draft' | 'pending' | 'published' | 'rejected';

export type PartnerAddressStatus = 'pending' | 'published' | 'rejected';

export interface PartnerEvent {
  id: string;
  title: string;
  description: string;
  program: string | null;
  category: EventCategory;
  startsAt: string;
  endsAt: string | null;
  addressId: string;
  venueName: string;
  venueAddress: string;
  entryPrice: number | null;
  currency: string;
  speakers: string;
  status: PartnerEventStatus;
  stagingId: string | null;
  createdAt: string;
}

export type PartnerActivityType =
  | 'restaurant'
  | 'bar_club'
  | 'association'
  | 'event_organizer'
  | 'other';

export const PARTNER_ACTIVITY_LABELS: Record<PartnerActivityType, string> = {
  restaurant: 'Restaurant',
  bar_club: 'Bar / Club',
  association: 'Association',
  event_organizer: 'Organisateur d\'événements',
  other: 'Autre',
};

export interface PartnerApplication {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  activityType: PartnerActivityType;
  message: string;
  submittedAt: string;
}

export interface PartnerWorkspace {
  addresses: PartnerAddress[];
  events: PartnerEvent[];
  categories: PartnerCustomCategory[];
}

export type PartnerHubTab = 'addresses' | 'events' | 'categories';
