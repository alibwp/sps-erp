// Shared states of academic years and periods (reference
// app/Enums/AcademicPeriodStatus.php).
export const ACADEMIC_STATUSES = [
  'draft',
  'scheduled',
  'open',
  'closing',
  'closed',
  'archived',
] as const;

export type AcademicStatus = (typeof ACADEMIC_STATUSES)[number];

// AcademicPeriodStatus::allowedNext.
export const ALLOWED_NEXT: Record<AcademicStatus, readonly AcademicStatus[]> = {
  // A draft can be dated, or opened straight away when staff are setting up
  // a period that is already running.
  draft: ['scheduled', 'open', 'closed'],
  scheduled: ['open', 'draft', 'closed'],
  open: ['closing', 'closed'],
  closing: ['closed', 'open'],
  closed: ['open', 'archived'],
  // Archived is the end.
  archived: [],
};

export function canMoveTo(from: AcademicStatus, to: AcademicStatus): boolean {
  return ALLOWED_NEXT[from].includes(to);
}

export function isFrozen(status: AcademicStatus): boolean {
  return status === 'closed' || status === 'archived';
}

export function isOperational(status: AcademicStatus): boolean {
  return status === 'open' || status === 'closing';
}

// Leaving closed or archived for a state that is not frozen needs a reason.
export function requiresReasonToReach(
  from: AcademicStatus,
  to: AcademicStatus,
): boolean {
  return isFrozen(from) && !isFrozen(to);
}

// Reference app/Enums/AcademicPeriodType.php.
export const PERIOD_TYPES = [
  'term',
  'semester',
  'trimester',
  'quarter',
  'exam_window',
  'holiday',
  'reporting_period',
  'other',
] as const;

export type PeriodType = (typeof PERIOD_TYPES)[number];

// The types that divide a year (isPrimaryDivision) plus "other": the only
// ones a calendar's top-level periods may use.
export const TOP_LEVEL_PERIOD_TYPES: readonly PeriodType[] = [
  'term',
  'semester',
  'trimester',
  'quarter',
  'other',
];

// The types that sit inside a top-level period (subPeriodTypes).
export const SUB_PERIOD_TYPES: readonly PeriodType[] = [
  'exam_window',
  'holiday',
  'reporting_period',
];

// Reference app/Enums/InstructionalModel.php and RosterMode.php.
export const INSTRUCTIONAL_MODELS = [
  'fixed_home_sections',
  'hybrid',
  'subject_based_schedule',
] as const;

export type InstructionalModel = (typeof INSTRUCTIONAL_MODELS)[number];

export const DEFAULT_INSTRUCTIONAL_MODEL: InstructionalModel =
  'fixed_home_sections';

export const ROSTER_MODES = [
  'home_section',
  'combined_home_sections',
  'academic_level',
  'individual_roster',
] as const;

export type RosterMode = (typeof ROSTER_MODES)[number];

export const INSTRUCTIONAL_MODEL_LABELS: Record<InstructionalModel, string> = {
  fixed_home_sections: 'One class group all day',
  hybrid: 'One class group, with exceptions',
  subject_based_schedule: 'A timetable of separate subjects',
};

// InstructionalModel::allowsRosterMode: home sections and whole-class
// rosters always; combined sections and named learners except under fixed
// home sections.
export function allowsRosterMode(
  model: InstructionalModel,
  mode: RosterMode,
): boolean {
  if (mode === 'home_section' || mode === 'academic_level') return true;
  return model !== 'fixed_home_sections';
}

export function rosterModesFor(model: InstructionalModel): RosterMode[] {
  return ROSTER_MODES.filter((mode) => allowsRosterMode(model, mode));
}

// Campus setup steps (reference SchoolSetupStep) and year setup steps
// (AcademicYearSetupStep), in order.
export const SCHOOL_SETUP_STEPS = [
  {
    value: 'details',
    label: 'School details',
    description: 'Confirm the information shown to families and staff.',
  },
  {
    value: 'language',
    label: 'School language',
    description: 'Use the terms your school already knows.',
  },
  {
    value: 'classes',
    label: 'Classes or grades',
    description: 'Add the reusable classes or grades your school teaches.',
  },
  {
    value: 'academic-year',
    label: 'Academic year',
    description: 'Create the first year and its reporting periods.',
  },
  {
    value: 'finish',
    label: 'Finish setup',
    description: 'Review what is ready and choose the next task.',
  },
] as const;

export const YEAR_SETUP_STEPS = [
  {
    value: 'calendar',
    label: 'Dates and periods',
    description: 'Set the dates and terms or semesters.',
  },
  {
    value: 'teaching',
    label: 'Teaching approach',
    description: 'Choose how learners are grouped for teaching.',
  },
  {
    value: 'structure',
    label: 'Classes and teachers',
    description: 'Create this year’s classes and assign class teachers.',
  },
  {
    value: 'subjects',
    label: 'Subjects for this year',
    description: 'Add the subjects each class will study and when they run.',
  },
  {
    value: 'review',
    label: 'Review and publish',
    description: 'Check the setup and make the year available.',
  },
] as const;

export const SETUP_PHASE_STATUSES = [
  'in_progress',
  'ready',
  'acknowledged',
] as const;
export type SetupPhaseStatus = (typeof SETUP_PHASE_STATUSES)[number];

export const ISO_WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const YEAR_SUBJECT = 'academic_year';
export const PERIOD_SUBJECT = 'academic_period';
