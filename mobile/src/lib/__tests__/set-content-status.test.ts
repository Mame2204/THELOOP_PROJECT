import AsyncStorage from '@react-native-async-storage/async-storage';

const mockRows: Record<string, { id: string }[]> = {
  events: [],
  tools: [],
  establishments: [],
};

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    from: (table: string) => {
      const api = {
        update: () => api,
        eq: () => api,
        select: () => Promise.resolve({ data: mockRows[table] ?? [], error: null }),
      };
      return api;
    },
  },
}));

import { getAdminContentStatus, setContentStatus } from '@/lib/admin-content-store';

describe('setContentStatus', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockRows.events = [];
    mockRows.tools = [];
    mockRows.establishments = [];
  });

  it('désactive un spot dans establishments quand tools ne contient pas la ligne', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    mockRows.establishments = [{ id }];

    const result = await setContentStatus('spot', id, 'deactivated');

    expect(result.ok).toBe(true);
    expect(await getAdminContentStatus('spot', id)).toBe('deactivated');
  });

  it('ne garde pas un statut local si aucune ligne n’a été modifiée', async () => {
    const id = '22222222-2222-4222-8222-222222222222';
    const result = await setContentStatus('spot', id, 'deactivated');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/introuvable/);
    expect(await getAdminContentStatus('spot', id)).toBe('published');
  });

  it('désactive un outil déjà dans la table tools', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    mockRows.tools = [{ id }];

    const result = await setContentStatus('spot', id, 'deactivated');

    expect(result.ok).toBe(true);
    expect(await getAdminContentStatus('spot', id)).toBe('deactivated');
  });
});
