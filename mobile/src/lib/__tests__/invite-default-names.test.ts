import { defaultInviteFirstName, resolveInviteDisplayName } from '@/lib/invite-default-names';

describe('invite-default-names', () => {
  it('utilise Partenaire pour le rôle partner', () => {
    expect(defaultInviteFirstName('partner')).toBe('Partenaire');
    expect(resolveInviteDisplayName({ userRole: 'partner' })).toEqual({
      firstName: 'Partenaire',
      lastName: 'THE LOOP',
    });
  });

  it('utilise Membre par défaut', () => {
    expect(defaultInviteFirstName('member')).toBe('Membre');
    expect(defaultInviteFirstName(undefined)).toBe('Membre');
  });
});
