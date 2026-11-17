// Cohorts and programmes (Stage 6; reference CohortType, ProgramType,
// ParticipationStatus).

export const COHORT_TYPES = [
  'graduation_year',
  'scholarship',
  'club',
  'watchlist',
  'ranking_group',
  'other',
] as const;
export type CohortType = (typeof COHORT_TYPES)[number];

// A watchlist is private, whoever makes it (CohortType::isRestricted).
export function isAlwaysRestricted(type: CohortType): boolean {
  return type === 'watchlist';
}

export const PROGRAM_TYPES = [
  'club',
  'intervention',
  'support_service',
  'extracurricular',
  'special',
] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

export const PARTICIPATION_STATUSES = [
  'requested',
  'active',
  'completed',
  'withdrawn',
] as const;
export type ParticipationStatus = (typeof PARTICIPATION_STATUSES)[number];

const PARTICIPATION_NEXT: Record<
  ParticipationStatus,
  readonly ParticipationStatus[]
> = {
  requested: ['active', 'withdrawn'],
  active: ['completed', 'withdrawn'],
  completed: [],
  withdrawn: ['active'],
};

export function canMoveParticipation(
  from: ParticipationStatus,
  to: ParticipationStatus,
): boolean {
  return PARTICIPATION_NEXT[from].includes(to);
}

// Still in the programme: a place that holds the learner's one seat.
export const RUNNING_PARTICIPATION: readonly ParticipationStatus[] = [
  'requested',
  'active',
];

export function isRunning(status: ParticipationStatus): boolean {
  return RUNNING_PARTICIPATION.includes(status);
}

export function participationLabel(status: ParticipationStatus): string {
  return {
    requested: 'Requested',
    active: 'Taking part',
    completed: 'Completed',
    withdrawn: 'Withdrawn',
  }[status];
}

export const COHORT_SUBJECT = 'cohort';
export const PROGRAM_SUBJECT = 'program';
