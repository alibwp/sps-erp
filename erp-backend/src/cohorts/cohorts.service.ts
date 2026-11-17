import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager, IsNull } from 'typeorm';
import { AcademicPeriodContext } from '../academic/academic-period-context.service.js';
import { AcademicYear } from '../academic/entities/academic-year.entity.js';
import { Forbidden } from '../access/access.constants.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { postgresCode } from '../common/errors/error-response.js';
import { findInSchool } from '../common/tenancy/school-scope.js';
import { isEnrolled } from '../enrollments/enrollment.constants.js';
import { StudentRecord } from '../enrollments/entities/student-record.entity.js';
import { statusLabel } from '../enrollments/moving.constants.js';
import { School } from '../organizations/entities/school.entity.js';
import {
  COHORT_SUBJECT,
  type CohortType,
  isAlwaysRestricted,
} from './cohorts.constants.js';
import { CohortMember } from './entities/cohort-member.entity.js';
import { Cohort } from './entities/cohort.entity.js';

export const COHORT_NOT_FOUND = 'Group not found.';
export const MEMBER_NOT_FOUND = 'Member not found.';
export const READ_RESTRICTED = 'read restricted cohort';

export const CohortMessages = {
  nameTaken: 'This school already has a group with that name.',
  ownSchool: 'A student can only join a group in their own school.',
  notAttending: (status: string) =>
    `This learner no longer attends the school (${statusLabel(status)}).`,
  futureJoin: 'Nobody can join a group on a day that has not come yet.',
  closed: (name: string) =>
    `${name} is closed. Open it again before anybody joins.`,
  alreadyLeft: 'This person already left the group.',
  watchlist: 'A watchlist is always restricted.',
} as const;

export interface CohortInput {
  name?: string;
  type?: CohortType;
  description?: string | null;
  isRestricted?: boolean;
  isActive?: boolean;
  academicYearId?: string | null;
}

export interface Reader {
  id: string;
  permissions: ReadonlySet<string>;
}

// Cohorts of a campus and their members (reference SaveCohort,
// ChangeCohortMembership, CohortPolicy, CohortDirectory). A restricted
// cohort is not found by anyone without "read restricted cohort".
@Injectable()
export class Cohorts {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly periods: AcademicPeriodContext,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async list(
    schoolId: string,
    reader: Reader,
    filter: { type?: CohortType; activeOnly?: boolean } = {},
  ): Promise<Array<{ cohort: Cohort; currentMembers: number }>> {
    const query = this.dataSource.manager
      .createQueryBuilder(Cohort, 'cohort')
      .where('cohort.schoolId = :schoolId', { schoolId })
      .orderBy('cohort.name', 'ASC');
    if (!reader.permissions.has(READ_RESTRICTED)) {
      query.andWhere('cohort.isRestricted = false');
    }
    if (filter.type)
      query.andWhere('cohort.type = :type', { type: filter.type });
    if (filter.activeOnly) query.andWhere('cohort.isActive = true');
    const cohorts = await query.getMany();
    const counts = cohorts.length
      ? ((await this.dataSource.query(
          `SELECT cohort_id, count(*)::int AS n FROM cohort_members
            WHERE left_on IS NULL AND cohort_id = ANY($1::uuid[]) GROUP BY cohort_id`,
          [cohorts.map((cohort) => cohort.id)],
        )) as Array<{ cohort_id: string; n: number }>)
      : [];
    const byCohort = new Map(counts.map((row) => [row.cohort_id, row.n]));
    return cohorts.map((cohort) => ({
      cohort,
      currentMembers: byCohort.get(cohort.id) ?? 0,
    }));
  }

  // A cohort the reader may see (CohortPolicy::view): a restricted one
  // needs "read restricted cohort" and is not found otherwise.
  async find(
    schoolId: string,
    id: string,
    reader: Reader,
    manager: EntityManager = this.dataSource.manager,
    lock = false,
  ): Promise<Cohort> {
    const cohort = await findInSchool(
      manager,
      Cohort,
      { id },
      { schoolId, lock, notFound: COHORT_NOT_FOUND },
    );
    if (cohort.isRestricted) {
      if (!reader.permissions.has(READ_RESTRICTED)) {
        throw new NotFoundException(COHORT_NOT_FOUND);
      }
    } else if (!reader.permissions.has('read cohort')) {
      throw new Forbidden();
    }
    return cohort;
  }

  members(cohortId: string, currentOnly: boolean): Promise<CohortMember[]> {
    return this.dataSource.manager.find(CohortMember, {
      where: { cohortId, ...(currentOnly ? { leftOn: IsNull() } : {}) },
      relations: { studentRecord: { user: true }, addedBy: true },
      withDeleted: true,
      order: { joinedOn: 'ASC', createdAt: 'ASC' },
    });
  }

