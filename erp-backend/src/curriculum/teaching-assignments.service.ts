import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { isFrozen } from '../academic/academic.constants.js';
import { AcademicYear } from '../academic/entities/academic-year.entity.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { findInSchool, newInSchool } from '../common/tenancy/school-scope.js';
import { School } from '../organizations/entities/school.entity.js';
import {
  ASSIGNMENT_SUBJECT,
  type TeachingRole,
  usesHomeSections,
} from './curriculum.constants.js';
import { AcademicCycleSection } from './entities/academic-cycle-section.entity.js';
import { CourseOfferingSection } from './entities/course-offering-section.entity.js';
import { CourseOffering } from './entities/course-offering.entity.js';
import { TeachingAssignment } from './entities/teaching-assignment.entity.js';
import { OFFERING_NOT_FOUND } from './course-offerings.service.js';
import { teacherStanding } from './teachers.js';

export const ASSIGNMENT_NOT_FOUND = 'Teaching assignment not found.';

export const AssignmentMessages = {
  elsewhere: 'The teacher does not work in this school.',
  notTeacher: 'Only a teacher can be assigned to a subject.',
  section: 'The home group does not belong to this offering.',
  yearClosed:
    'The academic year is closed. Reopen it before you change teaching.',
  endBeforeStart: 'An assignment cannot end before it starts.',
} as const;

export interface AssignInput {
  userId: string;
  role?: TeachingRole;
  academicCycleSectionId?: string | null;
  startsOn?: string | null;
}

// Who teaches an offering (reference AssignTeacher). Asking again for an
// assignment that is running returns it; ending one sets ends_on.
@Injectable()
export class TeachingAssignments {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async list(
    schoolId: string,
    offeringId: string,
  ): Promise<TeachingAssignment[]> {
    const manager = this.dataSource.manager;
    await findInSchool(
      manager,
      CourseOffering,
      { id: offeringId },
      { schoolId, notFound: OFFERING_NOT_FOUND },
    );
    return manager.find(TeachingAssignment, {
      where: { schoolId, courseOfferingId: offeringId },
      relations: { user: true, academicCycleSection: true },
      order: { startsOn: 'ASC', createdAt: 'ASC' },
    });
  }

  async assign(
    schoolId: string,
    offeringId: string,
    input: AssignInput,
  ): Promise<{ assignment: TeachingAssignment; created: boolean }> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const offering = await findInSchool(
        manager,
        CourseOffering,
        { id: offeringId },
        { schoolId, lock: true, notFound: OFFERING_NOT_FOUND },
      );
      const standing = await teacherStanding(manager, schoolId, input.userId);
      if (!standing.worksHere) {
        throw new RuleViolation(AssignmentMessages.elsewhere, {
          userId: [AssignmentMessages.elsewhere],
        });
      }
      if (!standing.isTeacher) {
        throw new RuleViolation(AssignmentMessages.notTeacher, {
          userId: [AssignmentMessages.notTeacher],
        });
      }
      const sectionId = input.academicCycleSectionId ?? null;
      if (sectionId) await this.sectionMustFit(manager, offering, sectionId);
      const year = await manager.findOneOrFail(AcademicYear, {
        where: { id: offering.academicYearId },
      });
      if (isFrozen(year.status)) {
        throw new RuleViolation(AssignmentMessages.yearClosed);
      }

      const startsOn = input.startsOn ?? (await this.today(manager, schoolId));
      const running = await this.runningOn(manager, startsOn)
        .andWhere('assignment.courseOfferingId = :offeringId', {
          offeringId: offering.id,
        })
        .andWhere('assignment.userId = :userId', { userId: input.userId })
        .andWhere(
          sectionId
            ? 'assignment.academicCycleSectionId = :sectionId'
            : 'assignment.academicCycleSectionId IS NULL',
          { sectionId },
        )
        .getOne();
      if (running) return { assignment: running, created: false };

