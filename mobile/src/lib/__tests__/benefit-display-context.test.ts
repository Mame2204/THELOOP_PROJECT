import { formatBenefitDisplayContext } from '@/lib/benefit-display-context';
import {
  formatBenefitGrantMessage,
  formatBenefitGrantPlaceLabel,
} from '@/lib/user-notifications-store';

describe('benefit display context', () => {
  it('affiche événement avec lieu et organisateur', () => {
    const label = formatBenefitDisplayContext({
      contentType: 'event',
      contentTitle: 'Concert live',
      venueName: 'Palais du Peuple',
      locationLabel: 'Kaloum, Conakry',
      organizerName: 'Orange Guinée',
    });
    expect(label).toContain('Événement · Concert live');
    expect(label).toContain('Palais du Peuple');
    expect(label).toContain('Orange Guinée');
  });

  it('affiche spot avec adresse et enseigne', () => {
    const label = formatBenefitDisplayContext({
      contentType: 'spot',
      contentTitle: "L'Avenue",
      locationLabel: 'Kaloum · Camayenne',
      organizerName: "Groupe L'Avenue",
    });
    expect(label).toBe("Spot · L'Avenue · Conakry · Groupe L'Avenue");
  });

  it('n’affiche pas le nom partenaire si le contenu est renseigné', () => {
    const label = formatBenefitDisplayContext({
      contentType: 'spot',
      contentTitle: 'Le Rooftop',
      locationLabel: 'Dixinn',
      partnerName: 'Compte partenaire XYZ',
    });
    expect(label).not.toContain('Compte partenaire XYZ');
    expect(label).toContain('Spot · Le Rooftop');
  });

  it('retombe sur le partenaire seulement sans contenu lié', () => {
    expect(
      formatBenefitDisplayContext({
        partnerName: 'Fallback Partenaire',
      }),
    ).toBe('Fallback Partenaire');
  });
});

describe('benefit grant notifications', () => {
  it('message octroi avec contexte enrichi', () => {
    const message = formatBenefitGrantMessage({
      benefitTitle: 'Boisson offerte',
      displayContext: "Spot · L'Avenue · Kaloum · Groupe L'Avenue",
    });
    expect(message).toBe(`« Boisson offerte » — Spot · L'Avenue · Kaloum · Groupe L'Avenue.`);
  });

  it('place label priorise displayContext', () => {
    expect(
      formatBenefitGrantPlaceLabel({
        contentType: 'spot',
        contentTitle: 'Nom court',
        displayContext: 'Spot · Nom complet · Kaloum',
      }),
    ).toBe('Spot · Nom complet · Kaloum');
  });
});
