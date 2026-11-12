import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { AcademicCycleSection } from '../../curriculum/entities/academic-cycle-section.entity.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { EnrollmentStatus } from '../enrollment.constants.js';

// A learner's enrollment at one campus (reference StudentRecord). Its
// section is a pointer to the newest placement; the history is in
// enrollment_placements and enrollment_status_changes. A person has at most
// one open (active or suspended) enrollment anywhere
// (student_records_one_open_enrollment), and an admission number is unique
// per campus ignoring case (student_records_school_admission_number_unique);
// both are created in the migration.
@SchoolOwned()
@Entity({ name: 'student_records' })
@Index('student_records_one_open_enrollment', { synchronize: false })
@Index('student_records_school_admission_number_unique', {
  synchronize: false,
})
@Index('student_records_school_status_index', ['schoolId', 'status'])
@Index('student_records_user_index', ['userId'])
@Index('student_records_section_index', ['academicCycleSectionId'])
@Check(
  'student_records_status_valid',
  "status IN ('active', 'suspended', 'withdrawn', 'transferred', 'graduated', 'archived')",
)
export class StudentRecord extends AppBaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 100 })
  admissionNumber: string;

  @Column({ type: 'date' })
  admissionDate: string;

  @Column({ type: 'uuid', nullable: true })
  academicCycleSectionId: string | null;

  @ManyToOne(() => AcademicCycleSection, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({ name: 'academic_cycle_section_id' })
  academicCycleSection: AcademicCycleSection | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: EnrollmentStatus;

  @Column({ type: 'boolean', default: true })
  isPrimary: boolean;

  @Column({ type: 'uuid', nullable: true })
  transferredFromId: string | null;

  @ManyToOne(() => StudentRecord, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'transferred_from_id' })
  transferredFrom: StudentRecord | null;
}
