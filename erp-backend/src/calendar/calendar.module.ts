import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcademicModule } from '../academic/academic.module.js';
import { CalendarEventsController } from './calendar.controller.js';
import { CalendarEvents } from './calendar-events.service.js';
import { CalendarEventAudience } from './entities/calendar-event-audience.entity.js';
import { CalendarEvent } from './entities/calendar-event.entity.js';
import { SchoolCalendar } from './school-calendar.service.js';

// Stage 7: the campus calendar, behind the events feature, and the closure
// lookup Stages 8 and 9 use whether or not the feature is on.
@Module({
  imports: [
    TypeOrmModule.forFeature([CalendarEvent, CalendarEventAudience]),
    AcademicModule,
  ],
  controllers: [CalendarEventsController],
  providers: [CalendarEvents, SchoolCalendar],
  exports: [SchoolCalendar],
})
export class CalendarModule {}