  async create(
    reader: Reader,
    school: School,
    input: CohortInput & { name: string; type: CohortType },
  ): Promise<Cohort> {
    const restricted = this.restrictedFlag(reader, input.type, false, input);
    return this.saving(async (manager) => {
      await this.lockSchool(manager, school.id);
      const name = input.name.trim();
      await this.refuseATakenName(manager, school.id, name);
      const cohort = await manager.save(
        manager.create(Cohort, {
          schoolId: school.id,
          name,
          type: input.type,
          description: input.description?.trim() || null,
          isRestricted: restricted,
          isActive: input.isActive ?? true,
          academicYearId: await this.yearFor(manager, reader, school, input),
          createdById: reader.id,
        }),
      );
      await this.record(manager, cohort, { created: true });
      return cohort;
    });
  }

  async update(
    reader: Reader,
    school: School,
    id: string,
    input: CohortInput,
  ): Promise<Cohort> {
    return this.saving(async (manager) => {
      await this.lockSchool(manager, school.id);
      const cohort = await this.find(school.id, id, reader, manager, true);
      const type = input.type ?? cohort.type;
      const restricted = this.restrictedFlag(
        reader,
        type,
        cohort.isRestricted,
        input,
      );
      const name = input.name?.trim() ?? cohort.name;
      await this.refuseATakenName(manager, school.id, name, cohort.id);
      const next = {
        name,
        type,
        description:
          input.description === undefined
            ? cohort.description
            : input.description?.trim() || null,
        isRestricted: restricted,
        isActive: input.isActive ?? cohort.isActive,
        academicYearId:
          input.academicYearId === undefined
            ? cohort.academicYearId
            : await this.yearFor(manager, reader, school, input),
      };
      const changed = (Object.keys(next) as Array<keyof typeof next>).filter(
        (field) => next[field] !== cohort[field],
      );
      if (!changed.length) return cohort;
      Object.assign(cohort, next);
      const saved = await manager.save(cohort);
      await this.record(manager, saved, { changed });
      return saved;
    });
  }

  async join(
    reader: Reader,
    schoolId: string,
    cohortId: string,
    input: { studentId: string; joinedOn?: string | null },
  ): Promise<{ member: CohortMember; created: boolean }> {
    const today = await this.today(this.dataSource.manager, schoolId);
    const joinedOn = input.joinedOn ?? today;
    try {
      return await this.transactions.run(async (tx) => {
        const manager = tx.manager;
        const cohort = await this.find(
          schoolId,
          cohortId,
          reader,
          manager,
          true,
        );
        const enrollment = await manager.findOne(StudentRecord, {
          where: { id: input.studentId },
        });
        if (!enrollment) throw new NotFoundException('Student not found.');
        if (enrollment.schoolId !== cohort.schoolId) {
          throw new RuleViolation(CohortMessages.ownSchool);
        }
        if (!isEnrolled(enrollment.status)) {
          throw new RuleViolation(
            CohortMessages.notAttending(enrollment.status),
          );
        }
        if (joinedOn > today)
          throw new RuleViolation(CohortMessages.futureJoin);
        if (!cohort.isActive) {
          throw new RuleViolation(CohortMessages.closed(cohort.name));
        }
        const open = await manager.findOne(CohortMember, {
          where: {
            cohortId: cohort.id,
            studentRecordId: enrollment.id,
            leftOn: IsNull(),
          },
        });
        if (open) return { member: open, created: false };
        const member = await manager.save(
          manager.create(CohortMember, {
            cohortId: cohort.id,
            studentRecordId: enrollment.id,
            joinedOn,
            leftOn: null,
            addedById: reader.id,
          }),
        );
        await this.record(
          manager,
          cohort,
          {
            member_id: member.id,
            student_record_id: enrollment.id,
            joined_on: joinedOn,
          },
          AuditAction.CohortMembershipChanged,
        );
        return { member, created: true };
      });
    } catch (error) {
      // The same learner added at the same moment: the one open row.
      if (postgresCode(error) !== '23505') throw error;
      const member = await this.dataSource.manager.findOneOrFail(CohortMember, {
        where: {
          cohortId,
          studentRecordId: input.studentId,
          leftOn: IsNull(),
        },
      });
      return { member, created: false };
    }
  }

