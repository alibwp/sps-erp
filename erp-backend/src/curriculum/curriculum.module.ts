import { Module, type OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { In } from 'typeorm';
import { AcademicModule } from '../academic/academic.module.js';
import { allowsRosterMode } from '../academic/academic.constants.js';
import { AcademicCalendar } from '../academic/academic-calendar.service.js';
import { displayName } from '../academic/entities/academic-period.entity.js';
import type { AcademicYear } from '../academic/entities/academic-year.entity.js';
import { InstructionalModels } from '../academic/instructional-models.service.js';
import { SchoolSetup } from '../academic/school-setup.service.js';
import { AccessModule } from '../access/access.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { SchoolMemberships } from '../organizations/school-memberships.service.js';
import type { School } from '../organizations/entities/school.entity.js';
import { AcademicLevels } from './academic-levels.service.js';
import { CourseOfferings } from './course-offerings.service.js';
import { CurriculumViews } from './curriculum-views.service.js';
import { CycleSections } from './cycle-sections.service.js';
import { AcademicCycleSection } from './entities/academic-cycle-section.entity.js';
import { AcademicLevel } from './entities/academic-level.entity.js';
import { CourseOfferingSection } from './entities/course-offering-section.entity.js';
import { CourseOfferingStudentRecord } from './entities/course-offering-student-record.entity.js';
import { CourseOffering } from './entities/course-offering.entity.js';
import { InstructionalModelException } from './entities/instructional-model-exception.entity.js';
import { Subject } from './entities/subject.entity.js';
import { TeachingAssignment } from './entities/teaching-assignment.entity.js';
import { OfferingExceptions } from './offering-exceptions.service.js';
import { OfferingRollForward } from './offering-roll-forward.service.js';
import { OfferingRoster } from './offering-roster.service.js';
import {
  CourseOfferingsController,
  CurriculumYearsController,
  TeachingAssignmentsController,
} from './offerings.controllers.js';
import {
  AcademicLevelsController,
  CycleSectionsController,
  SubjectsController,
} from './structure.controllers.js';
import { Subjects } from './subjects.service.js';
import { TeachingAssignments } from './teaching-assignments.service.js';

export const CalendarRemovalMessages = {
  year: 'This calendar has sections or course offerings, so it cannot be deleted.',
  period: (name: string) =>
    `${name} has course offerings, so it cannot be removed.`,
} as const;

// Stage 4: levels, the sections of each year, subjects, course offerings
// with their rosters, teaching assignments, instructional-model exceptions
// and the roster resolver. Stage 5 registers placed learners and waitlists
// with CycleSections and adds enrollments to OfferingRoster.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AcademicLevel,
      AcademicCycleSection,
      Subject,
      CourseOffering,
      CourseOfferingSection,
      CourseOfferingStudentRecord,
      TeachingAssignment,
      InstructionalModelException,
    ]),
    AccessModule,
    OrganizationsModule,
    AcademicModule,
  ],
  controllers: [
    AcademicLevelsController,
    CycleSectionsController,
    SubjectsController,
    CourseOfferingsController,
    TeachingAssignmentsController,
    CurriculumYearsController,
  ],
  providers: [
    AcademicLevels,
    CycleSections,
    Subjects,
    OfferingExceptions,
    CourseOfferings,
    OfferingRollForward,
    OfferingRoster,
    TeachingAssignments,
    CurriculumViews,
  ],
  exports: [
    AcademicLevels,
    CycleSections,
    Subjects,
    CourseOfferings,
    OfferingRoster,
    TeachingAssignments,
  ],
})
export class CurriculumModule implements OnModuleInit {
  constructor(
    private readonly setup: SchoolSetup,
    private readonly models: InstructionalModels,
    private readonly calendar: AcademicCalendar,
    private readonly memberships: SchoolMemberships,
    private readonly assignments: TeachingAssignments,
  ) {}

  onModuleInit(): void {
    // The setup checklist's classes, and the working year's sections and
    // offerings, whatever their status (SchoolSetupChecklist).
    this.setup.registerCount('academic_levels', (manager, school) =>
      manager.count(AcademicLevel, {
        where: { schoolId: school.id, isGroup: false },
      }),
    );
    this.setup.registerCount('cycle_sections', (manager, school, year) =>
      countIn(manager, AcademicCycleSection, school, year),
    );
    this.setup.registerCount('course_offerings', (manager, school, year) =>
      countIn(manager, CourseOffering, school, year),
    );

    // What a model migration meets: the year's offerings by roster, and
    // those the new model would refuse (MigrateInstructionalModel::impactOf).
    this.models.registerImpact(async (manager, year, model) => {
      const rows = (await manager
        .createQueryBuilder(CourseOffering, 'offering')
        .select('offering.rosterMode', 'mode')
        .addSelect('count(*)::int', 'total')
        .where('offering.schoolId = :schoolId', { schoolId: year.schoolId })
        .andWhere('offering.academicYearId = :yearId', { yearId: year.id })
        .groupBy('offering.rosterMode')
        .orderBy('offering.rosterMode')
        .getRawMany()) as Array<{
        mode: Parameters<typeof allowsRosterMode>[1];
        total: number;
      }>;
      const byRoster: Record<string, number> = {};
      const exceptionRosters: Record<string, number> = {};
      for (const row of rows) {
        byRoster[row.mode] = row.total;
        if (!allowsRosterMode(model, row.mode)) {
          exceptionRosters[row.mode] = row.total;
        }
      }
      const sum = (counts: Record<string, number>) =>
        Object.values(counts).reduce((total, count) => total + count, 0);
      return {
        offerings: sum(byRoster),
        offerings_by_roster: byRoster,
        exceptions: sum(exceptionRosters),
        exception_rosters: exceptionRosters,
      };
    });

    // A calendar with sections or offerings is kept, and so is a period
    // with offerings.
    this.calendar.registerRemovalGuard(async (manager, { year, periods }) => {
      if (year) {
        const used =
          (await manager.exists(AcademicCycleSection, {
            where: { academicYearId: year.id },
          })) ||
          (await manager.exists(CourseOffering, {
            where: { academicYearId: year.id },
          })) ||
          (await manager.exists(InstructionalModelException, {
            where: { academicYearId: year.id },
          }));
        return used ? CalendarRemovalMessages.year : null;
      }
      if (!periods.length) return null;
      const offering = await manager.findOne(CourseOffering, {
        where: { academicPeriodId: In(periods.map((period) => period.id)) },
        order: { createdAt: 'ASC' },
      });
      if (!offering) return null;
      const period = periods.find(
        (row) => row.id === offering.academicPeriodId,
      )!;
      return CalendarRemovalMessages.period(displayName(period));
    });

    // Leaving a campus ends the person's teaching there.
    this.memberships.registerEndHook((manager, userId, schoolId) =>
      this.assignments.endDutiesFrom(manager, userId, schoolId),
    );
  }
}

function countIn(
  manager: EntityManager,
  entity: typeof AcademicCycleSection | typeof CourseOffering,
  school: School,
  year: AcademicYear | null,
): Promise<number> {
  if (!year) return Promise.resolve(0);
  return manager.count(entity, {
    where: { schoolId: school.id, academicYearId: year.id },
  });
}
