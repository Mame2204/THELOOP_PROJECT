import { mergePrimeBenefits } from '@/lib/prime-benefits-sync';
import type { PrimeBenefit } from '@/lib/prime-benefits-store';

function benefit(id: string, status: PrimeBenefit['status'] = 'active'): PrimeBenefit {
  return {
    id,
    userId: 'user-1',
    userPhone: null,
    catalogId: 'cat-1',
    title: id,
    description: 'Desc',
    partnerName: 'Partenaire',
    benefitKind: 'unlimited',
    quantityTotal: null,
    quantityUsed: 0,
    maxUses: null,
    usesCount: 0,
    status,
    grantedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2099-12-31T00:00:00.000Z',
    usedAt: null,
    grantedBy: 'admin',
    grantAudience: 'individual',
    customNote: null,
  };
}

describe('mergePrimeBenefits', () => {
  it('fusionne local et remote par id', () => {
    const merged = mergePrimeBenefits([benefit('local-only')], [benefit('remote-only')]);
    expect(merged.map((b) => b.id).sort()).toEqual(['local-only', 'remote-only']);
  });

  it('priorise pending_validation si présent local ou remote', () => {
    const merged = mergePrimeBenefits(
      [benefit('shared', 'active')],
      [benefit('shared', 'pending_validation')],
    );
    expect(merged.find((b) => b.id === 'shared')?.status).toBe('pending_validation');
  });

  it('local enrichit le remote sur même id', () => {
    const local = benefit('role-ben-u-cat-member', 'active');
    local.roleEntitlement = 'member';
    local.catalogId = 'cat-lavenue';
    const remote = benefit('role-ben-u-cat-member', 'active');
    const merged = mergePrimeBenefits([local], [remote]);
    expect(merged[0].roleEntitlement).toBe('member');
    expect(merged[0].catalogId).toBe('cat-lavenue');
  });

  it('remote consommé avec used_at bloque le re-octroi via merge', () => {
    const remote = benefit('admin-grant-1', 'active');
    remote.usedAt = '2026-03-01T00:00:00.000Z';
    remote.status = 'used';
    const local = benefit('admin-grant-1', 'pending_validation');
    const merged = mergePrimeBenefits([local], [remote]);
    expect(merged[0].status).toBe('used');
  });
});
