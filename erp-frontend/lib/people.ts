// People and access at a campus: roles and their permissions, accounts (the
// people with a membership here), invitations, and the teacher and parent
// views of the account list. Types mirror erp-backend/src/access/access.dto.ts
// and erp-backend/src/accounts/accounts.dto.ts.

import type { PersonField } from "@/lib/teaching";

// ---------------------------------------------------------------- Roles

export type Role = {
  id: string;
  name: string;
  description: string | null;
  /** A role every campus can give; changing it gives this campus its own copy. */
  shared: boolean;
  /** Built into the application: can be given out, never changed. */
  builtIn: boolean;
  archivedAt: string | null;
  permissions: string[];
  /** People holding the role at this campus. */
  holders: number;
};

export type RoleDetail = Role & { people: Array<{ id: string; name: string; email: string }> };

/** Roles a campus never gives through the accounts screen. */
export const NOT_GIVEN_HERE = new Set(["platform-admin", "student", "parent"]);

export const peopleApi = {
  roles: "/v1/roles",
  role: (id: string) => `/v1/roles/${id}`,
  grantable: "/v1/roles/grantable-permissions",
  accounts: "/v1/accounts",
  account: (id: string) => `/v1/accounts/${id}`,
  invitations: "/v1/account-invitations",
} as const;

// ---------------------------------------------------------------- Permissions

export type PermissionGroup = { key: string; label: string; permissions: Array<{ name: string; label: string }> };

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Permission names grouped for the matrix. Campus permissions read
 * "<verb> <thing>" ("read student", "take attendance"), so they group by the
 * thing; the menu-* and header-* names only shape navigation and get groups
 * of their own.
 */
export function groupPermissions(names: readonly string[]): PermissionGroup[] {
  const groups = new Map<string, PermissionGroup>();
  const add = (key: string, label: string, name: string, itemLabel: string) => {
    const group = groups.get(key) ?? { key, label, permissions: [] };
    group.permissions.push({ name, label: itemLabel });
    groups.set(key, group);
  };

  for (const name of [...new Set(names)].sort()) {
    if (name.startsWith("menu-")) {
      add("~menu", "Sidebar menus", name, sentence(name.slice(5).replaceAll("-", " ")));
    } else if (name.startsWith("header-")) {
      add("~header", "Header menus", name, sentence(name.slice(7).replaceAll("-", " ")));
    } else {
      const [verb, ...rest] = name.split(" ");
      const thing = rest.join(" ") || verb;
      add(thing, sentence(thing), name, rest.length ? sentence(verb) : sentence(name));
    }
  }
  // Areas alphabetically, the navigation groups last.
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------- Accounts

export type AccountStatus = "invited" | "active" | "suspended" | "archived";

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  invited: "Invited",
  active: "Active",
  suspended: "Suspended",
  archived: "Archived",
};

export function accountTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "active") return "success";
  if (status === "invited") return "info";
  if (status === "suspended") return "warning";
  return "neutral";
}

export type HeldRole = { id: string; name: string; global: boolean };

export type Account = {
  id: string;
  name: string;
  email: string;
  accountStatus: AccountStatus;
  emailVerifiedAt: string | null;
  twoFactorEnabled: boolean;
  membership: { isPrimary: boolean; joinedAt: string | null };
  /** Roles held at this campus, and global roles. */
  roles: HeldRole[];
  createdAt: string;
};

export type AccountDetail = Account & Record<Exclude<PersonField, "name" | "email">, string | null> & { profilePhotoUrl: string | null };

/** What POST …/status-changes accepts. */
export type StatusAction = "suspend" | "reinstate" | "archive";

/** The actions that make sense from each account status. */
export const STATUS_ACTIONS: Record<AccountStatus, StatusAction[]> = {
  invited: ["suspend", "archive"],
  active: ["suspend", "archive"],
  suspended: ["reinstate", "archive"],
  archived: ["reinstate"],
};

export const STATUS_ACTION_LABELS: Record<StatusAction, string> = {
  suspend: "Suspend",
  reinstate: "Reinstate",
  archive: "Archive",
};

// ---------------------------------------------------------------- Invitations

export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  expired: "Expired",
  revoked: "Revoked",
};

export function invitationTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "accepted") return "success";
  if (status === "pending") return "info";
  if (status === "expired") return "warning";
  return "neutral";
}

export type Invitation = {
  id: string;
  status: InvitationStatus;
  user: { id: string; name: string; email: string };
  invitedBy: { id: string; name: string } | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

/** Role names the teacher and parent lists filter by. */
export const ROLE_NAMES = { teacher: "teacher", parent: "parent" } as const;
