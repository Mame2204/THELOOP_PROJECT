import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { UserRole } from '@/types';
import type { PrimeBillingPeriod } from '@/lib/prime-plans';

export type RootStackParamList = {
  Tabs: undefined;
  EventDetail: { slug: string };
  SpotDetail: { slug: string };
  Auth: { mode?: 'login' | 'signup' | 'activate' | 'reset' | 'set_password' } | undefined;
  Prime: undefined;
  PassPayment: { period: PrimeBillingPeriod };
  PartnerApply: undefined;
  Suggestion: undefined;
  PartnerValidationCode: undefined;
  PartnerBenefitScan: {
    partnerId: string;
    partnerName: string;
    partnerCode: string;
    establishmentId?: string;
    establishmentType?: 'event' | 'spot' | 'tool';
    establishmentTitle?: string;
  };
  PartnerBenefitConfirm: {
    partnerId: string;
    partnerName: string;
    partnerCode: string;
    memberUserId: string;
    memberFirstName: string | null;
    memberLastName: string | null;
    memberPhone: string | null;
    memberRole: UserRole;
    establishmentId?: string;
    establishmentType?: 'event' | 'spot' | 'tool';
    establishmentTitle?: string;
  };
  EditProfil: undefined;
  Settings: undefined;
  Abonnement: undefined;
  AdminModeration: { tab?: 'all' | 'events' | 'spots' | 'tools'; embedded?: boolean };
  PartnerSubmission: { type: 'event' | 'spot'; id?: string; asAdmin?: boolean; contentChannel?: 'admin' | 'loop'; isTool?: boolean };
  PartnerContent: undefined;
  PartnerBenefits: undefined;
  PartnerFeatured: undefined;
  PartnerRewards: undefined;
  AdminUsers: undefined;
  AdminNotifications: undefined;
  AdminContent: { tab?: 'all' | 'events' | 'spots' | 'tools' | 'walks' | 'corner' | 'chronique' | 'logos' };
  AdminFeatured: undefined;
  AdminInsights: { teamOnly?: boolean } | undefined;
  AdminPartnerships: { embedded?: boolean } | undefined;
  AdminPartnerMilestones: undefined;
  AdminReferralSettings: undefined;
  AdminSuggestions: { embedded?: boolean } | undefined;
  AdminDemandes: { filter?: 'partnerships' | 'moderation' | 'ideas' } | undefined;
  AdminCreateUser: undefined;
  AdminWaitlist: undefined;
  AdminPrimeBenefits: undefined;
  AdminBenefitTypes: undefined;
  AdminStaffBenefits: undefined;
  AdminBenefitDraw: undefined;
  AdminLoopContent: undefined;
  AdminLoopFeatured: undefined;
  AdminLoopStats: undefined;
  AdminLoopBenefits: undefined;
  AdminAutomationJobs: undefined;
  AdminCategories: undefined;
  AdminSpotStars: { tab?: 'top' | 'grant' | 'settings'; settingsOnly?: boolean } | undefined;
  AdminContentCountries: undefined;
  AdminLegal: undefined;
  AdminPermissions: undefined;
  AdminOpeningHours: undefined;
  AdminPassManagement: { section?: 'prices' | 'messages' } | undefined;
  AdminPayments: undefined;
  AdminCompta: undefined;
  AdminSuperSettings: undefined;
  AdminStandaloneBenefit: undefined;
  MyBenefits: undefined;
  Notifications: undefined;
  Referral: undefined;
  CreatorCornerDetail: { slug: string };
  FragmentDetail: { slug: string };
  LoopWalkDetail: { slug: string };
  LoopWalksList: undefined;
  PartnerPublic: { partnerId: string; partnerName: string; logoUrl?: string | null };
};

export type TabParamList = {
  Accueil: undefined;
  Agenda: undefined;
  Outils: undefined;
  Spots: undefined;
  Favoris: undefined;
  PartnerPro: undefined;
  PartnerStats: undefined;
  AdminTower: undefined;
  Profil: undefined;
};

/** Panneaux du workspace admin (barre verticale + détail). */
export type AdminPanelParamList = {
  AdminAccueil: { tab?: 'overview' | 'featured' | 'poll' | 'walks' | 'corner' | 'chronique' | 'logos' } | undefined;
  AdminRubrique: { rubrique: 'visibility' };
  AdminLoopHub: undefined;
  AdminContent: { tab?: 'all' | 'events' | 'spots' | 'tools' | 'walks' | 'corner' | 'chronique' | 'logos' };
  AdminSpotStars: { tab?: 'top' | 'grant' | 'settings'; settingsOnly?: boolean } | undefined;
  AdminFeatured: undefined;
  AdminInsights: { teamOnly?: boolean } | undefined;
  AdminUsers: undefined;
  AdminDemandes: { filter?: 'partnerships' | 'moderation' | 'ideas' } | undefined;
  AdminPartnerships: { embedded?: boolean } | undefined;
  AdminSuggestions: { embedded?: boolean } | undefined;
  AdminPrimeBenefits: undefined;
  AdminStaffBenefits: undefined;
  AdminBenefitDraw: undefined;
  AdminModeration: { tab?: 'all' | 'events' | 'spots' | 'tools'; embedded?: boolean };
  AdminPassManagement: { section?: 'prices' | 'messages' } | undefined;
  AdminPayments: undefined;
  AdminCompta: undefined;
  AdminSuperSettings: undefined;
};

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
