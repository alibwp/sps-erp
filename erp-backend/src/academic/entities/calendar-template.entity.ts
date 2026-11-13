import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { User } from '../../identity/entities/user.entity.js';
import { Organization } from '../../organizations/entities/organization.entity.js';

// An organization's school-year pattern: periods as day offsets from the
// cycle start. Campuses follow the organization default unless they
// override it.
@Entity({ name: 'calendar_templates' })
@Index('calendar_templates_organization_index', ['organizationId'])
// At most one default per organization (partial unique index, migration).
@Index('calendar_templates_one_default', { synchronize: false })
export class CalendarTemplate extends AppBaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'smallint', default: 365 })
  cycleLengthDays: number;

  // The hourly job opens scheduled years and periods of campuses that
  // follow a template with this on.
  @Column({ type: 'boolean', default: false })
  autoOpen: boolean;

  // 0: never draft the next cycle automatically.
  @Column({ type: 'smallint', default: 0 })
  generateAheadWeeks: number;

  // 0: no reminders.
  @Column({ type: 'smallint', default: 14 })
  remindDaysBefore: number;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;
}
