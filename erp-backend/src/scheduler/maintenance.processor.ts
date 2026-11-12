import { Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { HeartbeatService } from '../health/heartbeat.service.js';
import { IdentityMaintenance } from '../identity/identity-maintenance.service.js';
import { AppWorkerHost } from '../queue/app-worker-host.js';
import { WORKER_OPTIONS } from '../queue/queue-connections.js';
import { QUEUES } from '../queue/queue.module.js';
import {
  PRUNE_INVITATIONS_JOB,
  QUEUE_HEARTBEAT_JOB,
} from './scheduled-jobs.js';

@Processor(QUEUES.maintenance, WORKER_OPTIONS)
export class MaintenanceProcessor extends AppWorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    private readonly heartbeats: HeartbeatService,
    private readonly identity: IdentityMaintenance,
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
      default:
        this.logger.warn(`Unknown maintenance job "${job.name}" ignored`);
    }
  }
}
