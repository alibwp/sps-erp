// The dashboards the app has, and how a person's roles at their campus pick
// one. The roles come from the backend (GET /api/v1/me/permissions).

export type RoleId =
  | "platform-admin"
  | "school-admin"
  | "teacher"
  | "student"
  | "parent"
  | "accountant"
  | "librarian";

/** The signed-in person as the app shows them. */
export type Role = {
  id: RoleId;
  label: string;
  name: string;
  email: string;
};

// Backend role names, strongest first: a person holding several sees the
// dashboard of the first one they hold. The organization administrator has
// no dashboard of their own yet and sees the school administrator's.
const BY_PRIORITY: ReadonlyArray<{ name: string; id: RoleId; label: string }> = [
  { name: "platform-admin", id: "platform-admin", label: "Platform administrator" },
  { name: "organization-admin", id: "school-admin", label: "Organization administrator" },
  { name: "admin", id: "school-admin", label: "School administrator" },
  { name: "accountant", id: "accountant", label: "Accountant" },
  { name: "librarian", id: "librarian", label: "Librarian" },
  { name: "teacher", id: "teacher", label: "Teacher" },
  { name: "parent", id: "parent", label: "Parent" },
  { name: "student", id: "student", label: "Student" },
];

/**
 * The dashboard for a person's backend roles, and what to call them. Someone
 * holding none of these (a campus's own role, or no campus yet) sees the
 * teacher's dashboard, the plainest staff view, under the name of what they
 * do hold.
 */
export function roleFor(roleNames: readonly string[]): { id: RoleId; label: string } {
  const known = BY_PRIORITY.find((role) => roleNames.includes(role.name));
  if (known) return { id: known.id, label: known.label };
  return { id: "teacher", label: roleNames[0] ?? "No role yet" };
}
