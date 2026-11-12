import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { RosterMode } from '../../academic/academic.constants.js';
import { AcademicPeriod } from '../../academic/entities/academic-period.entity.js';
import { AcademicYear } from '../../academic/entities/academic-year.entity.js';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { StructureStatus } from '../curriculum.constants.js';
import { AcademicLevel } from './academic-level.entity.js';
import { Subject } from './subject.entity.js';

// One subject taught to one level in one period, with its roster (reference
// CourseOffering). While active it holds an active_key, unique, so two
// active offerings never share a subject, period, level and roster.
@SchoolOwned()
@Entity({ name: 'course_offerings' })
@Index('course_offerings_active_key_unique', ['activeKey'], { unique: true })
@Index('course_offerings_school_period_status_index', [
  'schoolId',
  'academicPeriodId',
  'status',
])
@Index('course_offerings_year_level_index', [
  'academicYearId',
  'academicLevelId',
])
@Index('course_offerings_subject_index', ['subjectId'])
@Index('course_offerings_level_index', ['academicLevelId'])
@Check(
  'course_offerings_status_valid',
  "status IN ('draft', 'active', 'archived')",
)
@Check(
  'course_offerings_roster_mode_valid',
  "roster_mode IN ('home_section', 'combined_home_sections', 'academic_level', 'individual_roster')",
)
export class CourseOffering extends AppBaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'uuid' })
  academicYearId: string;

  @ManyToOne(() => AcademicYear, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  @Column({ type: 'uuid' })
  academicPeriodId: string;

  @ManyToOne(() => AcademicPeriod, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'academic_period_id' })
  academicPeriod: AcademicPeriod;

  @Column({ type: 'uuid' })
  subjectId: string;

  @ManyToOne(() => Subject, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subject_id' })
  subject: Subject;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string | null;

  @Column({ type: 'uuid' })
  academicLevelId: string;

  @ManyToOne(() => AcademicLevel, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'academic_level_id' })
  academicLevel: AcademicLevel;

  @Column({ type: 'varchar', length: 32, default: 'home_section' })
  rosterMode: RosterMode;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: StructureStatus;

  @Column({ type: 'smallint', nullable: true })
  plannedPeriodsPerWeek: number | null;

  @Column({ type: 'smallint', nullable: true })
  capacity: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  activeKey: string | null;
}
