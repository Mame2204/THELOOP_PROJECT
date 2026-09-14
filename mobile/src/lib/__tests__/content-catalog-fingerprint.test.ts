import { buildFingerprintToken } from '@/lib/content-catalog-fingerprint';

// Exported via test helper — re-export token builder for unit test
jest.mock('@/lib/offline-store', () => ({
  isNetworkOnline: jest.fn().mockResolvedValue(true),
  markNetworkReachable: jest.fn(),
  readLocalCache: jest.fn(),
  writeLocalCache: jest.fn(),
  clearLocalCache: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => false,
  supabase: null,
}));

describe('content-catalog-fingerprint token', () => {
  it('change de token quand count ou updated_at diffère', () => {
    const a = buildFingerprintToken(
      { n: 2, rev: '2026-08-21T10:00:00Z' },
      { n: 5, rev: '2026-08-21T09:00:00Z' },
      { n: 1, rev: '2026-08-20T12:00:00Z' },
    );
    const b = buildFingerprintToken(
      { n: 3, rev: '2026-08-21T10:00:00Z' },
      { n: 5, rev: '2026-08-21T09:00:00Z' },
      { n: 1, rev: '2026-08-20T12:00:00Z' },
    );
    expect(a).not.toBe(b);
    expect(a).toContain('e:2:');
    expect(b).toContain('e:3:');
  });
});
