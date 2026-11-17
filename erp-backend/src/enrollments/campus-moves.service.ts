import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager, In, Not } from 'typeorm';
import {
  Forbidden,
  OrganizationPermission,
} from '../access/access.constants.js';
import { PermissionResolver } from '../access/permission-resolver.service.js';
import { RoleAssignments } from '../access/role-assignments.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { TransactionService } from '../common/database/transaction.service.js';
import {
  RuleViolation,
  ValidationFailed,
} from '../common/errors/api-exception.js';
import { postgresCode } from '../common/errors/error-response.js';
import { findInSchool } from '../common/tenancy/school-scope.js';
import { AcademicCycleSection } from '../curriculum/entities/academic-cycle-section.entity.js';
import { School } from '../organizations/entities/school.entity.js';
import { SchoolMembership } from '../organizations/entities/school-membership.entity.js';
import { OrganizationAccess } from '../organizations/organization-access.service.js';
import { SchoolMemberships } from '../organizations/school-memberships.service.js';
import {
  EnrollmentPlacements,
  PlacementMessages,
} from './enrollment-placements.service.js';
import {
  ENROLLMENT_SUBJECT,
  isClosedEnrollment,
} from './enrollment.constants.js';
import { CampusMoveRequest } from './entities/campus-move-request.entity.js';
import { StudentRecord } from './entities/student-record.entity.js';
import {
  CAMPUS_MOVE_SUBJECT,
  type CampusMoveStatus,
  canDecideCampusMove,
} from './moving.constants.js';
import { STUDENT_NOT_FOUND } from './students.service.js';

export const CAMPUS_MOVE_NOT_FOUND = 'Campus move request not found.';

export const CampusMoveMessages = {
  closed: 'This enrollment is closed. It cannot move to another campus.',
  sameCampus:
    'The student already attends that campus. Change the placement instead.',
  otherOrganization:
    'The two campuses belong to different organizations. Transfer the enrollment instead.',
  numberTaken: (campus: string, number: string) =>
    `${campus} already has a learner with admission number ${number}. Change one of the numbers first.`,
  openRequest: 'This student already has a campus move waiting for a decision.',
  cannotMove: (from: CampusMoveStatus, to: CampusMoveStatus) =>
    `A campus move request cannot move from ${from} to ${to}.`,
  leftAskingCampus:
    'The student no longer attends the campus that asked. Reject this request, and ask their current campus to ask again.',
  notSibling: 'That section does not belong to a campus of this organization.',
  notAllowed: 'You cannot move a student to another campus.',
} as const;

// Who may move a learner between campuses (reference CampusMoveAuthority):
// the organization permission "move students between campuses" moves at
// once; otherwise "request campus move" at the learner's campus asks, and
// "approve campus move" at the receiving campus decides. A campus other
// than the working one counts only where the person is an active member.
@Injectable()
export class CampusMoveAuthority {
  constructor(
    private readonly organizations: OrganizationAccess,
    private readonly resolver: PermissionResolver,
  ) {}

  movesFreely(
    manager: EntityManager,
    userId: string,
    campus: School,
  ): Promise<boolean> {
    return this.organizations.allows(
      manager,
      userId,
      campus.organizationId,
      OrganizationPermission.MoveStudents,
    );
  }

  canRequest(
    manager: EntityManager,
    userId: string,
    campus: School,
  ): Promise<boolean> {
    return this.allowsAt(manager, userId, campus, 'request campus move');
  }

  async canDecideAt(
    manager: EntityManager,
    userId: string,
    campus: School,
  ): Promise<boolean> {
    return (
      (await this.movesFreely(manager, userId, campus)) ||
      this.allowsAt(manager, userId, campus, 'approve campus move')
    );
  }

  async canCancel(
    manager: EntityManager,
    userId: string,
    request: { fromSchool: School; toSchool: School },
  ): Promise<boolean> {
    return (
      (await this.movesFreely(manager, userId, request.toSchool)) ||
      this.canRequest(manager, userId, request.fromSchool)
    );
  }

