import { mergeRoleEntitlementConfigs } from '@/lib/role-benefit-entitlements-store';

describe('mergeRoleEntitlementConfigs', () => {
  const local = {
    member: [{ catalogId: 'cat-a' }],
    prime: [],
    admin: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: null,
  };

  it('garde le local si remote absent', () => {
    expect(mergeRoleEntitlementConfigs(local, null)).toEqual(local);
  });

  it('prend le remote si plus récent', () => {
    const remote = {
      member: [],
      prime: [{ catalogId: 'cat-b' }],
      admin: [],
      updatedAt: '2026-06-01T00:00:00.000Z',
      updatedBy: 'admin',
    };
    expect(mergeRoleEntitlementConfigs(local, remote)).toEqual(remote);
  });

  it('garde le local si plus récent que remote', () => {
    const remote = {
      member: [{ catalogId: 'old' }],
      prime: [],
      admin: [],
      updatedAt: '2025-01-01T00:00:00.000Z',
      updatedBy: null,
    };
    expect(mergeRoleEntitlementConfigs(local, remote)).toEqual(local);
  });
});
