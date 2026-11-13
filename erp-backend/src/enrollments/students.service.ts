import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, Not } from 'typeorm';
import type { WorkingPeriod } from '../academic/academic-period-context.service.js';
import { Forbidden } from '../access/access.constants.js';
import { RoleAssignments } from '../access/role-assignments.service.js';
import { RoleAuthority } from '../access/role-authority.service.js';
import { AccountAuthority } from '../accounts/account-authority.service.js';
import { Accounts } from '../accounts/accounts.service.js';
import type { ProvisionAccountDto } from '../accounts/accounts.dto.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { postgresCode } from '../common/errors/error-response.js';
import {
  RuleViolation,
  ValidationFailed,
} from '../common/errors/api-exception.js';
import { type Paginated, paginate } from '../common/pagination/pagination.js';
import {
  findInSchool,
  inSchool,
  newInSchool,
} from '../common/tenancy/school-scope.js';
import { EmailDomainChecker } from '../common/validation/email-domain.js';
import { type CampusTerms, campusTerms } from '../curriculum/campus-terms.js';
import { AcademicCycleSection } from '../curriculum/entities/academic-cycle-section.entity.js';
import { SessionService } from '../identity/auth/session.service.js';
import { User } from '../identity/entities/user.entity.js';
import { Messages, normalizeEmail } from '../identity/identity.constants.js';
import { InvitationService } from '../identity/invitations/invitation.service.js';
import { School } from '../organizations/entities/school.entity.js';
import { SchoolMemberships } from '../organizations/school-memberships.service.js';
import { EnrollmentPlacements } from './enrollment-placements.service.js';
import { EnrollmentStatuses } from './enrollment-statuses.service.js';
import { type EnrollmentStatus, isEnrolled } from './enrollment.constants.js';
import { StudentRecord } from './entities/student-record.entity.js';
import {
  belongsToAnotherSchool,
  holdsRoleHere,
  openEnrollmentElsewhere,
  worksAsStaff,
} from './learners.js';

export const STUDENT_NOT_FOUND = 'Student not found.';

export const StudentMessages = {
  alreadyStudent: (name: string) =>
    `${name} already holds the student role at this school.`,
  worksAsStaff: (name: string) =>
    `${name} works as staff. A member of staff cannot be admitted as a learner.`,
  enrolledElsewhere:
    'This learner is enrolled at another school. Ask that school to move or transfer them.',
  section: 'Choose an active section of the current year.',
  numberTaken: 'The admission number has already been taken.',
  admissionDate: (today: string) =>
    `The date of admission field must be a date before or equal to ${today}.`,
  removed: 'Removed from the school',
  emailElsewhere:
    'This person also belongs to another school, so only they can change their email.',
  emailBeyond:
    'This person has authority beyond this school, so only they can change their email.',
  emailHoldsMore:
    'This person holds more at this school than you do, so only they can change their email.',
  removeHoldsMore: 'This person holds more at this campus than you do.',
  notThisYear: (t: CampusTerms) =>
    `That ${t.section} does not belong to the working ${t.academicYear}.`,
} as const;

export interface AdmitInput extends ProvisionAccountDto {
  academicCycleSectionId: string;
  admissionNumber?: string | null;
  admissionDate?: string | null;
}

export type StudentDetails = Partial<
  Pick<
    User,
    | 'name'
    | 'email'
    | 'birthday'
    | 'gender'
    | 'phone'
    | 'address'
    | 'addressLine2'
    | 'city'
    | 'state'
    | 'postalCode'
    | 'country'
    | 'nationality'
  >
>;

export interface StudentListQuery {
  page: number;
  perPage: number;
  sort?: string;
  search?: string;
  status?: EnrollmentStatus;
  academicYearId?: string;
  academicLevelId?: string;
  academicCycleSectionId?: string;
}

