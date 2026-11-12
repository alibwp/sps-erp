import { Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AcademicCalendarJobs } from '../academic/academic-calendar-jobs.service.js';
import { HeartbeatService } from '../health/heartbeat.service.js';
import { IdentityMaintenance } from '../identity/identity-maintenance.service.js';
import { AppWorkerHost } from '../queue/app-worker-host.js';
import { WORKER_OPTIONS } from '../queue/queue-connections.js';
import { QUEUES } from '../queue/queue.module.js';
import {
  ACADEMIC_CALENDAR_REMINDERS_JOB,
  GENERATE_ACADEMIC_CYCLES_JOB,
  OPEN_ACADEMIC_PERIODS_JOB,
  PRUNE_INVITATIONS_JOB,
  QUEUE_HEARTBEAT_JOB,
} from './scheduled-jobs.js';

@Processor(QUEUES.maintenance, WORKER_OPTIONS)
export class MaintenanceProcessor extends AppWorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    private readonly heartbeats: HeartbeatService,
    private readonly identity: IdentityMaintenance,
    private readonly calendar: AcademicCalendarJobs,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case QUEUE_HEARTBEAT_JOB:
        await this.heartbeats.record('queue');
        return;
      case PRUNE_INVITATIONS_JOB:
        await this.identity.pruneExpired();
        return;
      case OPEN_ACADEMIC_PERIODS_JOB:
        await this.calendar.openDue();
        return;
      case GENERATE_ACADEMIC_CYCLES_JOB:
        await this.calendar.generateUpcoming();
        return;
      case ACADEMIC_CALENDAR_REMINDERS_JOB:
        await this.calendar.sendReminders();
        return;
      default:
        this.logger.warn(`Unknown maintenance job "${job.name}" ignored`);
    }
  }
}
