import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { AcademicStatus, PeriodType } from '../academic.constants.js';
import { AcademicYear } from './academic-year.entity.js';

// A term, semester or other division of a year. Top-level periods divide
// the year; sub-periods (exam windows, holidays, reporting periods) sit
// inside one.
@SchoolOwned()
@Entity({ name: 'academic_periods' })
@Index('academic_periods_year_position_index', ['academicYearId', 'position'])
@Index('academic_periods_parent_index', ['parentId'])
@Index('academic_periods_school_status_index', ['schoolId', 'status'])
@Check(
  'academic_periods_status_valid',
  "status IN ('draft', 'scheduled', 'open', 'closing', 'closed', 'archived')",
)
@Check(
  'academic_periods_type_valid',
  "type IN ('term', 'semester', 'trimester', 'quarter', 'exam_window', 'holiday', 'reporting_period', 'other')",
)
export class AcademicPeriod extends AppBaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'uuid' })
  academicYearId: string;

  @ManyToOne(() => AcademicYear, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  @Column({ type: 'uuid', nullable: true })
  parentId: string | null;

  @ManyToOne(() => AcademicPeriod, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: AcademicPeriod | null;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  // Shown instead of the name when set.
  @Column({ type: 'varchar', length: 100, nullable: true })
  label: string | null;

  @Column({ type: 'varchar', length: 20 })
  type: PeriodType;

  @Column({ type: 'smallint', default: 1 })
  position: number;

  @Column({ type: 'date', nullable: true })
  startsOn: string | null;

  @Column({ type: 'date', nullable: true })
  endsOn: string | null;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: AcademicStatus;
}

export function displayName(
  period: Pick<AcademicPeriod, 'name' | 'label'>,
): string {
  return period.label ?? period.name;
}
