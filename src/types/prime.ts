import type { SubscriptionStatus } from '@/types';

export type PrimeInvitationStatus = 'pending' | 'activated' | 'expired' | 'suspended';

export interface PrimeInvitation {
  id: string;
  tokenCode: string;
  memberName: string;
  email: string | null;
  status: PrimeInvitationStatus;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt: string | null;
  activatedAt: string | null;
  activatedUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PrimeSectorTab =
  | 'corporate_finance'
  | 'tech_innovation'
  | 'mines_energy'
  | 'art_culture'
  | 'diaspora';

export const PRIME_SECTOR_LABELS: Record<PrimeSectorTab, string> = {
  corporate_finance: 'Corporate & Finance',
  tech_innovation: 'Tech & Innovation',
  mines_energy: 'Mines & Énergie',
  art_culture: 'Art & Culture',
  diaspora: 'Diaspora',
};

export type PrimePlan = 'monthly' | 'yearly';
export type PrimePaymentMethod = 'orange_money' | 'card';

export interface PrimeActivationProfile {
  firstName: string;
  lastName: string;
  jobTitle: string;
  company: string;
  sector: string;
  phone: string;
  email: string;
  password: string;
}
