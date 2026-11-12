import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { CycleSections } from '../curriculum/cycle-sections.service.js';
import { AcademicCycleSection } from '../curriculum/entities/academic-cycle-section.entity.js';
import { User } from '../identity/entities/user.entity.js';
import { EnrollmentPlacements } from './enrollment-placements.service.js';
import {
  ENROLLMENT_SUBJECT,
  type EnrollmentStatus,
  canMoveEnrollment,
  isClosedEnrollment,
  isEnrolled,
} from './enrollment.constants.js';
import { EnrollmentStatusChange } from './entities/enrollment-status-change.entity.js';
import { StudentRecord } from './entities/student-record.entity.js';
import { openEnrollmentElsewhere, shortDay, worksAsStaff } from './learners.js';

export const StatusMessages = {
  cannotMove: (from: EnrollmentStatus, to: EnrollmentStatus) =>
    `An enrollment cannot move from ${from} to ${to}.`,
  future: (day: string) =>
    `A change of state starts when it is made. Make it on ${shortDay(day)} or choose an earlier day.`,
  intoOpen: 'Only a learner who left can be taken back into a section.',
  attendsElsewhere: (school: string) =>
    `This learner now attends ${school}. Ask that school to move or transfer them.`,
  worksAsStaff: (name: string) =>
    `${name} works as staff. A member of staff cannot be admitted as a learner.`,
  seatGone: (capacity: number) =>
    `Their section is full at ${capacity} learners. Free a seat or raise its size first.`,
} as const;

export interface StatusInput {
  enrollmentId: string;
  status: EnrollmentStatus;
  actorId?: string | null;
  reason?: string | null;
  effectiveOn?: string | null;
  // Re-admission into a section other than the last one.
  intoSectionId?: string | null;
}

// What other parts of the system end when an enrollment closes, inside the
// same transaction (the enrollment.closed event). Later stages register:
// boarding places released, programmes ended (finished on graduation),
// support plans closed, library reservations cancelled, an open campus
// move cancelled, cohorts left except on graduation.
export type EnrollmentCloseHandler = (
  manager: EntityManager,
  enrollment: StudentRecord,
  status: EnrollmentStatus,
  context: {
    actorId: string | null;
    reason: string | null;
    effectiveOn: string;
  },
) => Promise<void>;

// An enrollment's state and its history (reference ChangeEnrollmentStatus).
// The only way an enrollment changes state.
@Injectable()
export class EnrollmentStatuses {
  private readonly closeHandlers: EnrollmentCloseHandler[] = [];

  constructor(
    private readonly transactions: TransactionService,
    private readonly placements: EnrollmentPlacements,
    private readonly sections: CycleSections,
    private readonly audit: AuditService,
  ) {}

  registerCloseHandler(handler: EnrollmentCloseHandler): void {
    this.closeHandlers.push(handler);
  }

  change(input: StatusInput): Promise<StudentRecord> {
    return this.transactions.run((tx) => this.changeIn(tx.manager, input));
  }

  async changeIn(
    manager: EntityManager,
    input: StatusInput,
  ): Promise<StudentRecord> {
    // Held, so two requests changing one enrollment queue up and the second
    // finds the change made.
    let enrollment = await manager.findOneOrFail(StudentRecord, {
      where: { id: input.enrollmentId },
      lock: { mode: 'pessimistic_write' },
    });
    const current = enrollment.status;
    const status = input.status;
    if (current === status) return enrollment;
    if (!canMoveEnrollment(current, status)) {
      throw new RuleViolation(StatusMessages.cannotMove(current, status));
    }
    const today = await this.placements.today(manager, enrollment.schoolId);
    // A leaver whose last day is ahead stays active until that day.
    if (input.effectiveOn && input.effectiveOn > today) {
      throw new RuleViolation(StatusMessages.future(input.effectiveOn));
    }
    if (input.intoSectionId && !isClosedEnrollment(current)) {
      throw new RuleViolation(StatusMessages.intoOpen);
    }
    // Only a learner coming back needs a seat and must not attend elsewhere
    // or work as staff; archiving one who left needs none of that.
    if (isClosedEnrollment(current) && isEnrolled(status)) {
      await this.refuseReturnThatDoesNotFit(manager, enrollment, input);
    }

    const effectiveOn = input.effectiveOn ?? today;
    const reason = input.reason?.trim() || null;
    enrollment.status = status;
    enrollment = await manager.save(enrollment);
    await manager.insert(EnrollmentStatusChange, {
      studentRecordId: enrollment.id,
      fromStatus: current,
      toStatus: status,
      effectiveOn,
      changedById: input.actorId ?? null,
      reason,
    });
    if (input.intoSectionId) {
      enrollment = await this.placements.placeIn(manager, {
        enrollmentId: enrollment.id,
        sectionId: input.intoSectionId,
        actorId: input.actorId,
        reason,
        effectiveOn: input.effectiveOn,
      });
    }
    if (isClosedEnrollment(status)) {
      for (const handler of this.closeHandlers) {
        await handler(manager, enrollment, status, {
          actorId: input.actorId ?? null,
          reason,
          effectiveOn,
        });
      }
    }
    await this.audit.record(manager, {
      action: AuditAction.EnrollmentStatusChanged,
      subject: { type: ENROLLMENT_SUBJECT, id: enrollment.id },
      context: { from: current, to: status, reason },
      schoolId: enrollment.schoolId,
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
    });
    return enrollment;
  }

  // Taking a learner back: they must not attend elsewhere now or work as
  // staff, and their section must still have a seat unless they return
  // into another one (which the placement checks).
  private async refuseReturnThatDoesNotFit(
    manager: EntityManager,
    enrollment: StudentRecord,
    input: StatusInput,
  ): Promise<void> {
    const elsewhere = await openEnrollmentElsewhere(
      manager,
      enrollment.userId,
      enrollment.schoolId,
    );
    if (elsewhere) {
      throw new RuleViolation(
        StatusMessages.attendsElsewhere(elsewhere.schoolName),
      );
    }
    if (await worksAsStaff(manager, enrollment.userId)) {
      const person = await manager.findOneOrFail(User, {
        where: { id: enrollment.userId },
        withDeleted: true,
      });
      throw new RuleViolation(StatusMessages.worksAsStaff(person.name));
    }
    if (input.intoSectionId || !enrollment.academicCycleSectionId) return;
    const section = await manager.findOne(AcademicCycleSection, {
      where: { id: enrollment.academicCycleSectionId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      section &&
      section.capacity !== null &&
      (await this.sections.seatsTaken(manager, section)) >= section.capacity
    ) {
      throw new RuleViolation(StatusMessages.seatGone(section.capacity));
    }
  }
}
