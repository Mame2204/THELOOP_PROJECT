import { neighborhoodLabelForSupabase } from '@/lib/admin-location-sync';
import {
  CONTENT_LOCATION_NA,
  CONTENT_LOCATION_ONLINE,
} from '@/lib/content-location-utils';

describe('admin-location-sync', () => {
  it('priorise venueAddress pour Supabase', () => {
    expect(
      neighborhoodLabelForSupabase('Kaloum · Camayenne', null, 'Salle VIP'),
    ).toBe('Camayenne');
  });

  it('conserve En ligne / N/A tels quels', () => {
    expect(neighborhoodLabelForSupabase(CONTENT_LOCATION_ONLINE, null, null)).toBe(CONTENT_LOCATION_ONLINE);
    expect(neighborhoodLabelForSupabase(CONTENT_LOCATION_NA, null, null)).toBe(CONTENT_LOCATION_NA);
  });

  it('utilise district spot si présent', () => {
    expect(neighborhoodLabelForSupabase('', 'Ratoma', null)).toBe('Ratoma');
  });

  it('n utilise pas le nom du lieu comme quartier', () => {
    expect(neighborhoodLabelForSupabase(null, null, 'Radisson Blue')).toBeNull();
    expect(neighborhoodLabelForSupabase('', null, 'Salle VIP')).toBeNull();
  });
});
