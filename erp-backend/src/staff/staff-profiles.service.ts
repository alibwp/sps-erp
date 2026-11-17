import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { Forbidden } from '../access/access.constants.js';
import { RoleAuthority } from '../access/role-authority.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { addDays } from '../common/clock/dates.js';
import { TransactionService } from '../common/database/transaction.service.js';
import {
  RuleViolation,
  ValidationFailed,
} from '../common/errors/api-exception.js';
import { postgresCode } from '../common/errors/error-response.js';
import {
  type Paginated,
  type PaginationQueryDto,
  paginate,
} from '../common/pagination/pagination.js';
import { findInSchool } from '../common/tenancy/school-scope.js';
import { TeachingAssignments } from '../curriculum/teaching-assignments.service.js';
import { isEnrolledLearner } from '../enrollments/learners.js';
import { School } from '../organizations/entities/school.entity.js';
import { SchoolMembership } from '../organizations/entities/school-membership.entity.js';
import { SchoolMemberships } from '../organizations/school-memberships.service.js';
import { StaffAvailability } from './entities/staff-availability.entity.js';
import { StaffCredential } from './entities/staff-credential.entity.js';
import { StaffProfile } from './entities/staff-profile.entity.js';
import { STAFF_PROFILE_NOT_FOUND, StaffLeave } from './staff-leave.service.js';
import {
  type EmploymentType,
  STAFF_PROFILE_SUBJECT,
  type StaffStatus,
} from './staff.constants.js';

export const CREDENTIAL_NOT_FOUND = 'Credential not found.';
export const HOURS_NOT_FOUND = 'Hours not found.';

export const ProfileMessages = {
  notMember: 'Choose somebody who works in this school.',
  learner: 'This person is still a learner. A learner cannot be made staff.',
  nowLearner: 'This person is now a learner. A learner cannot be made staff.',
  exists: 'This person already has an employment record here.',
  raced:
    'This person or staff number was just given an employment record. Open the staff list to see it.',
  numberRaced: 'Another person was just given this staff number.',
  numberTaken: (number: string) =>
    `Another person already has staff number ${number}.`,
  leaveHoldsMore:
    'This person holds more at this school than you do, so you cannot record that they left.',
  backHoldsMore:
    'This person holds more at this school than you do, so you cannot take them back.',
  lastRoleManager:
    'Nobody else at this campus can manage roles. Give somebody else role management before recording that this person left.',
  leftBeforeJoined: 'A person cannot leave before they joined.',
  hoursOverlap: (startsAt: string, endsAt: string) =>
    `These hours overlap ${startsAt.slice(0, 5)} to ${endsAt.slice(0, 5)} on the same day.`,
  hoursOrder: 'The ends at field must be a time after starts at.',
  expiresBeforeIssued:
    'The expires on field must be a date after or equal to issued on.',
  ownCredential: 'You cannot verify your own credential.',
} as const;

export interface ProfileInput {
  staffNumber?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  employmentType?: EmploymentType;
  status?: StaffStatus;
  joinedOn?: string | null;
  leftOn?: string | null;
}

export interface Viewer {
  id: string;
  permissions: ReadonlySet<string>;
}

const PROFILE_FIELDS = [
  'staffNumber',
  'jobTitle',
  'department',
  'employmentType',
  'status',
  'joinedOn',
  'leftOn',
] as const;

