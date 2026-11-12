import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import {
  DataSource,
  EntityManager,
  In,
  LessThan,
  LessThanOrEqual,
} from 'typeorm';
import { Clock } from '../common/clock/clock.js';
import { addDays, formatDay } from '../common/clock/dates.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { School } from '../organizations/entities/school.entity.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { AcademicLifecycle } from './academic-lifecycle.service.js';
import { CalendarTemplates } from './calendar-templates.service.js';
import {
  AcademicPeriod,
  displayName,
} from './entities/academic-period.entity.js';
import { AcademicYear, yearName } from './entities/academic-year.entity.js';
import type { PeriodKind } from './entities/academic-period-status-change.entity.js';

type ReminderKind = 'starts' | 'ends' | 'overdue';

interface Reminder {
  kind: ReminderKind;
  type: PeriodKind;
  id: string;
  name: string;
  date: string;
  startsOn: string | null;
  endsOn: string | null;
}

// A reminder is sent once per period, kind and dates (reference
// Cache::add for a year).
const REMINDER_CLAIM_SECONDS = 365 * 24 * 3600;
const REMINDER_PERMISSIONS = ['close academic period', 'update academic year'];

// The calendar's scheduled work (reference AdvanceAcademicCalendar,
// GenerateUpcomingAcademicCycles, SendAcademicCalendarReminders). "Today"
// is each campus's own.
@Injectable()
export class AcademicCalendarJobs {
  private readonly logger = new Logger(AcademicCalendarJobs.name);
  private readonly frontendUrl: string;

  constructor(
    config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly lifecycle: AcademicLifecycle,
    private readonly templates: CalendarTemplates,
    private readonly mail: MailService,
    private readonly clock: Clock,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.frontendUrl = config
      .get<string>('FRONTEND_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');
  }

  // Hourly: opens the scheduled years, then periods, whose start date has
  // arrived, at campuses following a template with auto-open on. Never
  // closes anything. A refused open (its year still closed) is skipped.
  async openDue(): Promise<{ opened: number; skipped: number }> {
    let opened = 0;
    let skipped = 0;
    for (const school of await this.schools()) {
      const template = await this.templates.effectiveTemplate(
        this.dataSource.manager,
        school,
      );
      if (!template?.autoOpen) continue;
      const today = this.clock.schoolToday(school.timezone);
      const due: Array<{ kind: PeriodKind; id: string }> = [
        ...(
          await this.dataSource.manager.find(AcademicYear, {
            where: {
              schoolId: school.id,
              status: 'scheduled',
              startsOn: LessThanOrEqual(today),
            },
            order: { startsOn: 'ASC' },
          })
        ).map((year) => ({ kind: 'academic_year' as const, id: year.id })),
        ...(
          await this.dataSource.manager.find(AcademicPeriod, {
            where: {
              schoolId: school.id,
              status: 'scheduled',
              startsOn: LessThanOrEqual(today),
            },
            order: { position: 'ASC', startsOn: 'ASC' },
          })
        ).map((period) => ({
          kind: 'academic_period' as const,
          id: period.id,
        })),
      ];
      for (const item of due) {
        try {
          const changed = await this.transactions.run(async (tx) => {
            const subject = await this.lifecycle.lockSubject(
              tx.manager,
              item.kind,
              item.id,
              school.id,
            );
            if (subject.row.status !== 'scheduled') return false;
            await this.lifecycle.change(tx.manager, subject, 'open', {
              actorId: null,
            });
            return true;
          });
          if (changed) opened++;
        } catch (error) {
          if (!(error instanceof RuleViolation)) throw error;
          skipped++;
          this.logger.warn(
            `Skipped opening ${item.kind} ${item.id} at ${school.name}: ${error.message}`,
          );
        }
      }
    }
    if (opened) this.logger.log(`Opened ${opened} academic period(s).`);
    return { opened, skipped };
  }

  // Weekly: drafts the next cycle from the template once the latest one
  // ends within generate_ahead_weeks.
  async generateUpcoming(): Promise<number> {
    let generated = 0;
    for (const school of await this.schools()) {
      const manager = this.dataSource.manager;
      const template = await this.templates.effectiveTemplate(manager, school);
      if (!template || template.generateAheadWeeks <= 0) continue;
      const latest = await manager
        .createQueryBuilder(AcademicYear, 'year')
        .where('year.schoolId = :schoolId', { schoolId: school.id })
        .andWhere('year.endsOn IS NOT NULL')
        .orderBy('year.endsOn', 'DESC')
        .getOne();
      if (!latest?.endsOn) continue;
      const today = this.clock.schoolToday(school.timezone);
      if (today < addDays(latest.endsOn, -7 * template.generateAheadWeeks))
        continue;
      try {
        await this.transactions.run((tx) =>
          this.templates.generateIn(
            tx.manager,
            school,
            addDays(latest.endsOn!, 1),
            template,
            null,
          ),
        );
        generated++;
      } catch (error) {
        if (!(error instanceof RuleViolation)) throw error;
        this.logger.warn(
          `Skipped drafting a cycle at ${school.name}: ${error.message}`,
        );
      }
    }
    return generated;
  }

