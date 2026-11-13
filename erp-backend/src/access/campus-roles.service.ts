import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { TransactionService } from '../common/database/transaction.service.js';
import {
  RuleViolation,
  ValidationFailed,
} from '../common/errors/api-exception.js';
import { postgresCode } from '../common/errors/error-response.js';
import { findInSchool, newInSchool } from '../common/tenancy/school-scope.js';
import { School } from '../organizations/entities/school.entity.js';
import { isSystemScopedRole } from './access.constants.js';
import { RoleAssignment } from './entities/role-assignment.entity.js';
import { RolePermission } from './entities/role-permission.entity.js';
import { Permission } from './entities/permission.entity.js';
import { Role } from './entities/role.entity.js';
import { ROLE_SUBJECT, RoleAssignments } from './role-assignments.service.js';
import { RoleAuthority, RoleMessages } from './role-authority.service.js';

export interface RoleInput {
  permissions: string[];
  description?: string | null;
}

export const ROLE_NOT_FOUND = 'Role not found.';

const nameTaken = (name: string) =>
  `This campus already has a role called ${name}.`;

// Writes the roles of the working campus (reference
// app/Actions/Authorization/WriteCampusRole.php). A role only ever holds
// what its author holds at the campus. Changing a shared role (librarian,
// accountant) makes the campus its own copy and moves the campus's holders
// onto it; other campuses are untouched.
@Injectable()
export class CampusRoles {
  constructor(
    private readonly transactions: TransactionService,
    private readonly authority: RoleAuthority,
    private readonly assignments: RoleAssignments,
    private readonly audit: AuditService,
  ) {}

  async create(
    actorId: string,
    schoolId: string,
    input: RoleInput & { name: string },
  ): Promise<Role> {
    const name = input.name.trim();
    const permissions = await this.knownPermissions(input.permissions);
    try {
      return await this.transactions.run(async (tx) => {
        await this.authority.mustBeGrantable(
          tx.manager,
          permissions,
          actorId,
          schoolId,
        );
        return this.createIn(tx.manager, schoolId, {
          name,
          permissions,
          description: input.description ?? null,
        });
      });
    } catch (error) {
      if (postgresCode(error) === '23505') {
        throw new RuleViolation(nameTaken(name), { name: [nameTaken(name)] });
      }
      throw error;
    }
  }

  // Changes what a role holds. Returns the role that changed: the campus's
  // own copy when the role was shared.
  async update(
    actorId: string,
    schoolId: string,
    roleId: string,
    input: RoleInput,
  ): Promise<Role> {
    const permissions = await this.knownPermissions(input.permissions);
    return this.transactions.run(async (tx) => {
      const role = await this.roleAt(tx.manager, schoolId, roleId);
      this.authority.mustNotBeBuiltIn(role);
      this.authority.mustBeUsableAt(role, schoolId);
      await this.authority.mustBeGrantable(
        tx.manager,
        permissions,
        actorId,
        schoolId,
      );
      await this.mustHoldWhatIsTakenOut(
        tx.manager,
        role,
        permissions,
        actorId,
        schoolId,
      );

      // Taking "manage role" out of a role could leave the campus with
      // nobody who manages roles.
      return this.authority.mustKeepARoleManager(
        tx.manager,
        schoolId,
        async () => {
          const own = await this.ownCopy(tx.manager, role, schoolId);
          const before = await this.assignments.permissionsOf(
            tx.manager,
            own.id,
          );
          own.description = input.description ?? null;
          await tx.manager.save(own);
          await this.syncPermissions(tx.manager, own, permissions, schoolId);
          await this.audit.record(tx.manager, {
            action: AuditAction.RoleUpdated,
            subject: { type: ROLE_SUBJECT, id: own.id },
            context: {
              name: own.name,
              permissions,
              previous_permissions: before,
            },
            schoolId,
          });
          return own;
        },
      );
    });
  }

