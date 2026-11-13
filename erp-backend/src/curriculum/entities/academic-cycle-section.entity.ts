import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AcademicYear } from '../../academic/entities/academic-year.entity.js';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { StructureStatus } from '../curriculum.constants.js';
import { AcademicLevel } from './academic-level.entity.js';

// One section (arm, stream, homeroom) of a level in one school year
// (reference AcademicCycleSection). Its name is unique per campus, year and
// level ignoring case (academic_cycle_sections_identity_unique, created in
// the migration). Sections are archived, never deleted.
@SchoolOwned()
@Entity({ name: 'academic_cycle_sections' })
@Index('academic_cycle_sections_identity_unique', { synchronize: false })
@Index('academic_cycle_sections_listing_index', [
  'schoolId',
  'academicYearId',
  'status',
  'position',
])
@Index('academic_cycle_sections_level_index', ['academicLevelId'])
@Index('academic_cycle_sections_homeroom_teacher_index', ['homeroomTeacherId'])
@Check(
  'academic_cycle_sections_status_valid',
  "status IN ('draft', 'active', 'archived')",
)
@Check(
  'academic_cycle_sections_capacity_positive',
  'capacity IS NULL OR capacity > 0',
)
export class AcademicCycleSection extends AppBaseEntity {
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
  academicLevelId: string;

  @ManyToOne(() => AcademicLevel, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'academic_level_id' })
  academicLevel: AcademicLevel;

  @Column({ type: 'uuid', nullable: true })
  homeroomTeacherId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'homeroom_teacher_id' })
  homeroomTeacher: User | null;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  label: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  stream: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  shift: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  language: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  room: string | null;

  @Column({ type: 'smallint', nullable: true })
  capacity: number | null;

  @Column({ type: 'smallint', default: 0 })
  position: number;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: StructureStatus;
}
