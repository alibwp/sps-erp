import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { DataSource, type EntityManager, LessThanOrEqual } from 'typeorm';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { addDays } from '../common/clock/dates.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { School } from '../organizations/entities/school.entity.js';
import { addJob } from '../queue/add-job.js';
import { QUEUES } from '../queue/queue.module.js';
import { NoticeRecipient } from './entities/notice-recipient.entity.js';
import { Notice } from './entities/notice.entity.js';
import { NoticeAudience } from './notice-audience.service.js';
import {
  NOTICE_SUBJECT,
  SEND_NOTICE_EMAILS_JOB,
  canMoveNotice,
} from './notices.constants.js';

export const PublishMessages = {
  cannotPublish: 'This notice cannot be published from its current state.',
  superseded: 'This notice revision has already been superseded.',
  cannotSchedule: 'This notice cannot be scheduled from its current state.',
} as const;

// Publishing, scheduling and expiring notices (reference PublishNotice,
// ProcessNotices). Publishing fixes the recipients once, supersedes the
// revision it replaces, and queues the emails after commit.
@Injectable()
export class NoticePublisher {
  private readonly logger = new Logger(NoticePublisher.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly audience: NoticeAudience,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    @InjectQueue(QUEUES.notices) private readonly queue: Queue,
  ) {}

  publish(id: string, actorId: string | null): Promise<Notice> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const notice = await this.lock(manager, id);
      if (notice.status === 'published') return notice;
      if (!canMoveNotice(notice.status, 'published')) {
        throw new RuleViolation(PublishMessages.cannotPublish);
      }
      const original = notice.revisionOfId
        ? await this.lock(manager, notice.revisionOfId)
        : null;
      if (original && original.status !== 'published') {
        throw new RuleViolation(PublishMessages.superseded);
      }
      const people = await this.audience.resolve(
        manager,
        notice.schoolId,
        notice.audience,
      );
      const now = this.clock.now();
      for (const userId of people) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(NoticeRecipient)
          .values({
            noticeId: notice.id,
            userId,
            state: 'delivered',
            deliveredAt: now,
          })
          .orIgnore()
          .execute();
      }
      notice.status = 'published';
      notice.publishedAt = now;
      notice.publishedById = actorId;
      const saved = await manager.save(notice);
      if (original) {
        original.status = 'superseded';
        await manager.save(original);
      }
      // Email is slow and optional, so it leaves the request.
      if (notice.sendEmail) {
        tx.afterCommit(() =>
          addJob(
            this.queue,
            SEND_NOTICE_EMAILS_JOB,
            { noticeId: notice.id },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 30_000 },
              removeOnComplete: true,
            },
          ).catch((error: unknown) =>
            this.logger.warn(
              `Emails for notice ${notice.id} not queued: ${
                error instanceof Error ? error.message : String(error)
              }`,
            ),
          ),
        );
      }
      await this.record(
        manager,
        saved,
        AuditAction.NoticePublished,
        { recipients: people.length, send_email: notice.sendEmail },
        actorId,
      );
      return saved;
    });
  }

  schedule(id: string, when: Date, actorId: string | null): Promise<Notice> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const notice = await this.lock(manager, id);
      if (!canMoveNotice(notice.status, 'scheduled')) {
        throw new RuleViolation(PublishMessages.cannotSchedule);
      }
      notice.status = 'scheduled';
      notice.scheduledFor = when;
      const saved = await manager.save(notice);
      await this.record(
        manager,
        saved,
        AuditAction.NoticeScheduled,
        { scheduled_for: when.toISOString() },
        actorId,
      );
      return saved;
    });
  }

  expire(id: string): Promise<Notice> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const notice = await this.lock(manager, id);
      if (!canMoveNotice(notice.status, 'expired')) return notice;
      notice.status = 'expired';
      const saved = await manager.save(notice);
      await this.record(manager, saved, AuditAction.NoticeExpired, {}, null);
      return saved;
    });
  }

  // Every 15 minutes (reference ProcessNotices): scheduled notices that are
  // due are published (one that can no longer be published goes back to
  // draft), and published notices whose stop date has passed in their
  // campus's today expire.
  async processDue(): Promise<{ published: number; expired: number }> {
    let published = 0;
    const due = await this.dataSource.manager.find(Notice, {
      where: {
        status: 'scheduled',
        scheduledFor: LessThanOrEqual(this.clock.now()),
      },
      order: { scheduledFor: 'ASC' },
    });
    for (const notice of due) {
      try {
        await this.publish(notice.id, null);
        published += 1;
      } catch (error) {
        if (!(error instanceof RuleViolation)) {
          this.logger.error(
            `Notice ${notice.id} not published: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          continue;
        }
        await this.dataSource.manager.update(
          Notice,
          { id: notice.id, status: 'scheduled' },
          { status: 'draft', scheduledFor: null },
        );
        this.logger.warn(
          `Notice ${notice.id} went back to draft. ${error.message}`,
        );
      }
    }

    let expired = 0;
    // A day ahead of the server, so a campus already in tomorrow counts;
    // each campus then counts its own day.
    const finishing = await this.dataSource.manager
      .createQueryBuilder(Notice, 'notice')
      .where("notice.status = 'published'")
      .andWhere('notice.stopDate < :tomorrow', {
        tomorrow: addDays(this.clock.schoolToday('UTC'), 1),
      })
      .getMany();
    const todays = new Map<string, string>();
    for (const notice of finishing) {
      let today = todays.get(notice.schoolId);
      if (!today) {
        const school = await this.dataSource.manager.findOneOrFail(School, {
          where: { id: notice.schoolId },
        });
        today = this.clock.schoolToday(school.timezone);
        todays.set(notice.schoolId, today);
      }
      if (!(notice.stopDate < today)) continue;
      await this.expire(notice.id);
      expired += 1;
    }
    return { published, expired };
  }

  private lock(manager: EntityManager, id: string): Promise<Notice> {
    return manager.findOneOrFail(Notice, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private async record(
    manager: EntityManager,
    notice: Notice,
    action:
      | typeof AuditAction.NoticePublished
      | typeof AuditAction.NoticeScheduled
      | typeof AuditAction.NoticeExpired
      | typeof AuditAction.NoticeRevised,
    context: Record<string, unknown>,
    actorId: string | null,
  ): Promise<void> {
    await this.audit.record(manager, {
      action,
      subject: { type: NOTICE_SUBJECT, id: notice.id },
      context,
      schoolId: notice.schoolId,
      ...(actorId === null ? { actorId } : {}),
    });
  }
}
