import { authCallbackDedupeKey, isRecoveryCallbackUrl } from '@/lib/auth-recovery-link';

describe('auth-recovery-link', () => {
  it('dedupe key stable pour token_hash', () => {
    const url =
      'theloop://auth/callback?type=recovery&token_hash=abc123&utm=1#ignored';
    expect(authCallbackDedupeKey(url)).toBe('hash:abc123');
  });

  it('detecte recovery', () => {
    expect(
      isRecoveryCallbackUrl('https://api.theloop-app.com/auth/callback?type=recovery&token_hash=x'),
    ).toBe(true);
    expect(isRecoveryCallbackUrl('theloop://auth/callback?type=invite&token_hash=x')).toBe(false);
  });
});