  private async allowsAt(
    manager: EntityManager,
    userId: string,
    campus: School,
    permission: string,
  ): Promise<boolean> {
    const member = await manager.exists(SchoolMembership, {
      where: { userId, schoolId: campus.id, status: 'active' },
    });
    if (!member) return false;
    return (
      await this.resolver.campusPermissions(userId, campus.id, manager)
    ).has(permission);
  }
}

export interface MoveInput {
  enrollmentId: string;
  sectionId: string;
  actorId: string | null;
  reason?: string | null;
  effectiveOn?: string | null;
}

// What else follows a learner to another campus, inside the move's
// transaction (reference MoveEnrollmentBetweenCampuses). Later stages
// register: the boarding place released, programmes and cohorts left,
// reservations cancelled and support plans closed at the old campus, and
// the balance carried when the campuses bill together. The enrollment is
// already at the destination, with its new placement.
export type CampusMoveHandler = (
  manager: EntityManager,
  enrollment: StudentRecord,
  context: {
    source: School;
    destination: School;
    effectiveOn: string;
    actorId: string | null;
    reason: string | null;
  },
) => Promise<void>;

// Moving a learner to another campus of the organization (reference
// MoveEnrollmentBetweenCampuses, RequestCampusMove). A move keeps the one
// enrollment, its admission number and history, and adds a placement at
// the new campus. The learner joins the new campus and keeps the old
// membership, so the old campus still reads what they did there.
@Injectable()
export class CampusMoves {
  private readonly moveHandlers: CampusMoveHandler[] = [];

  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly authority: CampusMoveAuthority,
    private readonly placements: EnrollmentPlacements,
    private readonly memberships: SchoolMemberships,
    private readonly roles: RoleAssignments,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  registerMoveHandler(handler: CampusMoveHandler): void {
    this.moveHandlers.push(handler);
  }

  // The sections a learner of this campus could move to: active sections
  // of the current school year of each other campus of the organization.
  async destinations(
    actorId: string,
    campus: School,
  ): Promise<AcademicCycleSection[]> {
    const manager = this.dataSource.manager;
    await this.mustBeAbleToMoveFrom(manager, actorId, campus);
    return this.siblingSections(manager, campus).getMany();
  }

  // From the learner's campus: moves now with organization authority,
  // otherwise asks the receiving campus.
  async moveOrRequest(
    actorId: string,
    campus: School,
    enrollmentId: string,
    input: {
      academicCycleSectionId: string;
      reason?: string | null;
      effectiveOn?: string | null;
    },
  ): Promise<{
    enrollment: StudentRecord | null;
    request: CampusMoveRequest | null;
  }> {
    const manager = this.dataSource.manager;
    const enrollment = await findInSchool(
      manager,
      StudentRecord,
      { id: enrollmentId },
      { schoolId: campus.id, notFound: STUDENT_NOT_FOUND },
    );
    const section = await this.siblingSections(manager, campus)
      .andWhere('section.id = :id', { id: input.academicCycleSectionId })
      .getOne();
    if (!section) {
      throw new ValidationFailed({
        academicCycleSectionId: [CampusMoveMessages.notSibling],
      });
    }
    const today = this.clock.schoolToday(campus.timezone);
    if (input.effectiveOn && input.effectiveOn > today) {
      throw new ValidationFailed({ effectiveOn: [PlacementMessages.future] });
    }
    const reason = input.reason?.trim() || null;
    const destination = await manager.findOneOrFail(School, {
      where: { id: section.schoolId },
    });
    if (await this.authority.movesFreely(manager, actorId, destination)) {
      const moved = await this.transactions.run((tx) =>
        this.moveIn(tx.manager, {
          enrollmentId: enrollment.id,
          sectionId: section.id,
          actorId,
          reason,
          effectiveOn: input.effectiveOn ?? null,
        }),
      );
      return { enrollment: moved, request: null };
    }
    if (!(await this.authority.canRequest(manager, actorId, campus))) {
      throw new Forbidden(CampusMoveMessages.notAllowed);
    }
    const request = await this.request(actorId, enrollment.id, section.id, {
      reason,
      effectiveOn: input.effectiveOn ?? today,
    });
    return { enrollment: null, request };
  }

