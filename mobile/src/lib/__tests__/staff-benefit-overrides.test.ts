import {
  resolveStaffAdminEntitlementEntriesPure,
  type StaffBenefitOverrides,
} from '@/lib/staff-benefit-overrides-store';
import type { RoleBenefitEntitlementEntry } from '@/lib/role-benefit-entitlements-store';
import type { BenefitCatalogItem } from '@/lib/benefit-catalog-store';
import type { User } from '@/types';

const team: RoleBenefitEntitlementEntry[] = [
  { catalogId: 'a1', partnerId: 'p1', partnerDisplayName: 'Spot A' },
  { catalogId: 'a2', partnerId: 'p2', partnerDisplayName: 'Spot B' },
  { catalogId: 'a3', partnerId: 'p3', partnerDisplayName: 'Spot C' },
];

const catalog: BenefitCatalogItem[] = [
  {
    id: 'a1',
    title: 'A1',
    description: '',
    offeringPartners: [{ partnerId: 'p1', displayName: 'Spot A' }],
    defaultValidityDays: 30,
    benefitKind: 'unlimited',
    quantityPerGrant: null,
    maxUsesPerGrant: null,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'a2',
    title: 'A2',
    description: '',
    offeringPartners: [{ partnerId: 'p2', displayName: 'Spot B' }],
    defaultValidityDays: 30,
    benefitKind: 'unlimited',
    quantityPerGrant: null,
    maxUsesPerGrant: null,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'a3',
    title: 'A3',
    description: '',
    offeringPartners: [{ partnerId: 'p3', displayName: 'Spot C' }],
    defaultValidityDays: 30,
    benefitKind: 'unlimited',
    quantityPerGrant: null,
    maxUsesPerGrant: null,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'x1',
    title: 'Extra',
    description: '',
    offeringPartners: [{ partnerId: 'px', displayName: 'Extra' }],
    defaultValidityDays: 30,
    benefitKind: 'unlimited',
    quantityPerGrant: null,
    maxUsesPerGrant: null,
    isActive: true,
    countryCode: 'SN',
    createdAt: '',
    updatedAt: '',
  },
];

function adminUser(overrides: Partial<User> = {}): User {
  return {
    id: 'admin-1',
    email: 'admin@theloop.gn',
    firstName: 'Admin',
    lastName: 'Test',
    fullName: 'Admin Test',
    phoneNumber: '+22462000001',
    userRole: 'admin',
    qrCodeToken: 't',
    avatarUrl: null,
    role: 'ADMIN',
    company: null,
    jobTitle: null,
    sector: null,
    isDirectoryOptIn: false,
    subscriptionStatus: 'none',
    subscriptionExpiresAt: null,
    countryCode: 'GN',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function overrides(partial: Partial<StaffBenefitOverrides>): StaffBenefitOverrides {
  return {
    userId: 'admin-1',
    revokedCatalogIds: [],
    extra: [],
    enabledCatalogIds: [],
    updatedAt: '',
    ...partial,
  };
}

describe('staff-benefit-overrides', () => {
  it('admin standard — pack équipe moins révocations + extras', () => {
    const user = adminUser();
    const result = resolveStaffAdminEntitlementEntriesPure(
      user,
      team,
      overrides({ revokedCatalogIds: ['a2'], extra: [{ catalogId: 'x1', partnerId: 'px' }] }),
      catalog,
    );
    expect(result.map((e) => e.catalogId).sort()).toEqual(['a1', 'a3', 'x1']);
  });

  it('super admin — uniquement les avantages activés individuellement', () => {
    const user = adminUser({ userRole: 'super_admin' });
    const result = resolveStaffAdminEntitlementEntriesPure(
      user,
      team,
      overrides({ enabledCatalogIds: ['x1', 'a2'] }),
      catalog,
    );
    expect(result.map((e) => e.catalogId).sort()).toEqual(['a2', 'x1']);
  });

  it('super admin — pack équipe ignoré si non activé', () => {
    const user = adminUser({ userRole: 'super_admin' });
    const result = resolveStaffAdminEntitlementEntriesPure(
      user,
      team,
      overrides({ enabledCatalogIds: [] }),
      catalog,
    );
    expect(result).toEqual([]);
  });
});
