import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { AcademicStatus } from '../academic.constants.js';

// A school year (a cycle) of one campus. Its periods divide it.
@SchoolOwned()
@Entity({ name: 'academic_years' })
@Index('academic_years_school_status_index', ['schoolId', 'status'])
@Check(
  'academic_years_status_valid',
  "status IN ('draft', 'scheduled', 'open', 'closing', 'closed', 'archived')",
)
export class AcademicYear extends AppBaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'integer' })
  startYear: number;

  @Column({ type: 'integer' })
  stopYear: number;

  @Column({ type: 'date', nullable: true })
  startsOn: string | null;

  @Column({ type: 'date', nullable: true })
  endsOn: string | null;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: AcademicStatus;
}

// "2026–27", or "2026" when the year starts and ends in one calendar year
// (reference AcademicYear::name).
export function yearName(
  year: Pick<AcademicYear, 'startsOn' | 'endsOn' | 'startYear' | 'stopYear'>,
): string {
  const start = year.startsOn?.slice(0, 4) ?? String(year.startYear);
  const end = year.endsOn?.slice(0, 4) ?? String(year.stopYear);
  return start === end ? start : `${start}–${end.slice(-2)}`;
}
