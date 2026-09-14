import type { EventCategory } from '@/types';
import type { PartnerActivityType } from '@/types/partner';
import type { UserRole } from '@/types';

export type ModerationStatus = 'pending' | 'approved' | 'rejected';
export interface AdminPartnershipApplication {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  activityType: PartnerActivityType;
  message: string;
  status: ModerationStatus;
  submittedAt: string;
  reviewedAt: string | null;
  generatedTokenCode: string | null;
  rejectionReason: string | null;
}

export interface StagingEventItem {
  id: string;
  partnerId: string;
  partnerName: string;
  workspaceRefId: string | null;
  title: string;
  description: string;
  program: string | null;
  category: EventCategory;
  startsAt: string;
  endsAt: string | null;
  venueName: string;
  venueAddress: string;
  entryPrice: number | null;
  currency: string;
  speakers: string;
  status: ModerationStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StagingLocationItem {
  id: string;
  partnerId: string;
  partnerName: string;
  workspaceRefId: string | null;
  name: string;
  address: string;
  city: string;
  status: ModerationStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDirectPartnerInput {
  contactName: string;
  companyName: string;
  email: string;
  phone: string;
  activityType: PartnerActivityType;
}

export interface TopPerformerRow {
  rank: number;
  id: string;
  name: string;
  clicks: number;
  conversionRate: number;
  type: 'event' | 'location';
  partnerName: string | null;
  category: string;
}

export interface AnalyticsPartnerOption {
  id: string;
  name: string;
}

export interface AnalyticsContentOption {
  id: string;
  name: string;
  type: 'event' | 'location';
  partnerName: string | null;
}

export interface AnalyticsSnapshot {
  totalVisits: number;
  eventClicks: number;
  globalCtr: number;
  activePartners: number;
  visitsDelta: string;
  clicksDelta: string;
  ctrDelta: string;
  partnersDelta: string;
  categoryRates: Record<'corporate' | 'nightlife' | 'art_culture' | 'gastronomie', number>;
  topPerformers: TopPerformerRow[];
  partnerBreakdown: { partnerName: string; clicks: number; share: number }[];
  dailyTrend: { label: string; visits: number; clicks: number }[];
}

export interface PlatformCategory {
  id: string;
  label: string;
  emoji: string;
  eventCategory: EventCategory;
  updatedAt: string;
}

export interface ManagedUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: 'active' | 'suspended';
  company: string | null;
  updatedAt: string;
}

export interface RetractionRequest {
  id: string;
  partnerId: string;
  partnerName: string;
  contentType: 'event' | 'location';
  stagingId: string;
  contentName: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}
