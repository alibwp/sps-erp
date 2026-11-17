import {
  EDITABLE_NOTICE,
  NOTICE_STATUSES,
  type NoticeStatus,
  canMoveNotice,
} from './notices.constants.js';

// The notice life cycle (reference NoticeStatus::canTransitionTo).
const ALLOWED: Record<NoticeStatus, NoticeStatus[]> = {
  draft: ['scheduled', 'published', 'archived'],
  scheduled: ['published', 'draft', 'archived'],
  published: ['expired', 'superseded', 'archived'],
  expired: ['archived'],
  superseded: [],
  archived: [],
};

describe('notice transitions', () => {
  const pairs = NOTICE_STATUSES.flatMap((from) =>
    NOTICE_STATUSES.map((to) => [from, to] as const),
  );

  it.each(pairs)('%s → %s follows the table', (from, to) => {
    expect(canMoveNotice(from, to)).toBe(ALLOWED[from].includes(to));
  });

  it('a superseded or archived notice never moves again', () => {
    for (const to of NOTICE_STATUSES) {
      expect(canMoveNotice('superseded', to)).toBe(false);
      expect(canMoveNotice('archived', to)).toBe(false);
    }
  });

  it('a published notice cannot go back to draft or be scheduled', () => {
    expect(canMoveNotice('published', 'draft')).toBe(false);
    expect(canMoveNotice('published', 'scheduled')).toBe(false);
  });

  it('only drafts and scheduled notices can be edited', () => {
    expect([...EDITABLE_NOTICE].sort()).toEqual(['draft', 'scheduled']);
  });
});
