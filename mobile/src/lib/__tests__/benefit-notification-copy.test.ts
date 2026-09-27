import {
  copyBenefitCancelledMessage,
  copyBenefitPendingMessage,
  copyBenefitValidatedMessage,
  resolveBenefitNotificationPlace,
  resolvePartnerPendingBenefitHeadline,
  shouldShowCatalogSubtitle,
} from '@/lib/benefit-notification-copy';

describe('benefit-notification-copy', () => {
  it('privilège le titre du contenu lié', () => {
    expect(
      resolveBenefitNotificationPlace({
        contentTitle: 'Restaurant Le Patio',
        partnerName: 'Menu Secret',
      }),
    ).toBe('Restaurant Le Patio');
  });

  it('messages sans répéter le nom catalogue', () => {
    const place = 'Restaurant Le Patio';
    expect(copyBenefitValidatedMessage(place)).toBe('Validation confirmée à Restaurant Le Patio.');
    expect(copyBenefitCancelledMessage(place)).toContain('Restaurant Le Patio');
    expect(copyBenefitPendingMessage(place, 15)).toBe(
      'Présentez votre QR code à Restaurant Le Patio (15 min max).',
    );
  });

  it('headline partenaire = lieu lié', () => {
    expect(
      resolvePartnerPendingBenefitHeadline({
        contentTitle: 'Le Singulier',
        catalogTitle: 'Menu Secret',
        partnerName: 'Lavenue',
      }),
    ).toBe('Le Singulier');
  });

  it('masque sous-titre catalogue si identique au headline', () => {
    expect(shouldShowCatalogSubtitle('Menu Secret', 'Menu Secret')).toBe(false);
    expect(shouldShowCatalogSubtitle('Le Patio', 'Menu Secret')).toBe(true);
  });
});
