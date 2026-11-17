import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AcademicYear } from '../../academic/entities/academic-year.entity.js';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { AcademicCycleSection } from '../../curriculum/entities/academic-cycle-section.entity.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { WaitlistStatus } from '../moving.constants.js';

// A candidate waiting for a seat in a full section (reference
// AdmissionWaitlistEntry). The queue runs by priority, highest first, then
// position. One open (pending or offered) entry per candidate and section
// (admission_waitlist_entries_one_open, made in the migration).
@SchoolOwned()
@Entity({ name: 'admission_waitlist_entries' })
@Index('admission_waitlist_entries_one_open', { synchronize: false })
@Index('admission_waitlist_queue_index', [
  'schoolId',
  'academicCycleSectionId',
  'status',
  'priority',
  'position',
])
@Index('admission_waitlist_person_index', ['schoolId', 'userId', 'status'])
@Check(
  'admission_waitlist_entries_status_valid',
  "status IN ('pending', 'offered', 'accepted', 'declined', 'withdrawn', 'placed')",
)
@Check('admission_waitlist_entries_priority_valid', 'priority >= 0')
export class AdmissionWaitlistEntry extends AppBaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'uuid' })
  academicYearId: string;

  @ManyToOne(() => AcademicYear, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  @Column({ type: 'uuid' })
  academicCycleSectionId: string;

  @ManyToOne(() => AcademicCycleSection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'academic_cycle_section_id' })
  academicCycleSection: AcademicCycleSection;

  // The candidate.
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @Column({ name: 'offered_by', type: 'uuid', nullable: true })
  offeredById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'offered_by' })
  offeredBy: User | null;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'decided_by' })
  decidedBy: User | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: WaitlistStatus;

  @Column({ type: 'integer', default: 0 })
  priority: number;

  @Column({ type: 'integer' })
  position: number;

  @Column({ type: 'text', nullable: true })
  decisionReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  offeredAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;
}
