import { loadUserFavorites } from '@/lib/favorites-store';
import { loadDemoFavorites } from '@/lib/demo-auth';

jest.mock('@/lib/demo-auth', () => ({
  loadDemoFavorites: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: jest.fn(() => true),
  supabase: {
    from: jest.fn(),
  },
}));

describe('favorites-store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (loadDemoFavorites as jest.Mock).mockResolvedValue({ events: ['evt-1'], locations: [] });
  });

  it('ne interroge pas Supabase pour un userId démo non-UUID', async () => {
    const { supabase } = jest.requireMock('@/lib/supabase');
    const result = await loadUserFavorites('tool-partner-demo');

    expect(result).toEqual({ events: ['evt-1'], locations: [] });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
