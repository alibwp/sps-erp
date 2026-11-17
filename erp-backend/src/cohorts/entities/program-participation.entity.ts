import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AcademicYear } from '../../academic/entities/academic-year.entity.js';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { StudentRecord } from '../../enrollments/entities/student-record.entity.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { ParticipationStatus } from '../cohorts.constants.js';
import { Program } from './program.entity.js';

// A learner's place in a programme (reference ProgramParticipation). One
// running (requested or active) place per learner and programme
// (program_participations_one_running, made in the migration).
@SchoolOwned()
@Entity({ name: 'program_participations' })
@Index('program_participations_one_running', { synchronize: false })
@Index('program_participations_school_status_index', ['schoolId', 'status'])
@Index('program_participations_enrollment_index', ['studentRecordId'])
@Check(
  'program_participations_status_valid',
  "status IN ('requested', 'active', 'completed', 'withdrawn')",
)
export class ProgramParticipation extends AppBaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'uuid' })
  programId: string;

  @ManyToOne(() => Program, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'program_id' })
  program: Program;

  @Column({ type: 'uuid' })
  studentRecordId: string;

  @ManyToOne(() => StudentRecord, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'student_record_id' })
  studentRecord: StudentRecord;

  @Column({ type: 'varchar', length: 20, default: 'requested' })
  status: ParticipationStatus;

  @Column({ type: 'date', nullable: true })
  startsOn: string | null;

  @Column({ type: 'date', nullable: true })
  endsOn: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  schedule: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  // The staff member who runs the learner's place.
  @Column({ name: 'staff_id', type: 'uuid', nullable: true })
  staffId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'staff_id' })
  staff: User | null;

  @Column({ type: 'uuid', nullable: true })
  academicYearId: string | null;

  @ManyToOne(() => AcademicYear, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear | null;
}
