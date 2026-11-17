import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { AcademicCycleSection } from '../../curriculum/entities/academic-cycle-section.entity.js';
import { User } from '../../identity/entities/user.entity.js';
import { CalendarEvent } from './calendar-event.entity.js';

// Narrows an event to one section or one person (reference
// CalendarEventAudience). An event with none is for the whole campus.
@Entity({ name: 'calendar_event_audiences' })
@Index('calendar_event_audiences_event_index', ['calendarEventId'])
@Index('calendar_event_audiences_section_index', ['academicCycleSectionId'])
@Index('calendar_event_audiences_user_index', ['userId'])
@Check(
  'calendar_event_audiences_one_target',
  '(academic_cycle_section_id IS NULL) <> (user_id IS NULL)',
)
export class CalendarEventAudience extends AppBaseEntity {
  @Column({ type: 'uuid' })
  calendarEventId: string;

  @ManyToOne(() => CalendarEvent, (event) => event.audiences, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'calendar_event_id' })
  calendarEvent: CalendarEvent;

  @Column({ type: 'uuid', nullable: true })
  academicCycleSectionId: string | null;

  @ManyToOne(() => AcademicCycleSection, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({ name: 'academic_cycle_section_id' })
  academicCycleSection: AcademicCycleSection | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;
}
