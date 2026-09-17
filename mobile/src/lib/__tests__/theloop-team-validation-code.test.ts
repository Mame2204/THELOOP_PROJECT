import {
  isTheLoopTeamPartnerKey,
  isTheLoopTeamPartnerName,
  THE_LOOP_TEAM_PARTNER_KEY,
} from '@/lib/partner-validation-code-store';

describe('THE LOOP team validation code', () => {
  it('recognizes stable team partner key', () => {
    expect(isTheLoopTeamPartnerKey(THE_LOOP_TEAM_PARTNER_KEY)).toBe(true);
    expect(isTheLoopTeamPartnerKey('user-uuid')).toBe(false);
  });

  it('recognizes THE LOOP organizer label', () => {
    expect(isTheLoopTeamPartnerName('THE LOOP')).toBe(true);
    expect(isTheLoopTeamPartnerName("L'Avenue")).toBe(false);
  });
});
