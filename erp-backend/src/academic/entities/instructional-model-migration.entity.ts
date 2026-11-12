import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { InstructionalModel } from '../academic.constants.js';
import { AcademicYear } from './academic-year.entity.js';

// A change of teaching model after the year started, with its reason and
// impact (append-only). Plain foreign keys: the table refuses the UPDATE or
// DELETE a cascade would make.
@SchoolOwned()
@Entity({ name: 'instructional_model_migrations' })
@Index('instructional_model_migrations_year_index', [
  'schoolId',
  'academicYearId',
])
@Check(
  'instructional_model_migrations_to_model_valid',
  "to_model IN ('fixed_home_sections', 'hybrid', 'subject_based_schedule')",
)
export class InstructionalModelMigration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'uuid' })
  academicYearId: string;

  @ManyToOne(() => AcademicYear, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  @Column({ type: 'varchar', length: 40, nullable: true })
  fromModel: InstructionalModel | null;

  @Column({ type: 'varchar', length: 40 })
  toModel: InstructionalModel;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'jsonb', nullable: true })
  impact: Record<string, unknown> | null;

  @Column({ name: 'migrated_by', type: 'uuid', nullable: true })
  migratedById: string | null;

  @ManyToOne(() => User, { onDelete: 'NO ACTION', nullable: true })
  @JoinColumn({ name: 'migrated_by' })
  migratedBy: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
