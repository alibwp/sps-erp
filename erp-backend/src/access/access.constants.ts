import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../common/errors/api-exception.js';

// Platform permissions (reference app/Enums/PlatformPermission.php). Only
// the global platform-admin role carries them.
export const PlatformPermission = {
  AccessAllSchools: 'access all schools',
  AccessAllOrganizations: 'access all organizations',
  ManagePlatform: 'manage platform',
} as const;

// Organization permissions (reference app/Enums/OrganizationPermission.php),
// in the reference's order. A member holds one only when the global
// organization-admin role carries it and their membership grants it.
export const OrganizationPermission = {
  Read: 'read organization',
  Manage: 'manage organization',
  ManageMembers: 'manage organization members',
  ManageCampuses: 'manage organization campuses',
  MoveStudents: 'move students between campuses',
  ReadReports: 'read organization reports',
} as const;

export type OrganizationPermissionName =
  (typeof OrganizationPermission)[keyof typeof OrganizationPermission];

export const ORGANIZATION_PERMISSIONS: readonly OrganizationPermissionName[] =
  Object.values(OrganizationPermission);

// What a member can be given one at a time. Read is always kept: every
// member needs it to open the screens.
export const DELEGABLE_ORGANIZATION_PERMISSIONS =
  ORGANIZATION_PERMISSIONS.filter(
    (permission) => permission !== OrganizationPermission.Read,
  );

// Permissions that belong above a campus. A campus role never grants them
// and nobody can put them in one.
export const ABOVE_THE_CAMPUS: ReadonlySet<string> = new Set([
  ...Object.values(PlatformPermission),
  ...ORGANIZATION_PERMISSIONS,
]);

// The campus permissions Stage 2 itself checks.
export const CampusPermission = {
  ReadSchool: 'read school',
  UpdateSchool: 'update school',
  ManageSchoolSettings: 'manage school settings',
  ReadRole: 'read role',
  ManageRole: 'manage role',
  ManageAccountAccess: 'manage account access',
} as const;

// Built-in role names (reference app/Enums/Role.php). Built-in roles cannot
// be rewritten; librarian and accountant are shared roles a campus may
// tailor.
export const BuiltInRole = {
  PlatformAdmin: 'platform-admin',
  OrganizationAdmin: 'organization-admin',
  Admin: 'admin',
  Teacher: 'teacher',
  Student: 'student',
  Parent: 'parent',
} as const;

const BUILT_IN_ROLES: readonly string[] = Object.values(BuiltInRole);

// The two roles the platform gives, never a campus. Held with no campus.
const SYSTEM_SCOPED_ROLES: readonly string[] = [
  BuiltInRole.PlatformAdmin,
  BuiltInRole.OrganizationAdmin,
];

// Family portal roles: they never count as staff authority, and Stage 2's
// role endpoints do not give them (enrollment and guardian links do, in
// Stage 5).
export const FAMILY_ROLES: readonly string[] = [
  BuiltInRole.Student,
  BuiltInRole.Parent,
];

export function isBuiltInRole(name: string): boolean {
  return BUILT_IN_ROLES.includes(name);
}

export function isSystemScopedRole(name: string): boolean {
  return SYSTEM_SCOPED_ROLES.includes(name);
}

// 403 for an admin route while the email address is not verified, with
// Laravel's message for its `verified` middleware.
export class EmailNotVerified extends ApiException {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      'email_not_verified',
      'Your email address is not verified.',
    );
  }
}

export class Forbidden extends ApiException {
  constructor(message = 'This action is unauthorized.') {
    super(HttpStatus.FORBIDDEN, 'forbidden', message);
  }
}
