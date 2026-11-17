import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { ProgramType } from '../cohorts.constants.js';

// A programme learners take part in (reference Program). The name is
// unique per campus ignoring case (programs_school_name_unique, made in
// the migration).
@SchoolOwned()
@Entity({ name: 'programs' })
@Index('programs_school_name_unique', { synchronize: false })
@Check(
  'programs_type_valid',
  "type IN ('club', 'intervention', 'support_service', 'extracurricular', 'special')",
)
export class Program extends AppBaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 30, default: 'club' })
  type: ProgramType;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
