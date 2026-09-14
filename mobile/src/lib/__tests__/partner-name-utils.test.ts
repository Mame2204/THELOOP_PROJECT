import { partnerNamesMatch, normalizePartnerName } from '@/lib/partner-name-utils';

describe('partner-name-utils', () => {
  it('normalise accents et casse', () => {
    expect(normalizePartnerName("  L'Avenue  ")).toBe("l'avenue");
    expect(normalizePartnerName('Café Étoile')).toBe('cafe etoile');
  });

  it('matche noms identiques ou contenus', () => {
    expect(partnerNamesMatch("L'Avenue", "lavenue")).toBe(false);
    expect(partnerNamesMatch("L'Avenue", "L'Avenue")).toBe(true);
    expect(partnerNamesMatch('Le Petit Café', 'Petit Café')).toBe(true);
  });
});