  // Copies a role under a new name. The copy holds only what the person
  // copying it holds, so copying is never a way around the rule.
  async duplicate(
    actorId: string,
    schoolId: string,
    roleId: string,
    input: { name: string },
  ): Promise<Role> {
    const name = input.name.trim();
    try {
      return await this.transactions.run(async (tx) => {
        const role = await this.roleAt(tx.manager, schoolId, roleId);
        this.authority.mustBeUsableAt(role, schoolId);
        const grantable = await this.authority.grantableBy(
          tx.manager,
          actorId,
          schoolId,
        );
        const permissions = (
          await this.assignments.permissionsOf(tx.manager, role.id)
        ).filter((permission) => grantable.has(permission));
        return this.createIn(tx.manager, schoolId, {
          name,
          permissions,
          description: role.description,
        });
      });
    } catch (error) {
      if (postgresCode(error) === '23505') {
        throw new RuleViolation(nameTaken(name), { name: [nameTaken(name)] });
      }
      throw error;
    }
  }

  // Stops offering a role. The people who hold it keep it.
  async archive(schoolId: string, roleId: string): Promise<Role> {
    return this.transactions.run(async (tx) => {
      const role = await this.roleAt(tx.manager, schoolId, roleId);
      this.authority.mustNotBeBuiltIn(role);
      this.authority.mustBeUsableAt(role, schoolId);
      const own = await this.ownCopy(tx.manager, role, schoolId);
      if (own.archivedAt) return own;

      own.archivedAt = new Date();
      await tx.manager.save(own);
      const holders = await tx.manager.count(RoleAssignment, {
        where: { roleId: own.id, schoolId },
      });
      await this.audit.record(tx.manager, {
        action: AuditAction.RoleArchived,
        subject: { type: ROLE_SUBJECT, id: own.id },
        context: { name: own.name, holders },
        schoolId,
      });
      return own;
    });
  }

  // Offers an archived role again.
  async restore(schoolId: string, roleId: string): Promise<Role> {
    return this.transactions.run(async (tx) => {
      const role = await this.roleAt(tx.manager, schoolId, roleId);
      this.authority.mustNotBeBuiltIn(role);
      this.authority.mustBeUsableAt(role, schoolId);
      const own = await this.ownCopy(tx.manager, role, schoolId);
      if (!own.archivedAt) return own;

      own.archivedAt = null;
      await tx.manager.save(own);
      await this.audit.record(tx.manager, {
        action: AuditAction.RoleUpdated,
        subject: { type: ROLE_SUBJECT, id: own.id },
        context: { name: own.name, restored: true },
        schoolId,
      });
      return own;
    });
  }

  // A role the campus can see: its own, or a shared one other than the two
  // the platform gives. Another campus's role answers 404.
  async roleAt(
    manager: EntityManager,
    schoolId: string,
    roleId: string,
    lock = true,
  ): Promise<Role> {
    const role = await findInSchool(
      manager,
      Role,
      { id: roleId },
      { schoolId, includeShared: true, lock, notFound: ROLE_NOT_FOUND },
    );
    if (!isListedAtCampus(role)) throw new NotFoundException(ROLE_NOT_FOUND);
    return role;
  }

  private async createIn(
    manager: EntityManager,
    schoolId: string,
    input: { name: string; permissions: string[]; description: string | null },
  ): Promise<Role> {
    // Holding the campus keeps two people from taking one name at once.
    await manager.findOne(School, {
      where: { id: schoolId },
      lock: { mode: 'pessimistic_write' },
    });
    await this.mustBeAFreeName(manager, input.name, schoolId);

    const role = await manager.save(
      newInSchool(
        manager,
        Role,
        { name: input.name, description: input.description },
        { schoolId },
      ),
    );
    await this.syncPermissions(manager, role, input.permissions, schoolId);
    await this.audit.record(manager, {
      action: AuditAction.RoleCreated,
      subject: { type: ROLE_SUBJECT, id: role.id },
      context: { name: role.name, permissions: input.permissions },
      schoolId,
    });
    return role;
  }

  // A name the campus already uses, in any capitals, is refused. Shared
  // roles count too, so a campus never has two roles people cannot tell
  // apart.
  private async mustBeAFreeName(
    manager: EntityManager,
    name: string,
    schoolId: string,
  ): Promise<void> {
    const taken = await manager
      .createQueryBuilder(Role, 'role')
      .where('(role.schoolId = :schoolId OR role.schoolId IS NULL)', {
        schoolId,
      })
      .andWhere('lower(role.name) = lower(:name)', { name })
      .getExists();
    if (taken) {
      throw new RuleViolation(nameTaken(name), { name: [nameTaken(name)] });
    }
  }

