// Which pages a person may open, and where they may add or change records,
// decided by the permissions they hold at the working campus
// (GET /v1/me/permissions), not by the name of their role.
//
// Every page connected to the backend is listed here with the permissions its
// endpoints check: `read` to open it, `change` to see its add/edit/delete
// actions and its create/edit pages (any one of the listed permissions is
// enough, as the backend accepts any of them). Pages not listed have no
// backend yet and keep the role-based rules in lib/nav.ts.
//
// This only shapes what is shown. The backend checks every request again.

export type Access = {
  /** Permissions held at the working campus, global roles included. */
  permissions: ReadonlySet<string>;
  /** Backend role names held there (e.g. "organization-admin"). */
  roleNames: readonly string[];
};

type PageRule =
  | { read: readonly string[]; change: readonly string[] }
  /** Organization-level pages: authority comes from the organization, not the campus. */
  | { organization: true };

const ACCOUNTS = ["manage account access"] as const;

export const PAGE_RULES: Record<string, PageRule> = {
  // Organization level (Phase 5).
  "/organizations": { organization: true },
  "/schools": { organization: true },
  "/calendar-templates": { organization: true },

  // Campus settings (Phase 4): GET /v1/school, PATCH /v1/school.
  "/school-settings": {
    read: ["read school", "manage school settings", "update school"],
    change: ["update school", "manage school settings"],
  },

  // Academic structure (Phase 6).
  "/academic-years": {
    read: ["read academic year", "read academic period"],
    change: ["create academic year", "update academic year"],
  },
  "/academic-levels": { read: ["read class"], change: ["create class", "update class", "delete class"] },
  "/academic-cycle-sections": { read: ["read section"], change: ["create section", "update section"] },
  "/subjects": { read: ["read subject"], change: ["create subject", "update subject", "delete subject"] },

  // Teaching and students (Phase 7).
  "/course-offerings": { read: ["read subject"], change: ["create subject", "update subject"] },
  "/students": { read: ["read student"], change: ["create student", "update student"] },

  // People and access (Phase 9).
  "/roles": { read: ["read role"], change: ["manage role"] },
  "/admins": { read: ACCOUNTS, change: ACCOUNTS },
  "/account-invitations": { read: ACCOUNTS, change: ACCOUNTS },
  "/teachers": { read: ACCOUNTS, change: ACCOUNTS },
  "/parents": { read: ACCOUNTS, change: ACCOUNTS },
};

/** Roles whose holders work at the organization level. */
const ORGANIZATION_ROLES = new Set(["platform-admin", "organization-admin"]);

function ruleFor(pathname: string): PageRule | undefined {
  const href = Object.keys(PAGE_RULES).find((key) => pathname === key || pathname.startsWith(`${key}/`));
  return href ? PAGE_RULES[href] : undefined;
}

const holdsAny = (access: Access, names: readonly string[]) => names.some((name) => access.permissions.has(name));

function organizationAccess(access: Access): boolean {
  return access.permissions.has("access all organizations") || access.roleNames.some((name) => ORGANIZATION_ROLES.has(name));
}

/**
 * true/false for a connected page, or undefined when the page has no backend
 * yet and the role-based rules decide.
 */
export function pageOpenable(access: Access, pathname: string): boolean | undefined {
  const rule = ruleFor(pathname);
  if (!rule) return undefined;
  if ("organization" in rule) return organizationAccess(access);
  // A create or edit page needs the right to change, not just to read.
  if (/\/(create|edit|bulk)$/.test(pathname)) return holdsAny(access, rule.change);
  return holdsAny(access, rule.read);
}

/** Like pageOpenable, for the add/edit/delete actions of a page. */
export function pageChangeable(access: Access, pathname: string): boolean | undefined {
  const rule = ruleFor(pathname);
  if (!rule) return undefined;
  // Organization pages check each organization's own permissions themselves.
  if ("organization" in rule) return organizationAccess(access);
  return holdsAny(access, rule.change);
}

/** Whether a page reads from the backend (the others show demo data). */
export function isConnected(pathname: string): boolean {
  return ruleFor(pathname) !== undefined;
}
