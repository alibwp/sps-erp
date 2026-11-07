import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { addJob } from '../queue/add-job.js';
import { QUEUES } from '../queue/queue.module.js';

export interface MailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export const SEND_MAIL_JOB = 'send';

// Puts an email on the mail queue; the mail worker sends it. Call it after
// the business transaction commits (TransactionService afterCommit), so a
// failed email never rolls back business data. While Redis is unreachable
// it fails within ADD_JOB_TIMEOUT_MS (QueueUnavailable) and the email is not
// sent.
@Injectable()
export class MailService {
  constructor(@InjectQueue(QUEUES.mail) private readonly queue: Queue) {}

  send(message: MailMessage): Promise<string | undefined> {
    return addJob(this.queue, SEND_MAIL_JOB, message, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      // Messages carry reset and invitation links: drop the job as soon as
      // it is sent. Failed jobs stay for inspection (queue default).
      removeOnComplete: true,
    });
  }
}
