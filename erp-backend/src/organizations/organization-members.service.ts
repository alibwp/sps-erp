import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  BuiltInRole,
  ORGANIZATION_PERMISSIONS,
  OrganizationPermission,
  type OrganizationPermissionName,
} from '../access/access.constants.js';
import { RoleAssignments } from '../access/role-assignments.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { TransactionService } from '../common/database/transaction.service.js';
import {
  RuleViolation,
  ValidationFailed,
} from '../common/errors/api-exception.js';
import { User } from '../identity/entities/user.entity.js';
import { normalizeEmail } from '../identity/identity.constants.js';
import { OrganizationMembership } from './entities/organization-membership.entity.js';
import { SchoolMembership } from './entities/school-membership.entity.js';
import {
  OrganizationAccess,
  grantedPermissions,
  membershipGrants,
} from './organization-access.service.js';
import type { OrganizationMemberDto } from './organizations.dto.js';

export const ORGANIZATION_MEMBERSHIP_SUBJECT = 'organization_membership';
export const MEMBER_NOT_FOUND =
  'This person does not administer the organization.';

export const MemberMessages = {
  unknownEmail: 'Nobody at this organization uses that email address.',
  alreadyMember: (name: string) =>
    `${name} already administers this organization.`,
  lastManagerRevoke: (organization: string) =>
    `${organization} would be left with nobody who can manage its members. Grant a replacement first.`,
  lastManagerNarrow: (organization: string) =>
    `${organization} would be left with nobody who can manage its members. Give somebody else that permission first.`,
  holdsMore:
    'This person holds more of the organization than you do, so only somebody holding as much can remove them.',
  notYours: 'You can only give or take away permissions you hold yourself.',
} as const;

// Organization scope for people (reference GrantOrganizationMembership,
// SetOrganizationMemberPermissions, RevokeOrganizationMembership). All of it
// needs "manage organization members" in that organization. A delegator
// can only hand out or take away permissions they hold, and the last member
// who can manage members cannot be revoked or narrowed. Campus access is
// never touched.
@Injectable()
export class OrganizationMembers {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly access: OrganizationAccess,
    private readonly roles: RoleAssignments,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async list(
    actorId: string,
    organizationId: string,
  ): Promise<OrganizationMemberDto[]> {
    await this.access.authorize(
      this.dataSource.manager,
      actorId,
      organizationId,
      OrganizationPermission.ManageMembers,
    );
    const memberships = await this.dataSource.manager.find(
      OrganizationMembership,
      {
        where: { organizationId, status: 'active' },
        relations: { user: true },
        order: { joinedAt: 'ASC' },
      },
    );
    return memberships.map((membership) => this.toDto(membership));
  }

