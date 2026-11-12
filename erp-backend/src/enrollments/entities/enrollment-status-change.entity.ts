import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../identity/entities/user.entity.js';
import type { EnrollmentStatus } from '../enrollment.constants.js';
import { StudentRecord } from './student-record.entity.js';

// Every change of an enrollment's state, with who, why and from which day
// (reference EnrollmentStatusChange). Append-only.
@Entity({ name: 'enrollment_status_changes' })
@Index('enrollment_status_changes_enrollment_day_index', [
  'studentRecordId',
  'effectiveOn',
])
@Check(
  'enrollment_status_changes_to_status_valid',
  "to_status IN ('active', 'suspended', 'withdrawn', 'transferred', 'graduated', 'archived')",
)
export class EnrollmentStatusChange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  studentRecordId: string;

  @ManyToOne(() => StudentRecord, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'student_record_id' })
  studentRecord: StudentRecord;

  @Column({ type: 'varchar', length: 20, nullable: true })
  fromStatus: EnrollmentStatus | null;

  @Column({ type: 'varchar', length: 20 })
  toStatus: EnrollmentStatus;

  @Column({ type: 'date' })
  effectiveOn: string;

  @Column({ name: 'changed_by', type: 'uuid', nullable: true })
  changedById: string | null;

  @ManyToOne(() => User, { onDelete: 'NO ACTION', nullable: true })
  @JoinColumn({ name: 'changed_by' })
  changedBy: User | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
