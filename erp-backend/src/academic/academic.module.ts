import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessModule } from '../access/access.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { AcademicCalendarJobs } from './academic-calendar-jobs.service.js';
import { AcademicCalendar } from './academic-calendar.service.js';
import { AcademicLifecycle } from './academic-lifecycle.service.js';
import { AcademicPeriodContext } from './academic-period-context.service.js';
import { AcademicPeriodGuard } from './academic-period.guard.js';
import { AcademicPeriodsController } from './academic-periods.controller.js';
import { AcademicQueries } from './academic-queries.service.js';
import { AcademicYearsController } from './academic-years.controller.js';
import {
  CalendarTemplatesController,
  CampusCalendarController,
} from './calendar-templates.controller.js';
import { CalendarTemplates } from './calendar-templates.service.js';
import { ClosureReadiness } from './closure-readiness.service.js';
import { AcademicPeriodStatusChange } from './entities/academic-period-status-change.entity.js';
import { AcademicPeriod } from './entities/academic-period.entity.js';
import { AcademicYear } from './entities/academic-year.entity.js';
import { CalendarTemplatePeriod } from './entities/calendar-template-period.entity.js';
import { CalendarTemplate } from './entities/calendar-template.entity.js';
import { InstructionalModelMigration } from './entities/instructional-model-migration.entity.js';
import { InstructionalModelSetting } from './entities/instructional-model-setting.entity.js';
import { SchoolSetupPhase } from './entities/school-setup-phase.entity.js';
import { UserAcademicPeriodPreference } from './entities/user-academic-period-preference.entity.js';
import { Weekday } from './entities/weekday.entity.js';
import { InstructionalModels } from './instructional-models.service.js';
import { MeContextController } from './me-context.controller.js';
import { RollForward } from './roll-forward.service.js';
import { SchoolSetupController } from './school-setup.controller.js';
import { SchoolSetup } from './school-setup.service.js';

// Stage 3: school years and their periods with the status lifecycle and
// closure readiness, calendar templates and cycle generation, the working
// period, setup checklists, the teaching model, weekdays and the calendar
// scheduled jobs. Later stages register their closure checks, setup counts
// and migration impact with ClosureReadiness, SchoolSetup and
// InstructionalModels.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AcademicYear,
      AcademicPeriod,
      AcademicPeriodStatusChange,
      CalendarTemplate,
      CalendarTemplatePeriod,
      SchoolSetupPhase,
      UserAcademicPeriodPreference,
      InstructionalModelSetting,
      InstructionalModelMigration,
      Weekday,
    ]),
    AccessModule,
    OrganizationsModule,
  ],
  controllers: [
    AcademicYearsController,
    AcademicPeriodsController,
    SchoolSetupController,
    CalendarTemplatesController,
    CampusCalendarController,
    MeContextController,
  ],
  providers: [
    ClosureReadiness,
    AcademicLifecycle,
    AcademicCalendar,
    AcademicPeriodContext,
    AcademicPeriodGuard,
    CalendarTemplates,
    RollForward,
    InstructionalModels,
    SchoolSetup,
    AcademicQueries,
    AcademicCalendarJobs,
  ],
  exports: [
    AcademicCalendar,
    ClosureReadiness,
    AcademicLifecycle,
    AcademicPeriodContext,
    AcademicPeriodGuard,
    InstructionalModels,
    SchoolSetup,
    AcademicCalendarJobs,
  ],
})
export class AcademicModule {}
