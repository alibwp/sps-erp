import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  Forbidden,
  OrganizationPermission,
  PlatformPermission,
} from '../access/access.constants.js';
import { CampusRoles } from '../access/campus-roles.service.js';
import { PermissionResolver } from '../access/permission-resolver.service.js';
import { RoleAssignments } from '../access/role-assignments.service.js';
import { RoleAuthority } from '../access/role-authority.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { TransactionService } from '../common/database/transaction.service.js';
import {
  RuleViolation,
  ValidationFailed,
} from '../common/errors/api-exception.js';
import { EmailDomainChecker } from '../common/validation/email-domain.js';
import type { AccountStatus } from '../identity/account-status.js';
import { SessionService } from '../identity/auth/session.service.js';
import { AccountInvitation } from '../identity/entities/account-invitation.entity.js';
import { User } from '../identity/entities/user.entity.js';
import { Messages, normalizeEmail } from '../identity/identity.constants.js';
import {
  AUDIT_SUBJECT,
  InvitationService,
} from '../identity/invitations/invitation.service.js';
import { School } from '../organizations/entities/school.entity.js';
import { SchoolMembership } from '../organizations/entities/school-membership.entity.js';
import { OrganizationAccess } from '../organizations/organization-access.service.js';
import { OrganizationMembers } from '../organizations/organization-members.service.js';
import { SchoolMemberships } from '../organizations/school-memberships.service.js';
import {
  type AccountAction,
  AccountAuthority,
  AccountMessages,
} from './account-authority.service.js';
import { invitationStatus } from './account-queries.service.js';
import type { ProvisionAccountDto, StatusAction } from './accounts.dto.js';

export const OUTSIDE_ORGANIZATION =
  'This email belongs to a person outside your organization, so it cannot be used here.';
export const INVITATION_NOT_FOUND = 'Invitation not found.';
export const NOT_PENDING =
  'Only a pending invitation can be sent again or revoked.';
export const PLATFORM_ADMIN_STATUS =
  'A platform administrator account cannot be suspended or archived.';

const PROFILE_FIELDS = [
  'name',
  'birthday',
  'gender',
  'phone',
  'address',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'country',
  'nationality',
] as const;

// Account administration at the working campus ("manage account access",
// reference ProvisionAccount, ChangeAccountStatus, SendAccountInvitation,
// RevokeAccountInvitation, EndSchoolMembership; roles: AssignCampusRole).
@Injectable()
export class Accounts {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly authority: AccountAuthority,
    private readonly resolver: PermissionResolver,
    private readonly roleAuthority: RoleAuthority,
    private readonly roleAssignments: RoleAssignments,
    private readonly campusRoles: CampusRoles,
    private readonly memberships: SchoolMemberships,
    private readonly organizationMembers: OrganizationMembers,
    private readonly organizationAccess: OrganizationAccess,
    private readonly invitations: InvitationService,
    private readonly sessions: SessionService,
    private readonly emailDomains: EmailDomainChecker,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  // Creates an invited account, or reuses the account of a person the
  // organization already knows, and grants a membership at the campus. An
  // existing person keeps the profile they or another campus wrote: only
  // blank fields are filled. Retrying is safe.
  async provision(
    schoolId: string,
    input: ProvisionAccountDto,
  ): Promise<{ user: User; created: boolean }> {
    await this.checkProvisioning(input);
    return this.transactions.run((tx) =>
      this.provisionIn(tx.manager, schoolId, input),
    );
  }

  // The checks made before the transaction: a birthday in the past, and a
  // new address whose domain can receive mail (a DNS lookup).
  async checkProvisioning(input: ProvisionAccountDto): Promise<void> {
    if (input.birthday && input.birthday >= this.clock.schoolToday('UTC')) {
      throw new ValidationFailed({
        birthday: ['The birthday field must be a date before today.'],
      });
    }
    const email = normalizeEmail(input.email);
    const known = await this.dataSource.manager.findOne(User, {
      where: { email },
      withDeleted: true,
    });
    if (!known && !(await this.emailDomains.canReceiveMail(email))) {
      throw new ValidationFailed({ email: [Messages.emailInvalid] });
    }
  }

