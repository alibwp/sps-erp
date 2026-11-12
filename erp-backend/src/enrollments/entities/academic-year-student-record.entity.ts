import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AcademicYear } from '../../academic/entities/academic-year.entity.js';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { AcademicCycleSection } from '../../curriculum/entities/academic-cycle-section.entity.js';
import { StudentRecord } from './student-record.entity.js';

// The section a learner ended up in for each school year (reference
// academic_year_student_record). A placement in a year writes or updates
// that year's row.
@Entity({ name: 'academic_year_student_records' })
@Index(
  'academic_year_student_records_enrollment_year_unique',
  ['studentRecordId', 'academicYearId'],
  { unique: true },
)
@Index('academic_year_student_records_year_section_index', [
  'academicYearId',
  'academicCycleSectionId',
])
export class AcademicYearStudentRecord extends AppBaseEntity {
  @Column({ type: 'uuid' })
  studentRecordId: string;

  @ManyToOne(() => StudentRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_record_id' })
  studentRecord: StudentRecord;

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
}
