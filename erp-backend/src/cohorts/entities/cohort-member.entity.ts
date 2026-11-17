import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { StudentRecord } from '../../enrollments/entities/student-record.entity.js';
import { User } from '../../identity/entities/user.entity.js';
import { Cohort } from './cohort.entity.js';

// One spell of a learner in a cohort (reference CohortMember). Leaving
// sets left_on; rows are never deleted, and joining again opens a new row,
// so every past membership survives. One open membership per learner and
// cohort (cohort_members_one_open, made in the migration).
@Entity({ name: 'cohort_members' })
@Index('cohort_members_one_open', { synchronize: false })
@Index('cohort_members_cohort_index', ['cohortId', 'leftOn'])
@Index('cohort_members_enrollment_index', ['studentRecordId'])
@Check(
  'cohort_members_left_after_joined',
  'left_on IS NULL OR left_on >= joined_on',
)
export class CohortMember extends AppBaseEntity {
  @Column({ type: 'uuid' })
  cohortId: string;

  @ManyToOne(() => Cohort, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cohort_id' })
  cohort: Cohort;

  @Column({ type: 'uuid' })
  studentRecordId: string;

  @ManyToOne(() => StudentRecord, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'student_record_id' })
  studentRecord: StudentRecord;

  @Column({ type: 'date' })
  joinedOn: string;

  @Column({ type: 'date', nullable: true })
  leftOn: string | null;

  @Column({ name: 'added_by', type: 'uuid', nullable: true })
  addedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'added_by' })
  addedBy: User | null;
}
