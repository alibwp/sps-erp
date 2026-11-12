import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AcademicPeriod } from '../../academic/entities/academic-period.entity.js';
import { AcademicYear } from '../../academic/entities/academic-year.entity.js';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { TeachingRole } from '../curriculum.constants.js';
import { AcademicCycleSection } from './academic-cycle-section.entity.js';
import { CourseOffering } from './course-offering.entity.js';
import { Subject } from './subject.entity.js';

// A teacher's part in one offering, from starts_on to ends_on (inclusive;
// no end: still running). With a section, the teacher works with that
// section's learners only (reference TeachingAssignment). An assignment
// ended before it started (the teacher left first) never runs.
@SchoolOwned()
@Entity({ name: 'teaching_assignments' })
@Index('teaching_assignments_school_subject_year_index', [
  'schoolId',
  'subjectId',
  'academicYearId',
])
@Index('teaching_assignments_user_year_index', ['userId', 'academicYearId'])
@Index('teaching_assignments_offering_index', ['courseOfferingId'])
@Index('teaching_assignments_section_index', ['academicCycleSectionId'])
@Check('teaching_assignments_role_valid', "role IN ('lead', 'supporting')")
export class TeachingAssignment extends AppBaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'uuid' })
  subjectId: string;

  @ManyToOne(() => Subject, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subject_id' })
  subject: Subject;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid' })
  academicYearId: string;

  @ManyToOne(() => AcademicYear, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  @Column({ type: 'uuid', nullable: true })
  academicPeriodId: string | null;

  @ManyToOne(() => AcademicPeriod, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'academic_period_id' })
  academicPeriod: AcademicPeriod | null;

  @Column({ type: 'uuid' })
  courseOfferingId: string;

  @ManyToOne(() => CourseOffering, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'course_offering_id' })
  courseOffering: CourseOffering;

  @Column({ type: 'uuid', nullable: true })
  academicCycleSectionId: string | null;

  @ManyToOne(() => AcademicCycleSection, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'academic_cycle_section_id' })
  academicCycleSection: AcademicCycleSection | null;

  @Column({ type: 'varchar', length: 20, default: 'lead' })
  role: TeachingRole;

  @Column({ type: 'date' })
  startsOn: string;

  @Column({ type: 'date', nullable: true })
  endsOn: string | null;
}
