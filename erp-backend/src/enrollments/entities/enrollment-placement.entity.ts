import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AcademicPeriod } from '../../academic/entities/academic-period.entity.js';
import { AcademicYear } from '../../academic/entities/academic-year.entity.js';
import { AcademicCycleSection } from '../../curriculum/entities/academic-cycle-section.entity.js';
import { User } from '../../identity/entities/user.entity.js';
import { StudentRecord } from './student-record.entity.js';

// Where a learner sat from a day on (reference EnrollmentPlacement).
// Append-only: a move adds the next row. The row in effect on a day is, of
// the rows effective on or before it, the one made last.
@Entity({ name: 'enrollment_placements' })
@Index('enrollment_placements_enrollment_day_index', [
  'studentRecordId',
  'effectiveOn',
])
@Index('enrollment_placements_section_day_index', [
  'academicCycleSectionId',
  'effectiveOn',
])
export class EnrollmentPlacement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  studentRecordId: string;

  @ManyToOne(() => StudentRecord, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'student_record_id' })
  studentRecord: StudentRecord;

  @Column({ type: 'uuid' })
  academicYearId: string;

  @ManyToOne(() => AcademicYear, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  @Column({ type: 'uuid', nullable: true })
  academicPeriodId: string | null;

  @ManyToOne(() => AcademicPeriod, { onDelete: 'NO ACTION', nullable: true })
  @JoinColumn({ name: 'academic_period_id' })
  academicPeriod: AcademicPeriod | null;

  @Column({ type: 'uuid' })
  academicCycleSectionId: string;

  @ManyToOne(() => AcademicCycleSection, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'academic_cycle_section_id' })
  academicCycleSection: AcademicCycleSection;

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
