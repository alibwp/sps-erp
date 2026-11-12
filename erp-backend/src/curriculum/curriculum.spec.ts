import { RuleViolation } from '../common/errors/api-exception.js';
import { reorder } from './academic-levels.service.js';
import { plural, withArticle } from './campus-terms.js';
import {
  activeKey,
  rosterReady,
  rosterRule,
} from './course-offerings.service.js';
import {
  STRUCTURE_STATUSES,
  canMoveStructure,
  levelAllowsRosterMode,
  usesHomeSections,
} from './curriculum.constants.js';
import { OfferingClaims } from './offering-claims.js';

const refusal = (fn: () => void): string => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(RuleViolation);
    return (error as RuleViolation).message;
  }
  throw new Error('not refused');
};

describe('structure statuses', () => {
  // AcademicStructureStatus::canMoveTo and CourseOfferingStatus::canMoveTo.
  const allowed = [
    ['draft', 'active'],
    ['draft', 'archived'],
    ['active', 'archived'],
  ];
  const pairs = STRUCTURE_STATUSES.flatMap((from) =>
    STRUCTURE_STATUSES.map((to) => [from, to] as const),
  );

  it.each(pairs)('%s -> %s', (from, to) => {
    expect(canMoveStructure(from, to)).toBe(
      allowed.some(([a, b]) => a === from && b === to),
    );
  });
});

describe('rosters', () => {
  it('reads home-section rosters from sections', () => {
    expect(usesHomeSections('home_section')).toBe(true);
    expect(usesHomeSections('combined_home_sections')).toBe(true);
    expect(usesHomeSections('academic_level')).toBe(false);
    expect(usesHomeSections('individual_roster')).toBe(false);
  });

  it('a level group teaches through the whole group or named learners', () => {
    expect(levelAllowsRosterMode(true, 'home_section')).toBe(false);
    expect(levelAllowsRosterMode(true, 'combined_home_sections')).toBe(false);
    expect(levelAllowsRosterMode(true, 'academic_level')).toBe(true);
    expect(levelAllowsRosterMode(true, 'individual_roster')).toBe(true);
    expect(levelAllowsRosterMode(false, 'home_section')).toBe(true);
  });

  const messages = {
    exactlyOne: 'one',
    atLeastTwo: 'two',
    namedNoSections: 'named',
  };

  it('needs the roster each mode names', () => {
    expect(refusal(() => rosterRule('home_section', [], messages))).toBe('one');
    expect(
      refusal(() => rosterRule('home_section', ['a', 'b'], messages)),
    ).toBe('one');
    expect(
      refusal(() => rosterRule('combined_home_sections', ['a'], messages)),
    ).toBe('two');
    expect(refusal(() => rosterRule('academic_level', ['a'], messages))).toBe(
      'A whole-level offering does not select sections or individual learners.',
    );
    expect(
      refusal(() => rosterRule('individual_roster', ['a'], messages)),
    ).toBe('named');
    expect(() => rosterRule('individual_roster', [], messages)).not.toThrow();
    expect(() =>
      rosterRule('combined_home_sections', ['a', 'b'], messages),
    ).not.toThrow();
  });

  it('refuses to activate an incomplete roster', () => {
    expect(refusal(() => rosterReady('home_section', 0, 0))).toBe(
      'Select exactly one section before activating this course offering.',
    );
    expect(refusal(() => rosterReady('combined_home_sections', 1, 0))).toBe(
      'Select at least two sections before activating this course offering.',
    );
    expect(refusal(() => rosterReady('academic_level', 1, 0))).toBe(
      'A whole-level offering cannot have sections or named learners.',
    );
    expect(refusal(() => rosterReady('individual_roster', 0, 0))).toBe(
      'Add at least one named learner before activating this course offering.',
    );
    expect(() => rosterReady('individual_roster', 0, 3)).not.toThrow();
  });
});

describe('active key', () => {
  const offering = {
    schoolId: 's',
    academicPeriodId: 'p',
    subjectId: 'm',
    academicLevelId: 'l',
    rosterMode: 'combined_home_sections' as const,
  };

  it('does not depend on the order of the roster', () => {
    expect(activeKey(offering, ['b', 'a'], [])).toBe(
      activeKey(offering, ['a', 'b'], []),
    );
    expect(activeKey(offering, ['a', 'b'], [])).toHaveLength(64);
  });

  it('differs by roster mode and by roster', () => {
    expect(activeKey(offering, ['a', 'b'], [])).not.toBe(
      activeKey({ ...offering, rosterMode: 'home_section' }, ['a', 'b'], []),
    );
    expect(activeKey(offering, ['a', 'b'], [])).not.toBe(
      activeKey(offering, ['a', 'c'], []),
    );
  });
});

describe('already taught', () => {
  const key = OfferingClaims.key('maths', 'term', 'grade');

  it('a section is taken once; a whole level takes every section', () => {
    const claims = new OfferingClaims();
    claims.add(key, 'home_section', ['a']);
    expect(claims.taken(key, 'home_section', ['a'])).toBe(true);
    expect(claims.taken(key, 'home_section', ['b'])).toBe(false);
    expect(claims.taken(key, 'combined_home_sections', ['b', 'a'])).toBe(true);
    expect(claims.taken(key, 'academic_level', [])).toBe(true);

    const whole = new OfferingClaims();
    whole.add(key, 'academic_level', []);
    expect(whole.taken(key, 'home_section', ['c'])).toBe(true);
    expect(whole.taken(key, 'individual_roster', [])).toBe(true);
  });

  it('named-learner offerings are counted one for one', () => {
    const claims = new OfferingClaims();
    claims.add(key, 'individual_roster', []);
    expect(claims.taken(key, 'individual_roster', [])).toBe(true);
    expect(claims.taken(key, 'individual_roster', [])).toBe(false);
    claims.add(key, 'individual_roster', []);
    expect(claims.taken(key, 'academic_level', [])).toBe(true);
    expect(claims.taken(key, 'home_section', ['a'])).toBe(false);
  });

  it('other periods and levels are separate', () => {
    const claims = new OfferingClaims();
    claims.add(key, 'academic_level', []);
    expect(
      claims.taken(
        OfferingClaims.key('maths', 'term2', 'grade'),
        'academic_level',
        [],
      ),
    ).toBe(false);
  });
});

describe('reordering', () => {
  const rows = () => [
    { id: 'a', position: 0 },
    { id: 'b', position: 5 },
    { id: 'c', position: 5 },
  ];

  it('swaps with the neighbour and numbers from 0', async () => {
    const list = rows();
    const saved: string[] = [];
    expect(
      await reorder(list, 'c', 'up', async (row) => {
        saved.push(`${row.id}:${row.position}`);
      }),
    ).toBe(true);
    expect(saved.sort()).toEqual(['b:2', 'c:1']);
  });

  it('nothing to swap with at either end', async () => {
    const noop = async () => undefined;
    expect(await reorder(rows(), 'a', 'up', noop)).toBe(false);
    expect(await reorder(rows(), 'c', 'down', noop)).toBe(false);
    expect(await reorder(rows(), 'z', 'down', noop)).toBe(false);
  });
});

describe('campus terms', () => {
  it('pluralises and picks the article as the reference does', () => {
    expect(plural('class')).toBe('classes');
    expect(plural('arm')).toBe('arms');
    expect(plural('category')).toBe('categories');
    expect(withArticle('class teacher')).toBe('a class teacher');
    expect(withArticle('arm leader')).toBe('an arm leader');
    expect(withArticle('form tutor')).toBe('a form tutor');
    expect(withArticle('unit head')).toBe('a unit head');
  });
});
