import { Check, Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { InstructionalModel } from '../academic.constants.js';
import { AcademicYear } from './academic-year.entity.js';

// How a campus teaches one year. No row: the default (fixed home
// sections), not chosen yet.
@SchoolOwned()
@Entity({ name: 'instructional_model_settings' })
@Unique('instructional_model_settings_school_year_unique', [
  'schoolId',
  'academicYearId',
])
@Check(
  'instructional_model_settings_model_valid',
  "model IN ('fixed_home_sections', 'hybrid', 'subject_based_schedule')",
)
export class InstructionalModelSetting extends AppBaseEntity {
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

  @Column({ type: 'varchar', length: 40 })
  model: InstructionalModel;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'updated_by' })
  updatedBy: User | null;
}
