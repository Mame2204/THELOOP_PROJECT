import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAllPublicDeviceCaches, reconcilePublicCachesWithRemote } from '@/lib/device-cache-reconcile';

jest.mock('@/lib/content-store', () => ({
  invalidateContentCache: jest.fn(),
  clearPersistedContentCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/device-operational-cache', () => ({
  clearOperationalDeviceCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/loop-walks-store', () => ({
  invalidateLoopWalksCache: jest.fn(),
}));

jest.mock('@/lib/home-partners-store', () => ({
  invalidateHomePartnerLogosCache: jest.fn(),
}));

jest.mock('@/lib/app-sections-store', () => ({
  invalidateAppSectionsCache: jest.fn(),
}));

jest.mock('@/lib/swr-cache', () => ({
  clearAllScopedMemory: jest.fn(),
  invalidateScope: jest.fn(),
  scopedStorageKey: jest.fn((prefix: string, scope: string) => `${prefix}:${scope}`),
}));

jest.mock('@/lib/offline-store', () => ({
  isNetworkOnline: jest.fn().mockResolvedValue(true),
  markNetworkReachable: jest.fn(),
}));

const headResponses: Record<string, number> = {
  events: 0,
  establishments: 0,
  tools: 0,
  home_polls: 0,
  loop_walks: 0,
  creator_corner_features: 0,
};

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: jest.fn(() => true),
  supabase: {
    from: jest.fn((table: string) => ({
      select: jest.fn(() => ({
        eq: jest.fn(function eq(this: unknown, ..._args: unknown[]) {
          return this;
        }),
        then: undefined,
      })),
    })),
  },
}));

describe('device-cache-reconcile', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();

    const { supabase } = jest.requireMock('@/lib/supabase');
    supabase.from.mockImplementation((table: string) => {
      const chain: { eq: jest.Mock } = {
        eq: jest.fn(function eq() {
          return chain;
        }),
      };
      return {
        select: jest.fn(() => ({
          ...chain,
          then: (resolve: (value: { count: number; error: null }) => void) =>
            resolve({ count: headResponses[table] ?? 0, error: null }),
        })),
      };
    });
  });

  it('purge aussi les caches admin (notifications + accueil)', async () => {
    await AsyncStorage.multiSet([
      ['loop_admin_notifications_v3', '[]'],
      ['loop_admin_accueil_v1:walks_GN', '[]'],
      ['loop_walks_demo_v5', '[]'],
      ['loop_content_snapshot_v1', JSON.stringify({ events: [{ id: '1' }], locations: [] })],
    ]);

    await clearAllPublicDeviceCaches();

    expect(await AsyncStorage.getItem('loop_admin_notifications_v3')).toBeNull();
    expect(await AsyncStorage.getItem('loop_admin_accueil_v1:walks_GN')).toBeNull();
    expect(await AsyncStorage.getItem('loop_walks_demo_v5')).toBeNull();
    expect(await AsyncStorage.getItem('loop_content_snapshot_v1')).toBeNull();
  });

  it('déclenche la purge quand le cloud est vide mais le cache admin local persiste', async () => {
    await AsyncStorage.setItem('loop_admin_notifications_v3', JSON.stringify([{ id: 'x' }]));

    const purged = await reconcilePublicCachesWithRemote();

    expect(purged).toBe(true);
    expect(await AsyncStorage.getItem('loop_admin_notifications_v3')).toBeNull();
  });
});
