import AsyncStorage from '@react-native-async-storage/async-storage';

describe('admin-notifications-store', () => {
  let listAdminNotifications: typeof import('@/lib/admin-notifications-store').listAdminNotifications;
  let mockOrder: jest.Mock;
  let mockFrom: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();
    await AsyncStorage.clear();

    mockOrder = jest.fn().mockResolvedValue({ data: [], error: null });
    mockFrom = jest.fn(() => ({
      select: jest.fn(() => ({ order: mockOrder })),
    }));

    jest.doMock('@/lib/partner-spot-auth', () => ({
      ensurePartnerSupabaseSession: jest.fn().mockResolvedValue(undefined),
    }));

    jest.doMock('@/lib/user-notifications-store', () => ({
      distributeNotification: jest.fn().mockResolvedValue(0),
    }));

    jest.doMock('expo-crypto', () => ({
      randomUUID: jest.fn(() => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
    }));

    jest.doMock('@/lib/supabase', () => ({
      isSupabaseConfigured: () => true,
      supabase: {
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
        from: mockFrom,
      },
    }));

    ({ listAdminNotifications } = require('@/lib/admin-notifications-store'));
  });

  it('synchronise le cache local quand Supabase renvoie une liste vide', async () => {
    await AsyncStorage.setItem(
      'loop_admin_notifications_v3',
      JSON.stringify([
        {
          id: '11111111-1111-1111-1111-111111111111',
          title: 'Campagne fantôme',
          message: 'Test',
          audience: 'all',
          targetPhone: null,
          favoriteEventCategories: [],
          favoriteSpotCategories: [],
          favoriteToolCategories: [],
          countryCode: 'GN',
          scheduledAt: null,
          sentAt: '2026-01-01T00:00:00.000Z',
          status: 'sent',
          recipientCount: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );

    const list = await listAdminNotifications('GN');

    expect(mockFrom).toHaveBeenCalledWith('admin_push_campaigns');
    expect(list).toEqual([]);
    const cached = await AsyncStorage.getItem('loop_admin_notifications_v3');
    expect(JSON.parse(cached ?? '[]')).toEqual([]);
  });

  it('remplace le cache local par les campagnes distantes', async () => {
    mockOrder.mockResolvedValue({
      data: [
        {
          id: '22222222-2222-2222-2222-222222222222',
          title: 'Campagne cloud',
          message: 'Hello',
          audience: 'members',
          target_phone: null,
          favorite_event_categories: [],
          favorite_spot_categories: [],
          favorite_tool_categories: [],
          country_code: 'GN',
          scheduled_at: null,
          sent_at: '2026-02-01T00:00:00.000Z',
          status: 'sent',
          recipient_count: 42,
          created_by: null,
          created_at: '2026-02-01T00:00:00.000Z',
          updated_at: '2026-02-01T00:00:00.000Z',
        },
      ],
      error: null,
    });

    const list = await listAdminNotifications('GN');

    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Campagne cloud');
    expect(list[0].recipientCount).toBe(42);
  });

  it('retombe sur le cache local si Supabase est indisponible', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'network' } });

    await AsyncStorage.setItem(
      'loop_admin_notifications_v3',
      JSON.stringify([
        {
          id: '33333333-3333-3333-3333-333333333333',
          title: 'Cache local',
          message: 'Offline',
          audience: 'all',
          targetPhone: null,
          favoriteEventCategories: [],
          favoriteSpotCategories: [],
          favoriteToolCategories: [],
          countryCode: 'GN',
          scheduledAt: null,
          sentAt: null,
          status: 'draft',
          recipientCount: 0,
          createdAt: '2026-03-01T00:00:00.000Z',
        },
      ]),
    );

    const list = await listAdminNotifications('GN');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Cache local');
  });
});
