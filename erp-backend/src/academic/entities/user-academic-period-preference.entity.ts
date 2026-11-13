import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from '../../organizations/entities/school.entity.js';
import { AcademicPeriod } from './academic-period.entity.js';
import { AcademicYear } from './academic-year.entity.js';

// The working period a person chose at a campus, one per year. The most
// recently updated one names their working year there.
@SchoolOwned()
@Entity({ name: 'user_academic_period_preferences' })
@Unique('user_academic_period_preferences_unique', [
  'userId',
  'schoolId',
  'academicYearId',
])
@Index('user_academic_period_preferences_lookup_index', [
  'schoolId',
  'academicYearId',
  'academicPeriodId',
])
export class UserAcademicPeriodPreference extends AppBaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'uuid' })
  academicYearId: string;

  @ManyToOne(() => AcademicYear, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  @Column({ type: 'uuid' })
  academicPeriodId: string;

  @ManyToOne(() => AcademicPeriod, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_period_id' })
  academicPeriod: AcademicPeriod;
}