  // The open requests a campus sends and receives.
  async open(
    actorId: string,
    campus: School,
  ): Promise<{ incoming: CampusMoveRequest[]; outgoing: CampusMoveRequest[] }> {
    const manager = this.dataSource.manager;
    const allowed =
      (await this.authority.canDecideAt(manager, actorId, campus)) ||
      (await this.authority.canRequest(manager, actorId, campus));
    if (!allowed) throw new Forbidden();
    const find = (side: 'toSchoolId' | 'fromSchoolId') =>
      manager.find(CampusMoveRequest, {
        where: { [side]: campus.id, status: 'requested' },
        relations: {
          studentRecord: { user: true },
          fromSchool: true,
          toSchool: true,
          academicCycleSection: true,
          requestedBy: true,
        },
        withDeleted: true,
        order: { createdAt: 'DESC' },
      });
    return {
      incoming: await find('toSchoolId'),
      outgoing: await find('fromSchoolId'),
    };
  }

  async decide(
    actorId: string,
    campus: School,
    id: string,
    decision: 'approve' | 'reject' | 'cancel',
    note: string | null,
  ): Promise<CampusMoveRequest> {
    const manager = this.dataSource.manager;
    const request = await manager.findOne(CampusMoveRequest, {
      where: [
        { id, toSchoolId: campus.id },
        { id, fromSchoolId: campus.id },
      ],
      relations: { fromSchool: true, toSchool: true },
    });
    if (!request) throw new NotFoundException(CAMPUS_MOVE_NOT_FOUND);
    const allowed =
      decision === 'cancel'
        ? await this.authority.canCancel(manager, actorId, request)
        : await this.authority.canDecideAt(manager, actorId, request.toSchool);
    if (!allowed) throw new Forbidden();
    const text = note?.trim() || null;
    if (decision === 'approve') return this.approve(actorId, id, text);
    return this.transactions.run(async (tx) =>
      this.writeDecision(
        tx.manager,
        await this.lockRequest(tx.manager, id),
        decision === 'reject' ? 'rejected' : 'cancelled',
        actorId,
        text,
      ),
    );
  }

  // A request with what its screen shows.
  find(id: string): Promise<CampusMoveRequest> {
    return this.dataSource.manager.findOneOrFail(CampusMoveRequest, {
      where: { id },
      relations: {
        studentRecord: { user: true },
        fromSchool: true,
        toSchool: true,
        requestedBy: true,
      },
      withDeleted: true,
    });
  }

  async campusNames(ids: string[]): Promise<Map<string, string>> {
    const schools = await this.dataSource.manager.find(School, {
      where: { id: In([...new Set(ids)]) },
    });
    return new Map(schools.map((school) => [school.id, school.name]));
  }

  // Asks the receiving campus to take the learner.
  async request(
    actorId: string | null,
    enrollmentId: string,
    sectionId: string,
    input: { reason?: string | null; effectiveOn: string },
  ): Promise<CampusMoveRequest> {
    try {
      return await this.transactions.run(async (tx) => {
        const manager = tx.manager;
        // Two requests sent at the same moment wait for each other here,
        // so the second one sees the first.
        const enrollment = await manager.findOneOrFail(StudentRecord, {
          where: { id: enrollmentId },
          lock: { mode: 'pessimistic_write' },
        });
        const section = await manager.findOneOrFail(AcademicCycleSection, {
          where: { id: sectionId },
        });
        const [source, destination] = await this.campuses(
          manager,
          enrollment.schoolId,
          section.schoolId,
        );
        await this.refuseMoveThatCannotBeMade(
          manager,
          enrollment,
          source,
          destination,
        );
        if (await this.openRequestFor(manager, enrollment.id)) {
          throw new RuleViolation(CampusMoveMessages.openRequest);
        }
        const request = await manager.save(
          manager.create(CampusMoveRequest, {
            studentRecordId: enrollment.id,
            fromSchoolId: source.id,
            toSchoolId: destination.id,
            academicCycleSectionId: section.id,
            status: 'requested',
            reason: input.reason ?? null,
            effectiveOn: input.effectiveOn,
            requestedById: actorId,
          }),
        );
        await this.audit.record(manager, {
          action: AuditAction.CampusMoveRequested,
          subject: { type: CAMPUS_MOVE_SUBJECT, id: request.id },
          context: {
            student_record_id: enrollment.id,
            from_school_id: source.id,
            to_school_id: destination.id,
            reason: input.reason ?? null,
          },
          schoolId: destination.id,
          actorId,
        });
        return request;
      });
    } catch (error) {
      // The index on open requests turns away a request that raced past
      // the lock.
      if (postgresCode(error) === '23505') {
        throw new RuleViolation(CampusMoveMessages.openRequest);
      }
      throw error;
    }
  }

