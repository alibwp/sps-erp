import { Injectable } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import type { User } from '../identity/entities/user.entity.js';
import { SchoolMembership } from '../organizations/entities/school-membership.entity.js';
import { FAMILY_ROLES, isSystemScopedRole } from './access.constants.js';
import { RoleAssignment } from './entities/role-assignment.entity.js';
import { RolePermission } from './entities/role-permission.entity.js';
import { Role } from './entities/role.entity.js';
import { RoleAuthority } from './role-authority.service.js';

export const AssignmentMessages = {
  notAMember: 'That person does not work at this campus.',
  archived: (name: string) => `${name} is no longer offered at this campus.`,
  tailored: (name: string) =>
    `This campus keeps its own ${name}. Give that one instead.`,
  holdsMore: (name: string) =>
    `${name} holds more than you do, so you cannot take it away.`,
  familyRole: (name: string) =>
    `${name} is given through enrollment and guardian links, not here.`,
} as const;

// A later stage that knows why a person may not hold a campus role
// (Stage 5: an enrolled learner).
export type GiveCheck = (
  manager: EntityManager,
  person: User,
  schoolId: string,
) => Promise<string | null>;

export const ROLE_SUBJECT = 'role';
export const USER_SUBJECT = 'user';

// Gives and takes roles, and records each change in the audit log
// (role.attached, role.detached), as the reference does for every role
// change (AssignCampusRole, GrantSystemRole, RecordPermissionChanges).
@Injectable()
export class RoleAssignments {
  private readonly giveChecks: GiveCheck[] = [];

  constructor(
    private readonly authority: RoleAuthority,
    private readonly audit: AuditService,
  ) {}

  registerGiveCheck(check: GiveCheck): void {
    this.giveChecks.push(check);
  }

  // Gives a campus role to somebody who works at the campus. Returns false
  // when they already held it (nothing is recorded then). Reference:
  // AssignCampusRole::give.
  async give(
    manager: EntityManager,
    input: { person: User; role: Role; schoolId: string; actorId: string },
  ): Promise<boolean> {
    const { person, role, schoolId, actorId } = input;
    this.mustBeAStaffRole(role, schoolId);

    // Giving a role hands out everything in it, so nobody gives away what
    // they do not hold.
    await this.authority.mustBeGrantable(
      manager,
      await this.permissionsOf(manager, role.id),
      actorId,
      schoolId,
    );

    const member = await manager.exists(SchoolMembership, {
      where: { userId: person.id, schoolId, status: 'active' },
    });
    if (!member) throw new RuleViolation(AssignmentMessages.notAMember);
    for (const check of this.giveChecks) {
      const refusal = await check(manager, person, schoolId);
      if (refusal) throw new RuleViolation(refusal);
    }
    if (role.archivedAt) {
      throw new RuleViolation(AssignmentMessages.archived(role.name));
    }
    if (await this.authority.tailoredCopyOf(manager, role, schoolId)) {
      throw new RuleViolation(AssignmentMessages.tailored(role.name));
    }

    const inserted = await this.insert(manager, person.id, role.id, schoolId);
    if (!inserted) return false;
    await this.audit.record(manager, {
      action: AuditAction.RoleAttached,
      subject: { type: USER_SUBJECT, id: person.id },
      context: { role: role.name, role_id: role.id },
      schoolId,
    });
    return true;
  }

  // Takes a campus role away. Returns false when the person did not hold
  // it. Reference: AssignCampusRole::take.
  async take(
    manager: EntityManager,
    input: { person: User; role: Role; schoolId: string; actorId: string },
  ): Promise<boolean> {
    const { person, role, schoolId, actorId } = input;
    this.mustBeAStaffRole(role, schoolId);

    // Taking a role away is as strong as giving it.
    const grantable = await this.authority.grantableBy(
      manager,
      actorId,
      schoolId,
    );
    const inRole = await this.permissionsOf(manager, role.id);
    if (inRole.some((name) => !grantable.has(name))) {
      throw new RuleViolation(AssignmentMessages.holdsMore(role.name));
    }

    const removed = await this.authority.mustKeepARoleManager(
      manager,
      schoolId,
      async () =>
        (
          await manager.delete(RoleAssignment, {
            userId: person.id,
            roleId: role.id,
            schoolId,
          })
        ).affected ?? 0,
    );
    if (!removed) return false;
    await this.audit.record(manager, {
      action: AuditAction.RoleDetached,
      subject: { type: USER_SUBJECT, id: person.id },
      context: { role: role.name, role_id: role.id },
      schoolId,
    });
    return true;
  }

