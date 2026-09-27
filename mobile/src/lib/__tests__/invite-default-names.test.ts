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

  it('priorité activation : saisie membre > invite admin > défaut', () => {
    expect(
      resolveInviteDisplayName({
        firstName: 'Aïssata',
        lastName: 'Camara',
        userRole: 'member',
      }),
    ).toEqual({ firstName: 'Aïssata', lastName: 'Camara' });
    expect(
      resolveInviteDisplayName({
        firstName: 'Vrai',
        lastName: 'Nom',
        userRole: 'member',
      }),
    ).toEqual({ firstName: 'Vrai', lastName: 'Nom' });
  });
});