  // Daily: emails the staff who can close periods or edit the year, before a
  // period starts, before it ends, and when a finished one is still open.
  // Campuses with no template, or remind_days_before 0, are skipped.
  async sendReminders(): Promise<number> {
    let sent = 0;
    for (const school of await this.schools()) {
      const manager = this.dataSource.manager;
      const template = await this.templates.effectiveTemplate(manager, school);
      if (!template || template.remindDaysBefore === 0) continue;
      const today = this.clock.schoolToday(school.timezone);
      const reminders = await this.dueReminders(
        manager,
        school.id,
        today,
        addDays(today, template.remindDaysBefore),
      );
      if (!reminders.length) continue;
      const recipients = await this.recipients(manager, school.id);
      if (!recipients.length) continue;

      for (const reminder of reminders) {
        if (!(await this.claim(reminder))) continue;
        for (const person of recipients) {
          try {
            await this.mail.send(this.message(school, reminder, person));
            sent++;
          } catch (error) {
            this.logger.error(
              `Could not queue a calendar reminder for ${person.email}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }
    }
    return sent;
  }

  private async dueReminders(
    manager: EntityManager,
    schoolId: string,
    today: string,
    leadDay: string,
  ): Promise<Reminder[]> {
    const reminders: Reminder[] = [];
    const add = (
      kind: ReminderKind,
      row: AcademicYear | AcademicPeriod,
      type: PeriodKind,
    ) =>
      reminders.push({
        kind,
        type,
        id: row.id,
        name:
          type === 'academic_year'
            ? yearName(row as AcademicYear)
            : displayName(row as AcademicPeriod),
        date: (kind === 'starts' ? row.startsOn : row.endsOn)!,
        startsOn: row.startsOn,
        endsOn: row.endsOn,
      });
    const running = In(['open', 'closing']);
    for (const [type, entity] of [
      ['academic_year', AcademicYear],
      ['academic_period', AcademicPeriod],
    ] as const) {
      for (const row of await manager.find(entity, {
        where: { schoolId, status: 'scheduled', startsOn: leadDay },
      })) {
        add('starts', row, type);
      }
      for (const row of await manager.find(entity, {
        where: { schoolId, status: running, endsOn: leadDay },
      })) {
        add('ends', row, type);
      }
      for (const row of await manager.find(entity, {
        where: { schoolId, status: running, endsOn: LessThan(today) },
      })) {
        add('overdue', row, type);
      }
    }
    return reminders;
  }

  // Active staff of the campus whose roles there (or global roles) carry
  // "close academic period" or "update academic year".
  private recipients(
    manager: EntityManager,
    schoolId: string,
  ): Promise<Array<{ id: string; name: string; email: string }>> {
    return manager.query(
      `SELECT DISTINCT u.id, u.name, u.email
         FROM users u
         JOIN school_memberships m ON m.user_id = u.id AND m.school_id = $1 AND m.status = 'active'
         JOIN model_has_roles a ON a.user_id = u.id AND (a.school_id = $1 OR a.school_id IS NULL)
         JOIN role_has_permissions rp ON rp.role_id = a.role_id
         JOIN permissions p ON p.id = rp.permission_id AND p.name = ANY($2::varchar[])
        WHERE u.account_status = 'active' AND u.deleted_at IS NULL
        ORDER BY u.email`,
      [schoolId, REMINDER_PERMISSIONS],
    );
  }

  private async claim(reminder: Reminder): Promise<boolean> {
    const key = `academic-calendar-reminder:${reminder.type}:${reminder.id}:${reminder.kind}:${reminder.startsOn ?? ''}:${reminder.endsOn ?? ''}`;
    return (
      (await this.redis.set(key, '1', 'EX', REMINDER_CLAIM_SECONDS, 'NX')) ===
      'OK'
    );
  }

  private message(
    school: School,
    reminder: Reminder,
    person: { name: string; email: string },
  ): MailMessage {
    const day = formatDay(reminder.date);
    const line =
      reminder.kind === 'starts'
        ? `${reminder.name} at ${school.name} starts on ${day}. Review the scheduled work before it opens.`
        : reminder.kind === 'ends'
          ? `${reminder.name} at ${school.name} ends on ${day}. Start the closure-readiness check now.`
          : `${reminder.name} at ${school.name} ended on ${day} and is still open. Review its closure-readiness check.`;
    const url = `${this.frontendUrl}/academic-years`;
    const after =
      'Closing stays a deliberate staff confirmation. Finance continues independently of the academic calendar.';
    const greeting = `Hello ${person.name},`;
    const escape = (text: string) =>
      text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    return {
      to: person.email,
      subject: `${school.name}: ${reminder.name} calendar reminder`,
      text: [
        greeting,
        '',
        line,
        '',
        `Review academic calendar: ${url}`,
        '',
        after,
      ].join('\n'),
      html: [
        `<p>${escape(greeting)}</p>`,
        `<p>${escape(line)}</p>`,
        `<p><a href="${escape(url)}">Review academic calendar</a></p>`,
        `<p>${escape(after)}</p>`,
      ].join('\n'),
    };
  }

  private schools(): Promise<School[]> {
    return this.dataSource.manager.find(School, {
      order: { createdAt: 'ASC' },
    });
  }
}
