import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { School } from './school.entity.js';

// The words a campus uses for its structure (Class or Grade, Term or
// Semester, ...). The backend stores and returns them; it never reads them.
@SchoolOwned()
@Entity({ name: 'school_operating_profiles' })
@Unique('school_operating_profiles_school_unique', ['schoolId'])
export class SchoolOperatingProfile extends AppBaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'varchar', length: 100, default: 'home_sections' })
  preset: string;

  @Column({ type: 'jsonb' })
  labels: Record<string, string>;

  @Column({ type: 'timestamptz', nullable: true })
  setupCompletedAt: Date | null;
}
