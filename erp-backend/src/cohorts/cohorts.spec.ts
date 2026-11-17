import {
  COHORT_TYPES,
  PARTICIPATION_STATUSES,
  type ParticipationStatus,
  canMoveParticipation,
  isAlwaysRestricted,
} from './cohorts.constants.js';

describe('the participation transition table', () => {
  const allowed: Record<ParticipationStatus, ParticipationStatus[]> = {
    requested: ['active', 'withdrawn'],
    active: ['completed', 'withdrawn'],
    completed: [],
    withdrawn: ['active'],
  };

  for (const from of PARTICIPATION_STATUSES) {
    for (const to of PARTICIPATION_STATUSES) {
      const expected = allowed[from].includes(to);
      it(`${from} → ${to} is ${expected ? 'allowed' : 'refused'}`, () => {
        expect(canMoveParticipation(from, to)).toBe(expected);
      });
    }
  }
});

describe('restricted cohort types', () => {
  it('only a watchlist is always restricted', () => {
    expect(COHORT_TYPES.filter(isAlwaysRestricted)).toEqual(['watchlist']);
  });
});
