import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { BillingGroup } from './billing-group.entity.js';
import { Organization } from './organization.entity.js';

// A campus. Every operational record belongs to exactly one.
@Entity({ name: 'schools' })
@Unique('schools_code_unique', ['code'])
@Index('schools_organization_index', ['organizationId'])
@Index('schools_billing_group_index', ['billingGroupId'])
export class School extends AppBaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  // A campus never leaves with its organization's records still pointing
  // at it, so an organization with campuses cannot be deleted.
  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'uuid', nullable: true })
  billingGroupId: string | null;

  @ManyToOne(() => BillingGroup, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'billing_group_id' })
  billingGroup: BillingGroup | null;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  // Short name used in admission and invoice numbers.
  @Column({ type: 'varchar', length: 10, nullable: true })
  initials: string | null;

  @Column({ type: 'varchar', length: 100 })
  code: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  postalCode: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  // IANA name. "Today" at this campus is computed in this zone.
  @Column({ type: 'varchar', length: 64 })
  timezone: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  email: string | null;

  // Storage key of the logo; served through short-lived signed links.
  @Column({ type: 'varchar', length: 2048, nullable: true })
  logoPath: string | null;

  // Set once the campus details form has been saved in full.
  @Column({ type: 'timestamptz', nullable: true })
  setupDetailsCompletedAt: Date | null;

  // The campus default year and period: set when a calendar is published
  // (its first top-level period). A person's own choice wins over them.
  // Relations by name: those entities import this one.
  @Column({ type: 'uuid', nullable: true })
  academicYearId: string | null;

  @ManyToOne('AcademicYear', { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: unknown;

  @Column({ type: 'uuid', nullable: true })
  academicPeriodId: string | null;

  @ManyToOne('AcademicPeriod', { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'academic_period_id' })
  academicPeriod: unknown;

  // A template of its own; null follows the organization default.
  @Column({ type: 'uuid', nullable: true })
  calendarTemplateId: string | null;

  @ManyToOne('CalendarTemplate', { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'calendar_template_id' })
  calendarTemplate: unknown;
}
