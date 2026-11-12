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
import { User } from '../../identity/entities/user.entity.js';
import type { AcademicStatus } from '../academic.constants.js';

export type PeriodKind = 'academic_year' | 'academic_period';

// One status change of a year or a period (append-only: a trigger refuses
// UPDATE and DELETE). A close keeps the readiness findings it was made on.
@Entity({ name: 'academic_period_status_changes' })
@Index('academic_period_status_changes_period_index', [
  'periodType',
  'periodId',
])
@Check(
  'academic_period_status_changes_period_type_valid',
  "period_type IN ('academic_year', 'academic_period')",
)
export class AcademicPeriodStatusChange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  periodType: PeriodKind;

  // The year or period; no foreign key, as it can point at either.
  @Column({ type: 'uuid' })
  periodId: string;

  @Column({ type: 'varchar', length: 20 })
  fromStatus: AcademicStatus;

  @Column({ type: 'varchar', length: 20 })
  toStatus: AcademicStatus;

  // Plain foreign key: this table refuses the UPDATE a SET NULL would make.
  @Column({ name: 'changed_by', type: 'uuid', nullable: true })
  changedById: string | null;

  @ManyToOne(() => User, { onDelete: 'NO ACTION', nullable: true })
  @JoinColumn({ name: 'changed_by' })
  changedBy: User | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @Column({ type: 'jsonb', nullable: true })
  checklist: unknown[] | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
