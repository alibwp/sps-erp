// The academic structure of a campus: school years and their periods (terms),
// classes (academic levels), sections, subjects and the year's instructional
// model. Types mirror erp-backend/src/academic/academic.dto.ts and
// erp-backend/src/curriculum/curriculum.dto.ts; the status rules mirror
// academic.constants.ts and curriculum.constants.ts so the screens only offer
// moves the backend accepts.

export { PERIOD_TYPES, periodTypeLabel, type PeriodType } from "@/lib/organizations";

// ---------------------------------------------------------------- Statuses

export type AcademicStatus = "draft" | "scheduled" | "open" | "closing" | "closed" | "archived";

export const ACADEMIC_STATUS_LABELS: Record<AcademicStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  open: "Open",
  closing: "Closing",
  closed: "Closed",
  archived: "Archived",
};

/** ALLOWED_NEXT in academic.constants.ts. */
export const ACADEMIC_NEXT: Record<AcademicStatus, readonly AcademicStatus[]> = {
  draft: ["scheduled", "open", "closed"],
  scheduled: ["open", "draft", "closed"],
  open: ["closing", "closed"],
  closing: ["closed", "open"],
  closed: ["open", "archived"],
  archived: [],
};

export const isFrozen = (status: AcademicStatus) => status === "closed" || status === "archived";

/** Leaving closed or archived for a state that is not frozen needs a reason. */
export const reasonNeededFor = (from: AcademicStatus, to: AcademicStatus) => isFrozen(from) && !isFrozen(to);

/** Moves that run the closure-readiness check first. */
export const isClosingMove = (to: AcademicStatus) => to === "closing" || to === "closed" || to === "archived";

/** The permission each move needs (the backend's rule for years and periods). */
export function statusPermission(from: AcademicStatus, to: AcademicStatus, kind: "year" | "period"): string {
  if (isClosingMove(to)) return "close academic period";
  if ((from === "closing" || from === "closed") && !isFrozen(to)) return "reopen academic period";
  return kind === "year" ? "update academic year" : "update academic period";
}

export type StructureStatus = "draft" | "active" | "archived";

export const STRUCTURE_STATUS_LABELS: Record<StructureStatus, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};

/** canMoveStructure in curriculum.constants.ts. */
export const STRUCTURE_NEXT: Record<StructureStatus, readonly StructureStatus[]> = {
  draft: ["active", "archived"],
  active: ["archived"],
  archived: [],
};

/** A badge tone for any status. */
export function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (status) {
    case "open":
    case "active":
      return "success";
    case "scheduled":
      return "info";
    case "closing":
    case "draft":
      return "warning";
    case "closed":
      return "danger";
    default:
      return "neutral";
  }
}

// ---------------------------------------------------------------- Years and periods

export type Period = {
  id: string;
  academicYearId: string;
  parentId: string | null;
  name: string;
  label: string | null;
  /** The label when set, else the name. */
  displayName: string;
  type: string;
  position: number;
  startsOn: string | null;
  endsOn: string | null;
  status: AcademicStatus;
  children: Period[];
};

export type Year = {
  id: string;
  /** e.g. "2026–27". */
  name: string;
  startYear: number;
  stopYear: number;
  startsOn: string | null;
  endsOn: string | null;
  status: AcademicStatus;
  /** The campus opens in this year by default. */
  isCampusDefault: boolean;
  createdAt: string;
};

/** Top-level periods in calendar order, each with its sub-periods. */
export type YearDetail = Year & { periods: Period[] };

export type StatusHistory = {
  id: string;
  fromStatus: AcademicStatus;
  toStatus: AcademicStatus;
  changedById: string | null;
  reason: string | null;
  createdAt: string;
};

export type ClosureFinding = { key: string; summary: string; count: number; blocking: boolean };
export type ClosureReadiness = { ready: boolean; findings: ClosureFinding[] };

export type SetupStep = { value: string; label: string; description: string; complete: boolean; required: boolean };
export type YearSetup = { academicYearId: string; steps: SetupStep[]; current: string };

/** Period types a top-level period may have; the others sit inside one. */
export const TOP_LEVEL_TYPES = ["term", "semester", "trimester", "quarter", "other"] as const;
/** Period types that sit inside a top-level period. */
export const CHILD_TYPES = ["exam_window", "holiday", "reporting_period"] as const;

/** Most periods per calendar (SaveCalendarDto). */
export const MAX_CALENDAR_PERIODS = 8;

// ---------------------------------------------------------------- Instructional model

