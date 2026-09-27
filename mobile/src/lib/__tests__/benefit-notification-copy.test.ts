import {
  copyBenefitCancelledMessage,
  copyBenefitPendingMessage,
  copyBenefitValidatedMessage,
  resolveBenefitLinkedPlace,
  resolvePartnerPendingBenefitHeadline,
  shouldShowPrivilegeSubtitle,
} from '@/lib/benefit-notification-copy';

describe('benefit-notification-copy', () => {
  it('lieu lié distinct du nom privilège', () => {
    expect(
      resolveBenefitLinkedPlace({
        privilegeTitle: 'Menu Secret',
        contentTitle: 'Restaurant Le Patio',
      }),
    ).toBe('Restaurant Le Patio');
    expect(
      copyBenefitValidatedMessage({
        privilegeTitle: 'Menu Secret',
        contentTitle: 'Restaurant Le Patio',
      }),
    ).toBe('Votre privilège « Menu Secret » a été validé chez Restaurant Le Patio.');
  });

  it('évite la double répétition si lieu = nom privilège', () => {
    expect(
      copyBenefitValidatedMessage({
        privilegeTitle: 'Menu Secret',
        contentTitle: 'Menu Secret',
        partnerName: 'Menu Secret',
      }),
    ).toBe('Votre privilège « Menu Secret » a été validé.');
    expect(
      copyBenefitPendingMessage(
        { privilegeTitle: 'Menu Secret', contentTitle: 'Menu Secret' },
        15,
      ),
    ).toBe('Présentez votre QR code pour le privilège « Menu Secret » (15 min max).');
  });

  it('deux privilèges même nom : le lieu distingue', () => {
    const ctx = { privilegeTitle: 'Menu Secret', contentTitle: 'Le Singulier' };
    expect(copyBenefitCancelledMessage(ctx)).toContain('Menu Secret');
    expect(copyBenefitCancelledMessage(ctx)).toContain('Le Singulier');
  });

  it('headline partenaire = lieu si distinct', () => {
    expect(
      resolvePartnerPendingBenefitHeadline({
        contentTitle: 'Le Singulier',
        catalogTitle: 'Menu Secret',
      }),
    ).toBe('Le Singulier');
    expect(shouldShowPrivilegeSubtitle('Le Singulier', 'Menu Secret')).toBe(true);
  });
});
