import { Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AppWorkerHost } from '../queue/app-worker-host.js';
import { WORKER_OPTIONS } from '../queue/queue-connections.js';
import { QUEUES } from '../queue/queue.module.js';
import { NoticeEmails } from './notice-emails.service.js';
import { SEND_NOTICE_EMAILS_JOB } from './notices.constants.js';

@Processor(QUEUES.notices, WORKER_OPTIONS)
export class NoticesProcessor extends AppWorkerHost {
  private readonly logger = new Logger(NoticesProcessor.name);

  constructor(private readonly emails: NoticeEmails) {
    super();
  }

  async process(job: Job<{ noticeId: string }>): Promise<void> {
    if (job.name !== SEND_NOTICE_EMAILS_JOB) {
      this.logger.warn(`Unknown notices job "${job.name}" ignored`);
      return;
    }
    const tally = await this.emails.send(job.data.noticeId);
    this.logger.log(
      `Notice job ${job.id}: ${tally.sent} sent, ${tally.failed} failed, ${tally.skipped} skipped`,
    );
  }
}
