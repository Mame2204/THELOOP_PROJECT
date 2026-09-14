import { getTheme, resolveThemeId, toShellTheme } from '@/lib/theme-config';

describe('theme-config', () => {
  it('mappe les rôles vers les bons thèmes', () => {
    expect(resolveThemeId('USER_ANONYMOUS')).toBe('VISITOR');
    expect(resolveThemeId('USER_FREE')).toBe('FREE_MEMBER');
    expect(resolveThemeId('USER_PRIME')).toBe('PRIME_MEMBER');
    expect(resolveThemeId('PARTNER')).toBe('PARTNER');
    expect(resolveThemeId('ADMIN')).toBe('ADMIN');
  });

  it('Visiteur = turquoise partenaire éclairci', () => {
    const visitor = getTheme('VISITOR');
    expect(visitor.colors.accent).toBe('#12A8BC');
    expect(visitor.colors.ctaBg).toBe('#0D7A8C');
    expect(visitor.colors.background).toBe('#F4FCFD');
    expect(visitor.label).toBe('Découverte');
    expect(visitor.atmosphere.heroWash).toContain('rgba');
    expect(visitor.elevation.card.shadowOpacity).toBeGreaterThan(0);
  });

  it('Membre = visiteur plus foncé (turquoise)', () => {
    const member = getTheme('FREE_MEMBER');
    expect(member.colors.background).toBe('#E0F2F5');
    expect(member.colors.accent).toBe('#0D7A8C');
    expect(member.colors.accentDeep).toBe('#065A66');
  });

  it('Prime = ancienne charte membre indigo', () => {
    const prime = getTheme('PRIME_MEMBER');
    expect(prime.colors.background).toBe('#EEF1FA');
    expect(prime.isPremium).toBe(true);
    expect(prime.colors.accent).toBe('#1A237E');
    expect(prime.colors.accentDeep).toBe('#0D1457');
    expect(prime.atmosphere.showAccentStripe).toBe(false);
    expect(prime.radius.card).toBe(14);
  });

  it('Partenaire = ancienne charte visiteur teal', () => {
    const partner = getTheme('PARTNER');
    expect(partner.colors.background).toBe('#F0FDF9');
    expect(partner.colors.accent).toBe('#20C997');
    expect(partner.colors.accentDeep).toBe('#0D9488');
  });

  it('Membre et Partenaire ont des fonds teintés distincts', () => {
    const member = getTheme('FREE_MEMBER');
    const partner = getTheme('PARTNER');
    expect(member.colors.background).not.toBe(partner.colors.background);
  });

  it('Admin = Control Tower structuré', () => {
    const admin = getTheme('ADMIN');
    expect(admin.colors.background).toBe('#ECEEF2');
    expect(admin.colors.accent).toBe('#8E1631');
    expect(admin.label).toBe('Control Tower');
  });

  it('toShellTheme conserve la compatibilité ShellTheme', () => {
    const shell = toShellTheme(getTheme('VISITOR'));
    expect(shell.pageBg).toBe('#F4FCFD');
    expect(shell.tabIndicator).toBe('#12A8BC');
    expect(shell.isDark).toBe(false);
  });
});
