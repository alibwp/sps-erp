import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { AcademicCycleSection } from '../../curriculum/entities/academic-cycle-section.entity.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { CampusMoveStatus } from '../moving.constants.js';
import { StudentRecord } from './student-record.entity.js';

// One campus asking another of its organization to take a learner
// (reference CampusMoveRequest). The receiving campus decides; approving
// moves the learner in the same transaction. One open request per
// enrollment (campus_move_requests_one_open, made in the migration).
@Entity({ name: 'campus_move_requests' })
@Index('campus_move_requests_one_open', { synchronize: false })
@Index('campus_move_requests_to_school_status_index', ['toSchoolId', 'status'])
@Index('campus_move_requests_enrollment_status_index', [
  'studentRecordId',
  'status',
])
@Check(
  'campus_move_requests_status_valid',
  "status IN ('requested', 'approved', 'rejected', 'cancelled')",
)
export class CampusMoveRequest extends AppBaseEntity {
  @Column({ type: 'uuid' })
  studentRecordId: string;

  @ManyToOne(() => StudentRecord, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'student_record_id' })
  studentRecord: StudentRecord;

  @Column({ type: 'uuid' })
  fromSchoolId: string;

  @ManyToOne(() => School, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'from_school_id' })
  fromSchool: School;

  @Column({ type: 'uuid' })
  toSchoolId: string;

  @ManyToOne(() => School, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'to_school_id' })
  toSchool: School;

  // The section at the receiving campus.
  @Column({ type: 'uuid' })
  academicCycleSectionId: string;

  @ManyToOne(() => AcademicCycleSection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'academic_cycle_section_id' })
  academicCycleSection: AcademicCycleSection;

  @Column({ type: 'varchar', length: 20, default: 'requested' })
  status: CampusMoveStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @Column({ type: 'date' })
  effectiveOn: string;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'requested_by' })
  requestedBy: User | null;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'decided_by' })
  decidedBy: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  decisionNote: string | null;
}
