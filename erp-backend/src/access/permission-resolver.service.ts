import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  ABOVE_THE_CAMPUS,
  FAMILY_ROLES,
  ORGANIZATION_PERMISSIONS,
} from './access.constants.js';

interface PermissionRow {
  name: string;
  global: boolean;
}

// Works out what a person may do. Roles are held either globally (no
// campus: platform-admin, organization-admin) or at one campus.
@Injectable()
export class PermissionResolver {
  constructor(private readonly dataSource: DataSource) {}

  // The permissions of the person's global roles.
  async globalPermissions(
    userId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Set<string>> {
    const rows = (await manager.query(
      `SELECT DISTINCT p.name
         FROM model_has_roles a
         JOIN role_has_permissions rp ON rp.role_id = a.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE a.user_id = $1 AND a.school_id IS NULL`,
      [userId],
    )) as Array<{ name: string }>;
    return new Set(rows.map((row) => row.name));
  }

  // What the person may do at one campus: the roles held there plus the
  // global roles. A campus role never grants a platform or organization
  // permission, even if one was put in it. Organization permissions are
  // left out altogether: they belong to an organization, narrowed by the
  // membership, and are read through OrganizationAccess (GET
  // /organizations/{id} answers yourPermissions).
  async campusPermissions(
    userId: string,
    schoolId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Set<string>> {
    const rows = (await manager.query(
      `SELECT DISTINCT p.name, (a.school_id IS NULL) AS global
         FROM model_has_roles a
         JOIN role_has_permissions rp ON rp.role_id = a.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE a.user_id = $1 AND (a.school_id IS NULL OR a.school_id = $2)`,
      [userId, schoolId],
    )) as PermissionRow[];
    const permissions = new Set<string>();
    for (const row of rows) {
      if (ORGANIZATION_PERMISSIONS.includes(row.name as never)) continue;
      if (row.global || !ABOVE_THE_CAMPUS.has(row.name)) {
        permissions.add(row.name);
      }
    }
    return permissions;
  }

  // The permissions of the roles held at one campus only. With staffOnly,
  // the family portal roles (student, parent) are left out: they are never
  // staff authority (reference RoleAuthority::holdsMoreThan).
  async heldAtCampus(
    userId: string,
    schoolId: string,
    options: { staffOnly?: boolean } = {},
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Set<string>> {
    const rows = (await manager.query(
      `SELECT DISTINCT p.name
         FROM model_has_roles a
         JOIN roles r ON r.id = a.role_id
         JOIN role_has_permissions rp ON rp.role_id = a.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE a.user_id = $1 AND a.school_id = $2
          AND ($3::boolean = false OR NOT (r.school_id IS NULL AND r.name = ANY($4::varchar[])))`,
      [userId, schoolId, options.staffOnly === true, FAMILY_ROLES],
    )) as Array<{ name: string }>;
    return new Set(rows.map((row) => row.name));
  }
}
