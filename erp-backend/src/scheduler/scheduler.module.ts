import { Module } from '@nestjs/common';
import { AcademicModule } from '../academic/academic.module.js';
import { HealthModule } from '../health/health.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { NoticesModule } from '../notices/notices.module.js';
import { MaintenanceProcessor } from './maintenance.processor.js';
import { SchedulerService } from './scheduler.service.js';
import { StaffModule } from '../staff/staff.module.js';

@Module({
  imports: [
    HealthModule,
    IdentityModule,
    AcademicModule,
    StaffModule,
    NoticesModule,
  ],
  providers: [SchedulerService, MaintenanceProcessor],
  exports: [SchedulerService],
})
export class SchedulerModule {}
