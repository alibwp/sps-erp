import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AcademicYear } from '../../academic/entities/academic-year.entity.js';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { AcademicCycleSection } from '../../curriculum/entities/academic-cycle-section.entity.js';
import { School } from '../../organizations/entities/school.entity.js';

// Learners moved together from one section to another (reference
// Promotion). Resetting it moves back those still there and deletes the
// record; the placements keep the history.
@SchoolOwned()
@Entity({ name: 'promotions' })
@Index('promotions_school_year_index', ['schoolId', 'academicYearId'])
export class Promotion extends AppBaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  // The destination's school year.
  @Column({ type: 'uuid' })
  academicYearId: string;

  @ManyToOne(() => AcademicYear, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  @Column({ type: 'uuid' })
  sourceAcademicCycleSectionId: string;

  @ManyToOne(() => AcademicCycleSection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'source_academic_cycle_section_id' })
  sourceAcademicCycleSection: AcademicCycleSection;

  @Column({ type: 'uuid' })
  destinationAcademicCycleSectionId: string;

  @ManyToOne(() => AcademicCycleSection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'destination_academic_cycle_section_id' })
  destinationAcademicCycleSection: AcademicCycleSection;

  // The enrollments that moved.
  @Column({ type: 'jsonb' })
  studentRecordIds: string[];
}
