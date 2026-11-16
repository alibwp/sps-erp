// Teaching (course offerings, their rosters and teachers) and students
// (enrollments, placements in sections, enrollment status). Types mirror
// erp-backend/src/curriculum/curriculum.dto.ts and
// erp-backend/src/enrollments/students.dto.ts; the enrollment status rules
// mirror enrollment.constants.ts.
//
// The backend keeps no guardian on a student record, so nothing here shows one.

import type { Person, RosterMode, StructureStatus } from "@/lib/academic";

// ---------------------------------------------------------------- Course offerings

export type SubjectBrief = { id: string; name: string; shortName: string };
export type SectionBrief = { id: string; name: string; academicLevelId: string };

export type Offering = {
  id: string;
  academicYearId: string;
  academicPeriodId: string;
  subject: SubjectBrief;
  academicLevelId: string;
  /** Tells two offerings of one subject apart, e.g. "Algebra A". */
  name: string | null;
  rosterMode: RosterMode;
  status: StructureStatus;
  plannedPeriodsPerWeek: number | null;
  capacity: number | null;
  academicCycleSectionIds: string[];
  studentRecordIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type BulkSkip = {
  academicPeriodId: string;
  academicLevelId: string;
  rosterMode: RosterMode;
  academicCycleSectionIds: string[];
  reason: string;
};
export type BulkResult = { created: Offering[]; skipped: BulkSkip[] };

export type RosterLearner = {
  studentRecordId: string;
  userId: string;
  name: string;
  admissionNumber: string;
  /** Their section on that day. */
  academicCycleSectionId: string;
};

export type Roster = {
  courseOfferingId: string;
  date: string;
  rosterMode: RosterMode;
  academicLevelIds: string[];
  sections: SectionBrief[];
  studentRecordIds: string[];
  /** The reader teaches part of the offering and sees only those sections. */
  limitedToSections: boolean;
  learners: RosterLearner[];
};

export type TeachingRole = "lead" | "supporting";
export const TEACHING_ROLES: ReadonlyArray<{ value: TeachingRole; label: string }> = [
  { value: "lead", label: "Lead teacher" },
  { value: "supporting", label: "Supporting teacher" },
];

export type Assignment = {
  id: string;
  courseOfferingId: string;
  teacher: Person;
  role: TeachingRole;
  /** Teaches only this section's learners. */
  section: SectionBrief | null;
  startsOn: string;
  endsOn: string | null;
  /** Running on the campus's today. */
  running: boolean;
  createdAt: string;
};

/** Which roster modes read home sections, and how many each needs. */
export function sectionRule(mode: RosterMode): { min: number; max: number } | null {
  if (mode === "home_section") return { min: 1, max: 1 };
  if (mode === "combined_home_sections") return { min: 2, max: 50 };
  return null;
}

/** "All terms" in CreateOfferingDto / BulkOfferingsDto. */
export const ALL_PERIODS = "all";

// ---------------------------------------------------------------- Students

export type EnrollmentStatus = "active" | "suspended" | "withdrawn" | "transferred" | "graduated" | "archived";

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  withdrawn: "Withdrawn",
  transferred: "Transferred",
  graduated: "Graduated",
  archived: "Archived",
};

/** ALLOWED_NEXT in enrollment.constants.ts. */
export const ENROLLMENT_NEXT: Record<EnrollmentStatus, readonly EnrollmentStatus[]> = {
  active: ["suspended", "withdrawn", "transferred", "graduated", "archived"],
  suspended: ["active", "withdrawn", "transferred", "archived"],
  withdrawn: ["active", "archived"],
  transferred: ["archived"],
  graduated: ["active", "archived"],
  archived: [],
};

/** Still enrolled: attends now, or is away for a while. */
export const isEnrolled = (status: EnrollmentStatus) => status === "active" || status === "suspended";

export function enrollmentTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (status) {
    case "active":
      return "success";
    case "suspended":
      return "warning";
    case "graduated":
      return "info";
    case "withdrawn":
    case "transferred":
      return "danger";
    default:
      return "neutral";
  }
}

export const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"] as const;

export type Student = {
  /** The enrollment's id. */
  id: string;
  userId: string;
  name: string;
  email: string;
  admissionNumber: string;
  admissionDate: string;
  status: EnrollmentStatus;
  isPrimary: boolean;
  transferredFromId: string | null;
  /** Where they sit now. */
  section: (SectionBrief & { academicYearId: string }) | null;
  birthday: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  nationality: string | null;
  accountStatus: string;
  createdAt: string;
};

export type Placement = {
  id: string;
  academicYearId: string;
  academicPeriodId: string | null;
  section: SectionBrief;
  effectiveOn: string;
  changedBy: Person | null;
  reason: string | null;
  createdAt: string;
};

export type EnrollmentHistory = {
  id: string;
  fromStatus: EnrollmentStatus | null;
  toStatus: EnrollmentStatus;
  effectiveOn: string;
  changedBy: Person | null;
  reason: string | null;
  createdAt: string;
};

/** The person fields of AdmitStudentDto / UpdateStudentDto. */
export const PERSON_FIELDS = [
  "name",
  "email",
  "birthday",
  "gender",
  "phone",
  "address",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "country",
  "nationality",
] as const;
export type PersonField = (typeof PERSON_FIELDS)[number];

export const teachingApi = {
  offerings: "/v1/course-offerings",
  offering: (id: string) => `/v1/course-offerings/${id}`,
  assignment: (id: string) => `/v1/teaching-assignments/${id}`,
  students: "/v1/students",
  student: (id: string) => `/v1/students/${id}`,
} as const;
