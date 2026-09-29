import { isValidReferralCode, resolveSponsorReferrerByCode } from '@/lib/referral-store';
import { findRegistryUserByReferralCode } from '@/lib/user-registry-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

jest.mock('@/lib/user-registry-store', () => ({
  findRegistryUserByReferralCode: jest.fn(),
  findRegistryUserById: jest.fn(),
  listRegistryUsers: jest.fn(),
  upsertRegistryUser: jest.fn(),
  userToRegistryEntry: jest.fn(),
  updateRegistrySubscription: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: jest.fn(() => true),
  supabase: { rpc: jest.fn() },
}));

const mockFindByCode = findRegistryUserByReferralCode as jest.Mock;
const mockRpc = supabase!.rpc as jest.Mock;

describe('referral sponsor lookup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindByCode.mockResolvedValue(null);
  });

  it('accepte un code trouvé via RPC quand le registre local est vide', async () => {
    mockRpc.mockResolvedValue({
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        referral_code: 'LOOP-TEST1234',
        user_role: 'member',
      },
      error: null,
    });

    await expect(isValidReferralCode(' loop-test1234 ')).resolves.toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('lookup_sponsor_referral', {
      p_code: 'LOOP-TEST1234',
    });
  });

  it('retourne null si RPC ne trouve pas le parrain', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(resolveSponsorReferrerByCode('LOOP-UNKNOWN')).resolves.toBeNull();
  });
});
