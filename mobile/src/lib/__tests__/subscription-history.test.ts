import {
  getActiveSubscription,
  getPrimeSlotHolder,
  getPendingSubscriptions,
  isAdminGrantedPass,
  isHeritagePass,
  isReferralPass,
  formatPassHistoryPriceTag,
  passOccupiesPrimeSlot,
  type SubscriptionRecord,
} from '@/lib/subscription-history';

function pass(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    id: 'p1',
    type: 'prime',
    status: 'active',
    startedAt: '2026-08-06T00:00:00.000Z',
    expiresAt: '2027-09-06T00:00:00.000Z',
    label: 'PASS mensuel',
    billingPeriod: 'monthly',
    amountGnf: 850_000,
    paymentMethod: 'orange_money',
    passKind: 'standard',
    ...overrides,
  };
}

describe('subscription-history PASS slot & queue', () => {
  it('PASS suspendu (gel admin) occupe le créneau', () => {
    const suspended = pass({ status: 'suspended', passKind: 'intermediate' });
    expect(passOccupiesPrimeSlot(suspended)).toBe(true);
    expect(getPrimeSlotHolder([suspended])).toBe(suspended);
  });

  it('PASS acheté mensuel n’est pas Heritage', () => {
    const monthly = pass();
    expect(isHeritagePass(monthly)).toBe(false);
    expect(isAdminGrantedPass(monthly)).toBe(false);
  });

  it('historique PASS parrainage affiche mois offert, pas 0 GNF', () => {
    const referral = pass({
      passKind: 'referral',
      passCatalogId: 'pass-parrainage-builtin',
      label: 'PASS Parrainage (1 mois offerts)',
      amountGnf: 0,
      paymentMethod: undefined,
      billingPeriod: undefined,
      status: 'expired',
    });
    expect(formatPassHistoryPriceTag(referral)).toBe('1 mois offert');
  });

  it('PASS Parrainage (referral) n’est pas Heritage', () => {
    const referral = pass({
      passKind: 'referral',
      passCatalogId: 'pass-parrainage-builtin',
      label: 'PASS Parrainage (1 mois offerts)',
      amountGnf: 0,
      paymentMethod: undefined,
      billingPeriod: undefined,
    });
    expect(isReferralPass(referral)).toBe(true);
    expect(isHeritagePass(referral)).toBe(false);
  });

  it('tri pending par date d’achat', () => {
    const history = [
      pass({ id: 'a', status: 'pending', paidAt: '2026-08-10T00:00:00.000Z' }),
      pass({ id: 'b', status: 'pending', paidAt: '2026-08-05T00:00:00.000Z' }),
    ];
    const pending = getPendingSubscriptions(history, 'prime');
    expect(pending[0].id).toBe('b');
  });

  it('suspendu non actif mais occupe le slot', () => {
    const history = [pass({ status: 'suspended', passKind: 'intermediate' })];
    expect(getActiveSubscription(history, 'prime')).toBeUndefined();
    expect(getPrimeSlotHolder(history)?.status).toBe('suspended');
  });
});