  async leave(
    reader: Reader,
    schoolId: string,
    cohortId: string,
    memberId: string,
    leftOn: string | null,
  ): Promise<CohortMember> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const cohort = await this.find(schoolId, cohortId, reader, manager);
      const member = await manager.findOne(CohortMember, {
        where: { id: memberId, cohortId: cohort.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!member) throw new NotFoundException(MEMBER_NOT_FOUND);
      return this.leaveIn(manager, cohort, member, leftOn, reader.id);
    });
  }

  // The learner's open memberships at a campus end (an enrollment closing,
  // a move to another campus).
  async leaveSchoolIn(
    manager: EntityManager,
    enrollmentId: string,
    schoolId: string,
    leftOn: string,
    actorId: string | null,
  ): Promise<number> {
    const open = await manager
      .createQueryBuilder(CohortMember, 'member')
      .innerJoinAndSelect('member.cohort', 'cohort')
      .where('member.studentRecordId = :enrollmentId', { enrollmentId })
      .andWhere('member.leftOn IS NULL')
      .andWhere('cohort.schoolId = :schoolId', { schoolId })
      .setLock('pessimistic_write', undefined, ['member'])
      .getMany();
    for (const member of open) {
      await this.leaveIn(manager, member.cohort, member, leftOn, actorId);
    }
    return open.length;
  }

  private async leaveIn(
    manager: EntityManager,
    cohort: Cohort,
    member: CohortMember,
    leftOn: string | null,
    actorId: string | null,
  ): Promise<CohortMember> {
    if (member.leftOn !== null) {
      throw new RuleViolation(CohortMessages.alreadyLeft);
    }
    const day = leftOn ?? (await this.today(manager, cohort.schoolId));
    // A day before joining moves to the joining day.
    member.leftOn = day < member.joinedOn ? member.joinedOn : day;
    const saved = await manager.save(member);
    await this.record(
      manager,
      cohort,
      {
        member_id: member.id,
        student_record_id: member.studentRecordId,
        left_on: member.leftOn,
      },
      AuditAction.CohortMembershipChanged,
      actorId,
    );
    return saved;
  }

  // The restricted flag a cohort ends up with. A watchlist is always
  // restricted; otherwise only a reader of restricted cohorts sets or
  // clears it.
  private restrictedFlag(
    reader: Reader,
    type: CohortType,
    current: boolean,
    input: CohortInput,
  ): boolean {
    if (isAlwaysRestricted(type)) {
      if (input.isRestricted === false) {
        throw new RuleViolation(CohortMessages.watchlist);
      }
      return true;
    }
    if (input.isRestricted === undefined || input.isRestricted === current) {
      return current;
    }
    if (!reader.permissions.has(READ_RESTRICTED)) throw new Forbidden();
    return input.isRestricted;
  }

  // The given year of this campus, or the reader's working year.
  private async yearFor(
    manager: EntityManager,
    reader: Reader,
    school: School,
    input: CohortInput,
  ): Promise<string | null> {
    if (input.academicYearId) {
      const year = await findInSchool(
        manager,
        AcademicYear,
        { id: input.academicYearId },
        { schoolId: school.id, notFound: 'Academic year not found.' },
      );
      return year.id;
    }
    if (input.academicYearId === null) return null;
    const working = await this.periods.resolve(
      reader.id,
      school,
      undefined,
      manager,
    );
    return working.academicYear?.id ?? null;
  }

  private async refuseATakenName(
    manager: EntityManager,
    schoolId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const taken = await manager
      .createQueryBuilder(Cohort, 'cohort')
      .where('cohort.schoolId = :schoolId', { schoolId })
      .andWhere('lower(cohort.name) = lower(:name)', { name })
      .andWhere(exceptId ? 'cohort.id <> :exceptId' : 'TRUE', { exceptId })
      .getExists();
    if (taken) throw new RuleViolation(CohortMessages.nameTaken);
  }

  private async saving<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.transactions.run((tx) => work(tx.manager));
    } catch (error) {
      if (postgresCode(error) === '23505') {
        throw new RuleViolation(CohortMessages.nameTaken);
      }
      throw error;
    }
  }

  private async lockSchool(
    manager: EntityManager,
    schoolId: string,
  ): Promise<void> {
    await manager.findOne(School, {
      where: { id: schoolId },
      lock: { mode: 'pessimistic_write' },
    });
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
    cohort: Cohort,
    context: Record<string, unknown>,
    action:
      | typeof AuditAction.CohortChanged
      | typeof AuditAction.CohortMembershipChanged = AuditAction.CohortChanged,
    actorId?: string | null,
  ): Promise<void> {
    await this.audit.record(manager, {
      action,
      subject: { type: COHORT_SUBJECT, id: cohort.id },
      context,
      schoolId: cohort.schoolId,
      ...(actorId === null ? { actorId } : {}),
    });
  }
}
