import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { findInSchool, newInSchool } from '../common/tenancy/school-scope.js';
import { SECTION_NOT_FOUND } from '../curriculum/cycle-sections.service.js';
import { AcademicCycleSection } from '../curriculum/entities/academic-cycle-section.entity.js';
import { EnrollmentPlacements } from './enrollment-placements.service.js';
import { EnrollmentStatuses } from './enrollment-statuses.service.js';
import { isClosedEnrollment } from './enrollment.constants.js';
import { Promotion } from './entities/promotion.entity.js';
import { StudentRecord } from './entities/student-record.entity.js';
import { STUDENT_NOT_FOUND } from './students.service.js';

export const PROMOTION_NOT_FOUND = 'Promotion not found.';
export const PROMOTION_REASON = 'Promotion';
export const PROMOTION_RESET_REASON = 'Promotion reset';

export const MovingMessages = {
  sameSection: 'Choose a destination other than the current section.',
  noneInSection:
    'None of the chosen learners are still in this section. They may have been moved already.',
  noneActive:
    'None of the chosen learners are still active in this section. They may have graduated already.',
} as const;

// Promotions and graduations of a section's learners (reference
// StudentService::promoteStudents, resetPromotion, graduateStudents,
// resetGraduation). The section is locked, so a second click on a page
// left open finds the learners gone and writes nothing; every learner moves
// or none does.
@Injectable()
export class Promotions {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly placements: EnrollmentPlacements,
    private readonly statuses: EnrollmentStatuses,
  ) {}

  list(schoolId: string, academicYearId?: string): Promise<Promotion[]> {
    return this.dataSource.manager.find(Promotion, {
      where: { schoolId, ...(academicYearId ? { academicYearId } : {}) },
      relations: {
        sourceAcademicCycleSection: true,
        destinationAcademicCycleSection: true,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async find(schoolId: string, id: string): Promise<Promotion> {
    const promotion = await findInSchool(
      this.dataSource.manager,
      Promotion,
      { id },
      { schoolId, notFound: PROMOTION_NOT_FOUND },
    );
    return this.dataSource.manager.findOneOrFail(Promotion, {
      where: { id: promotion.id },
      relations: {
        sourceAcademicCycleSection: true,
        destinationAcademicCycleSection: true,
      },
    });
  }

  // Moves the chosen active learners still in the source section to the
  // destination, one placement each, and records the promotion.
  async promote(
    actorId: string,
    schoolId: string,
    input: {
      sourceAcademicCycleSectionId: string;
      destinationAcademicCycleSectionId: string;
      studentIds: string[];
    },
  ): Promise<Promotion> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const source = await findInSchool(
        manager,
        AcademicCycleSection,
        { id: input.sourceAcademicCycleSectionId },
        { schoolId, lock: true, notFound: SECTION_NOT_FOUND },
      );
      const destination = await findInSchool(
        manager,
        AcademicCycleSection,
        { id: input.destinationAcademicCycleSectionId },
        { schoolId, notFound: SECTION_NOT_FOUND },
      );
      if (source.id === destination.id) {
        throw new RuleViolation(MovingMessages.sameSection);
      }
      const learners = await manager.find(StudentRecord, {
        where: {
          schoolId,
          id: In(input.studentIds),
          status: 'active',
          academicCycleSectionId: source.id,
        },
        order: { createdAt: 'ASC' },
      });
      if (!learners.length) {
        throw new RuleViolation(MovingMessages.noneInSection);
      }
      for (const learner of learners) {
        await this.placements.placeIn(manager, {
          enrollmentId: learner.id,
          sectionId: destination.id,
          actorId,
          reason: PROMOTION_REASON,
        });
      }
      return manager.save(
        newInSchool(
          manager,
          Promotion,
          {
            academicYearId: destination.academicYearId,
            sourceAcademicCycleSectionId: source.id,
            destinationAcademicCycleSectionId: destination.id,
            studentRecordIds: learners.map((learner) => learner.id),
          },
          { schoolId },
        ),
      );
    });
  }

  // Moves back every learner still open and still in the destination, then
  // deletes the promotion. Learners who moved on, graduated or left stay.
  async reset(actorId: string, schoolId: string, id: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const promotion = await findInSchool(
        manager,
        Promotion,
        { id },
        { schoolId, lock: true, notFound: PROMOTION_NOT_FOUND },
      );
      const learners = await manager.find(StudentRecord, {
        where: { schoolId, id: In(promotion.studentRecordIds) },
        order: { createdAt: 'ASC' },
      });
      for (const learner of learners) {
        if (
          isClosedEnrollment(learner.status) ||
          learner.academicCycleSectionId !==
            promotion.destinationAcademicCycleSectionId
        ) {
          continue;
        }
        await this.placements.placeIn(manager, {
          enrollmentId: learner.id,
          sectionId: promotion.sourceAcademicCycleSectionId,
          actorId,
          reason: PROMOTION_RESET_REASON,
        });
      }
      await manager.remove(promotion);
    });
  }

  // Graduates the chosen active learners of a section; returns how many.
  async graduate(
    actorId: string,
    schoolId: string,
    input: {
      academicCycleSectionId: string;
      studentIds: string[];
      reason?: string | null;
    },
  ): Promise<number> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const section = await findInSchool(
        manager,
        AcademicCycleSection,
        { id: input.academicCycleSectionId },
        { schoolId, lock: true, notFound: SECTION_NOT_FOUND },
      );
      const learners = await manager.find(StudentRecord, {
        where: {
          schoolId,
          id: In(input.studentIds),
          status: 'active',
          academicCycleSectionId: section.id,
        },
        order: { createdAt: 'ASC' },
      });
      if (!learners.length) {
        throw new RuleViolation(MovingMessages.noneActive);
      }
      for (const learner of learners) {
        await this.statuses.changeIn(manager, {
          enrollmentId: learner.id,
          status: 'graduated',
          actorId,
          reason: input.reason ?? null,
        });
      }
      return learners.length;
    });
  }

  // Returns a graduate to active, with the checks for taking a learner
  // back. An enrollment that is not graduated is left as it is.
  async resetGraduation(
    actorId: string,
    schoolId: string,
    id: string,
    reason: string | null,
  ): Promise<StudentRecord> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const enrollment = await findInSchool(
        manager,
        StudentRecord,
        { id },
        { schoolId, lock: true, notFound: STUDENT_NOT_FOUND },
      );
      if (enrollment.status !== 'graduated') return enrollment;
      return this.statuses.changeIn(manager, {
        enrollmentId: enrollment.id,
        status: 'active',
        actorId,
        reason,
      });
    });
  }
}
