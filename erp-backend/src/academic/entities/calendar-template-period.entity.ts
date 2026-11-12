import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import type { PeriodType } from '../academic.constants.js';
import { CalendarTemplate } from './calendar-template.entity.js';

// One period of a template: it starts startOffsetDays after the cycle
// start and runs lengthDays days.
@Entity({ name: 'calendar_template_periods' })
@Index('calendar_template_periods_template_position_index', [
  'calendarTemplateId',
  'position',
])
@Index('calendar_template_periods_parent_index', ['parentId'])
export class CalendarTemplatePeriod extends AppBaseEntity {
  @Column({ type: 'uuid' })
  calendarTemplateId: string;

  @ManyToOne(() => CalendarTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'calendar_template_id' })
  calendarTemplate: CalendarTemplate;

  @Column({ type: 'uuid', nullable: true })
  parentId: string | null;

  @ManyToOne(() => CalendarTemplatePeriod, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'parent_id' })
  parent: CalendarTemplatePeriod | null;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  label: string | null;

  @Column({ type: 'varchar', length: 30 })
  type: PeriodType;

  @Column({ type: 'smallint', default: 1 })
  position: number;

  @Column({ type: 'smallint', default: 0 })
  startOffsetDays: number;

  @Column({ type: 'smallint' })
  lengthDays: number;
}
