import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { AcademicCycleSection } from './academic-cycle-section.entity.js';
import { CourseOffering } from './course-offering.entity.js';

// The home sections an offering's roster is read from (reference
// course_offering_cycle_sections).
@Entity({ name: 'course_offering_cycle_sections' })
@Index('course_offering_cycle_sections_section_index', [
  'academicCycleSectionId',
])
export class CourseOfferingSection {
  @PrimaryColumn({ type: 'uuid' })
  courseOfferingId: string;

  @ManyToOne(() => CourseOffering, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_offering_id' })
  courseOffering: CourseOffering;

  @PrimaryColumn({ type: 'uuid' })
  academicCycleSectionId: string;

  @ManyToOne(() => AcademicCycleSection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'academic_cycle_section_id' })
  academicCycleSection: AcademicCycleSection;
}
