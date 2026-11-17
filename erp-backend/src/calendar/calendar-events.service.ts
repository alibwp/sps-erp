import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager, In } from 'typeorm';
import { AcademicPeriodContext } from '../academic/academic-period-context.service.js';
import { Forbidden } from '../access/access.constants.js';
import { isPortalOnly } from '../access/portal-only.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { ValidationFailed } from '../common/errors/api-exception.js';
import { findInSchool } from '../common/tenancy/school-scope.js';
import { AcademicCycleSection } from '../curriculum/entities/academic-cycle-section.entity.js';
import { School } from '../organizations/entities/school.entity.js';
import { SchoolMembership } from '../organizations/entities/school-membership.entity.js';
import { type CalendarEventType, wallTime } from './calendar.constants.js';
import { CalendarEventAudience } from './entities/calendar-event-audience.entity.js';
import { CalendarEvent } from './entities/calendar-event.entity.js';

export const EVENT_NOT_FOUND = 'Event not found.';

export const EventMessages = {
  endsBeforeStart: 'A day on the calendar cannot end before it starts.',
  tooLong:
    'A day on the calendar cannot last more than a year. Check the year.',
  section: 'The selected section is invalid.',
  person: 'The selected person is invalid.',
} as const;

export interface EventInput {
  title?: string;
  type?: CalendarEventType;
  description?: string | null;
  location?: string | null;
  isAllDay?: boolean;
  // The campus's own time: "2026-11-10" for an all-day event, otherwise
  // "2026-11-10T09:30".
  startsAt?: string;
  endsAt?: string;
  sectionIds?: string[];
  userIds?: string[];
}

export interface Reader {
  id: string;
  permissions: ReadonlySet<string>;
}

