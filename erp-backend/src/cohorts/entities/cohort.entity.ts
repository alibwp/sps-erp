import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AcademicYear } from '../../academic/entities/academic-year.entity.js';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { CohortType } from '../cohorts.constants.js';

// A named group of learners (reference Cohort). The name is unique per
// campus ignoring case (cohorts_school_name_unique, made in the
// migration). A restricted cohort and its members are seen only with
// "read restricted cohort"; a watchlist is always restricted.
@SchoolOwned()
@Entity({ name: 'cohorts' })
@Index('cohorts_school_name_unique', { synchronize: false })
@Check(
  'cohorts_type_valid',
  "type IN ('graduation_year', 'scholarship', 'club', 'watchlist', 'ranking_group', 'other')",
)
@Check('cohorts_watchlist_restricted', "type <> 'watchlist' OR is_restricted")
export class Cohort extends AppBaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 30, default: 'other' })
  type: CohortType;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: false })
  isRestricted: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'uuid', nullable: true })
  academicYearId: string | null;

  @ManyToOne(() => AcademicYear, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;
}
