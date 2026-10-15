import { aspectPreparedForUpload } from '@/lib/media-upload-aspect';

describe('aspectPreparedForUpload', () => {
  it('garde le carré de la galerie et du logo', () => {
    expect(aspectPreparedForUpload([1, 1])).toEqual([1, 1]);
  });

  it('envoie la couverture 16:9 comme la galerie', () => {
    expect(aspectPreparedForUpload([16, 9])).toEqual([1, 1]);
  });

  it('sans ratio demandé, reste sur le carré qui s’affiche', () => {
    expect(aspectPreparedForUpload()).toEqual([1, 1]);
  });
});
