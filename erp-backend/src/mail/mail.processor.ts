import { Processor } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { Transporter } from 'nodemailer';
import { AppWorkerHost } from '../queue/app-worker-host.js';
import { WORKER_OPTIONS } from '../queue/queue-connections.js';
import { QUEUES } from '../queue/queue.module.js';
import { MailMessage, SEND_MAIL_JOB } from './mail.service.js';
import { MAIL_TRANSPORT } from './mail.transport.js';

@Processor(QUEUES.mail, WORKER_OPTIONS)
export class MailProcessor extends AppWorkerHost {
  private readonly logger = new Logger(MailProcessor.name);
  private readonly from: string;

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: Transporter,
    config: ConfigService,
  ) {
    super();
    this.from = config.get<string>('MAIL_FROM', 'SPS ERP <no-reply@localhost>');
  }

  async process(job: Job<MailMessage>): Promise<void> {
    if (job.name !== SEND_MAIL_JOB) {
      this.logger.warn(`Unknown mail job "${job.name}" ignored`);
      return;
    }
    const { to, subject, text, html, replyTo } = job.data;
    // A thrown error fails the attempt; BullMQ retries with backoff.
    await this.transport.sendMail({
      from: this.from,
      to,
      subject,
      text,
      html,
      replyTo,
    });
    // Addresses and content are personal data: log the job only.
    this.logger.log(`Mail job ${job.id} sent`);
  }
}
