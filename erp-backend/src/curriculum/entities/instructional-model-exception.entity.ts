import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { RosterMode } from '../../academic/academic.constants.js';
import { AcademicYear } from '../../academic/entities/academic-year.entity.js';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from '../../organizations/entities/school.entity.js';
import { AcademicLevel } from './academic-level.entity.js';
import { Subject } from './subject.entity.js';

// Permission, in writing, for one subject to use a roster the year's model
// refuses (reference InstructionalModelException). No level: every level.
// Revoking keeps the row and leaves the offerings made under it alone.
@SchoolOwned()
@Entity({ name: 'instructional_model_exceptions' })
@Index('instructional_model_exceptions_cycle_index', [
  'schoolId',
  'academicYearId',
])
@Index('instructional_model_exceptions_subject_index', ['subjectId'])
@Index('instructional_model_exceptions_level_index', ['academicLevelId'])
@Check(
  'instructional_model_exceptions_roster_mode_valid',
  "roster_mode IN ('home_section', 'combined_home_sections', 'academic_level', 'individual_roster')",
)
export class InstructionalModelException extends AppBaseEntity {
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
  subjectId: string;

  @ManyToOne(() => Subject, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subject_id' })
  subject: Subject;

  @Column({ type: 'uuid', nullable: true })
  academicLevelId: string | null;

  @ManyToOne(() => AcademicLevel, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'academic_level_id' })
  academicLevel: AcademicLevel | null;

  @Column({ type: 'varchar', length: 40 })
  rosterMode: RosterMode;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'uuid', nullable: true, name: 'granted_by' })
  grantedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'granted_by' })
  grantedBy: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'uuid', nullable: true, name: 'revoked_by' })
  revokedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'revoked_by' })
  revokedBy: User | null;
}
