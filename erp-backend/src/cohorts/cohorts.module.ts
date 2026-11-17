import { Module, type OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcademicModule } from '../academic/academic.module.js';
import { CampusMoves } from '../enrollments/campus-moves.service.js';
import { EnrollmentStatuses } from '../enrollments/enrollment-statuses.service.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { CohortsController } from './cohorts.controllers.js';
import { Cohorts } from './cohorts.service.js';
import { CohortMember } from './entities/cohort-member.entity.js';
import { Cohort } from './entities/cohort.entity.js';

// Stage 6: cohorts and programmes. A closed enrollment ends its places
// (completed on graduation) and leaves its cohorts (except on graduation);
// a move to another campus ends both at the old campus
// (ChangeEnrollmentStatus, MoveEnrollmentBetweenCampuses).
@Module({
  imports: [
    TypeOrmModule.forFeature([Cohort, CohortMember]),
    AcademicModule,
    EnrollmentsModule,
  ],
  controllers: [CohortsController],
  providers: [Cohorts],
  exports: [Cohorts],
})
export class CohortsModule implements OnModuleInit {
  constructor(
    private readonly cohorts: Cohorts,
    private readonly statuses: EnrollmentStatuses,
    private readonly moves: CampusMoves,
  ) {}

  onModuleInit(): void {
    this.statuses.registerCloseHandler(
      async (manager, enrollment, status, context) => {
        const graduated = status === 'graduated';
        // A graduate stays in the class they graduated with.
        if (!graduated) {
          await this.cohorts.leaveSchoolIn(
            manager,
            enrollment.id,
            enrollment.schoolId,
            context.effectiveOn,
            context.actorId,
          );
        }
      },
    );

    this.moves.registerMoveHandler(async (manager, enrollment, context) => {
      await this.cohorts.leaveSchoolIn(
        manager,
        enrollment.id,
        context.source.id,
        context.effectiveOn,
        context.actorId,
      );
    });
  }
}
