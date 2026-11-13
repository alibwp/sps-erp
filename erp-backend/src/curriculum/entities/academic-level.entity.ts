import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { StructureStatus } from '../curriculum.constants.js';

// A grade or class a campus teaches, reused every year (reference
// AcademicLevel). A level group sits at the top and teaches through its
// child levels. Name and code are unique per campus ignoring case
// (academic_levels_school_name_unique, academic_levels_school_code_unique,
// created in the migration).
@SchoolOwned()
@Entity({ name: 'academic_levels' })
@Index('academic_levels_school_name_unique', { synchronize: false })
@Index('academic_levels_school_code_unique', { synchronize: false })
@Index('academic_levels_school_status_position_index', [
  'schoolId',
  'status',
  'position',
])
@Index('academic_levels_parent_index', ['parentId'])
@Check(
  'academic_levels_status_valid',
  "status IN ('draft', 'active', 'archived')",
)
export class AcademicLevel extends AppBaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'uuid', nullable: true })
  parentId: string | null;

  @ManyToOne(() => AcademicLevel, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: AcademicLevel | null;

  @Column({ type: 'boolean', default: false })
  isGroup: boolean;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  code: string | null;

  @Column({ type: 'smallint', default: 0 })
  position: number;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: StructureStatus;
}
