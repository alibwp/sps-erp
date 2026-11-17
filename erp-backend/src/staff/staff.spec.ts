import { daysBetween } from './staff-leave.service.js';
import {
  LEAVE_STATUSES,
  type LeaveStatus,
  canMoveLeave,
} from './staff.constants.js';

describe('the leave transition table', () => {
  const allowed: Record<LeaveStatus, LeaveStatus[]> = {
    requested: ['approved', 'declined', 'cancelled'],
    approved: ['taken', 'cancelled'],
    declined: ['requested'],
    cancelled: [],
    taken: [],
  };

  for (const from of LEAVE_STATUSES) {
    for (const to of LEAVE_STATUSES) {
      const expected = allowed[from].includes(to);
      it(`${from} → ${to} is ${expected ? 'allowed' : 'refused'}`, () => {
        expect(canMoveLeave(from, to)).toBe(expected);
      });
    }
  }
});

describe('leave days', () => {
  it('counts both ends', () => {
    expect(daysBetween('2027-01-04', '2027-01-08')).toBe(5);
    expect(daysBetween('2027-01-04', '2027-01-04')).toBe(1);
    expect(daysBetween('2027-02-27', '2027-03-01')).toBe(3);
  });
});
