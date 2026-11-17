// Staff operations (Stage 5 part 4): employment records, availability,
// credentials and leave (reference EmploymentType, StaffStatus, LeaveType,
// LeaveStatus).

export const EMPLOYMENT_TYPES = [
  'full_time',
  'part_time',
  'contract',
  'volunteer',
  'intern',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const STAFF_STATUSES = [
  'active',
  'on_leave',
  'suspended',
  'left',
] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export const LEAVE_TYPES = [
  'annual',
  'sick',
  'compassionate',
  'study',
  'maternity',
  'unpaid',
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = [
  'requested',
  'approved',
  'declined',
  'cancelled',
  'taken',
] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

const LEAVE_NEXT: Record<LeaveStatus, readonly LeaveStatus[]> = {
  requested: ['approved', 'declined', 'cancelled'],
  approved: ['taken', 'cancelled'],
  declined: ['requested'],
  cancelled: [],
  taken: [],
};

export function canMoveLeave(from: LeaveStatus, to: LeaveStatus): boolean {
  return LEAVE_NEXT[from].includes(to);
}

// Leave that holds its days: a second request may not ask for them.
export const HOLDING_LEAVE: readonly LeaveStatus[] = [
  'requested',
  'approved',
  'taken',
];

export function leaveLabel(status: LeaveStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export const STAFF_PROFILE_SUBJECT = 'staff_profile';
export const STAFF_LEAVE_SUBJECT = 'staff_leave_request';
