import { THELOOP_AUTH_CALLBACK } from '@/lib/auth-redirect';

const mockCreateURL = jest.fn(() => 'exp://tunnel.exp.direct/--/auth/callback');

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    appOwnership: 'standalone',
    executionEnvironment: 'standalone',
    expoConfig: {},
  },
}));

jest.mock('expo-linking', () => ({
  createURL: (...args: unknown[]) => mockCreateURL(...args),
}));

describe('auth-redirect', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.EXPO_PUBLIC_AUTH_CALLBACK_HTTPS_URL;
    delete process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL;
    delete process.env.EXPO_PUBLIC_DEV_AUTH_REDIRECT_URL;
    mockCreateURL.mockReturnValue('exp://tunnel.exp.direct/--/auth/callback');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('utilise theloop:// en build EAS / natif', () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = 'theloop://auth/callback';
    const mod = require('@/lib/auth-redirect') as typeof import('@/lib/auth-redirect');
    expect(mod.getAuthEmailRedirectUrl()).toBe(THELOOP_AUTH_CALLBACK);
  });

  it('utilise exp:// en Expo Go (tunnel)', () => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {
        appOwnership: 'expo',
        executionEnvironment: 'storeClient',
        expoConfig: { hostUri: 'k-dahvm-mamehope-8082.exp.direct' },
      },
    }));
    jest.resetModules();
    const mod = require('@/lib/auth-redirect') as typeof import('@/lib/auth-redirect');
    expect(mod.getAuthEmailRedirectUrl()).toMatch(/^exp:\/\//);
    expect(mod.getAuthEmailRedirectUrl()).toContain('auth/callback');
  });

  it('refuse theloop:// en Expo Go sans Metro', () => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {
        appOwnership: 'expo',
        executionEnvironment: 'storeClient',
        expoConfig: {},
      },
    }));
    mockCreateURL.mockReturnValue('http://localhost');
    jest.resetModules();
    const mod = require('@/lib/auth-redirect') as typeof import('@/lib/auth-redirect');
    expect(() => mod.getAuthEmailRedirectUrl()).toThrow(/Metro/);
  });

  it('utilise la page HTTPS auth-callback pour les invites membres', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://eeyhtulpixvftvhppinz.supabase.co';
    jest.resetModules();
    const mod = require('@/lib/auth-redirect') as typeof import('@/lib/auth-redirect');
    expect(mod.getAuthMemberFacingRedirectUrl()).toBe(
      'https://admin.theloop-app.com/auth-callback.html',
    );
  });

  it('fallback LAN via EXPO_PUBLIC_DEV_AUTH_REDIRECT_URL en Expo Go', () => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {
        appOwnership: 'expo',
        executionEnvironment: 'storeClient',
        expoConfig: {},
      },
    }));
    mockCreateURL.mockReturnValue('http://localhost');
    process.env.EXPO_PUBLIC_DEV_AUTH_REDIRECT_URL = 'exp://192.168.1.1:8082/--/auth/callback';
    jest.resetModules();
    const mod = require('@/lib/auth-redirect') as typeof import('@/lib/auth-redirect');
    expect(mod.getAuthEmailRedirectUrl()).toBe('exp://192.168.1.1:8082/--/auth/callback');
  });
});