      const role = input.role ?? 'lead';
      const assignment = await manager.save(
        newInSchool(
          manager,
          TeachingAssignment,
          {
            subjectId: offering.subjectId,
            userId: input.userId,
            academicYearId: offering.academicYearId,
            academicPeriodId: offering.academicPeriodId,
            courseOfferingId: offering.id,
            academicCycleSectionId: sectionId,
            role,
            startsOn,
            endsOn: null,
          },
          { schoolId },
        ),
      );
      await this.audit.record(manager, {
        action: AuditAction.TeachingAssignmentCreated,
        subject: { type: ASSIGNMENT_SUBJECT, id: assignment.id },
        context: {
          subject_id: offering.subjectId,
          teacher_id: input.userId,
          role,
          academic_cycle_section_id: sectionId,
          academic_year_id: offering.academicYearId,
          course_offering_id: offering.id,
        },
        schoolId,
      });
      return { assignment, created: true };
    });
  }

  async end(
    schoolId: string,
    id: string,
    endsOn?: string | null,
  ): Promise<TeachingAssignment> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const assignment = await findInSchool(
        manager,
        TeachingAssignment,
        { id },
        { schoolId, lock: true, notFound: ASSIGNMENT_NOT_FOUND },
      );
      const day = endsOn ?? (await this.today(manager, schoolId));
      if (day < assignment.startsOn) {
        throw new RuleViolation(AssignmentMessages.endBeforeStart, {
          endsOn: [AssignmentMessages.endBeforeStart],
        });
      }
      return this.endOn(manager, assignment, day);
    });
  }

  // A person who leaves the campus stops teaching there from that day and
  // hands back the sections they were class teacher of in running years
  // (reference EndSchoolMembership::endDutiesFrom). Runs inside the
  // membership change's transaction.
  async endDutiesFrom(
    manager: EntityManager,
    userId: string,
    schoolId: string,
  ): Promise<void> {
    const today = await this.today(manager, schoolId);
    const running = await manager
      .createQueryBuilder(TeachingAssignment, 'assignment')
      .where('assignment.schoolId = :schoolId', { schoolId })
      .andWhere('assignment.userId = :userId', { userId })
      .andWhere('(assignment.endsOn IS NULL OR assignment.endsOn > :today)', {
        today,
      })
      .setLock('pessimistic_write')
      .getMany();
    for (const assignment of running) {
      await this.endOn(manager, assignment, today);
    }
    await manager.query(
      `UPDATE academic_cycle_sections
          SET homeroom_teacher_id = NULL, updated_at = now()
        WHERE school_id = $1 AND homeroom_teacher_id = $2 AND status <> 'archived'
          AND academic_year_id IN (
            SELECT id FROM academic_years
             WHERE school_id = $1 AND status IN ('open', 'closing'))`,
      [schoolId, userId],
    );
  }

  private async endOn(
    manager: EntityManager,
    assignment: TeachingAssignment,
    day: string,
  ): Promise<TeachingAssignment> {
    if (assignment.endsOn !== null && assignment.endsOn <= day) {
      return assignment;
    }
    assignment.endsOn = day;
    const saved = await manager.save(assignment);
    await this.audit.record(manager, {
      action: AuditAction.TeachingAssignmentEnded,
      subject: { type: ASSIGNMENT_SUBJECT, id: assignment.id },
      context: {
        subject_id: assignment.subjectId,
        teacher_id: assignment.userId,
        ends_on: day,
      },
      schoolId: assignment.schoolId,
    });
    return saved;
  }

  // A section of the offering's level and year; for a home or combined
  // roster, one of the offering's own sections.
  private async sectionMustFit(
    manager: EntityManager,
    offering: CourseOffering,
    sectionId: string,
  ): Promise<void> {
    const section = await manager.findOne(AcademicCycleSection, {
      where: {
        id: sectionId,
        schoolId: offering.schoolId,
        academicYearId: offering.academicYearId,
        academicLevelId: offering.academicLevelId,
      },
    });
    const inRoster =
      !usesHomeSections(offering.rosterMode) ||
      (await manager.exists(CourseOfferingSection, {
        where: {
          courseOfferingId: offering.id,
          academicCycleSectionId: sectionId,
        },
      }));
    if (!section || !inRoster) {
      throw new RuleViolation(AssignmentMessages.section, {
        academicCycleSectionId: [AssignmentMessages.section],
      });
    }
  }

  // Assignments running on the day (TeachingAssignment::scopeRunningOn).
  runningOn(manager: EntityManager, day: string) {
    return manager
      .createQueryBuilder(TeachingAssignment, 'assignment')
      .where('assignment.startsOn <= :day', { day })
      .andWhere('(assignment.endsOn IS NULL OR assignment.endsOn >= :day)', {
        day,
      });
  }

  async today(manager: EntityManager, schoolId: string): Promise<string> {
    const school = await manager.findOneOrFail(School, {
      where: { id: schoolId },
    });
    return this.clock.schoolToday(school.timezone);
  }
}
