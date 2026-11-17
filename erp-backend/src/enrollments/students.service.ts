import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { WorkingPeriod } from '../academic/academic-period-context.service.js';
import { Forbidden } from '../access/access.constants.js';
import { RoleAssignments } from '../access/role-assignments.service.js';
import { RoleAuthority } from '../access/role-authority.service.js';
import { Accounts, PersonMessages } from '../accounts/accounts.service.js';
import type { ProvisionAccountDto } from '../accounts/accounts.dto.js';
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
import { type CampusTerms, campusTerms } from '../curriculum/campus-terms.js';
import { AcademicCycleSection } from '../curriculum/entities/academic-cycle-section.entity.js';
import { User } from '../identity/entities/user.entity.js';
import { normalizeEmail } from '../identity/identity.constants.js';
import { InvitationService } from '../identity/invitations/invitation.service.js';
import { School } from '../organizations/entities/school.entity.js';
import { EnrollmentPlacements } from './enrollment-placements.service.js';
import { EnrollmentStatuses } from './enrollment-statuses.service.js';
import { type EnrollmentStatus, isEnrolled } from './enrollment.constants.js';
import { StudentRecord } from './entities/student-record.entity.js';
import { LINKED_LEARNERS } from './guardian-links.service.js';
import {
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
  emailElsewhere: PersonMessages.emailElsewhere,
  emailBeyond: PersonMessages.emailBeyond,
  emailHoldsMore: PersonMessages.emailHoldsMore,
  removeHoldsMore: PersonMessages.removeHoldsMore,
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
  // Only the learners this guardian is linked to.
  childrenOf?: string;
}

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
    private readonly roleAssignments: RoleAssignments,
    private readonly roleAuthority: RoleAuthority,
    private readonly placements: EnrollmentPlacements,
    private readonly statuses: EnrollmentStatuses,
    private readonly invitations: InvitationService,
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
    if (query.childrenOf) {
      qb.andWhere(`enrollment.userId IN (${LINKED_LEARNERS})`, {
        guardianId: query.childrenOf,
      });
    }
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
    await this.accounts.checkNewEmail(details.email);
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const enrollment = await this.find(manager, schoolId, id);
      const person = await manager.findOneOrFail(User, {
        where: { id: enrollment.userId },
        lock: { mode: 'pessimistic_write' },
      });
      await this.accounts.updateDetailsIn(
        manager,
        actorId,
        schoolId,
        person,
        details,
        await this.placements.today(manager, schoolId),
      );
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
      await this.accounts.removeFromCampusIn(
        manager,
        actorId,
        schoolId,
        enrollment.userId,
      );
    });
  }

  // User::keepsAccountWhenRemovedHere.
  keepsAccountWhenRemovedHere(
    manager: EntityManager,
    userId: string,
    schoolId: string,
  ): Promise<boolean> {
    return this.accounts.keepsAccountWhenRemovedHere(manager, userId, schoolId);
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

  // A free admission number at the campus: initials, the campus year and
  // six random digits.
  async generateNumber(
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
