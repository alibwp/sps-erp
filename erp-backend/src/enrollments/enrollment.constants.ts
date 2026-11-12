// An enrollment's state (reference EnrollmentStatus). Change it only
// through EnrollmentStatuses, which checks this table.
export const ENROLLMENT_STATUSES = [
  'active',
  'suspended',
  'withdrawn',
  'transferred',
  'graduated',
  'archived',
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

const ALLOWED_NEXT: Record<EnrollmentStatus, readonly EnrollmentStatus[]> = {
  active: ['suspended', 'withdrawn', 'transferred', 'graduated', 'archived'],
  suspended: ['active', 'withdrawn', 'transferred', 'archived'],
  withdrawn: ['active', 'archived'],
  transferred: ['archived'],
  graduated: ['active', 'archived'],
  archived: [],
};

export function canMoveEnrollment(
  from: EnrollmentStatus,
  to: EnrollmentStatus,
): boolean {
  return ALLOWED_NEXT[from].includes(to);
}

// Still enrolled: attends now, or is away for a while.
export const ENROLLED_STATUSES: readonly EnrollmentStatus[] = [
  'active',
  'suspended',
];

export function isEnrolled(status: EnrollmentStatus): boolean {
  return ENROLLED_STATUSES.includes(status);
}

// Left the campus: the enrollment is history.
export function isClosedEnrollment(status: EnrollmentStatus): boolean {
  return (
    status === 'withdrawn' ||
    status === 'transferred' ||
    status === 'graduated' ||
    status === 'archived'
  );
}

export const ENROLLMENT_SUBJECT = 'student_record';
