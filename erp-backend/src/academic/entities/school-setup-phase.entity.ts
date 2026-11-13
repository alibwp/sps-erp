import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { SetupPhaseStatus } from '../academic.constants.js';
import { AcademicYear } from './academic-year.entity.js';

// The campus's setup for one working year: in progress until every
// required checklist item is done, then ready, then acknowledged.
@SchoolOwned()
@Entity({ name: 'school_setup_phases' })
@Unique('school_setup_phases_school_phase_unique', ['schoolId', 'phaseKey'])
@Index('school_setup_phases_school_status_index', ['schoolId', 'status'])
export class SchoolSetupPhase extends AppBaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'uuid', nullable: true })
  academicYearId: string | null;

  @ManyToOne(() => AcademicYear, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear | null;

  @Column({ type: 'varchar', length: 150 })
  phaseKey: string;

  @Column({ type: 'varchar', length: 30, default: 'in_progress' })
  status: SetupPhaseStatus;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  acknowledgedAt: Date | null;

  @Column({ name: 'acknowledged_by', type: 'uuid', nullable: true })
  acknowledgedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'acknowledged_by' })
  acknowledgedBy: User | null;
}
