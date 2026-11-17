// The organization level: organizations, their campuses, billing groups,
// members and calendar templates. Types mirror the backend DTOs
// (erp-backend/src/organizations/organizations.dto.ts and the template DTOs in
// erp-backend/src/academic/academic.dto.ts).
//
// Authority here is not a campus role: each organization answers with
// `yourPermissions`, the organization permissions the signed-in person holds
// there, and the screens offer only what those allow. The backend still
// checks every request.

export const OrgPermission = {
  Read: "read organization",
  Manage: "manage organization",
  ManageMembers: "manage organization members",
  ManageCampuses: "manage organization campuses",
  MoveStudents: "move students between campuses",
  ReadReports: "read organization reports",
} as const;

export type OrgPermissionName = (typeof OrgPermission)[keyof typeof OrgPermission];

/** What a member can be given ("read organization" is always kept). */
export const DELEGABLE_PERMISSIONS: ReadonlyArray<{ value: OrgPermissionName; label: string; description: string }> = [
  {
    value: OrgPermission.Manage,
    label: "Manage the organization",
    description: "Edit its details, billing groups and calendar templates.",
  },
  {
    value: OrgPermission.ManageMembers,
    label: "Manage members",
    description: "Add and remove organization administrators and set what they may do.",
  },
  {
    value: OrgPermission.ManageCampuses,
    label: "Manage campuses",
    description: "Open campuses and edit their details.",
  },
  {
    value: OrgPermission.MoveStudents,
    label: "Move students between campuses",
    description: "Transfer learners from one campus to another.",
  },
  {
    value: OrgPermission.ReadReports,
    label: "Read organization reports",
    description: "See reports across every campus.",
  },
];

/** Platform permission that lets someone create organizations. */
export const ACCESS_ALL_ORGANIZATIONS = "access all organizations";

export type OrganizationDto = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  /** The organization permissions the signed-in person holds here. */
  yourPermissions: string[];
  createdAt: string;
};

export function orgCan(organization: Pick<OrganizationDto, "yourPermissions">, permission: OrgPermissionName): boolean {
  return organization.yourPermissions.includes(permission);
}

/** GET /v1/organizations/:id/campuses (the backend's CampusDto). */
export type OrgCampus = {
  id: string;
  organizationId: string;
  billingGroupId: string | null;
  name: string;
  code: string;
  initials: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  timezone: string;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  /** When the campus details were first complete; null while setup is needed. */
  setupDetailsCompletedAt: string | null;
  createdAt: string;
};

export type BillingGroup = { id: string; name: string; schoolIds: string[]; createdAt: string };

export type OrgMember = {
  userId: string;
  name: string;
  email: string;
  /** True when the member holds every organization permission (permissions: null). */
  fullAuthority: boolean;
  permissions: string[];
  joinedAt: string | null;
};

export const PERIOD_TYPES = [
  { value: "term", label: "Term" },
  { value: "semester", label: "Semester" },
  { value: "trimester", label: "Trimester" },
  { value: "quarter", label: "Quarter" },
  { value: "exam_window", label: "Exam window" },
  { value: "holiday", label: "Holiday" },
  { value: "reporting_period", label: "Reporting period" },
  { value: "other", label: "Other" },
] as const;

export type PeriodType = (typeof PERIOD_TYPES)[number]["value"];

export function periodTypeLabel(type: string): string {
  return PERIOD_TYPES.find((item) => item.value === type)?.label ?? type;
}

export type TemplatePeriod = {
  id: string;
  parentId: string | null;
  name: string;
  label: string | null;
  type: PeriodType;
  position: number;
  /** Days after the cycle start. */
  startOffsetDays: number;
  lengthDays: number;
};

export type CalendarTemplate = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  cycleLengthDays: number;
  autoOpen: boolean;
  generateAheadWeeks: number;
  remindDaysBefore: number;
  periods: TemplatePeriod[];
  createdAt: string;
};

/** Limits of SaveTemplateDto. */
export const TEMPLATE_LIMITS = {
  periods: 12,
  cycleDays: 3660,
  aheadWeeks: 104,
  remindDays: 90,
} as const;

/** API paths of one organization. */
export const orgApi = {
  list: "/v1/organizations",
  one: (id: string) => `/v1/organizations/${id}`,
  campuses: (id: string) => `/v1/organizations/${id}/campuses`,
  campus: (id: string, schoolId: string) => `/v1/organizations/${id}/campuses/${schoolId}`,
  billingGroups: (id: string) => `/v1/organizations/${id}/billing-groups`,
  billingGroup: (id: string, groupId: string) => `/v1/organizations/${id}/billing-groups/${groupId}`,
  members: (id: string) => `/v1/organizations/${id}/members`,
  member: (id: string, userId: string) => `/v1/organizations/${id}/members/${userId}`,
  templates: (id: string) => `/v1/organizations/${id}/calendar-templates`,
  template: (id: string, templateId: string) => `/v1/organizations/${id}/calendar-templates/${templateId}`,
} as const;
