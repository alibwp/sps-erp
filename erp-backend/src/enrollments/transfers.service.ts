import { Injectable, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { RoleAssignments } from '../access/role-assignments.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { newInSchool } from '../common/tenancy/school-scope.js';
import { CAMPUS_NOT_FOUND } from '../organizations/campuses.service.js';
import { School } from '../organizations/entities/school.entity.js';
import { SchoolMemberships } from '../organizations/school-memberships.service.js';
import { EnrollmentPlacements } from './enrollment-placements.service.js';
import { EnrollmentStatuses } from './enrollment-statuses.service.js';
import {
  ENROLLED_STATUSES,
  ENROLLMENT_SUBJECT,
  isClosedEnrollment,
} from './enrollment.constants.js';
import { StudentRecord } from './entities/student-record.entity.js';
import { Students } from './students.service.js';

export const TransferMessages = {
  sameSchool: 'The student is already enrolled in that school.',
  sameOrganization:
    'Both schools are campuses of one organization. Move the enrollment between campuses instead.',
  closed: 'This enrollment is closed and cannot be transferred.',
  alreadyTransferred: (school: string) =>
    `This enrollment was already transferred to ${school}. Ask that school to transfer the learner on.`,
  alreadyThere: (school: string) =>
    `The learner is already enrolled at ${school}.`,
} as const;

export interface TransferInput {
  enrollmentId: string;
  destinationSchoolId: string;
  sectionId?: string | null;
  actorId?: string | null;
  reason?: string | null;
}

// A learner leaving for a school of another organization (reference
// TransferEnrollment). The old enrollment closes as transferred before the
// new one opens at the destination, linked by transferred_from_id, in one
// transaction, so the index on open enrollments always holds. No route
// starts it yet: the reference has none either.
@Injectable()
export class Transfers {
  constructor(
    private readonly transactions: TransactionService,
    private readonly statuses: EnrollmentStatuses,
    private readonly placements: EnrollmentPlacements,
    private readonly memberships: SchoolMemberships,
    private readonly roles: RoleAssignments,
    private readonly students: Students,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  transfer(input: TransferInput): Promise<StudentRecord> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      // A retry, or a second click at the same moment, waits here and then
      // finds the enrollment the first one opened.
      const enrollment = await manager.findOneOrFail(StudentRecord, {
        where: { id: input.enrollmentId },
        lock: { mode: 'pessimistic_write' },
      });
      const schools = await manager.find(School, {
        where: { id: In([enrollment.schoolId, input.destinationSchoolId]) },
      });
      const source = schools.find((s) => s.id === enrollment.schoolId)!;
      const destination = schools.find(
        (s) => s.id === input.destinationSchoolId,
      );
      if (!destination) throw new NotFoundException(CAMPUS_NOT_FOUND);
      if (source.id === destination.id) {
        throw new RuleViolation(TransferMessages.sameSchool);
      }
      if (source.organizationId === destination.organizationId) {
        throw new RuleViolation(TransferMessages.sameOrganization);
      }
      if (
        isClosedEnrollment(enrollment.status) &&
        enrollment.status !== 'transferred'
      ) {
        throw new RuleViolation(TransferMessages.closed);
      }

      const successor = await manager.findOne(StudentRecord, {
        where: { transferredFromId: enrollment.id },
      });
      if (successor?.schoolId === destination.id) return successor;
      if (successor) {
        const there = await manager.findOneOrFail(School, {
          where: { id: successor.schoolId },
        });
        throw new RuleViolation(
          TransferMessages.alreadyTransferred(there.name),
        );
      }
      const alreadyThere = await manager.exists(StudentRecord, {
        where: {
          userId: enrollment.userId,
          schoolId: destination.id,
          status: In([...ENROLLED_STATUSES]),
        },
      });
      if (alreadyThere) {
        throw new RuleViolation(
          TransferMessages.alreadyThere(destination.name),
        );
      }

      const reason = input.reason?.trim() || null;
      const closed = await this.statuses.changeIn(manager, {
        enrollmentId: enrollment.id,
        status: 'transferred',
        actorId: input.actorId,
        reason,
      });
      // Only one enrollment leads the screens, and it is the new one.
      closed.isPrimary = false;
      await manager.save(closed);

      const today = this.clock.schoolToday(destination.timezone);
      let transferred = await manager.save(
        newInSchool(
          manager,
          StudentRecord,
          {
            userId: enrollment.userId,
            status: 'active',
            isPrimary: true,
            transferredFromId: enrollment.id,
            admissionNumber: await this.students.generateNumber(
              manager,
              destination,
              today,
            ),
            admissionDate: today,
          },
          { schoolId: destination.id },
        ),
      );

      // The person needs access to the school they now attend.
      await this.memberships.grant(manager, enrollment.userId, destination.id);
      await this.roles.giveFamilyRole(manager, {
        userId: enrollment.userId,
        roleName: 'student',
        schoolId: destination.id,
      });

      if (input.sectionId) {
        transferred = await this.placements.placeIn(manager, {
          enrollmentId: transferred.id,
          sectionId: input.sectionId,
          actorId: input.actorId,
          reason,
        });
      }

      await this.audit.record(manager, {
        action: AuditAction.EnrollmentTransferred,
        subject: { type: ENROLLMENT_SUBJECT, id: transferred.id },
        context: {
          from_school_id: source.id,
          to_school_id: destination.id,
          from_enrollment_id: enrollment.id,
          reason,
        },
        schoolId: destination.id,
        ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      });
      return transferred;
    });
  }
}
