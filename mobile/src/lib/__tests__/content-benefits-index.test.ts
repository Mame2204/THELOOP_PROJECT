import type { BenefitCatalogItem } from '@/lib/benefit-catalog-store';
import {
  catalogItemMatchesContentBenefit,
  contentHasLinkedActiveBenefit,
  offeringMatchesContentBenefit,
  resolveContentBenefitLookupIds,
} from '@/lib/content-benefits-index';

function catalogItem(
  id: string,
  partners: BenefitCatalogItem['offeringPartners'],
  isActive = true,
): BenefitCatalogItem {
  return {
    id,
    title: 'Test',
    description: 'Desc',
    offeringPartners: partners,
    defaultValidityDays: 30,
    benefitKind: 'unlimited',
    quantityPerGrant: null,
    maxUsesPerGrant: null,
    isActive,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('resolveContentBenefitLookupIds', () => {
  it('ajoute les alias catalog-event pour les événements', () => {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(resolveContentBenefitLookupIds(uuid, 'event')).toEqual([
      uuid,
      `catalog-event-${uuid}`,
    ]);
    expect(resolveContentBenefitLookupIds(`catalog-event-${uuid}`, 'event')).toEqual([
      `catalog-event-${uuid}`,
      uuid,
    ]);
  });

  it('ne duplique pas pour spot/outil', () => {
    expect(resolveContentBenefitLookupIds('spot-1', 'spot')).toEqual(['spot-1']);
  });
});

describe('offeringMatchesContentBenefit', () => {
  const eventId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const lookup = new Set(resolveContentBenefitLookupIds(eventId, 'event'));

  it('matche événement par UUID et contentType', () => {
    expect(
      offeringMatchesContentBenefit(
        {
          partnerId: 'p1',
          displayName: 'Partenaire',
          contentId: eventId,
          contentType: 'event',
        },
        lookup,
        'event',
      ),
    ).toBe(true);
  });

  it('matche alias catalog-event-', () => {
    expect(
      offeringMatchesContentBenefit(
        {
          partnerId: 'p1',
          displayName: 'Partenaire',
          contentId: `catalog-event-${eventId}`,
          contentType: 'event',
        },
        lookup,
        'event',
      ),
    ).toBe(true);
  });

  it('ignore un spot portant le même UUID si contentType spot', () => {
    expect(
      offeringMatchesContentBenefit(
        {
          partnerId: 'p1',
          displayName: 'Partenaire',
          contentId: eventId,
          contentType: 'spot',
        },
        lookup,
        'event',
      ),
    ).toBe(false);
  });

  it('accepte legacy sans contentType si l’ID correspond', () => {
    expect(
      offeringMatchesContentBenefit(
        { partnerId: 'p1', displayName: 'Partenaire', contentId: eventId },
        lookup,
        'event',
      ),
    ).toBe(true);
  });
});

describe('contentHasLinkedActiveBenefit', () => {
  const eventId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('matche UUID et alias catalog-event', () => {
    const ids = new Set([`catalog-event-${eventId}`]);
    expect(contentHasLinkedActiveBenefit(ids, eventId, 'event')).toBe(true);
    expect(contentHasLinkedActiveBenefit(ids, `catalog-event-${eventId}`, 'event')).toBe(true);
  });

  it('retourne false si l’index est vide', () => {
    expect(contentHasLinkedActiveBenefit(new Set(), eventId, 'event')).toBe(false);
  });
});

describe('catalogItemMatchesContentBenefit', () => {
  const eventId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const lookup = new Set([eventId]);

  it('ignore catalogue inactif', () => {
    const item = catalogItem(
      'cat-1',
      [{ partnerId: 'p1', displayName: 'P', contentId: eventId, contentType: 'event' }],
      false,
    );
    expect(catalogItemMatchesContentBenefit(item, lookup, 'event')).toBe(false);
  });

  it('matche un offering événement actif', () => {
    const item = catalogItem('cat-1', [
      { partnerId: 'p1', displayName: 'P', contentId: eventId, contentType: 'event' },
    ]);
    expect(catalogItemMatchesContentBenefit(item, lookup, 'event')).toBe(true);
  });
});
