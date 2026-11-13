import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { isFrozen } from '../academic/academic.constants.js';
import { AcademicPeriod } from '../academic/entities/academic-period.entity.js';
import { AcademicYear } from '../academic/entities/academic-year.entity.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { type CampusTerms, campusTerms } from '../curriculum/campus-terms.js';
import { CycleSections } from '../curriculum/cycle-sections.service.js';
import { AcademicCycleSection } from '../curriculum/entities/academic-cycle-section.entity.js';
import { School } from '../organizations/entities/school.entity.js';
import {
  ENROLLMENT_SUBJECT,
  isClosedEnrollment,
} from './enrollment.constants.js';
import { EnrollmentPlacement } from './entities/enrollment-placement.entity.js';
import { StudentRecord } from './entities/student-record.entity.js';

export const PlacementMessages = {
  closed: 'This enrollment is closed. It cannot take a new placement.',
  otherSchool: (t: CampusTerms) =>
    `That ${t.section} belongs to another school.`,
  yearClosed:
    'The academic year is closed. Reopen it before you move a student.',
  inactive: (t: CampusTerms) =>
    `Activate the ${t.section} before placing a student in it.`,
  periodOutside: (t: CampusTerms) =>
    `That ${t.period} is not part of the ${t.section}’s ${t.academicYear}.`,
  future: 'A new place starts when it is made. Choose today or an earlier day.',
  full: (t: CampusTerms, capacity: number) =>
    `The ${t.section} is full at ${capacity} seats, counting open waitlist offers. Add the candidate to its admission waitlist instead.`,
} as const;

export interface PlaceInput {
  enrollmentId: string;
  sectionId: string;
  periodId?: string | null;
  actorId?: string | null;
  reason?: string | null;
  effectiveOn?: string | null;
}

// Where a learner sits, and the history of it (reference
// ChangeEnrollmentPlacement). The only way an enrollment changes section.
@Injectable()
export class EnrollmentPlacements {
  constructor(
    private readonly transactions: TransactionService,
    private readonly sections: CycleSections,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  place(input: PlaceInput): Promise<StudentRecord> {
    return this.transactions.run((tx) => this.placeIn(tx.manager, input));
  }

  // Inside the caller's transaction. The enrollment and the section are
  // held until it ends, so two placements into the last seat queue up and
  // the second finds the section full.
  async placeIn(
    manager: EntityManager,
    input: PlaceInput,
  ): Promise<StudentRecord> {
    const enrollment = await manager.findOneOrFail(StudentRecord, {
      where: { id: input.enrollmentId },
      lock: { mode: 'pessimistic_write' },
    });
    const section = await manager.findOneOrFail(AcademicCycleSection, {
      where: { id: input.sectionId },
      lock: { mode: 'pessimistic_write' },
    });
    const year = await manager.findOneOrFail(AcademicYear, {
      where: { id: section.academicYearId },
    });
    const terms = await campusTerms(manager, enrollment.schoolId);
    const period = input.periodId
      ? await manager.findOneOrFail(AcademicPeriod, {
          where: { id: input.periodId },
        })
      : null;

    if (isClosedEnrollment(enrollment.status)) {
      throw new RuleViolation(PlacementMessages.closed);
    }
    if (section.schoolId !== enrollment.schoolId) {
      throw new RuleViolation(PlacementMessages.otherSchool(terms));
    }
    if (isFrozen(year.status)) {
      throw new RuleViolation(PlacementMessages.yearClosed);
    }
    if (section.status !== 'active') {
      throw new RuleViolation(PlacementMessages.inactive(terms));
    }
    if (period && period.academicYearId !== section.academicYearId) {
      throw new RuleViolation(PlacementMessages.periodOutside(terms));
    }
    const today = await this.today(manager, enrollment.schoolId);
    if (input.effectiveOn && input.effectiveOn > today) {
      throw new RuleViolation(PlacementMessages.future);
    }
    // The same place is not a move. Record nothing.
    if (enrollment.academicCycleSectionId === section.id) return enrollment;
    // An offered seat is taken, so a learner placed another way cannot
    // fill it before the family answers.
    if (
      section.capacity !== null &&
      (await this.sections.seatsTaken(manager, section)) >= section.capacity
    ) {
      throw new RuleViolation(PlacementMessages.full(terms, section.capacity));
    }

    await manager.insert(EnrollmentPlacement, {
      studentRecordId: enrollment.id,
      academicYearId: year.id,
      academicPeriodId: period?.id ?? null,
      academicCycleSectionId: section.id,
      effectiveOn: input.effectiveOn ?? today,
      changedById: input.actorId ?? null,
      reason: input.reason?.trim() || null,
    });
    enrollment.academicCycleSectionId = section.id;
    const saved = await manager.save(enrollment);
    await manager.query(
      `INSERT INTO academic_year_student_records (student_record_id, academic_year_id, academic_cycle_section_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (student_record_id, academic_year_id)
       DO UPDATE SET academic_cycle_section_id = EXCLUDED.academic_cycle_section_id, updated_at = now()`,
      [enrollment.id, year.id, section.id],
    );
    await this.audit.record(manager, {
      action: AuditAction.EnrollmentPlaced,
      subject: { type: ENROLLMENT_SUBJECT, id: enrollment.id },
      context: {
        academic_year_id: year.id,
        academic_cycle_section_id: section.id,
        reason: input.reason?.trim() || null,
      },
      schoolId: enrollment.schoolId,
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
    });
    return saved;
  }

  async today(manager: EntityManager, schoolId: string): Promise<string> {
    const school = await manager.findOneOrFail(School, {
      where: { id: schoolId },
    });
    return this.clock.schoolToday(school.timezone);
  }
}
