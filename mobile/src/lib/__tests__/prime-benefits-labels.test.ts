import {
  benefitBlocksCatalogRegrant,
  canRevokeBenefit,
  getBenefitCardKey,
  getBenefitExpiryLabel,
  getRoleEntitlementBadge,
  grantRegrantSlotKey,
  refreshBenefitStatuses,
  type PrimeBenefit,
} from '@/lib/prime-benefits-store';

function benefit(overrides: Partial<PrimeBenefit> = {}): PrimeBenefit {
  return {
    id: 'ben-1',
    userId: 'user-1',
    userPhone: null,
    catalogId: 'cat-1',
    title: 'Test',
    description: 'Desc',
    partnerName: 'Partenaire',
    benefitKind: 'unlimited',
    quantityTotal: null,
    quantityUsed: 0,
    maxUses: null,
    usesCount: 0,
    status: 'active',
    grantedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2099-12-31T00:00:00.000Z',
    usedAt: null,
    grantedBy: 'admin',
    grantAudience: 'individual',
    customNote: null,
    ...overrides,
  };
}

describe('prime-benefits labels & rules', () => {
  it('badges rôle Membre / Prime uniquement', () => {
    expect(getRoleEntitlementBadge(benefit({ roleEntitlement: 'member' }))).toBe('Membre');
    expect(getRoleEntitlementBadge(benefit({ roleEntitlement: 'prime' }))).toBe('Prime');
    expect(getRoleEntitlementBadge(benefit({ grantAudience: 'birthday' }))).toBeNull();
  });

  it('clés cartes distinctes pour même catalogue, origines différentes', () => {
    const role = benefit({ id: 'role-1', roleEntitlement: 'prime', grantedAt: '2026-01-01T00:00:00.000Z' });
    const admin = benefit({ id: 'admin-1', grantedAt: '2026-02-01T00:00:00.000Z' });
    expect(getBenefitCardKey(role)).not.toBe(getBenefitCardKey(admin));
  });

  it('entitlements rôle non révocables', () => {
    expect(canRevokeBenefit(benefit({ roleEntitlement: 'member' }))).toBe(false);
    expect(canRevokeBenefit(benefit({ roleEntitlement: 'prime' }))).toBe(false);
    expect(canRevokeBenefit(benefit())).toBe(true);
  });

  it('conserve expired_unused après révocation admin (validité à l’activation)', () => {
    const revoked = benefit({
      status: 'expired_unused',
      validityStartsOnActivation: true,
      activatedAt: null,
      expiresAt: new Date().toISOString(),
    });
    const [refreshed] = refreshBenefitStatuses([revoked]);
    expect(refreshed.status).toBe('expired_unused');
    expect(canRevokeBenefit(refreshed)).toBe(false);
  });

  it('libellé expiration sans préfixe rôle', () => {
    expect(getBenefitExpiryLabel(benefit({ roleEntitlement: 'member' }))).toBe('Valable sans limite');
    expect(getBenefitExpiryLabel(benefit({ roleEntitlement: 'prime', expiresAt: '2026-12-31T00:00:00.000Z' }))).toContain(
      '2026',
    );
  });

  it('autorise re-octroi après consommation ou expiration', () => {
    expect(benefitBlocksCatalogRegrant(benefit({ status: 'used', usedAt: '2026-03-01T00:00:00.000Z' }))).toBe(false);
    expect(benefitBlocksCatalogRegrant(benefit({ status: 'expired_unused' }))).toBe(false);
    expect(
      benefitBlocksCatalogRegrant(
        benefit({ status: 'pending_validation', usedAt: '2026-03-01T00:00:00.000Z', usesCount: 1 }),
      ),
    ).toBe(false);
  });

  it('bloque re-octroi si avantage encore actif ou en validation', () => {
    expect(benefitBlocksCatalogRegrant(benefit({ status: 'active' }))).toBe(true);
    expect(benefitBlocksCatalogRegrant(benefit({ status: 'pending_validation' }))).toBe(true);
    expect(
      benefitBlocksCatalogRegrant(
        benefit({
          status: 'active',
          benefitKind: 'quantity',
          quantityTotal: 2,
          quantityUsed: 1,
        }),
      ),
    ).toBe(true);
  });

  it('autorise re-octroi si consommation totale même avec statut local incohérent', () => {
    expect(
      benefitBlocksCatalogRegrant(
        benefit({
          status: 'active',
          benefitKind: 'unlimited',
          usedAt: '2026-03-01T00:00:00.000Z',
          usesCount: 1,
        }),
      ),
    ).toBe(false);
  });

  it('slots octroi distincts par catalogue et non par partenaire seul', () => {
    const partner = 'Le Spot Demo';
    expect(
      grantRegrantSlotKey(benefit({ catalogId: 'cat-a', partnerName: partner, contentId: 'spot-1' })),
    ).not.toBe(
      grantRegrantSlotKey(benefit({ catalogId: 'cat-b', partnerName: partner, contentId: 'spot-1' })),
    );
    expect(
      grantRegrantSlotKey(benefit({ catalogId: 'cat-a', partnerName: partner, contentId: 'spot-1' })),
    ).not.toBe(
      grantRegrantSlotKey(benefit({ catalogId: 'cat-a', partnerName: partner, contentId: 'spot-2' })),
    );
  });
});
