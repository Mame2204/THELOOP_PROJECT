import { mapPassGrantCloudStatus } from '@/lib/pass-admin-store';
import type { SubscriptionRecord } from '@/lib/subscription-history';

describe('pass cloud status mapping', () => {
  function pass(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
    return {
      id: 'p1',
      type: 'prime',
      status: 'active',
      startedAt: '2026-08-06T00:00:00.000Z',
      expiresAt: '2026-09-06T00:00:00.000Z',
      label: 'PASS mensuel',
      amountGnf: 850_000,
      paymentMethod: 'orange_money',
      ...overrides,
    };
  }

  it('pending reste pending en cloud (pas active)', () => {
    expect(mapPassGrantCloudStatus(pass({ status: 'pending' }))).toBe('pending');
  });

  it('intermediate mappe vers suspended', () => {
    expect(mapPassGrantCloudStatus(pass({ status: 'active', passKind: 'intermediate' }))).toBe('suspended');
  });
});
