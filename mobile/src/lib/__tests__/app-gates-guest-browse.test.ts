jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ isSupabaseConfigured: () => false, supabase: null }));

import { DEFAULT_APP_GATES, normalizeAppGates } from '@/lib/app-gates-store';

describe('app gates — navigation sans compte', () => {
  it('est ouverte par défaut (exigence App Store)', () => {
    expect(DEFAULT_APP_GATES.guestBrowseEnabled).toBe(true);
    expect(normalizeAppGates(null).guestBrowseEnabled).toBe(true);
  });

  it('reste ouverte si la clé est absente des réglages cloud (anciennes versions)', () => {
    const gates = normalizeAppGates({ signupEnabled: false, passPurchaseEnabled: true });
    expect(gates.guestBrowseEnabled).toBe(true);
    expect(gates.passPurchaseEnabled).toBe(true);
  });

  it('respecte la coupure super admin', () => {
    expect(normalizeAppGates({ guestBrowseEnabled: false }).guestBrowseEnabled).toBe(false);
  });

  it('ignore une valeur non booléenne', () => {
    expect(normalizeAppGates({ guestBrowseEnabled: 'false' }).guestBrowseEnabled).toBe(true);
  });
});
