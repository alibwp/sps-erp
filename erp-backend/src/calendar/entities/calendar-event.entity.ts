import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { AcademicPeriod } from '../../academic/entities/academic-period.entity.js';
import { AcademicYear } from '../../academic/entities/academic-year.entity.js';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { CalendarEventType } from '../calendar.constants.js';
import { CalendarEventAudience } from './calendar-event-audience.entity.js';

// A dated event on a campus's calendar (reference CalendarEvent). New
// events are drafts; only a published holiday or closure shuts the campus,
// or the sections it is aimed at. Times are instants; the campus's time
// zone decides which days they cover.
@SchoolOwned()
@Entity({ name: 'calendar_events' })
@Index('calendar_events_school_starts_index', ['schoolId', 'startsAt'])
@Check(
  'calendar_events_type_valid',
  "type IN ('holiday', 'closure', 'special_day', 'assembly', 'activity', 'parent_meeting', 'appointment', 'examination', 'other')",
)
@Check('calendar_events_ends_after_start', 'ends_at >= starts_at')
export class CalendarEvent extends AppBaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'uuid', nullable: true })
  academicYearId: string | null;

  @ManyToOne(() => AcademicYear, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear | null;

  @Column({ type: 'uuid', nullable: true })
  academicPeriodId: string | null;

  @ManyToOne(() => AcademicPeriod, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'academic_period_id' })
  academicPeriod: AcademicPeriod | null;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 30, default: 'other' })
  type: CalendarEventType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

  @Column({ type: 'boolean', default: true })
  isAllDay: boolean;

  @Column({ type: 'boolean', default: false })
  isPublished: boolean;

  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  endsAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @OneToMany(() => CalendarEventAudience, (audience) => audience.calendarEvent)
  audiences: CalendarEventAudience[];
}
