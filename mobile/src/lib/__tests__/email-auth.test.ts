import {
  isValidEmailFormat,
  isDisposableEmailDomain,
  isSyntheticPhoneEmail,
  normalizeEmail,
  validateSignupEmail,
  validateSignupPassword,
} from '@/lib/email-auth';

describe('email-auth', () => {
  it('normalise les e-mails', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
  });

  it('rejette les e-mails synthétiques téléphone', () => {
    expect(isSyntheticPhoneEmail('620000001@theloop.gn')).toBe(true);
    expect(isSyntheticPhoneEmail('user@gmail.com')).toBe(false);
  });

  it('bloque mailinator', () => {
    expect(isDisposableEmailDomain('bot@mailinator.com')).toBe(true);
  });

  it('valide un e-mail correct', () => {
    const res = validateSignupEmail('membre@theloop.gn');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.email).toBe('membre@theloop.gn');
  });

  it('exige lettre et chiffre dans le mot de passe', () => {
    expect(validateSignupPassword('abcdefgh', 'abcdefgh')).toMatch(/lettre/i);
    expect(validateSignupPassword('abc12345', 'abc12345')).toBeNull();
  });
});
