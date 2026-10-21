import { mergePrimeIntoFavorites } from '@/lib/favorite-catalog';

describe('mergePrimeIntoFavorites', () => {
  const publicEvents = [{ id: 'pub' }];
  const primeEvents = [{ id: 'loopx' }];

  it('garde le LoopX pour un membre qui peut le voir', () => {
    expect(mergePrimeIntoFavorites(publicEvents, primeEvents, true).map((e) => e.id)).toEqual([
      'pub',
      'loopx',
    ]);
  });

  it('masque le LoopX sans droit Prime', () => {
    expect(mergePrimeIntoFavorites(publicEvents, primeEvents, false)).toEqual(publicEvents);
  });

  it('ne duplique pas un contenu déjà dans la liste publique', () => {
    expect(mergePrimeIntoFavorites(publicEvents, [{ id: 'pub' }, { id: 'loopx' }], true).map((e) => e.id)).toEqual([
      'pub',
      'loopx',
    ]);
  });
});
