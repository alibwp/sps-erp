import {
  type InstructionalModel,
  type PeriodType,
  type RosterMode,
  allowsRosterMode,
} from '../academic/academic.constants.js';

// Levels and sections (reference AcademicStructureStatus) and course
// offerings (CourseOfferingStatus) share one lifecycle: a draft becomes
// active or is archived, an active one is archived, and an archived one
// never changes.
export const STRUCTURE_STATUSES = ['draft', 'active', 'archived'] as const;
export type StructureStatus = (typeof STRUCTURE_STATUSES)[number];

export function canMoveStructure(
  from: StructureStatus,
  to: StructureStatus,
): boolean {
  if (from === 'draft') return to === 'active' || to === 'archived';
  if (from === 'active') return to === 'archived';
  return false;
}

export const STATUS_LABELS: Record<StructureStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
};

// Reference TeachingRole.
export const TEACHING_ROLES = ['lead', 'supporting'] as const;
export type TeachingRole = (typeof TEACHING_ROLES)[number];

// The roster is read from home sections (RosterMode::usesHomeSections).
export function usesHomeSections(mode: RosterMode): boolean {
  return mode === 'home_section' || mode === 'combined_home_sections';
}

// A level group has no sections of its own, so it teaches through the whole
// group or named learners (AcademicLevel::allowsRosterMode).
export function levelAllowsRosterMode(
  isGroup: boolean,
  mode: RosterMode,
): boolean {
  return !isGroup || !usesHomeSections(mode);
}

// The model allows the roster, or an exception lets one subject differ.
export function modelAllows(
  model: InstructionalModel,
  mode: RosterMode,
): boolean {
  return allowsRosterMode(model, mode);
}

// The periods an offering for "every period of the year" is created in
// (AcademicPeriodType::isPrimaryDivision, plus custom periods).
export const TEACHING_PERIOD_TYPES: readonly PeriodType[] = [
  'term',
  'semester',
  'trimester',
  'quarter',
  'other',
];

export const LEVEL_SUBJECT = 'academic_level';
export const SECTION_SUBJECT = 'academic_cycle_section';
export const OFFERING_SUBJECT = 'course_offering';
export const ASSIGNMENT_SUBJECT = 'teaching_assignment';
export const EXCEPTION_SUBJECT = 'instructional_model_exception';