export type InstructionalModel = "fixed_home_sections" | "hybrid" | "subject_based_schedule";

export const INSTRUCTIONAL_MODELS: ReadonlyArray<{ value: InstructionalModel; label: string; description: string }> = [
  {
    value: "fixed_home_sections",
    label: "One class group all day",
    description: "Learners stay in their section for every subject.",
  },
  {
    value: "hybrid",
    label: "One class group, with exceptions",
    description: "Learners stay in their section, but some subjects combine sections or have their own rosters.",
  },
  {
    value: "subject_based_schedule",
    label: "A timetable of separate subjects",
    description: "Each subject has its own roster; learners move between classes.",
  },
];

export type RosterMode = "home_section" | "combined_home_sections" | "academic_level" | "individual_roster";

export const ROSTER_MODES: ReadonlyArray<{ value: RosterMode; label: string }> = [
  { value: "home_section", label: "One section" },
  { value: "combined_home_sections", label: "Several sections combined" },
  { value: "academic_level", label: "The whole class level" },
  { value: "individual_roster", label: "A list of named learners" },
];

export const rosterModeLabel = (mode: string) => ROSTER_MODES.find((item) => item.value === mode)?.label ?? mode;

export type ModelMigration = {
  id: string;
  fromModel: InstructionalModel | null;
  toModel: InstructionalModel;
  reason: string;
  impact: Record<string, unknown> | null;
  migratedById: string | null;
  createdAt: string;
};

export type InstructionalModelState = {
  academicYearId: string;
  model: InstructionalModel;
  label: string;
  /** false: nothing saved yet, the default applies. */
  chosen: boolean;
  rosterModes: RosterMode[];
  /** The year has not started: set it directly. */
  canSet: boolean;
  /** The year is running: migrate with a reason. */
  canMigrate: boolean;
  migrations: ModelMigration[];
};

export const modelLabel = (model: string | null) =>
  INSTRUCTIONAL_MODELS.find((item) => item.value === model)?.label ?? model ?? "—";

export type Person = { id: string; name: string };

export type ModelException = {
  id: string;
  academicYearId: string;
  subject: { id: string; name: string; shortName: string };
  /** null: every level. */
  academicLevel: { id: string; name: string } | null;
  rosterMode: RosterMode;
  reason: string;
  grantedBy: Person | null;
  revokedAt: string | null;
  revokedById: string | null;
  running: boolean;
  createdAt: string;
};

// ---------------------------------------------------------------- Classes, sections, subjects

export type Level = {
  id: string;
  parentId: string | null;
  /** A group teaches through its child levels. */
  isGroup: boolean;
  name: string;
  code: string | null;
  position: number;
  status: StructureStatus;
  createdAt: string;
  updatedAt: string;
};

export type Section = {
  id: string;
  academicYearId: string;
  academicLevelId: string;
  homeroomTeacher: Person | null;
  name: string;
  label: string | null;
  stream: string | null;
  shift: string | null;
  language: string | null;
  room: string | null;
  capacity: number | null;
  position: number;
  status: StructureStatus;
  createdAt: string;
  updatedAt: string;
};

export type Subject = { id: string; name: string; shortName: string; createdAt: string; updatedAt: string };

/** Levels in display order with each group's children right after it. */
export function levelTree(levels: Level[]): Array<{ level: Level; depth: number }> {
  const byPosition = (a: Level, b: Level) => a.position - b.position || a.name.localeCompare(b.name);
  const children = (parentId: string | null) => levels.filter((level) => level.parentId === parentId).sort(byPosition);
  const result: Array<{ level: Level; depth: number }> = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const level of children(parentId)) {
      result.push({ level, depth });
      walk(level.id, depth + 1);
    }
  };
  walk(null, 0);
  // Levels whose parent is not in the list (archived parent filtered out).
  for (const level of levels) if (!result.some((entry) => entry.level.id === level.id)) result.push({ level, depth: 0 });
  return result;
}

/** API paths. */
export const academicApi = {
  years: "/v1/academic-years",
  year: (id: string) => `/v1/academic-years/${id}`,
  period: (id: string) => `/v1/academic-periods/${id}`,
  levels: "/v1/academic-levels",
  level: (id: string) => `/v1/academic-levels/${id}`,
  sections: "/v1/academic-cycle-sections",
  section: (id: string) => `/v1/academic-cycle-sections/${id}`,
  subjects: "/v1/subjects",
  subject: (id: string) => `/v1/subjects/${id}`,
} as const;