  // Gives the shared student or parent role at a campus. Only admission
  // and parent records call this; the role routes never give these roles.
  async giveFamilyRole(
    manager: EntityManager,
    input: { userId: string; roleName: string; schoolId: string },
  ): Promise<boolean> {
    if (!FAMILY_ROLES.includes(input.roleName)) {
      throw new Error(`${input.roleName} is not a family role.`);
    }
    const role = await this.authority.sharedRole(manager, input.roleName);
    if (!role) throw new Error(`The ${input.roleName} role is missing.`);
    const inserted = await this.insert(
      manager,
      input.userId,
      role.id,
      input.schoolId,
    );
    if (!inserted) return false;
    await this.audit.record(manager, {
      action: AuditAction.RoleAttached,
      subject: { type: USER_SUBJECT, id: input.userId },
      context: { role: role.name, role_id: role.id },
      schoolId: input.schoolId,
    });
    return true;
  }

  // Gives one of the two global roles (no campus). Reference:
  // GrantSystemRole.
  async grantGlobal(
    manager: EntityManager,
    userId: string,
    roleName: string,
    actorId?: string | null,
  ): Promise<boolean> {
    const role = await this.globalRole(manager, roleName);
    const inserted = await this.insert(manager, userId, role.id, null);
    if (inserted) {
      await this.audit.record(manager, {
        action: AuditAction.RoleAttached,
        subject: { type: USER_SUBJECT, id: userId },
        context: { role: role.name, role_id: role.id },
        schoolId: null,
        ...(actorId !== undefined ? { actorId } : {}),
      });
    }
    return inserted;
  }

  // Takes a global role away. Reference: RevokeSystemRole.
  async revokeGlobal(
    manager: EntityManager,
    userId: string,
    roleName: string,
  ): Promise<boolean> {
    const role = await this.globalRole(manager, roleName);
    const result = await manager.delete(RoleAssignment, {
      userId,
      roleId: role.id,
      schoolId: IsNull(),
    });
    if (!result.affected) return false;
    await this.audit.record(manager, {
      action: AuditAction.RoleDetached,
      subject: { type: USER_SUBJECT, id: userId },
      context: { role: role.name, role_id: role.id },
      schoolId: null,
    });
    return true;
  }

  // Whether the person holds this global role.
  async holdsGlobal(
    manager: EntityManager,
    userId: string,
    roleName: string,
  ): Promise<boolean> {
    return manager
      .createQueryBuilder(RoleAssignment, 'a')
      .innerJoin('a.role', 'role')
      .where('a.userId = :userId', { userId })
      .andWhere('a.schoolId IS NULL')
      .andWhere('role.name = :roleName', { roleName })
      .getExists();
  }

  async permissionsOf(
    manager: EntityManager,
    roleId: string,
  ): Promise<string[]> {
    const rows = await manager
      .createQueryBuilder(RolePermission, 'rp')
      .innerJoin('rp.permission', 'permission')
      .select('permission.name', 'name')
      .where('rp.roleId = :roleId', { roleId })
      .orderBy('permission.name')
      .getRawMany<{ name: string }>();
    return rows.map((row) => row.name);
  }

  // The role endpoints give and take staff roles only. The platform roles
  // are never a campus's to give, and the family roles (student, parent)
  // come with enrollment and guardian links (Stage 5).
  private mustBeAStaffRole(role: Role, schoolId: string): void {
    this.authority.mustBeUsableAt(role, schoolId);
    if (role.schoolId === null && FAMILY_ROLES.includes(role.name)) {
      throw new RuleViolation(AssignmentMessages.familyRole(role.name));
    }
  }

  private async globalRole(
    manager: EntityManager,
    roleName: string,
  ): Promise<Role> {
    if (!isSystemScopedRole(roleName)) {
      throw new Error(`${roleName} is not a global role.`);
    }
    const role = await this.authority.sharedRole(manager, roleName);
    if (!role) throw new Error(`The ${roleName} role is missing.`);
    return role;
  }

  // Inserts the assignment unless it exists; true when a row was added.
  private async insert(
    manager: EntityManager,
    userId: string,
    roleId: string,
    schoolId: string | null,
  ): Promise<boolean> {
    const rows = (await manager.query(
      `INSERT INTO model_has_roles (user_id, role_id, school_id)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [userId, roleId, schoolId],
    )) as unknown[];
    return rows.length > 0;
  }
}
