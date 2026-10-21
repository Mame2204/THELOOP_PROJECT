import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: jest.fn(() => false),
  supabase: null,
}));

jest.mock('@/lib/admin-insights-store', () => ({
  invalidateAdminInsightsCache: jest.fn(),
}));

import { deleteAdminHomePoll, listAdminHomePolls } from '@/lib/admin-accueil-store';
import { forgetLocalHomePoll } from '@/lib/home-poll-store';

const DEMO_POLLS_ADMIN = 'loop_admin_home_polls_v1';
const DEMO_VOTES_KEY = 'loop_home_poll_votes_demo';
const DEMO_POLL_KEY = 'loop_home_poll_demo';

describe('deleteAdminHomePoll', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('retire le sondage du pays sans effacer ceux des autres pays', async () => {
    await AsyncStorage.setItem(
      DEMO_POLLS_ADMIN,
      JSON.stringify([
        {
          id: 'poll-gn',
          question: 'Ce week-end ?',
          options: [
            { id: 'a', label: 'Terrasse' },
            { id: 'b', label: 'Live' },
          ],
          weekKey: '2026-W43',
          isActive: true,
          countryCode: 'GN',
          voteCounts: { a: 1, b: 0 },
          voteTotal: 1,
          periodStart: null,
          periodEnd: null,
          createdAt: '2026-10-21T00:00:00.000Z',
        },
        {
          id: 'poll-sn',
          question: 'Dakar ?',
          options: [
            { id: 'a', label: 'Plage' },
            { id: 'b', label: 'Concert' },
          ],
          weekKey: '2026-W43',
          isActive: true,
          countryCode: 'SN',
          voteCounts: {},
          voteTotal: 0,
          periodStart: null,
          periodEnd: null,
          createdAt: '2026-10-21T00:00:00.000Z',
        },
      ]),
    );

    const result = await deleteAdminHomePoll('poll-gn', 'GN');
    expect(result).toEqual({ ok: true });

    const remaining = await listAdminHomePolls('SN');
    expect(remaining.map((p) => p.id)).toEqual(['poll-sn']);
    expect(await listAdminHomePolls('GN')).toEqual([]);
  });

  it('oublie les votes démo du sondage supprimé', async () => {
    await AsyncStorage.setItem(
      DEMO_VOTES_KEY,
      JSON.stringify({
        'poll-gn': [{ optionId: 'a', phone: 'ph_1' }],
        'poll-other': [{ optionId: 'b', phone: 'ph_2' }],
      }),
    );
    await AsyncStorage.setItem(
      DEMO_POLL_KEY,
      JSON.stringify({
        id: 'poll-gn',
        question: 'Ce week-end ?',
        options: [
          { id: 'a', label: 'Terrasse' },
          { id: 'b', label: 'Live' },
        ],
        weekKey: '2026-W43',
      }),
    );

    await forgetLocalHomePoll('poll-gn', 'GN');

    const votes = JSON.parse((await AsyncStorage.getItem(DEMO_VOTES_KEY)) ?? '{}') as Record<string, unknown>;
    expect(votes['poll-gn']).toBeUndefined();
    expect(votes['poll-other']).toEqual([{ optionId: 'b', phone: 'ph_2' }]);
    expect(await AsyncStorage.getItem(DEMO_POLL_KEY)).toBeNull();
  });
});