const DETAIL_FIELDS = [
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

// "{campus initials}/{two-digit year}/{six random digits}", the year from
// the campus's today (StudentService::generateAdmissionNumber).
export function admissionNumber(
  initials: string | null,
  today: string,
  digits: number,
): string {
  const prefix = initials?.trim() ? `${initials.trim()}/` : '';
  return `${prefix}${today.slice(2, 4)}/${digits}`;
}

// The learners of a campus (reference StudentService, UserService for the
// person, UserPolicy for who may act).
@Injectable()
export class Students {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly accounts: Accounts,
    private readonly accountAuthority: AccountAuthority,
    private readonly roleAssignments: RoleAssignments,
    private readonly roleAuthority: RoleAuthority,
    private readonly memberships: SchoolMemberships,
    private readonly placements: EnrollmentPlacements,
    private readonly statuses: EnrollmentStatuses,
    private readonly invitations: InvitationService,
    private readonly sessions: SessionService,
    private readonly emailDomains: EmailDomainChecker,
    private readonly audit: AuditService,
  ) {}

  list(
    schoolId: string,
    query: StudentListQuery,
  ): Promise<Paginated<StudentRecord>> {
    const qb = inSchool(
      this.dataSource.manager
        .createQueryBuilder(StudentRecord, 'enrollment')
        .innerJoinAndSelect('enrollment.user', 'person')
        .leftJoinAndSelect('enrollment.academicCycleSection', 'section')
        .withDeleted(),
      { schoolId },
    );
    if (query.status) {
      qb.andWhere('enrollment.status = :status', { status: query.status });
    }
    if (query.academicCycleSectionId) {
      qb.andWhere('enrollment.academicCycleSectionId = :sectionId', {
        sectionId: query.academicCycleSectionId,
      });
    }
    if (query.academicLevelId) {
      qb.andWhere('section.academicLevelId = :levelId', {
        levelId: query.academicLevelId,
      });
    }
    if (query.academicYearId) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM academic_year_student_records y WHERE y.student_record_id = enrollment.id AND y.academic_year_id = :yearId)',
        { yearId: query.academicYearId },
      );
    }
    if (query.search) {
      qb.andWhere(
        '(person.name ILIKE :search OR enrollment.admissionNumber ILIKE :search)',
        { search: `%${query.search.replace(/[\\%_]/g, '')}%` },
      );
    }
    return paginate(
      qb,
      { page: query.page, perPage: query.perPage, sort: query.sort },
      {
        name: 'person.name',
        admissionNumber: 'enrollment.admissionNumber',
        admissionDate: 'enrollment.admissionDate',
        status: 'enrollment.status',
      },
      [
        { column: 'person.name', direction: 'ASC' },
        { column: 'enrollment.admissionNumber', direction: 'ASC' },
      ],
    );
  }

  find(
    manager: EntityManager,
    schoolId: string,
    id: string,
    lock = false,
  ): Promise<StudentRecord> {
    return findInSchool(
      manager,
      StudentRecord,
      { id },
      { schoolId, lock, notFound: STUDENT_NOT_FOUND },
    );
  }

  // Admits a learner (StudentService::createStudent): the account, the
  // campus membership, the student role, the enrollment and its first
  // placement in one transaction. A new account is sent its invitation
  // after commit. A null actor is a command run on the server
  // (seed-demo-users).
  async admit(
    actorId: string | null,
    schoolId: string,
    working: WorkingPeriod,
    input: AdmitInput,
  ): Promise<{ enrollment: StudentRecord; created: boolean }> {
    await this.accounts.checkProvisioning(input);
    const result = await this.openEnrollmentRace(() =>
      this.transactions.run(async (tx) => {
        const manager = tx.manager;
        const school = await manager.findOneOrFail(School, {
          where: { id: schoolId },
        });
        const today = await this.placements.today(manager, schoolId);
        const admissionDate = input.admissionDate ?? today;
        if (admissionDate > today) {
          const message = StudentMessages.admissionDate(today);
          throw new ValidationFailed({ admissionDate: [message] });
        }
        await this.mustBeAnOpenSectionThisYear(
          manager,
          schoolId,
          working,
          input.academicCycleSectionId,
        );
        const number = input.admissionNumber?.trim() || null;
        if (number && (await this.numberTaken(manager, schoolId, number))) {
          throw new RuleViolation(StudentMessages.numberTaken, {
            admissionNumber: [StudentMessages.numberTaken],
          });
        }

        const person = await manager.findOne(User, {
          where: { email: normalizeEmail(input.email) },
        });
        if (person) await this.mustBeAdmissible(manager, person, schoolId);

        const { user, created } = await this.accounts.provisionIn(
          manager,
          schoolId,
          input,
        );
        await this.roleAssignments.giveFamilyRole(manager, {
          userId: user.id,
          roleName: 'student',
          schoolId,
        });
        // An earlier enrollment here is taken up again (firstOrCreate); a
        // closed one is refused by the placement.
        const enrollment =
          (await manager.findOne(StudentRecord, {
            where: { userId: user.id, schoolId },
            order: { createdAt: 'DESC' },
          })) ??
          (await manager.save(
            newInSchool(
              manager,
              StudentRecord,
              {
                userId: user.id,
                admissionNumber:
                  number ?? (await this.generateNumber(manager, school, today)),
                admissionDate,
                status: 'active',
                isPrimary: true,
              },
              { schoolId },
            ),
          ));
        const placed = await this.placements.placeIn(manager, {
          enrollmentId: enrollment.id,
          sectionId: input.academicCycleSectionId,
          periodId: working.academicPeriod?.id ?? null,
          actorId,
          reason: 'Admission',
        });
        return { enrollment: placed, user, created };
      }),
    );
    if (
      result.user.accountStatus === 'invited' &&
      result.user.passwordHash === null
    ) {
      await this.invitations.send(result.user.id, { invitedById: actorId });
    }
    return { enrollment: result.enrollment, created: result.created };
  }

  // Moves a learner within the working school year (the profile screen's
  // placement: ShowStudentProfile::changePlacement).
  async place(
    actorId: string,
    schoolId: string,
    working: WorkingPeriod,
    id: string,
    input: {
      academicCycleSectionId: string;
      reason?: string | null;
      effectiveOn?: string;
    },
  ): Promise<StudentRecord> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const enrollment = await this.find(manager, schoolId, id);
      const inThisYear = await manager.exists(AcademicCycleSection, {
        where: {
          id: input.academicCycleSectionId,
          schoolId,
          academicYearId: working.academicYear?.id,
        },
      });
      if (!inThisYear) {
        const terms = await campusTerms(manager, schoolId);
        const message = StudentMessages.notThisYear(terms);
        throw new RuleViolation(message, { academicCycleSectionId: [message] });
      }
      return this.placements.placeIn(manager, {
        enrollmentId: enrollment.id,
        sectionId: input.academicCycleSectionId,
        periodId: working.academicPeriod?.id ?? null,
        actorId,
        reason: input.reason,
        effectiveOn: input.effectiveOn,
      });
    });
  }

  async changeStatus(
    actorId: string,
    schoolId: string,
    id: string,
    input: {
      status: EnrollmentStatus;
      reason?: string | null;
      effectiveOn?: string;
      academicCycleSectionId?: string | null;
    },
  ): Promise<StudentRecord> {
    return this.openEnrollmentRace(() =>
      this.transactions.run(async (tx) => {
        const enrollment = await this.find(tx.manager, schoolId, id);
        return this.statuses.changeIn(tx.manager, {
          enrollmentId: enrollment.id,
          status: input.status,
          actorId,
          reason: input.reason,
          effectiveOn: input.effectiveOn,
          intoSectionId: input.academicCycleSectionId ?? null,
        });
      }),
    );
  }

  // The person's details (UserService::updateUser). A new email is a new
  // way into their account, so only they may change it when they belong to
  // another campus, hold authority beyond this one, or hold more here than
  // the editor.
  async update(
    actorId: string,
    schoolId: string,
    id: string,
    details: StudentDetails,
  ): Promise<StudentRecord> {
    const email = details.email ? normalizeEmail(details.email) : undefined;
    if (email !== undefined) {
      const known = await this.dataSource.manager.findOne(User, {
        where: { email },
        withDeleted: true,
      });
      if (!known && !(await this.emailDomains.canReceiveMail(email))) {
        throw new ValidationFailed({ email: [Messages.emailInvalid] });
      }
    }
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const enrollment = await this.find(manager, schoolId, id);
      const person = await manager.findOneOrFail(User, {
        where: { id: enrollment.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        details.birthday &&
        details.birthday >= (await this.placements.today(manager, schoolId))
      ) {
        throw new ValidationFailed({
          birthday: ['The birthday field must be a date before today.'],
        });
      }
      if (email !== undefined && email !== person.email) {
        if (await belongsToAnotherSchool(manager, person.id, schoolId)) {
          throw new ValidationFailed({
            email: [StudentMessages.emailElsewhere],
          });
        }
        if (
          await this.accountAuthority.holdsPowerBeyond(
            manager,
            person.id,
            schoolId,
          )
        ) {
          throw new ValidationFailed({ email: [StudentMessages.emailBeyond] });
        }
        if (
          actorId !== person.id &&
          (await this.roleAuthority.holdsMoreThan(
            manager,
            person.id,
            actorId,
            schoolId,
          ))
        ) {
          throw new ValidationFailed({
            email: [StudentMessages.emailHoldsMore],
          });
        }
        const taken = await manager.exists(User, {
          where: { email, id: Not(person.id) },
          withDeleted: true,
        });
        if (taken) throw new ValidationFailed({ email: [Messages.emailTaken] });
        person.email = email;
        person.emailVerifiedAt = null;
      }
      for (const field of DETAIL_FIELDS) {
        if (field === 'name' && !details.name) continue;
        if (details[field] !== undefined) {
          (person as unknown as Record<string, unknown>)[field] =
            details[field];
        }
      }
      await manager.save(person);
      return enrollment;
    });
  }

  // Removes a learner from the campus (StudentService::deleteStudent,
  // UserService::deleteUser): an open enrollment is withdrawn, the campus
  // membership ends, and the account is deleted unless the person still
  // belongs to another campus or has access beyond this one.
  async remove(actorId: string, schoolId: string, id: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const enrollment = await this.find(manager, schoolId, id, true);
      if (
        actorId !== enrollment.userId &&
        (await this.roleAuthority.holdsMoreThan(
          manager,
          enrollment.userId,
          actorId,
          schoolId,
        ))
      ) {
        throw new Forbidden(StudentMessages.removeHoldsMore);
      }
      if (isEnrolled(enrollment.status)) {
        await this.statuses.changeIn(manager, {
          enrollmentId: enrollment.id,
          status: 'withdrawn',
          actorId,
          reason: StudentMessages.removed,
        });
      }
      await this.memberships.end(manager, enrollment.userId, schoolId);
      if (
        await this.keepsAccountWhenRemovedHere(
          manager,
          enrollment.userId,
          schoolId,
        )
      ) {
        return;
      }
      const person = await manager.findOneOrFail(User, {
        where: { id: enrollment.userId },
      });
      await this.invitations.revokeIn(manager, person, actorId);
      await this.sessions.revokeAllForUser(manager, person.id);
      await manager.softDelete(User, { id: person.id });
      await this.audit.record(manager, {
        action: AuditAction.AccountDeleted,
        subject: { type: 'user', id: person.id },
        context: { email: person.email, school_id: schoolId },
        schoolId,
      });
    });
  }

  // User::keepsAccountWhenRemovedHere.
  async keepsAccountWhenRemovedHere(
    manager: EntityManager,
    userId: string,
    schoolId: string,
  ): Promise<boolean> {
    return (
      (await belongsToAnotherSchool(manager, userId, schoolId)) ||
      (await this.accountAuthority.holdsPowerBeyond(manager, userId, schoolId))
    );
  }

  private async mustBeAdmissible(
    manager: EntityManager,
    person: User,
    schoolId: string,
  ): Promise<void> {
    const fields = (message: string) => ({ email: [message] });
    if (await holdsRoleHere(manager, person.id, schoolId, 'student')) {
      const message = StudentMessages.alreadyStudent(person.name);
      throw new RuleViolation(message, fields(message));
    }
    if (await worksAsStaff(manager, person.id)) {
      const message = StudentMessages.worksAsStaff(person.name);
      throw new RuleViolation(message, fields(message));
    }
    if (await openEnrollmentElsewhere(manager, person.id, schoolId)) {
      throw new RuleViolation(
        StudentMessages.enrolledElsewhere,
        fields(StudentMessages.enrolledElsewhere),
      );
    }
  }

  private async mustBeAnOpenSectionThisYear(
    manager: EntityManager,
    schoolId: string,
    working: WorkingPeriod,
    sectionId: string,
  ): Promise<void> {
    const section = await manager.findOne(AcademicCycleSection, {
      where: {
        id: sectionId,
        schoolId,
        status: 'active',
        academicYearId: working.academicYear?.id,
      },
    });
    if (!section) {
      throw new RuleViolation(StudentMessages.section, {
        academicCycleSectionId: [StudentMessages.section],
      });
    }
  }

  private numberTaken(
    manager: EntityManager,
    schoolId: string,
    number: string,
  ): Promise<boolean> {
    return manager
      .createQueryBuilder(StudentRecord, 'enrollment')
      .where('enrollment.schoolId = :schoolId', { schoolId })
      .andWhere('lower(enrollment.admissionNumber) = lower(:number)', {
        number,
      })
      .getExists();
  }

  private async generateNumber(
    manager: EntityManager,
    school: School,
    today: string,
  ): Promise<string> {
    for (;;) {
      const candidate = admissionNumber(
        school.initials,
        today,
        randomInt(100000, 1000000),
      );
      if (!(await this.numberTaken(manager, school.id, candidate))) {
        return candidate;
      }
    }
  }

  // Two campuses admitting one learner at the same moment: the index on
  // open enrollments lets one through; the other gets the same refusal as
  // when it came second. The same for an admission number taken meanwhile.
  private async openEnrollmentRace<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (postgresCode(error) !== '23505') throw error;
      const constraint =
        (error as { driverError?: { constraint?: string } }).driverError
          ?.constraint ?? '';
      if (constraint.includes('admission_number')) {
        throw new RuleViolation(StudentMessages.numberTaken, {
          admissionNumber: [StudentMessages.numberTaken],
        });
      }
      throw new RuleViolation(StudentMessages.enrolledElsewhere, {
        email: [StudentMessages.enrolledElsewhere],
      });
    }
  }
}