  // The provisioning itself, inside the caller's transaction (admission
  // provisions a learner together with their enrollment).
  async provisionIn(
    manager: EntityManager,
    schoolId: string,
    input: ProvisionAccountDto,
  ): Promise<{ user: User; created: boolean }> {
    const email = normalizeEmail(input.email);
    const school = await manager.findOneOrFail(School, {
      where: { id: schoolId },
    });
    let user = await manager.findOne(User, {
      where: { email },
      withDeleted: true,
      lock: { mode: 'pessimistic_write' },
    });
    const existing = user !== null;
    if (user?.deletedAt) {
      throw new ValidationFailed({ email: [Messages.emailTaken] });
    }
    // Another organization's person is not this one's to attach: their
    // profile holds what that organization recorded.
    if (
      user &&
      !(await this.organizationMembers.isKnownToOrganization(
        manager,
        user.id,
        school.organizationId,
      ))
    ) {
      throw new ValidationFailed({ email: [OUTSIDE_ORGANIZATION] });
    }

    const filled: string[] = [];
    user ??= manager.create(User, {
      email,
      accountStatus: 'invited',
      passwordHash: null,
    });
    for (const field of PROFILE_FIELDS) {
      const value = input[field];
      if (value === undefined || value === null) continue;
      const current = (user as unknown as Record<string, unknown>)[field];
      if (
        !existing ||
        current === null ||
        current === undefined ||
        current === ''
      ) {
        (user as unknown as Record<string, unknown>)[field] = value;
        filled.push(field);
      }
    }
    user = await manager.save(user);

    const wasMember = await manager.exists(SchoolMembership, {
      where: { userId: user.id, schoolId, status: 'active' },
    });
    await this.memberships.grant(manager, user.id, schoolId);

    if (!existing || filled.length || !wasMember) {
      await this.audit.record(manager, {
        action: AuditAction.AccountProvisioned,
        subject: { type: AUDIT_SUBJECT.user, id: user.id },
        context: {
          email,
          existing_person: existing,
          filled: existing ? filled : [],
          school_id: schoolId,
        },
        schoolId,
      });
    }
    return { user, created: !existing };
  }

  // Suspends, reinstates or archives an account. Blocking an account ends
  // its sessions and pending invitations at once; nobody leaves an
  // organization without a member manager or a campus without a role
  // manager. The person's profile and records stay.
  async changeStatus(
    actorId: string,
    schoolId: string,
    userId: string,
    action: StatusAction,
    reason: string | null,
  ): Promise<User> {
    return this.transactions.run(async (tx) => {
      // Held with the invitation it may revoke, so an invitation being
      // accepted at the same moment cannot open the account again.
      const user = await this.authority.member(tx.manager, userId, schoolId, {
        lock: true,
      });
      await this.authority.mustManage(tx.manager, actorId, user, schoolId);

      const to: AccountStatus =
        action === 'suspend'
          ? 'suspended'
          : action === 'archive'
            ? 'archived'
            : user.passwordHash === null
              ? 'invited'
              : 'active';
      const blocking = to === 'suspended' || to === 'archived';
      if (blocking) {
        const global = await this.resolver.globalPermissions(
          user.id,
          tx.manager,
        );
        if (global.has(PlatformPermission.ManagePlatform)) {
          throw new RuleViolation(PLATFORM_ADMIN_STATUS);
        }
      }

      const from = user.accountStatus;
      if (from === to) return user;

      let change = async () => {
        user.accountStatus = to;
        await tx.manager.save(user);
      };
      if (to !== 'active') {
        await this.organizationMembers.mustNotBeTheLastMemberManager(
          tx.manager,
          user.id,
        );
        // A blocked account cannot manage roles, so no campus may be left
        // with only blocked role managers.
        const campuses = await tx.manager.find(SchoolMembership, {
          where: { userId: user.id, status: 'active' },
        });
        for (const { schoolId: campusId } of campuses) {
          const inner = change;
          change = () =>
            this.roleAuthority.mustKeepARoleManager(
              tx.manager,
              campusId,
              inner,
            );
        }
      }
      await change();

      if (to !== 'active') {
        await this.invitations.revokeIn(tx.manager, user);
      }
      if (blocking) {
        await this.sessions.revokeAllForUser(tx.manager, user.id);
      }
      await this.audit.record(tx.manager, {
        action: AuditAction.AccountStatusChanged,
        subject: { type: AUDIT_SUBJECT.user, id: user.id },
        context: { from, to, reason },
        schoolId,
      });
      return user;
    });
  }