  // Gives organization scope to a person the organization already knows
  // (a member or somebody with a membership at one of its campuses). A new
  // membership holds everything the granting person holds; a reactivated
  // one keeps its delegation, narrowed to what they hold.
  async grant(
    actorId: string,
    organizationId: string,
    email: string,
  ): Promise<OrganizationMemberDto> {
    return this.transactions.run(async (tx) => {
      const organization = await this.access.authorize(
        tx.manager,
        actorId,
        organizationId,
        OrganizationPermission.ManageMembers,
        { lock: true },
      );
      const user = await tx.manager.findOne(User, {
        where: { email: normalizeEmail(email) },
      });
      // A stranger's account is neither named nor granted, so the form
      // cannot tell anyone which emails exist elsewhere on the platform.
      if (
        !user ||
        !(await this.isKnownToOrganization(tx.manager, user.id, organizationId))
      ) {
        throw new ValidationFailed({ email: [MemberMessages.unknownEmail] });
      }

      let membership = await tx.manager.findOne(OrganizationMembership, {
        where: { organizationId, userId: user.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (membership?.status === 'active') {
        throw new ValidationFailed({
          email: [MemberMessages.alreadyMember(user.name)],
        });
      }
      membership ??= tx.manager.create(OrganizationMembership, {
        organizationId,
        userId: user.id,
        permissions: null,
      });
      membership.permissions = await this.limitToWhatTheActorHolds(
        tx.manager,
        membership,
        organizationId,
        actorId,
      );
      membership.status = 'active';
      membership.joinedAt ??= this.clock.now();
      membership.endedAt = null;
      membership = await tx.manager.save(membership);

      await this.roles.grantGlobal(
        tx.manager,
        user.id,
        BuiltInRole.OrganizationAdmin,
      );
      await this.audit.record(tx.manager, {
        action: AuditAction.OrganizationMembershipGranted,
        subject: { type: ORGANIZATION_MEMBERSHIP_SUBJECT, id: membership.id },
        context: { organization_id: organization.id, user_id: user.id },
        schoolId: null,
      });
      membership.user = user;
      return this.toDto(membership);
    });
  }

  // Makes the person an active member with every organization permission,
  // inside the caller's transaction. Only commands run on the server call
  // this (seed-demo-users); it is safe to repeat.
  async grantAllIn(
    manager: EntityManager,
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembership> {
    let membership = await manager.findOne(OrganizationMembership, {
      where: { organizationId, userId },
      lock: { mode: 'pessimistic_write' },
    });
    const wasActive = membership?.status === 'active';
    membership ??= manager.create(OrganizationMembership, {
      organizationId,
      userId,
    });
    membership.permissions = null;
    membership.status = 'active';
    membership.joinedAt ??= this.clock.now();
    membership.endedAt = null;
    membership = await manager.save(membership);

    await this.roles.grantGlobal(
      manager,
      userId,
      BuiltInRole.OrganizationAdmin,
      null,
    );
    if (!wasActive) {
      await this.audit.record(manager, {
        action: AuditAction.OrganizationMembershipGranted,
        subject: { type: ORGANIZATION_MEMBERSHIP_SUBJECT, id: membership.id },
        context: { organization_id: organizationId, user_id: userId },
        schoolId: null,
        actorId: null,
      });
    }
    return membership;
  }

  // Sets what a member may do; null gives every organization permission.
  // "read organization" is always kept.
  async setPermissions(
    actorId: string,
    organizationId: string,
    userId: string,
    permissions: string[] | null,
  ): Promise<OrganizationMemberDto> {
    return this.transactions.run(async (tx) => {
      // Two managers taking each other's access at the same moment would
      // each count the other. The lock makes the second wait.
      const organization = await this.access.authorize(
        tx.manager,
        actorId,
        organizationId,
        OrganizationPermission.ManageMembers,
        { lock: true },
      );
      const membership = await this.activeMembership(
        tx.manager,
        organizationId,
        userId,
      );
      const previous = membership.permissions;
      const next =
        permissions === null
          ? null
          : [...new Set([OrganizationPermission.Read, ...permissions])];

      const before = grantedPermissions(membership);
      const after = next ?? [...ORGANIZATION_PERMISSIONS];
      const held = await this.access.permissionsFor(
        tx.manager,
        actorId,
        organizationId,
      );
      const changed = [
        ...before.filter((permission) => !after.includes(permission)),
        ...after.filter(
          (permission) =>
            !before.includes(permission as OrganizationPermissionName),
        ),
      ];
      if (
        changed.some(
          (permission) =>
            !held.includes(permission as OrganizationPermissionName),
        )
      ) {
        throw new RuleViolation(MemberMessages.notYours);
      }

      const keepsMemberManagement =
        next === null || next.includes(OrganizationPermission.ManageMembers);
      if (
        !keepsMemberManagement &&
        membershipGrants(membership, OrganizationPermission.ManageMembers) &&
        !(await this.hasAnotherMemberManager(
          tx.manager,
          organizationId,
          userId,
        ))
      ) {
        throw new RuleViolation(
          MemberMessages.lastManagerNarrow(organization.name),
        );
      }

      membership.permissions = next;
      const saved = await tx.manager.save(membership);
      await this.audit.record(tx.manager, {
        action: AuditAction.OrganizationMembershipPermissionsChanged,
        subject: { type: ORGANIZATION_MEMBERSHIP_SUBJECT, id: saved.id },
        context: {
          organization_id: organizationId,
          user_id: userId,
          previous_permissions: previous,
          permissions: next,
        },
        schoolId: null,
      });
      return this.toDto(saved);
    });
  }

  // Ends a member's organization scope. Campus memberships stay, the row
  // stays for history, and the global role stays while another active
  // organization membership still needs it.
  async revoke(
    actorId: string,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    await this.transactions.run(async (tx) => {
      const organization = await this.access.authorize(
        tx.manager,
        actorId,
        organizationId,
        OrganizationPermission.ManageMembers,
        { lock: true },
      );
      const membership = await this.activeMembership(
        tx.manager,
        organizationId,
        userId,
      );
      await this.failIfTheMemberHoldsMore(
        tx.manager,
        membership,
        organizationId,
        actorId,
      );
      if (
        membershipGrants(membership, OrganizationPermission.ManageMembers) &&
        !(await this.hasAnotherMemberManager(
          tx.manager,
          organizationId,
          userId,
        ))
      ) {
        throw new RuleViolation(
          MemberMessages.lastManagerRevoke(organization.name),
        );
      }

      membership.status = 'ended';
      membership.endedAt = this.clock.now();
      await tx.manager.save(membership);

      const administersAnother = await tx.manager.exists(
        OrganizationMembership,
        {
          where: { userId, status: 'active' },
        },
      );
      if (!administersAnother) {
        await this.roles.revokeGlobal(
          tx.manager,
          userId,
          BuiltInRole.OrganizationAdmin,
        );
      }
      await this.audit.record(tx.manager, {
        action: AuditAction.OrganizationMembershipRevoked,
        subject: { type: ORGANIZATION_MEMBERSHIP_SUBJECT, id: membership.id },
        context: {
          organization_id: organizationId,
          user_id: userId,
          kept_organization_admin_role: administersAnother,
        },
        schoolId: null,
      });
    });
  }

  // Whether another active member, whose account is not suspended or
  // archived, can manage members (reference Organization::hasAnotherMemberManager).
  async hasAnotherMemberManager(
    manager: EntityManager,
    organizationId: string,
    exceptUserId: string,
  ): Promise<boolean> {
    const others = await manager
      .createQueryBuilder(OrganizationMembership, 'membership')
      .innerJoin('membership.user', 'user')
      .where('membership.organizationId = :organizationId', { organizationId })
      .andWhere("membership.status = 'active'")
      .andWhere('membership.userId <> :exceptUserId', { exceptUserId })
      .andWhere("user.accountStatus NOT IN ('suspended', 'archived')")
      .getMany();
    return others.some((membership) =>
      membershipGrants(membership, OrganizationPermission.ManageMembers),
    );
  }

  // Refuses to block the last person who can manage an organization's
  // members (reference ChangeAccountStatus).
  async mustNotBeTheLastMemberManager(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    const memberships = await manager.find(OrganizationMembership, {
      where: { userId, status: 'active' },
      relations: { organization: true },
    });
    for (const membership of memberships) {
      if (
        membershipGrants(membership, OrganizationPermission.ManageMembers) &&
        !(await this.hasAnotherMemberManager(
          manager,
          membership.organizationId,
          userId,
        ))
      ) {
        throw new RuleViolation(
          MemberMessages.lastManagerRevoke(membership.organization.name),
        );
      }
    }
  }

  // A member of the organization, or somebody with a membership (of any
  // state) at one of its campuses (reference User::isKnownToOrganization).
  async isKnownToOrganization(
    manager: EntityManager,
    userId: string,
    organizationId: string,
  ): Promise<boolean> {
    if (
      await manager.exists(OrganizationMembership, {
        where: { userId, organizationId },
      })
    ) {
      return true;
    }
    return manager
      .createQueryBuilder(SchoolMembership, 'membership')
      .innerJoin('membership.school', 'school')
      .where('membership.userId = :userId', { userId })
      .andWhere('school.organizationId = :organizationId', { organizationId })
      .getExists();
  }

  private async activeMembership(
    manager: EntityManager,
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembership> {
    const membership = await manager.findOne(OrganizationMembership, {
      where: { organizationId, userId, status: 'active' },
      lock: { mode: 'pessimistic_write' },
    });
    if (!membership) throw new NotFoundException(MEMBER_NOT_FOUND);
    membership.user = await manager.findOneOrFail(User, {
      where: { id: userId },
    });
    return membership;
  }

  // Anybody may give up their own scope; removing somebody else needs as
  // much as they hold.
  private async failIfTheMemberHoldsMore(
    manager: EntityManager,
    membership: OrganizationMembership,
    organizationId: string,
    actorId: string,
  ): Promise<void> {
    if (actorId === membership.userId) return;
    const held = await this.access.permissionsFor(
      manager,
      actorId,
      organizationId,
    );
    if (
      grantedPermissions(membership).some(
        (permission) => !held.includes(permission),
      )
    ) {
      throw new RuleViolation(MemberMessages.holdsMore);
    }
  }

  // Keeps only the permissions the actor holds in this organization. An
  // actor holding all of them passes the membership through unchanged.
  private async limitToWhatTheActorHolds(
    manager: EntityManager,
    membership: OrganizationMembership,
    organizationId: string,
    actorId: string,
  ): Promise<string[] | null> {
    const held = await this.access.permissionsFor(
      manager,
      actorId,
      organizationId,
    );
    if (held.length === ORGANIZATION_PERMISSIONS.length)
      return membership.permissions;
    const kept = grantedPermissions(membership).filter((permission) =>
      held.includes(permission),
    );
    return [...new Set<string>([OrganizationPermission.Read, ...kept])];
  }

  private toDto(membership: OrganizationMembership): OrganizationMemberDto {
    return {
      userId: membership.userId,
      name: membership.user.name,
      email: membership.user.email,
      fullAuthority: membership.permissions === null,
      permissions: grantedPermissions(membership),
      joinedAt: membership.joinedAt,
    };
  }
}
