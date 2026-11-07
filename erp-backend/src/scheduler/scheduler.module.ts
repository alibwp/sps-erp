import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { MaintenanceProcessor } from './maintenance.processor.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  imports: [HealthModule, IdentityModule],
  providers: [SchedulerService, MaintenanceProcessor],
  exports: [SchedulerService],
})
export class SchedulerModule {}
