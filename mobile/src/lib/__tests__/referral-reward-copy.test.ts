import { referralRewardRuleText } from '@/lib/referral-store';

describe('referralRewardRuleText', () => {
  it('décrit un PASS payé pour un seul filleul', () => {
    expect(referralRewardRuleText(1, 1)).toBe(
      'Chaque filleul qui prend un PASS avec votre code vous offre 1 mois Prime gratuit.',
    );
  });

  it('accorde le palier et le pluriel des mois', () => {
    expect(referralRewardRuleText(5, 2)).toBe(
      'Tous les 5 filleuls qui prennent un PASS avec votre code, vous recevez 2 mois Prime gratuits.',
    );
  });
});
