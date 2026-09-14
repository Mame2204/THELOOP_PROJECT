import {
  canViewBenefitsForInterestCountry,
  userMatchesBenefitCountry,
  userQualifiesForAdminEntitlements,
  userQualifiesForDelegatedAdminEntitlements,
  userQualifiesForMemberEntitlements,
  userQualifiesForPrimeEntitlements,
} from '@/lib/role-benefit-eligibility';
import type { User } from '@/types';

function baseUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'test@theloop.gn',
    firstName: 'Test',
    lastName: 'User',
    fullName: 'Test User',
    phoneNumber: '+22462000001',
    userRole: 'member',
    qrCodeToken: 'token',
    avatarUrl: null,
    role: 'USER_FREE',
    company: null,
    jobTitle: null,
    sector: null,
    isDirectoryOptIn: false,
    subscriptionStatus: 'none',
    subscriptionExpiresAt: null,
    countryCode: 'GN',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('role-benefit-eligibility', () => {
  it('membre gratuit → entitlements Membre', () => {
    const user = baseUser();
    expect(userQualifiesForMemberEntitlements(user)).toBe(true);
    expect(userQualifiesForPrimeEntitlements(user)).toBe(false);
  });

  it('PASS Prime → entitlements Prime uniquement, pas Membre', () => {
    const user = baseUser({
      role: 'USER_PRIME',
      userRole: 'prime',
      subscriptionStatus: 'active',
    });
    expect(userQualifiesForPrimeEntitlements(user)).toBe(true);
    expect(userQualifiesForMemberEntitlements(user)).toBe(false);
  });

  it('membre forcé admin avec PASS suspendu → pas entitlements Prime', () => {
    const user = baseUser({
      role: 'USER_FREE',
      userRole: 'member',
      subscriptionStatus: 'suspended',
      subscriptionExpiresAt: '2026-09-06T00:00:00.000Z',
    });
    expect(userQualifiesForPrimeEntitlements(user)).toBe(false);
    expect(userQualifiesForMemberEntitlements(user)).toBe(true);
  });

  it('abonnement actif sans rôle Prime app → Prime oui', () => {
    const user = baseUser({ role: 'USER_FREE', userRole: 'prime', subscriptionStatus: 'active' });
    expect(userQualifiesForPrimeEntitlements(user)).toBe(true);
    expect(userQualifiesForMemberEntitlements(user)).toBe(false);
  });

  it('admin / super admin → entitlements Admin uniquement, pas broadcast auto Prime', () => {
    const admin = baseUser({ role: 'ADMIN', userRole: 'admin' });
    const superAdmin = baseUser({ role: 'ADMIN', userRole: 'super_admin' });
    expect(userQualifiesForPrimeEntitlements(admin)).toBe(false);
    expect(userQualifiesForMemberEntitlements(admin)).toBe(false);
    expect(userQualifiesForAdminEntitlements(admin)).toBe(true);
    expect(userQualifiesForDelegatedAdminEntitlements(admin)).toBe(true);
    expect(userQualifiesForPrimeEntitlements(superAdmin)).toBe(false);
    expect(userQualifiesForAdminEntitlements(superAdmin)).toBe(true);
    expect(userQualifiesForDelegatedAdminEntitlements(superAdmin)).toBe(false);
  });
});

describe('userMatchesBenefitCountry', () => {
  it('match pays de compte ou pays d’intérêt', () => {
    const user = baseUser({ countryCode: 'GN', interestCountryCode: 'SN' });
    expect(userMatchesBenefitCountry(user, 'GN')).toBe(true);
    expect(userMatchesBenefitCountry(user, 'SN')).toBe(true);
    expect(userMatchesBenefitCountry(user, 'CI')).toBe(false);
    expect(canViewBenefitsForInterestCountry(user, 'SN')).toBe(true);
  });
});
