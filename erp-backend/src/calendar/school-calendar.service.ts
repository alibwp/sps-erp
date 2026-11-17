import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { CLOSING_EVENT_TYPES } from './calendar.constants.js';
import { CalendarEvent } from './entities/calendar-event.entity.js';

// The closure lookup (reference SchoolCalendar::closureOn), the one place
// that answers whether a campus, or a section of it, is shut on a day.
// Stage 8 refuses cover and Stage 9 refuses registers on such a day. It
// reads the stored events whether or not the campus has the events
// feature switched on.
@Injectable()
export class SchoolCalendar {
  constructor(private readonly dataSource: DataSource) {}

  // The first published holiday or closure covering the day (in the
  // campus's time zone) for the whole campus, or aimed at the section. An
  // event aimed only at people never closes a section.
  closureOn(
    schoolId: string,
    sectionId: string | null,
    day: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<CalendarEvent | null> {
    return manager
      .createQueryBuilder(CalendarEvent, 'event')
      .innerJoin('event.school', 'school')
      .where('event.schoolId = :schoolId', { schoolId })
      .andWhere('event.isPublished = true')
      .andWhere('event.type IN (:...types)', {
        types: [...CLOSING_EVENT_TYPES],
      })
      .andWhere(
        '(event.startsAt AT TIME ZONE school.timezone)::date <= :day AND (event.endsAt AT TIME ZONE school.timezone)::date >= :day',
        { day },
      )
      .andWhere(
        `(NOT EXISTS (SELECT 1 FROM calendar_event_audiences a WHERE a.calendar_event_id = event.id)
          OR (CAST(:sectionId AS uuid) IS NOT NULL AND EXISTS (
            SELECT 1 FROM calendar_event_audiences a
             WHERE a.calendar_event_id = event.id AND a.academic_cycle_section_id = :sectionId)))`,
        { sectionId },
      )
      .orderBy('event.startsAt', 'ASC')
      .getOne();
  }
}
