import { Injectable } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { RuleViolation } from '../common/errors/api-exception.js';
import { School } from '../organizations/entities/school.entity.js';
import {
  ABOVE_THE_CAMPUS,
  CampusPermission,
  PlatformPermission,
  isBuiltInRole,
  isSystemScopedRole,
} from './access.constants.js';
import { Permission } from './entities/permission.entity.js';
import { Role } from './entities/role.entity.js';
import { PermissionResolver } from './permission-resolver.service.js';

export const RoleMessages = {
  notYoursToGive: (names: string[]) =>
    `You cannot put something in a role that you do not hold yourself: ${names.join(', ')}.`,
  notYoursToTakeOut: (names: string[]) =>
    `You cannot take something out of a role that you do not hold yourself: ${names.join(', ')}.`,
  anotherCampus: 'That role belongs to another campus.',
  givenByPlatform: (name: string) =>
    `${name} is given by the platform, not by a campus.`,
  builtIn: (name: string) =>
    `${name} is a built-in role. Copy it and change the copy instead.`,
  lastRoleManager:
    'Nobody at this campus could manage roles after that. Give somebody else role management first.',
} as const;

// Campus role changes are limited to what the actor holds at that campus,
// and a campus never loses its last role manager (reference
// app/Services/Authorization/RoleAuthority.php).
@Injectable()
export class RoleAuthority {
  constructor(private readonly resolver: PermissionResolver) {}

  // The permissions this person may put in a role at this campus: every
  // campus permission for a platform administrator, otherwise the ones
  // their roles at the campus hold. Platform and organization permissions
  // never go in a campus role.
  async grantableBy(
    manager: EntityManager,
    actorId: string,
    schoolId: string,
  ): Promise<Set<string>> {
    const all = (
      await manager.find(Permission, {
        select: { name: true },
        order: { name: 'ASC' },
      })
    )
      .map((permission) => permission.name)
      .filter((name) => !ABOVE_THE_CAMPUS.has(name));

    const global = await this.resolver.globalPermissions(actorId, manager);
    if (global.has(PlatformPermission.ManagePlatform)) return new Set(all);

    const held = await this.resolver.heldAtCampus(
      actorId,
      schoolId,
      {},
      manager,
    );
    return new Set(all.filter((name) => held.has(name)));
  }

  // Refuses a role that would hand out more than its author holds.
  async mustBeGrantable(
    manager: EntityManager,
    permissions: readonly string[],
    actorId: string,
    schoolId: string,
  ): Promise<void> {
    const grantable = await this.grantableBy(manager, actorId, schoolId);
    const refused = permissions.filter((name) => !grantable.has(name));
    if (refused.length) {
      throw new RuleViolation(RoleMessages.notYoursToGive(refused));
    }
  }

  // Refuses a role of another campus or one the platform gives. A shared
  // role (no campus) can be given out, and tailored, at every campus.
  mustBeUsableAt(role: Role, schoolId: string): void {
    if (role.schoolId !== null && role.schoolId !== schoolId) {
      throw new RuleViolation(RoleMessages.anotherCampus);
    }
    if (role.schoolId === null && isSystemScopedRole(role.name)) {
      throw new RuleViolation(RoleMessages.givenByPlatform(role.name));
    }
  }

  // Refuses a change to a role the application itself relies on.
  mustNotBeBuiltIn(role: Role): void {
    if (role.schoolId === null && isBuiltInRole(role.name)) {
      throw new RuleViolation(RoleMessages.builtIn(role.name));
    }
  }

  // The campus's own copy of a shared role, when it made one.
  async tailoredCopyOf(
    manager: EntityManager,
    role: Role,
    schoolId: string,
  ): Promise<Role | null> {
    if (role.schoolId !== null) return null;
    return manager
      .createQueryBuilder(Role, 'role')
      .where('role.schoolId = :schoolId', { schoolId })
      .andWhere('lower(role.name) = lower(:name)', { name: role.name })
      .getOne();
  }

  // Whether this person's staff roles at the campus hold anything the actor
  // could not hand out. Family portal roles do not count.
  async holdsMoreThan(
    manager: EntityManager,
    personId: string,
    actorId: string,
    schoolId: string,
  ): Promise<boolean> {
    const staffPower = await this.resolver.heldAtCampus(
      personId,
      schoolId,
      { staffOnly: true },
      manager,
    );
    const grantable = await this.grantableBy(manager, actorId, schoolId);
    return [...staffPower].some((name) => !grantable.has(name));
  }

  // Whether an active member of the campus whose account is not suspended
  // or archived holds "manage role" through a role held there. A role
  // outlives the membership, so only active members count. Reads the
  // tables directly, so changes made earlier in the transaction count.
  async campusHasARoleManager(
    manager: EntityManager,
    schoolId: string,
  ): Promise<boolean> {
    const rows = (await manager.query(
      `SELECT 1
         FROM model_has_roles a
         JOIN role_has_permissions rp ON rp.role_id = a.role_id
         JOIN permissions p ON p.id = rp.permission_id
         JOIN school_memberships m
           ON m.user_id = a.user_id AND m.school_id = a.school_id AND m.status = 'active'
         JOIN users u
           ON u.id = a.user_id AND u.account_status NOT IN ('suspended', 'archived') AND u.deleted_at IS NULL
        WHERE a.school_id = $1 AND p.name = $2
        LIMIT 1`,
      [schoolId, CampusPermission.ManageRole],
    )) as unknown[];
    return rows.length > 0;
  }

  // Runs a change, refusing it when the campus had somebody who could
  // manage roles before and has nobody after. The campus row is locked
  // first, so two managers taking the role from each other at once cannot
  // both succeed. A campus with no role manager yet (a new one) does not
  // block anything: a platform administrator gives its first role. Must be
  // called inside a transaction.
  async mustKeepARoleManager<T>(
    manager: EntityManager,
    schoolId: string,
    change: () => Promise<T>,
  ): Promise<T> {
    await manager.findOne(School, {
      where: { id: schoolId },
      lock: { mode: 'pessimistic_write' },
    });
    const hadOne = await this.campusHasARoleManager(manager, schoolId);
    const result = await change();
    if (hadOne && !(await this.campusHasARoleManager(manager, schoolId))) {
      throw new RuleViolation(RoleMessages.lastRoleManager);
    }
    return result;
  }

  // The shared role with this name (built-in roles, librarian, accountant).
  sharedRole(manager: EntityManager, name: string): Promise<Role | null> {
    return manager.findOne(Role, { where: { name, schoolId: IsNull() } });
  }
}
