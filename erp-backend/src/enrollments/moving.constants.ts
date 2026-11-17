// Moving learners (Stage 5 part 2): the admission waitlist and campus move
// states (reference AdmissionWaitlistStatus, CampusMoveStatus).

export const WAITLIST_STATUSES = [
  'pending',
  'offered',
  'accepted',
  'declined',
  'withdrawn',
  'placed',
] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

// Still waiting: not yet decided.
export const OPEN_WAITLIST_STATUSES: readonly WaitlistStatus[] = [
  'pending',
  'offered',
];

export function isOpenWaitlistEntry(status: WaitlistStatus): boolean {
  return OPEN_WAITLIST_STATUSES.includes(status);
}

export const CAMPUS_MOVE_STATUSES = [
  'requested',
  'approved',
  'rejected',
  'cancelled',
] as const;
export type CampusMoveStatus = (typeof CAMPUS_MOVE_STATUSES)[number];

// A request is decided once; a decided one is final.
export function canDecideCampusMove(
  from: CampusMoveStatus,
  to: CampusMoveStatus,
): boolean {
  return from === 'requested' && to !== 'requested';
}

// "Withdrawn", as the reference labels an enrollment state.
export function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export const PROMOTION_SUBJECT = 'promotion';
export const WAITLIST_SUBJECT = 'admission_waitlist_entry';
export const CAMPUS_MOVE_SUBJECT = 'campus_move_request';
