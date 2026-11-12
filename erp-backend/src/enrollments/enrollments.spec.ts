import {
  ENROLLMENT_STATUSES,
  type EnrollmentStatus,
  canMoveEnrollment,
  isClosedEnrollment,
  isEnrolled,
} from './enrollment.constants.js';
import { shortDay } from './learners.js';
import { admissionNumber } from './students.service.js';

// The plan's table (reference EnrollmentStatus::allowedNext).
const TABLE: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  active: ['suspended', 'withdrawn', 'transferred', 'graduated', 'archived'],
  suspended: ['active', 'withdrawn', 'transferred', 'archived'],
  withdrawn: ['active', 'archived'],
  transferred: ['archived'],
  graduated: ['active', 'archived'],
  archived: [],
};

describe('enrollment states', () => {
  const pairs = ENROLLMENT_STATUSES.flatMap((from) =>
    ENROLLMENT_STATUSES.filter((to) => to !== from).map(
      (to) => [from, to] as const,
    ),
  );

  it.each(pairs)('%s -> %s follows the table', (from, to) => {
    expect(canMoveEnrollment(from, to)).toBe(TABLE[from].includes(to));
  });

  it('withdrawn, transferred, graduated and archived are closed', () => {
    expect(ENROLLMENT_STATUSES.filter(isClosedEnrollment)).toEqual([
      'withdrawn',
      'transferred',
      'graduated',
      'archived',
    ]);
    expect(ENROLLMENT_STATUSES.filter(isEnrolled)).toEqual([
      'active',
      'suspended',
    ]);
  });
});

describe('admission numbers', () => {
  it('reads {initials}/{two-digit year}/{six digits}', () => {
    expect(admissionNumber('SPS', '2026-11-10', 123456)).toBe('SPS/26/123456');
    expect(admissionNumber(null, '2027-01-01', 654321)).toBe('27/654321');
    expect(admissionNumber('  ', '2026-11-10', 100000)).toBe('26/100000');
  });
});

describe('days in messages', () => {
  it('writes a day as the reference does (j M Y)', () => {
    expect(shortDay('2026-11-05')).toBe('5 Nov 2026');
    expect(shortDay('2027-01-31')).toBe('31 Jan 2027');
  });
});
