// The roles someone can sign in as, with the demo account for each. Sign-in
// is not connected to the backend yet, so the role picked at login decides
// which dashboard and identity the app shows.

import { PARENT_NAMES, STUDENT_NAMES, TEACHER_NAMES } from "@/lib/mock";

export type RoleId =
  | "platform-admin"
  | "school-admin"
  | "teacher"
  | "student"
  | "parent"
  | "accountant"
  | "librarian";

export type Role = {
  id: RoleId;
  label: string;
  /** The demo person signed in under this role. */
  name: string;
  email: string;
};

const plainName = (name: string) => name.replace(/^(Mr|Ms|Mrs|Dr)\.\s+/, "");

export const ROLES: Role[] = [
  { id: "platform-admin", label: "Platform administrator", name: "Azeem Abbasi", email: "admin@spsarmyschool.edu.pk" },
  { id: "school-admin", label: "School administrator", name: "Adil Mehmood", email: "adil@spsarmyschool.edu.pk" },
  { id: "teacher", label: "Teacher", name: plainName(TEACHER_NAMES[0]), email: "teacher@spsarmyschool.edu.pk" },
  { id: "student", label: "Student", name: STUDENT_NAMES[0], email: "student@students.sps.edu.pk" },
  { id: "parent", label: "Parent", name: PARENT_NAMES[0], email: "parent@gmail.com" },
  { id: "accountant", label: "Accountant", name: "Kamran Butt", email: "kamran@spsarmyschool.edu.pk" },
  { id: "librarian", label: "Librarian", name: "Nida Farooq", email: "nida@spsarmyschool.edu.pk" },
];

/** Who the app shows when nobody has signed in yet. */
export const DEFAULT_ROLE: RoleId = "platform-admin";

const byId = new Map(ROLES.map((role) => [role.id, role]));

export function isRoleId(value: unknown): value is RoleId {
  return typeof value === "string" && byId.has(value as RoleId);
}

export function getRole(id: RoleId): Role {
  return byId.get(id) ?? byId.get(DEFAULT_ROLE)!;
}

/** The role of a demo account, or the default for any other address. */
export function roleForEmail(email: string): RoleId {
  const match = ROLES.find((role) => role.email === email.trim().toLowerCase());
  return match?.id ?? DEFAULT_ROLE;
}