// The events of a campus's calendar (reference CalendarEventEditor,
// CalendarEventDirectory, CalendarEventPolicy). An event starts as a draft;
// drafts are seen by those who may change events, and by their creator.
@Injectable()
export class CalendarEvents {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly periods: AcademicPeriodContext,
  ) {}

  async list(
    school: School,
    reader: Reader,
    filter: {
      from: string;
      to: string;
      type?: CalendarEventType;
      draftsOnly?: boolean;
    },
  ): Promise<CalendarEvent[]> {
    await this.mustNotBePortalOnly(reader.id, school.id);
    const query = this.dataSource.manager
      .createQueryBuilder(CalendarEvent, 'event')
      .innerJoin('event.school', 'school')
      .leftJoinAndSelect('event.audiences', 'audience')
      .where('event.schoolId = :schoolId', { schoolId: school.id })
      .andWhere(
        '(event.startsAt AT TIME ZONE school.timezone)::date <= :to AND (event.endsAt AT TIME ZONE school.timezone)::date >= :from',
        { from: filter.from, to: filter.to },
      )
      .orderBy('event.startsAt', 'ASC');
    if (!this.mayChange(reader)) {
      query.andWhere('event.isPublished = true');
    }
    if (filter.type)
      query.andWhere('event.type = :type', { type: filter.type });
    if (filter.draftsOnly) query.andWhere('event.isPublished = false');
    return query.getMany();
  }

  async find(
    school: School,
    id: string,
    reader: Reader,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<CalendarEvent> {
    await this.mustNotBePortalOnly(reader.id, school.id, manager);
    const event = await this.eventHere(manager, school.id, id);
    if (
      !event.isPublished &&
      !this.mayChange(reader) &&
      event.createdById !== reader.id
    ) {
      throw new Forbidden();
    }
    return event;
  }

  // The event a write route just changed, for its answer: the route's own
  // permission already allowed the action, so the draft rule of find()
  // does not apply.
  load(schoolId: string, id: string): Promise<CalendarEvent> {
    return this.eventHere(this.dataSource.manager, schoolId, id);
  }

  async create(
    reader: Reader,
    school: School,
    input: EventInput & {
      title: string;
      type: CalendarEventType;
      startsAt: string;
      endsAt: string;
    },
  ): Promise<CalendarEvent> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const times = await this.times(manager, school, input, null);
      const working = await this.periods.resolve(
        reader.id,
        school,
        undefined,
        manager,
      );
      const event = await manager.save(
        manager.create(CalendarEvent, {
          schoolId: school.id,
          academicYearId: working.academicYear?.id ?? null,
          academicPeriodId: working.academicPeriod?.id ?? null,
          title: input.title.trim(),
          type: input.type,
          description: input.description?.trim() || null,
          location: input.location?.trim() || null,
          isAllDay: times.isAllDay,
          isPublished: false,
          startsAt: times.startsAt,
          endsAt: times.endsAt,
          createdById: reader.id,
        }),
      );
      await this.replaceAudiences(manager, school.id, event.id, input);
      return event;
    });
  }

  async update(
    reader: Reader,
    school: School,
    id: string,
    input: EventInput,
  ): Promise<CalendarEvent> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const event = await this.eventHere(manager, school.id, id, true);
      const times = await this.times(manager, school, input, event);
      event.title = input.title?.trim() ?? event.title;
      event.type = input.type ?? event.type;
      if (input.description !== undefined) {
        event.description = input.description?.trim() || null;
      }
      if (input.location !== undefined) {
        event.location = input.location?.trim() || null;
      }
      event.isAllDay = times.isAllDay;
      event.startsAt = times.startsAt;
      event.endsAt = times.endsAt;
      const saved = await manager.save(event);
      if (input.sectionIds !== undefined || input.userIds !== undefined) {
        const current = await manager.find(CalendarEventAudience, {
          where: { calendarEventId: event.id },
        });
        await this.replaceAudiences(manager, school.id, event.id, {
          sectionIds:
            input.sectionIds ??
            current.flatMap((a) =>
              a.academicCycleSectionId ? [a.academicCycleSectionId] : [],
            ),
          userIds:
            input.userIds ??
            current.flatMap((a) => (a.userId ? [a.userId] : [])),
        });
      }
      return saved;
    });
  }

  async setPublished(
    schoolId: string,
    id: string,
    isPublished: boolean,
  ): Promise<CalendarEvent> {
    return this.transactions.run(async (tx) => {
      const event = await this.eventHere(tx.manager, schoolId, id, true);
      event.isPublished = isPublished;
      return tx.manager.save(event);
    });
  }

  async remove(schoolId: string, id: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      const event = await this.eventHere(tx.manager, schoolId, id, true);
      await tx.manager.delete(CalendarEventAudience, {
        calendarEventId: event.id,
      });
      await tx.manager.remove(event);
    });
  }

  audiences(eventId: string): Promise<CalendarEventAudience[]> {
    return this.dataSource.manager.find(CalendarEventAudience, {
      where: { calendarEventId: eventId },
      relations: { academicCycleSection: true, user: true },
      withDeleted: true,
      order: { createdAt: 'ASC' },
    });
  }

  private mayChange(reader: Reader): boolean {
    return reader.permissions.has('update calendar event');
  }

  // Families read their calendar through the portal (Stage 13), not the
  // campus calendar (CalendarEventPolicy::isPortalOnly).
  private async mustNotBePortalOnly(
    userId: string,
    schoolId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    if (await isPortalOnly(manager, userId, schoolId)) throw new Forbidden();
  }

  // Start and end as instants: an all-day event covers whole days of the
  // campus; a timed one starts and ends at the campus's own clock times.
  private async times(
    manager: EntityManager,
    school: School,
    input: EventInput,
    current: CalendarEvent | null,
  ): Promise<{ isAllDay: boolean; startsAt: Date; endsAt: Date }> {
    const isAllDay = input.isAllDay ?? current?.isAllDay ?? true;
    if (
      current &&
      input.startsAt === undefined &&
      input.endsAt === undefined &&
      input.isAllDay === undefined
    ) {
      return { isAllDay, startsAt: current.startsAt, endsAt: current.endsAt };
    }
    // A change to one end keeps the other as it was.
    const start =
      input.startsAt ??
      (current ? wallTime(current.startsAt, school.timezone) : undefined);
    const end =
      input.endsAt ??
      (current ? wallTime(current.endsAt, school.timezone) : undefined);
    if (!start || !end) {
      throw new ValidationFailed({
        ...(start ? {} : { startsAt: ['The start field is required.'] }),
        ...(end ? {} : { endsAt: ['The end field is required.'] }),
      });
    }
    const startWall = isAllDay ? `${start.slice(0, 10)}T00:00:00` : start;
    const endWall = isAllDay ? `${end.slice(0, 10)}T23:59:59` : end;
    if (endWall < startWall) {
      throw new ValidationFailed({ endsAt: [EventMessages.endsBeforeStart] });
    }
    const yearLater = `${String(Number(startWall.slice(0, 4)) + 1)}${startWall.slice(4)}`;
    if (endWall > yearLater) {
      throw new ValidationFailed({ endsAt: [EventMessages.tooLong] });
    }
    const [row] = (await manager.query(
      `SELECT ($1::timestamp AT TIME ZONE $3) AS starts_at, ($2::timestamp AT TIME ZONE $3) AS ends_at`,
      [startWall, endWall, school.timezone],
    )) as Array<{ starts_at: Date; ends_at: Date }>;
    return { isAllDay, startsAt: row.starts_at, endsAt: row.ends_at };
  }

  private async replaceAudiences(
    manager: EntityManager,
    schoolId: string,
    eventId: string,
    input: { sectionIds?: string[]; userIds?: string[] },
  ): Promise<void> {
    const sectionIds = [...new Set(input.sectionIds ?? [])];
    const userIds = [...new Set(input.userIds ?? [])];
    if (sectionIds.length) {
      const found = await manager.count(AcademicCycleSection, {
        where: { id: In(sectionIds), schoolId },
      });
      if (found !== sectionIds.length) {
        throw new ValidationFailed({ sectionIds: [EventMessages.section] });
      }
    }
    if (userIds.length) {
      const found = await manager.count(SchoolMembership, {
        where: { userId: In(userIds), schoolId, status: 'active' },
      });
      if (found !== userIds.length) {
        throw new ValidationFailed({ userIds: [EventMessages.person] });
      }
    }
    await manager.delete(CalendarEventAudience, { calendarEventId: eventId });
    for (const sectionId of sectionIds) {
      await manager.insert(CalendarEventAudience, {
        calendarEventId: eventId,
        academicCycleSectionId: sectionId,
        userId: null,
      });
    }
    for (const userId of userIds) {
      await manager.insert(CalendarEventAudience, {
        calendarEventId: eventId,
        academicCycleSectionId: null,
        userId,
      });
    }
  }

  private eventHere(
    manager: EntityManager,
    schoolId: string,
    id: string,
    lock = false,
  ): Promise<CalendarEvent> {
    return findInSchool(
      manager,
      CalendarEvent,
      { id },
      { schoolId, lock, notFound: EVENT_NOT_FOUND },
    );
  }
}
