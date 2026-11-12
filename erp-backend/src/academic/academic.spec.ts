import {
  addDays,
  addYears,
  formatDay,
  isCalendarDay,
} from '../common/clock/dates.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import {
  ACADEMIC_STATUSES,
  type AcademicStatus,
  allowsRosterMode,
  canMoveTo,
  isFrozen,
  requiresReasonToReach,
  rosterModesFor,
} from './academic.constants.js';
import { statusForDates } from './academic-calendar.service.js';
import { permissionsFor } from './academic-lifecycle.service.js';
import { checkTemplatePeriods } from './calendar-templates.service.js';
import { yearName } from './entities/academic-year.entity.js';

// The plan's table, copied from AcademicPeriodStatus::allowedNext.
const TABLE: Record<AcademicStatus, AcademicStatus[]> = {
  draft: ['scheduled', 'open', 'closed'],
  scheduled: ['open', 'draft', 'closed'],
  open: ['closing', 'closed'],
  closing: ['closed', 'open'],
  closed: ['open', 'archived'],
  archived: [],
};

describe('status transitions', () => {
  const pairs = ACADEMIC_STATUSES.flatMap((from) =>
    ACADEMIC_STATUSES.filter((to) => to !== from).map(
      (to) => [from, to] as const,
    ),
  );

  it.each(pairs)('%s -> %s follows the table', (from, to) => {
    expect(canMoveTo(from, to)).toBe(TABLE[from].includes(to));
  });

  it('only leaving closed or archived for an open state needs a reason', () => {
    const needing = pairs.filter(([from, to]) =>
      requiresReasonToReach(from, to),
    );
    expect(needing.filter(([from, to]) => canMoveTo(from, to))).toEqual([
      ['closed', 'open'],
    ]);
    expect(isFrozen('closed')).toBe(true);
    expect(isFrozen('closing')).toBe(false);
  });

  it('asks for the permission each move needs', () => {
    expect(permissionsFor('academic_period', 'open', 'closing')).toEqual([
      'close academic period',
    ]);
    expect(permissionsFor('academic_year', 'closed', 'archived')).toEqual([
      'close academic period',
    ]);
    expect(permissionsFor('academic_period', 'closed', 'open')).toEqual([
      'reopen academic period',
    ]);
    expect(permissionsFor('academic_period', 'closing', 'open')).toEqual([
      'reopen academic period',
    ]);
    expect(permissionsFor('academic_year', 'scheduled', 'open')).toEqual([
      'update academic year',
    ]);
    expect(permissionsFor('academic_period', 'scheduled', 'draft')).toEqual([
      'update academic period',
    ]);
  });
});

describe('calendar days', () => {
  it('adds days across month ends and leap days', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('a 365-day cycle crossing 29 February ends a day earlier in the calendar', () => {
    expect(addDays('2026-09-01', 365 - 1)).toBe('2027-08-31');
    expect(addDays('2027-09-01', 365 - 1)).toBe('2028-08-30');
  });

  it('moves a day by whole years; 29 February becomes 1 March', () => {
    expect(addYears('2027-09-01', 1)).toBe('2028-09-01');
    expect(addYears('2028-02-29', 1)).toBe('2029-03-01');
    expect(addYears('2028-02-29', 4)).toBe('2032-02-29');
  });

  it('recognises real days only', () => {
    expect(isCalendarDay('2028-02-29')).toBe(true);
    expect(isCalendarDay('2027-02-29')).toBe(false);
    expect(isCalendarDay('2027-13-01')).toBe(false);
    expect(isCalendarDay('1 Sep 2027')).toBe(false);
    expect(formatDay('2026-11-10')).toBe('Nov 10, 2026');
  });
});

describe('publishing', () => {
  it('takes each status from the dates against campus today', () => {
    expect(statusForDates('2026-09-01', '2026-12-15', '2026-11-10')).toBe(
      'open',
    );
    expect(statusForDates('2026-11-10', '2026-12-15', '2026-11-10')).toBe(
      'open',
    );
    expect(statusForDates('2026-09-01', '2026-11-10', '2026-11-10')).toBe(
      'open',
    );
    expect(statusForDates('2026-11-11', '2026-12-15', '2026-11-10')).toBe(
      'scheduled',
    );
    expect(statusForDates('2026-09-01', '2026-11-09', '2026-11-10')).toBe(
      'closed',
    );
  });

  it('names a year by its calendar years', () => {
    expect(
      yearName({
        startsOn: '2026-09-01',
        endsOn: '2027-07-31',
        startYear: 2026,
        stopYear: 2027,
      }),
    ).toBe('2026–27');
    expect(
      yearName({
        startsOn: '2027-01-10',
        endsOn: '2027-12-01',
        startYear: 2027,
        stopYear: 2027,
      }),
    ).toBe('2027');
  });
});

describe('calendar template rows', () => {
  const row = (start: number, length: number, parentIndex?: number) => ({
    name: 'Row',
    type: 'term' as const,
    position: 1,
    startOffsetDays: start,
    lengthDays: length,
    parentIndex: parentIndex ?? null,
  });
  const refusal = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(RuleViolation);
      return (error as RuleViolation).message;
    }
    throw new Error('not refused');
  };

  it('accepts terms side by side with nested windows', () => {
    expect(() =>
      checkTemplatePeriods(
        [row(0, 100), row(100, 100), row(10, 5, 1), row(20, 5, 1)],
        365,
      ),
    ).not.toThrow();
  });

  it('refuses the reference cases with the reference messages', () => {
    expect(refusal(() => checkTemplatePeriods([], 365))).toBe(
      'Add at least one period to the calendar template.',
    );
    expect(
      refusal(() => checkTemplatePeriods([row(0, 10, 2), row(10, 5)], 365)),
    ).toBe('Row 1 must name an earlier, filled row as its parent.');
    expect(refusal(() => checkTemplatePeriods([row(300, 66)], 365))).toBe(
      'Row 1 ends after the school year ends. Shorten it or start it earlier.',
    );
    expect(
      refusal(() => checkTemplatePeriods([row(0, 50), row(40, 20, 1)], 365)),
    ).toBe('Row 2 must fall inside row 1, its parent.');
    expect(
      refusal(() => checkTemplatePeriods([row(0, 50), row(49, 20)], 365)),
    ).toBe('Rows 1 and 2 share days. Periods side by side must not overlap.');
  });
});

describe('teaching models', () => {
  it('fixed home sections forbid combined sections and named learners', () => {
    expect(rosterModesFor('fixed_home_sections')).toEqual([
      'home_section',
      'academic_level',
    ]);
    expect(rosterModesFor('hybrid')).toHaveLength(4);
    expect(
      allowsRosterMode('subject_based_schedule', 'individual_roster'),
    ).toBe(true);
  });
});