  // Approving moves the learner in the same transaction, so there is no
  // approved-but-unmoved state.
  async approve(
    actorId: string | null,
    id: string,
    note: string | null,
  ): Promise<CampusMoveRequest> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const request = await this.lockRequest(manager, id);
      this.mustBeAbleToBecome(request, 'approved');
      const enrollment = await manager.findOneOrFail(StudentRecord, {
        where: { id: request.studentRecordId },
      });
      if (enrollment.schoolId !== request.fromSchoolId) {
        throw new RuleViolation(CampusMoveMessages.leftAskingCampus);
      }
      const destination = await manager.findOneOrFail(School, {
        where: { id: request.toSchoolId },
      });
      // Approving early moves the learner now, so the move starts today.
      const today = this.clock.schoolToday(destination.timezone);
      await this.moveIn(manager, {
        enrollmentId: enrollment.id,
        sectionId: request.academicCycleSectionId,
        actorId,
        reason: request.reason,
        effectiveOn: request.effectiveOn > today ? today : request.effectiveOn,
      });
      return this.writeDecision(manager, request, 'approved', actorId, note);
    });
  }

  // An enrollment that closes can never move: its open request is taken
  // back (registered as an enrollment close handler).
  async cancelOpenIn(
    manager: EntityManager,
    enrollmentId: string,
    actorId: string | null,
    note: string,
  ): Promise<void> {
    const waiting = await this.openRequestFor(manager, enrollmentId);
    if (!waiting) return;
    await this.writeDecision(
      manager,
      await this.lockRequest(manager, waiting.id),
      'cancelled',
      actorId,
      note,
    );
  }

  // The move itself, inside the caller's transaction.
  async moveIn(
    manager: EntityManager,
    input: MoveInput,
  ): Promise<StudentRecord> {
    const enrollment = await manager.findOneOrFail(StudentRecord, {
      where: { id: input.enrollmentId },
      lock: { mode: 'pessimistic_write' },
    });
    const section = await manager.findOneOrFail(AcademicCycleSection, {
      where: { id: input.sectionId },
      lock: { mode: 'pessimistic_write' },
    });
    const [source, destination] = await this.campuses(
      manager,
      enrollment.schoolId,
      section.schoolId,
    );
    await this.refuseMoveThatCannotBeMade(
      manager,
      enrollment,
      source,
      destination,
    );

    // The learner needs access to the campus they now attend; the old
    // membership stays.
    await this.memberships.grant(manager, enrollment.userId, destination.id);
    await this.roles.giveFamilyRole(manager, {
      userId: enrollment.userId,
      roleName: 'student',
      schoolId: destination.id,
    });

    enrollment.schoolId = destination.id;
    await manager.save(enrollment);
    // The placement owns the history, and now sees one enrollment and one
    // section inside the same campus.
    const moved = await this.placements.placeIn(manager, {
      enrollmentId: enrollment.id,
      sectionId: section.id,
      actorId: input.actorId,
      reason: input.reason ?? null,
      effectiveOn: input.effectiveOn ?? null,
    });
    for (const handler of this.moveHandlers) {
      await handler(manager, moved, {
        source,
        destination,
        effectiveOn:
          input.effectiveOn ?? this.clock.schoolToday(destination.timezone),
        actorId: input.actorId,
        reason: input.reason ?? null,
      });
    }
    await this.audit.record(manager, {
      action: AuditAction.EnrollmentCampusChanged,
      subject: { type: ENROLLMENT_SUBJECT, id: enrollment.id },
      context: {
        from_school_id: source.id,
        to_school_id: destination.id,
        organization_id: destination.organizationId,
        academic_cycle_section_id: section.id,
        reason: input.reason ?? null,
      },
      schoolId: destination.id,
      actorId: input.actorId,
    });
    return moved;
  }

  private async mustBeAbleToMoveFrom(
    manager: EntityManager,
    actorId: string,
    campus: School,
  ): Promise<void> {
    const siblings = await manager.find(School, {
      where: { organizationId: campus.organizationId, id: Not(campus.id) },
    });
    for (const sibling of siblings) {
      if (await this.authority.movesFreely(manager, actorId, sibling)) return;
    }
    if (await this.authority.canRequest(manager, actorId, campus)) return;
    throw new Forbidden(CampusMoveMessages.notAllowed);
  }

  private siblingSections(manager: EntityManager, campus: School) {
    return manager
      .createQueryBuilder(AcademicCycleSection, 'section')
      .innerJoin(School, 'school', 'school.id = section.schoolId')
      .where('school.organizationId = :organizationId', {
        organizationId: campus.organizationId,
      })
      .andWhere('school.id <> :campusId', { campusId: campus.id })
      .andWhere('section.academicYearId = school.academicYearId')
      .andWhere("section.status = 'active'")
      .orderBy('section.schoolId')
      .addOrderBy('section.position')
      .addOrderBy('section.name');
  }

  private async campuses(
    manager: EntityManager,
    sourceId: string,
    destinationId: string,
  ): Promise<[School, School]> {
    const schools = await manager.find(School, {
      where: { id: In([sourceId, destinationId]) },
    });
    const find = (id: string) => schools.find((school) => school.id === id)!;
    return [find(sourceId), find(destinationId)];
  }

  private async refuseMoveThatCannotBeMade(
    manager: EntityManager,
    enrollment: StudentRecord,
    source: School,
    destination: School,
  ): Promise<void> {
    if (isClosedEnrollment(enrollment.status)) {
      throw new RuleViolation(CampusMoveMessages.closed);
    }
    if (source.id === destination.id) {
      throw new RuleViolation(CampusMoveMessages.sameCampus);
    }
    if (source.organizationId !== destination.organizationId) {
      throw new RuleViolation(CampusMoveMessages.otherOrganization);
    }
    const numberTaken = await manager
      .createQueryBuilder(StudentRecord, 'other')
      .where('other.schoolId = :schoolId', { schoolId: destination.id })
      .andWhere('lower(other.admissionNumber) = lower(:number)', {
        number: enrollment.admissionNumber,
      })
      .andWhere('other.id <> :id', { id: enrollment.id })
      .getExists();
    if (numberTaken) {
      throw new RuleViolation(
        CampusMoveMessages.numberTaken(
          destination.name,
          enrollment.admissionNumber,
        ),
      );
    }
  }

  private openRequestFor(
    manager: EntityManager,
    enrollmentId: string,
  ): Promise<CampusMoveRequest | null> {
    return manager.findOne(CampusMoveRequest, {
      where: { studentRecordId: enrollmentId, status: 'requested' },
      order: { createdAt: 'DESC' },
    });
  }

  private lockRequest(
    manager: EntityManager,
    id: string,
  ): Promise<CampusMoveRequest> {
    return manager.findOneOrFail(CampusMoveRequest, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private mustBeAbleToBecome(
    request: CampusMoveRequest,
    status: CampusMoveStatus,
  ): void {
    if (!canDecideCampusMove(request.status, status)) {
      throw new RuleViolation(
        CampusMoveMessages.cannotMove(request.status, status),
      );
    }
  }

  private async writeDecision(
    manager: EntityManager,
    request: CampusMoveRequest,
    status: CampusMoveStatus,
    actorId: string | null,
    note: string | null,
  ): Promise<CampusMoveRequest> {
    const current = request.status;
    this.mustBeAbleToBecome(request, status);
    request.status = status;
    request.decidedById = actorId;
    request.decidedAt = this.clock.now();
    request.decisionNote = note ?? request.decisionNote;
    const saved = await manager.save(request);
    await this.audit.record(manager, {
      action: AuditAction.CampusMoveStatusChanged,
      subject: { type: CAMPUS_MOVE_SUBJECT, id: request.id },
      context: { from: current, to: status, note },
      schoolId: request.toSchoolId,
      actorId,
    });
    return saved;
  }
}
