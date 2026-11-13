import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
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
//
// Demo accounts (seed-demo-users) never receive email: their addresses may
// belong to strangers. A message only for them is dropped without a sign.
@Injectable()
export class MailService {
  constructor(
    @InjectQueue(QUEUES.mail) private readonly queue: Queue,
    private readonly dataSource: DataSource,
  ) {}

  async send(message: MailMessage): Promise<string | undefined> {
    const to = await this.withoutDemoAccounts(message.to);
    if (!to.length) return undefined;
    return addJob(
      this.queue,
      SEND_MAIL_JOB,
      { ...message, to: Array.isArray(message.to) ? to : to[0] },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        // Messages carry reset and invitation links: drop the job as soon
        // as it is sent. Failed jobs stay for inspection (queue default).
        removeOnComplete: true,
      },
    );
  }

  private async withoutDemoAccounts(to: string | string[]): Promise<string[]> {
    const addresses = Array.isArray(to) ? to : [to];
    const rows = (await this.dataSource.query(
      'SELECT email FROM users WHERE demo_account AND email = ANY($1::text[])',
      [addresses.map(normalized)],
    )) as Array<{ email: string }>;
    const demo = new Set(rows.map((row) => row.email));
    return addresses.filter((address) => !demo.has(normalized(address)));
  }
}

function normalized(address: string): string {
  return address.trim().toLowerCase();
}
