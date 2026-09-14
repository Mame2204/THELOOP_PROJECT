import {
  CONTENT_LOCATION_NA_LABEL,
  CONTENT_LOCATION_ONLINE,
  formatEventLocationDisplay,
  formatSpotLocationDisplay,
  parseStoredContentLocation,
  resolveStoredContentLocationInput,
  serializeContentLocation,
} from '@/lib/content-location-utils';

describe('content-location-utils', () => {
  it('sérialise en ligne et N/A', () => {
    expect(serializeContentLocation('online', '')).toBe(CONTENT_LOCATION_ONLINE);
    expect(serializeContentLocation('na', '')).toBe('N/A');
    expect(serializeContentLocation('physical', 'Kaloum · Camayenne')).toBe('Kaloum · Camayenne');
    expect(serializeContentLocation('physical', '')).toBeNull();
  });

  it('parse une adresse stockée', () => {
    expect(parseStoredContentLocation('En ligne')).toEqual({ mode: 'online', physicalValue: '' });
    expect(parseStoredContentLocation('EN LIGNE')).toEqual({ mode: 'online', physicalValue: '' });
    expect(parseStoredContentLocation('N/A')).toEqual({ mode: 'na', physicalValue: '' });
    expect(parseStoredContentLocation('Kaloum · Camayenne')).toEqual({
      mode: 'physical',
      physicalValue: 'Kaloum · Camayenne',
    });
  });

  it('affiche événement en ligne avec pays', () => {
    expect(
      formatEventLocationDisplay({
        venueName: 'Webinar',
        venueAddress: CONTENT_LOCATION_ONLINE,
        countryCode: 'GN',
      }),
    ).toContain('En ligne');
    expect(
      formatEventLocationDisplay({
        venueName: 'Webinar',
        venueAddress: CONTENT_LOCATION_ONLINE,
        countryCode: 'GN',
      }),
    ).toContain('Guinée');
  });

  it('affiche N/A pour événement', () => {
    expect(
      formatEventLocationDisplay({
        venueName: 'TBA',
        venueAddress: 'N/A',
        countryCode: 'GN',
      }),
    ).toBe(CONTENT_LOCATION_NA_LABEL);
  });

  it('canonicalise legacy quartier, ville pour le picker', () => {
    const { canonicalizeGuineaLocationLabel } = require('@/lib/guinea-locations');
    expect(canonicalizeGuineaLocationLabel('CAMAYENNE, Conakry')).toBe('DIXINN · CAMAYENNE');
    expect(canonicalizeGuineaLocationLabel('Kaloum · Camayenne')).toBe('DIXINN · CAMAYENNE');
  });

  it('affiche le nom du lieu sur la carte liste', () => {
    const { formatEventCardLocationDisplay } = require('@/lib/content-location-utils');
    expect(
      formatEventCardLocationDisplay({
        venueName: "L'Avenue Restaurant",
        venueAddress: 'DIXINN · CAMAYENNE',
        countryCode: 'GN',
      }),
    ).toBe("L'Avenue Restaurant");
  });

  it('affiche uniquement le nom du lieu en fiche (sans ville)', () => {
    expect(
      formatEventLocationDisplay({
        venueName: 'Radisson Blue',
        venueAddress: 'KALOUM · CAMAYENNE',
        countryCode: 'GN',
      }),
    ).toBe('Radisson Blue');
  });

  it('affiche spot physique', () => {
    expect(
      formatSpotLocationDisplay({
        address: 'Kaloum · Camayenne',
        district: 'Camayenne',
        countryCode: 'GN',
      }),
    ).toBe('Conakry');
  });

  it('affiche la commune seule en fiche spot (bloc adresse)', () => {
    const { formatSpotCommuneDisplay } = require('@/lib/content-location-utils');
    expect(
      formatSpotCommuneDisplay({
        address: 'Kaloum · Camayenne',
        district: 'Camayenne',
        countryCode: 'GN',
      }),
    ).toBe('DIXINN');
  });

  it('ignore un nom de lieu erroné dans le picker', () => {
    expect(
      resolveStoredContentLocationInput("L'Avenue Restaurant", null, {
        excludeLabel: "L'Avenue Restaurant",
      }),
    ).toEqual({ mode: 'physical', physicalValue: '' });
    expect(
      resolveStoredContentLocationInput('Salle VIP Conakry', null),
    ).toEqual({ mode: 'physical', physicalValue: '' });
    expect(
      resolveStoredContentLocationInput('CAMAYENNE, Conakry', null),
    ).toEqual({ mode: 'physical', physicalValue: 'DIXINN · CAMAYENNE' });
  });
});