  // Emails a new one-time link (earlier links stop working).
  async sendInvitation(
    actorId: string,
    schoolId: string,
    userId: string,
  ): Promise<{ expiresAt: Date }> {
    await this.mustManageMember(actorId, schoolId, userId, 'invitation');
    const sent = await this.invitations.send(userId, { invitedById: actorId });
    return { expiresAt: sent.invitation.expiresAt };
  }

  async revokeInvitations(
    actorId: string,
    schoolId: string,
    userId: string,
  ): Promise<number> {
    await this.mustManageMember(actorId, schoolId, userId, 'invitation');
    return this.invitations.revoke(userId, actorId);
  }

  // Organization reach (reference ListAccountInvitations with
  // AccountInvitationPolicy::resend/revoke): a member with "manage
  // organization members" acts on the invitations of people at the
  // organization's campuses, with no campus membership. Only a pending
  // invitation can be resent or revoked; nobody acts on their own.
  async resendFromOrganization(
    actorId: string,
    organizationId: string,
    invitationId: string,
  ): Promise<{ expiresAt: Date }> {
    const invitation = await this.organizationInvitation(
      actorId,
      organizationId,
      invitationId,
    );
    const sent = await this.invitations.send(invitation.userId, {
      invitedById: actorId,
    });
    return { expiresAt: sent.invitation.expiresAt };
  }

  async revokeFromOrganization(
    actorId: string,
    organizationId: string,
    invitationId: string,
  ): Promise<void> {
    const invitation = await this.organizationInvitation(
      actorId,
      organizationId,
      invitationId,
    );
    await this.invitations.revoke(invitation.userId, actorId);
  }

  private async organizationInvitation(
    actorId: string,
    organizationId: string,
    invitationId: string,
  ): Promise<AccountInvitation> {
    const manager = this.dataSource.manager;
    await this.organizationAccess.authorize(
      manager,
      actorId,
      organizationId,
      OrganizationPermission.ManageMembers,
    );
    const invitation = await manager.findOne(AccountInvitation, {
      where: { id: invitationId },
    });
    if (
      !invitation ||
      !(await this.authority.belongsToOrganizations(
        manager,
        invitation.userId,
        [organizationId],
      ))
    ) {
      throw new NotFoundException(INVITATION_NOT_FOUND);
    }
    if (invitation.userId === actorId) {
      throw new Forbidden(AccountMessages.self);
    }
    if (invitationStatus(invitation, this.clock.now()) !== 'pending') {
      throw new Forbidden(NOT_PENDING);
    }
    return invitation;
  }

  // Ends the person's access to this campus. They keep their account,
  // their roles (unused while they are not a member) and their records.
  async endMembership(
    actorId: string,
    schoolId: string,
    userId: string,
  ): Promise<void> {
    await this.transactions.run(async (tx) => {
      const user = await this.authority.member(tx.manager, userId, schoolId);
      await this.authority.mustManage(tx.manager, actorId, user, schoolId);
      await this.memberships.end(tx.manager, user.id, schoolId);
    });
  }

  async giveRole(
    actorId: string,
    schoolId: string,
    userId: string,
    roleId: string,
  ): Promise<void> {
    await this.transactions.run(async (tx) => {
      const person = await this.authority.member(tx.manager, userId, schoolId);
      const role = await this.campusRoles.roleAt(tx.manager, schoolId, roleId);
      await this.roleAssignments.give(tx.manager, {
        person,
        role,
        schoolId,
        actorId,
      });
    });
  }

  async takeRole(
    actorId: string,
    schoolId: string,
    userId: string,
    roleId: string,
  ): Promise<void> {
    await this.transactions.run(async (tx) => {
      const person = await this.authority.member(tx.manager, userId, schoolId);
      const role = await this.campusRoles.roleAt(tx.manager, schoolId, roleId);
      await this.roleAssignments.take(tx.manager, {
        person,
        role,
        schoolId,
        actorId,
      });
    });
  }

  private async mustManageMember(
    actorId: string,
    schoolId: string,
    userId: string,
    action: AccountAction,
  ): Promise<void> {
    const manager: EntityManager = this.dataSource.manager;
    const user = await this.authority.member(manager, userId, schoolId);
    await this.authority.mustManage(manager, actorId, user, schoolId, action);
  }
}
