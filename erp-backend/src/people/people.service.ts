import { Injectable, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Forbidden } from '../access/access.constants.js';
import { RoleAssignments } from '../access/role-assignments.service.js';
import { RoleAuthority } from '../access/role-authority.service.js';
import { AccountQueries } from '../accounts/account-queries.service.js';
import type {
  AccountDetailDto,
  AccountDto,
  AccountListQueryDto,
  ProvisionAccountDto,
} from '../accounts/accounts.dto.js';
import {
  Accounts,
  type PersonDetails,
  PersonMessages,
} from '../accounts/accounts.service.js';
import { Clock } from '../common/clock/clock.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import type { Paginated } from '../common/pagination/pagination.js';
import { GuardianLinks } from '../enrollments/guardian-links.service.js';
import { holdsRoleHere, isEnrolledLearner } from '../enrollments/learners.js';
import { User } from '../identity/entities/user.entity.js';
import { normalizeEmail } from '../identity/identity.constants.js';
import { InvitationService } from '../identity/invitations/invitation.service.js';
import type { School } from '../organizations/entities/school.entity.js';

// The people a campus manages besides its learners (reference
// TeacherService, AdminService, ParentService).
export type PersonRole = 'teacher' | 'admin' | 'parent';

// Role::label, as the messages write it.
const LABELS: Record<PersonRole, string> = {
  teacher: 'teacher',
  admin: 'administrator',
  parent: 'parent',
};

export const PERSON_NOT_FOUND: Record<PersonRole, string> = {
  teacher: 'Teacher not found.',
  admin: 'Administrator not found.',
  parent: 'Parent not found.',
};

export const PeopleMessages = {
  alreadyHolds: (name: string, role: PersonRole) =>
    `${name} already holds the ${LABELS[role]} role at this school.`,
  learner: (name: string) =>
    `${name} is a learner. A learner cannot be made staff.`,
} as const;

// Create provisions the account (or reuses a person the organization
// knows), gives the role at the campus, and for a parent makes their one
// guardian record. Remove ends the membership, then deletes the account
// unless the person keeps it (UserService::deleteUser); a parent's links to
// this campus's learners end first.
@Injectable()
export class People {
  constructor(
    private readonly transactions: TransactionService,
    private readonly accounts: Accounts,
    private readonly queries: AccountQueries,
    private readonly roles: RoleAssignments,
    private readonly roleAuthority: RoleAuthority,
    private readonly guardians: GuardianLinks,
    private readonly invitations: InvitationService,
    private readonly clock: Clock,
  ) {}

  list(
    schoolId: string,
    role: PersonRole,
    query: AccountListQueryDto,
  ): Promise<Paginated<AccountDto>> {
    return this.queries.list(schoolId, query, role);
  }

  async view(
    schoolId: string,
    role: PersonRole,
    userId: string,
  ): Promise<AccountDetailDto> {
    await this.transactions.run((tx) =>
      this.find(tx.manager, schoolId, role, userId),
    );
    return this.queries.detail(schoolId, userId);
  }

  async create(
    actorId: string,
    schoolId: string,
    role: PersonRole,
    input: ProvisionAccountDto,
  ): Promise<User> {
    await this.accounts.checkProvisioning(input);
    const user = await this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const person = await manager.findOne(User, {
        where: { email: normalizeEmail(input.email) },
      });
      if (person && (await holdsRoleHere(manager, person.id, schoolId, role))) {
        const message = PeopleMessages.alreadyHolds(person.name, role);
        throw new RuleViolation(message, { email: [message] });
      }
      if (
        role === 'teacher' &&
        person &&
        (await isEnrolledLearner(manager, person.id))
      ) {
        const message = PeopleMessages.learner(person.name);
        throw new RuleViolation(message, { email: [message] });
      }

      const { user } = await this.accounts.provisionIn(
        manager,
        schoolId,
        input,
      );
      if (role === 'parent') {
        await this.roles.giveFamilyRole(manager, {
          userId: user.id,
          roleName: 'parent',
          schoolId,
        });
        // One guardian record per person, shared by every school they join.
        await this.guardians.parentRecordIn(manager, user.id);
      } else {
        const shared = await this.roleAuthority.sharedRole(manager, role);
        if (!shared) throw new Error(`The ${role} role is missing.`);
        await this.roles.give(manager, {
          person: user,
          role: shared,
          schoolId,
          actorId: null,
        });
      }
      return user;
    });
    if (user.accountStatus === 'invited' && user.passwordHash === null) {
      await this.invitations.send(user.id, { invitedById: actorId });
    }
    return user;
  }

  async update(
    actorId: string,
    school: School,
    role: PersonRole,
    userId: string,
    details: PersonDetails,
  ): Promise<void> {
    await this.accounts.checkNewEmail(details.email);
    await this.transactions.run(async (tx) => {
      const person = await this.find(tx.manager, school.id, role, userId, true);
      await this.accounts.updateDetailsIn(
        tx.manager,
        actorId,
        school.id,
        person,
        details,
        this.clock.schoolToday(school.timezone),
      );
    });
  }

  async remove(
    actorId: string,
    schoolId: string,
    role: PersonRole,
    userId: string,
  ): Promise<void> {
    await this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const person = await this.find(manager, schoolId, role, userId, true);
      if (
        actorId !== person.id &&
        (await this.roleAuthority.holdsMoreThan(
          manager,
          person.id,
          actorId,
          schoolId,
        ))
      ) {
        throw new Forbidden(PersonMessages.removeHoldsMore);
      }
      if (role === 'parent') {
        await this.guardians.unlinkEveryoneHereIn(
          manager,
          actorId,
          schoolId,
          person.id,
        );
      }
      await this.accounts.removeFromCampusIn(
        manager,
        actorId,
        schoolId,
        person.id,
      );
    });
  }

  // A person holding the role at this campus, or not found.
  async find(
    manager: EntityManager,
    schoolId: string,
    role: PersonRole,
    userId: string,
    lock = false,
  ): Promise<User> {
    if (!(await holdsRoleHere(manager, userId, schoolId, role))) {
      throw new NotFoundException(PERSON_NOT_FOUND[role]);
    }
    return manager.findOneOrFail(User, {
      where: { id: userId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
  }
}