// Employment records of a campus (reference ManageStaffProfile,
// EndLeaversAccess). left_on is the last working day: duties end from the
// day after, and access ends once campus today is after it (at once for a
// past day, otherwise by the 00:15 leavers job).
@Injectable()
export class StaffProfiles {
  private readonly logger = new Logger(StaffProfiles.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly leave: StaffLeave,
    private readonly memberships: SchoolMemberships,
    private readonly roleAuthority: RoleAuthority,
    private readonly assignments: TeachingAssignments,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  list(
    schoolId: string,
    query: PaginationQueryDto & { status?: StaffStatus },
  ): Promise<Paginated<StaffProfile>> {
    const qb = this.dataSource.manager
      .createQueryBuilder(StaffProfile, 'profile')
      .innerJoinAndSelect('profile.user', 'person')
      .withDeleted()
      .where('profile.schoolId = :schoolId', { schoolId });
    if (query.status) {
      qb.andWhere('profile.status = :status', { status: query.status });
    }
    if (query.search) {
      qb.andWhere(
        '(person.name ILIKE :search OR profile.staffNumber ILIKE :search OR profile.jobTitle ILIKE :search)',
        { search: `%${query.search.replace(/[\\%_]/g, '')}%` },
      );
    }
    return paginate(
      qb,
      query,
      {
        name: 'person.name',
        staffNumber: 'profile.staffNumber',
        joinedOn: 'profile.joinedOn',
      },
      [{ column: 'person.name', direction: 'ASC' }],
    );
  }

  // One record with its person; the person may always read their own.
  async find(
    schoolId: string,
    id: string,
    viewer?: Viewer,
  ): Promise<StaffProfile> {
    const profile = await this.profileHere(
      this.dataSource.manager,
      schoolId,
      id,
    );
    if (
      viewer &&
      !viewer.permissions.has('read staff profile') &&
      profile.userId !== viewer.id
    ) {
      throw new Forbidden();
    }
    return this.dataSource.manager.findOneOrFail(StaffProfile, {
      where: { id: profile.id },
      relations: { user: true },
      withDeleted: true,
    });
  }

  credentials(profileId: string): Promise<StaffCredential[]> {
    return this.dataSource.manager.find(StaffCredential, {
      where: { staffProfileId: profileId },
      relations: { verifiedBy: true },
      withDeleted: true,
      order: { createdAt: 'ASC' },
    });
  }

  hours(profileId: string): Promise<StaffAvailability[]> {
    return this.dataSource.manager.find(StaffAvailability, {
      where: { staffProfileId: profileId },
      order: { dayOfWeek: 'ASC', startsAt: 'ASC' },
    });
  }

  async create(
    actorId: string,
    schoolId: string,
    input: ProfileInput & { userId: string },
  ): Promise<StaffProfile> {
    const manager = this.dataSource.manager;
    const member = await manager.exists(SchoolMembership, {
      where: { userId: input.userId, schoolId, status: 'active' },
    });
    if (!member) {
      throw new ValidationFailed({ userId: [ProfileMessages.notMember] });
    }
    if (await isEnrolledLearner(manager, input.userId)) {
      throw new RuleViolation(ProfileMessages.learner);
    }
    try {
      return await this.transactions.run(async (tx) => {
        const m = tx.manager;
        if (
          await m.exists(StaffProfile, {
            where: { schoolId, userId: input.userId },
          })
        ) {
          throw new RuleViolation(ProfileMessages.exists);
        }
        const staffNumber = input.staffNumber?.trim() || null;
        await this.refuseATakenStaffNumber(m, schoolId, staffNumber);
        const profile = await m.save(
          m.create(StaffProfile, {
            schoolId,
            userId: input.userId,
            staffNumber,
            jobTitle: input.jobTitle?.trim() || null,
            department: input.department?.trim() || null,
            employmentType: input.employmentType ?? 'full_time',
            status: 'active',
            joinedOn: input.joinedOn ?? null,
            leftOn: null,
          }),
        );
        await this.record(m, profile, { change: 'created' });
        return profile;
      });
    } catch (error) {
      // Somebody saved the same person or number a moment earlier.
      if (postgresCode(error) === '23505') {
        throw new RuleViolation(ProfileMessages.raced);
      }
      throw error;
    }
  }

  async update(
    actorId: string,
    schoolId: string,
    id: string,
    input: ProfileInput,
  ): Promise<StaffProfile> {
    try {
      return await this.transactions.run((tx) =>
        this.updateIn(tx.manager, actorId, schoolId, id, input),
      );
    } catch (error) {
      if (postgresCode(error) === '23505') {
        throw new RuleViolation(ProfileMessages.numberRaced);
      }
      throw error;
    }
  }

  async addCredential(
    schoolId: string,
    profileId: string,
    input: {
      type: string;
      name: string;
      issuer?: string | null;
      reference?: string | null;
      issuedOn?: string | null;
      expiresOn?: string | null;
    },
  ): Promise<StaffCredential> {
    if (input.issuedOn && input.expiresOn && input.expiresOn < input.issuedOn) {
      throw new ValidationFailed({
        expiresOn: [ProfileMessages.expiresBeforeIssued],
      });
    }
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const profile = await this.profileHere(manager, schoolId, profileId);
      const credential = await manager.save(
        manager.create(StaffCredential, {
          staffProfileId: profile.id,
          type: input.type.trim(),
          name: input.name.trim(),
          issuer: input.issuer?.trim() || null,
          reference: input.reference?.trim() || null,
          issuedOn: input.issuedOn ?? null,
          expiresOn: input.expiresOn ?? null,
        }),
      );
      await this.record(manager, profile, {
        change: 'credential_added',
        credential_id: credential.id,
      });
      return credential;
    });
  }

  async removeCredential(
    schoolId: string,
    profileId: string,
    credentialId: string,
  ): Promise<void> {
    await this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const profile = await this.profileHere(manager, schoolId, profileId);
      const credential = await this.credentialOf(
        manager,
        profile,
        credentialId,
      );
      await manager.remove(credential);
      await this.record(manager, profile, {
        change: 'credential_removed',
        name: credential.name,
      });
    });
  }

  // Somebody other than the holder confirms the credential; who and when
  // are kept. A verified credential stays as it was verified.
  async verifyCredential(
    actorId: string,
    schoolId: string,
    profileId: string,
    credentialId: string,
  ): Promise<StaffCredential> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const profile = await this.profileHere(manager, schoolId, profileId);
      if (profile.userId === actorId) {
        throw new Forbidden(ProfileMessages.ownCredential);
      }
      const credential = await this.credentialOf(
        manager,
        profile,
        credentialId,
      );
      if (credential.verifiedAt) return credential;
      credential.verifiedAt = this.clock.now();
      credential.verifiedById = actorId;
      const saved = await manager.save(credential);
      await this.record(manager, profile, {
        change: 'credential_verified',
        credential_id: credential.id,
      });
      return saved;
    });
  }

  async addHours(
    schoolId: string,
    profileId: string,
    input: { dayOfWeek: number; startsAt: string; endsAt: string },
  ): Promise<StaffAvailability> {
    if (input.endsAt <= input.startsAt) {
      throw new ValidationFailed({ endsAt: [ProfileMessages.hoursOrder] });
    }
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const profile = await this.profileHere(
        manager,
        schoolId,
        profileId,
        true,
      );
      const overlap = await manager
        .createQueryBuilder(StaffAvailability, 'hours')
        .where('hours.staffProfileId = :profileId', { profileId: profile.id })
        .andWhere('hours.dayOfWeek = :day', { day: input.dayOfWeek })
        .andWhere('hours.startsAt < :endsAt AND hours.endsAt > :startsAt', {
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        })
        .getOne();
      if (overlap) {
        throw new RuleViolation(
          ProfileMessages.hoursOverlap(overlap.startsAt, overlap.endsAt),
        );
      }
      const hours = await manager.save(
        manager.create(StaffAvailability, {
          staffProfileId: profile.id,
          dayOfWeek: input.dayOfWeek,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        }),
      );
      await this.record(manager, profile, {
        change: 'hours_added',
        day_of_week: input.dayOfWeek,
      });
      return hours;
    });
  }

  async removeHours(
    schoolId: string,
    profileId: string,
    hoursId: string,
  ): Promise<void> {
    await this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const profile = await this.profileHere(manager, schoolId, profileId);
      const hours = await manager.findOne(StaffAvailability, {
        where: { id: hoursId, staffProfileId: profile.id },
      });
      if (!hours) throw new NotFoundException(HOURS_NOT_FOUND);
      await manager.remove(hours);
      await this.record(manager, profile, {
        change: 'hours_removed',
        day_of_week: hours.dayOfWeek,
      });
    });
  }

  // Daily at 00:15: staff whose last day is before campus today lose
  // their access (EndLeaversAccess). The campus's last role manager keeps
  // it, with a warning, until somebody else can manage roles.
  async endLeaversAccess(): Promise<number> {
    const due = await this.dataSource.manager
      .createQueryBuilder(StaffProfile, 'profile')
      .innerJoin(
        SchoolMembership,
        'membership',
        "membership.userId = profile.userId AND membership.schoolId = profile.schoolId AND membership.status <> 'ended'",
      )
      .where("profile.status = 'left'")
      .andWhere('profile.leftOn IS NOT NULL')
      // A day ahead of the server, so a campus already in tomorrow counts.
      .andWhere('profile.leftOn < :tomorrow', {
        tomorrow: addDays(this.clock.schoolToday('UTC'), 1),
      })
      .orderBy('profile.createdAt', 'ASC')
      .getMany();
    let ended = 0;
    for (const profile of due) {
      try {
        const done = await this.transactions.run((tx) =>
          this.endAccessIfDueIn(tx.manager, profile.id),
        );
        if (done) ended += 1;
      } catch (error) {
        if (!(error instanceof RuleViolation)) throw error;
        this.logger.warn(`Staff record ${profile.id}: ${error.message}`);
      }
    }
    return ended;
  }

  private async updateIn(
    manager: EntityManager,
    actorId: string,
    schoolId: string,
    id: string,
    input: ProfileInput,
  ): Promise<StaffProfile> {
    const profile = await this.profileHere(manager, schoolId, id, true);
    const staffNumber =
      input.staffNumber === undefined
        ? profile.staffNumber
        : input.staffNumber?.trim() || null;
    await this.refuseATakenStaffNumber(
      manager,
      schoolId,
      staffNumber,
      profile.id,
    );

    const status = input.status ?? profile.status;
    const isLeaving = status === 'left';
    const isComingBack = profile.status === 'left' && !isLeaving;
    if (isComingBack && (await isEnrolledLearner(manager, profile.userId))) {
      throw new RuleViolation(ProfileMessages.nowLearner);
    }
    if (
      (isLeaving || isComingBack) &&
      actorId !== profile.userId &&
      (await this.roleAuthority.holdsMoreThan(
        manager,
        profile.userId,
        actorId,
        schoolId,
      ))
    ) {
      throw new RuleViolation(
        isLeaving
          ? ProfileMessages.leaveHoldsMore
          : ProfileMessages.backHoldsMore,
      );
    }
    if (isLeaving && profile.status !== 'left') {
      await this.failIfTheLastRoleManagerLeaves(manager, profile);
    }

    const today = await this.today(manager, schoolId);
    const joinedOn =
      input.joinedOn === undefined ? profile.joinedOn : input.joinedOn;
    const leftOn = isLeaving
      ? (input.leftOn ??
        (profile.status === 'left' ? profile.leftOn : null) ??
        today)
      : null;
    if (leftOn !== null && joinedOn !== null && leftOn < joinedOn) {
      throw new RuleViolation(ProfileMessages.leftBeforeJoined);
    }

    const next: Record<(typeof PROFILE_FIELDS)[number], unknown> = {
      staffNumber,
      jobTitle:
        input.jobTitle === undefined
          ? profile.jobTitle
          : input.jobTitle?.trim() || null,
      department:
        input.department === undefined
          ? profile.department
          : input.department?.trim() || null,
      employmentType: input.employmentType ?? profile.employmentType,
      status,
      joinedOn,
      leftOn,
    };
    const changed = PROFILE_FIELDS.filter(
      (field) => next[field] !== profile[field],
    );
    if (!changed.length) return profile;
    Object.assign(profile, next);
    const saved = await manager.save(profile);
    await this.record(manager, saved, { change: 'updated', fields: changed });

    if (leftOn !== null) {
      await this.leave.cancelHeldAfterIn(manager, saved, leftOn, actorId);
      // They still work on their last day, and nothing after it.
      await this.assignments.endDutiesFrom(
        manager,
        saved.userId,
        schoolId,
        addDays(leftOn, 1),
      );
      await this.endAccessIfDueIn(manager, saved.id);
    }
    // A person taken back works here again, with the roles they had.
    if (isComingBack) {
      await this.memberships.grant(manager, saved.userId, schoolId);
    }
    return saved;
  }

  // Ends the leaver's access once campus today is after their last day;
  // true when it ended now.
  private async endAccessIfDueIn(
    manager: EntityManager,
    profileId: string,
  ): Promise<boolean> {
    const profile = await manager.findOneOrFail(StaffProfile, {
      where: { id: profileId },
    });
    if (profile.status !== 'left' || profile.leftOn === null) return false;
    if (!(profile.leftOn < (await this.today(manager, profile.schoolId)))) {
      return false;
    }
    const membership = await this.memberships.end(
      manager,
      profile.userId,
      profile.schoolId,
    );
    return membership !== null;
  }

  private async failIfTheLastRoleManagerLeaves(
    manager: EntityManager,
    profile: StaffProfile,
  ): Promise<void> {
    if (
      (await this.roleAuthority.campusHasARoleManager(
        manager,
        profile.schoolId,
      )) &&
      !(await this.roleAuthority.campusHasARoleManager(
        manager,
        profile.schoolId,
        profile.userId,
      ))
    ) {
      throw new RuleViolation(ProfileMessages.lastRoleManager);
    }
  }

  private async refuseATakenStaffNumber(
    manager: EntityManager,
    schoolId: string,
    staffNumber: string | null,
    exceptId?: string,
  ): Promise<void> {
    if (!staffNumber) return;
    const taken = await manager
      .createQueryBuilder(StaffProfile, 'profile')
      .where('profile.schoolId = :schoolId', { schoolId })
      .andWhere('lower(profile.staffNumber) = lower(:staffNumber)', {
        staffNumber,
      })
      .andWhere(exceptId ? 'profile.id <> :exceptId' : 'TRUE', { exceptId })
      .getExists();
    if (taken)
      throw new RuleViolation(ProfileMessages.numberTaken(staffNumber));
  }

  private profileHere(
    manager: EntityManager,
    schoolId: string,
    id: string,
    lock = false,
  ): Promise<StaffProfile> {
    return findInSchool(
      manager,
      StaffProfile,
      { id },
      { schoolId, lock, notFound: STAFF_PROFILE_NOT_FOUND },
    );
  }

  private async credentialOf(
    manager: EntityManager,
    profile: StaffProfile,
    credentialId: string,
  ): Promise<StaffCredential> {
    const credential = await manager.findOne(StaffCredential, {
      where: { id: credentialId, staffProfileId: profile.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!credential) throw new NotFoundException(CREDENTIAL_NOT_FOUND);
    return credential;
  }

  private async today(
    manager: EntityManager,
    schoolId: string,
  ): Promise<string> {
    const school = await manager.findOneOrFail(School, {
      where: { id: schoolId },
    });
    return this.clock.schoolToday(school.timezone);
  }

  private async record(
    manager: EntityManager,
    profile: StaffProfile,
    context: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record(manager, {
      action: AuditAction.StaffProfileChanged,
      subject: { type: STAFF_PROFILE_SUBJECT, id: profile.id },
      context,
      schoolId: profile.schoolId,
    });
  }
}
