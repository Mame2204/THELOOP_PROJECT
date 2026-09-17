import {
  isCatalogEligibleForDraw,
  isDelegatedAdminDrawUser,
  isSuperAdminDrawUser,
} from '@/lib/admin-benefit-draw-store';
import type { RoleBenefitEntitlementsConfig } from '@/lib/role-benefit-entitlements-store';

const EMPTY_CONFIG: RoleBenefitEntitlementsConfig = {
  member: [],
  prime: [],
  partner: [],
  admin: [],
  updatedAt: new Date(0).toISOString(),
  updatedBy: null,
};

describe('isCatalogEligibleForDraw', () => {
  it('accepte une campagne limitée non associée au rôle', () => {
    expect(isCatalogEligibleForDraw('cat-dinner', 'standard', ['USER_FREE'], EMPTY_CONFIG)).toBe(true);
  });

  it('exclut un privilège octroyé à tous les membres', () => {
    const config: RoleBenefitEntitlementsConfig = {
      ...EMPTY_CONFIG,
      member: [{ catalogId: 'cat-global' }],
    };
    expect(isCatalogEligibleForDraw('cat-global', 'standard', ['USER_FREE'], config)).toBe(false);
    expect(isCatalogEligibleForDraw('cat-global', 'standard', ['USER_PRIME'], config)).toBe(true);
  });

  it('conserve les codes promo même si associés au rôle', () => {
    const config: RoleBenefitEntitlementsConfig = {
      ...EMPTY_CONFIG,
      member: [{ catalogId: 'promo-ig' }],
    };
    expect(isCatalogEligibleForDraw('promo-ig', 'promo_code', ['USER_FREE'], config)).toBe(true);
  });

  it('identifie admin délégué vs super admin pour le pool', () => {
    expect(isSuperAdminDrawUser({ userRole: 'super_admin' })).toBe(true);
    expect(isDelegatedAdminDrawUser({ userRole: 'admin', role: 'ADMIN' })).toBe(true);
    expect(isDelegatedAdminDrawUser({ userRole: 'super_admin', role: 'ADMIN' })).toBe(false);
  });

  it('exclut un privilège octroyé à tous les partenaires', () => {
    const config: RoleBenefitEntitlementsConfig = {
      ...EMPTY_CONFIG,
      partner: [{ catalogId: 'cat-partner-gift' }],
    };
    expect(isCatalogEligibleForDraw('cat-partner-gift', 'standard', ['PARTNER'], config)).toBe(false);
    expect(isCatalogEligibleForDraw('cat-partner-gift', 'standard', ['USER_FREE'], config)).toBe(true);
  });

  it('exclut un privilège octroyé à tous les admins délégués', () => {
    const config: RoleBenefitEntitlementsConfig = {
      ...EMPTY_CONFIG,
      admin: [{ catalogId: 'cat-staff-gift' }],
    };
    expect(isCatalogEligibleForDraw('cat-staff-gift', 'standard', ['ADMIN'], config)).toBe(false);
  });
});