  // Taking a permission out of a role takes it from everybody holding the
  // role, so it needs the same power as putting it in.
  private async mustHoldWhatIsTakenOut(
    manager: EntityManager,
    role: Role,
    permissions: string[],
    actorId: string,
    schoolId: string,
  ): Promise<void> {
    const current = await this.assignments.permissionsOf(manager, role.id);
    const grantable = await this.authority.grantableBy(
      manager,
      actorId,
      schoolId,
    );
    const refused = current.filter(
      (name) => !permissions.includes(name) && !grantable.has(name),
    );
    if (refused.length) {
      throw new RuleViolation(RoleMessages.notYoursToTakeOut(refused));
    }
  }

  // The campus's own copy of a shared role, made on first change, with the
  // campus's holders moved onto it.
  private async ownCopy(
    manager: EntityManager,
    role: Role,
    schoolId: string,
  ): Promise<Role> {
    if (role.schoolId !== null) return role;

    let copy = await this.authority.tailoredCopyOf(manager, role, schoolId);
    if (!copy) {
      copy = await manager.save(
        newInSchool(
          manager,
          Role,
          { name: role.name, description: role.description },
          { schoolId },
        ),
      );
      await this.syncPermissions(
        manager,
        copy,
        await this.assignments.permissionsOf(manager, role.id),
        schoolId,
      );
      await this.audit.record(manager, {
        action: AuditAction.RoleCreated,
        subject: { type: ROLE_SUBJECT, id: copy.id },
        context: { name: copy.name, tailored_from: role.id },
        schoolId,
      });
    }

    // Holders of the shared role at this campus now hold the copy.
    await manager.query(
      `DELETE FROM model_has_roles a
        WHERE a.role_id = $1 AND a.school_id = $3
          AND EXISTS (SELECT 1 FROM model_has_roles c
                       WHERE c.role_id = $2 AND c.school_id = $3 AND c.user_id = a.user_id)`,
      [role.id, copy.id, schoolId],
    );
    await manager.query(
      `UPDATE model_has_roles SET role_id = $2 WHERE role_id = $1 AND school_id = $3`,
      [role.id, copy.id, schoolId],
    );
    return copy;
  }

  // Sets what a role holds and records what moved (permission.attached,
  // permission.detached), as the reference's RecordPermissionChanges does.
  private async syncPermissions(
    manager: EntityManager,
    role: Role,
    permissions: string[],
    schoolId: string,
  ): Promise<void> {
    const current = await this.assignments.permissionsOf(manager, role.id);
    const added = permissions.filter((name) => !current.includes(name));
    const removed = current.filter((name) => !permissions.includes(name));

    if (removed.length) {
      const ids = await this.permissionIds(manager, removed);
      await manager.delete(RolePermission, {
        roleId: role.id,
        permissionId: In(ids),
      });
      await this.audit.record(manager, {
        action: AuditAction.PermissionDetached,
        subject: { type: ROLE_SUBJECT, id: role.id },
        context: { permissions: removed },
        schoolId,
      });
    }
    if (added.length) {
      const ids = await this.permissionIds(manager, added);
      await manager.insert(
        RolePermission,
        ids.map((permissionId) => ({ roleId: role.id, permissionId })),
      );
      await this.audit.record(manager, {
        action: AuditAction.PermissionAttached,
        subject: { type: ROLE_SUBJECT, id: role.id },
        context: { permissions: added },
        schoolId,
      });
    }
  }

  private async permissionIds(
    manager: EntityManager,
    names: string[],
  ): Promise<string[]> {
    const rows = await manager.find(Permission, {
      where: { name: In(names) },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  // Every name must be a real permission; repeats are dropped.
  private async knownPermissions(names: string[]): Promise<string[]> {
    const unique = [...new Set(names)];
    if (!unique.length) return [];
    const known = await this.transactions.run(async (tx) =>
      tx.manager.find(Permission, {
        where: { name: In(unique) },
        select: { name: true },
      }),
    );
    const knownNames = new Set(known.map((permission) => permission.name));
    const unknown = unique.filter((name) => !knownNames.has(name));
    if (unknown.length) {
      throw new ValidationFailed({
        permissions: unknown.map((name) => `"${name}" is not a permission.`),
      });
    }
    return unique;
  }
}

// Roles the working campus lists: its own and the shared ones, never the
// two the platform gives.
export function isListedAtCampus(role: Role): boolean {
  return !(role.schoolId === null && isSystemScopedRole(role.name));
}
