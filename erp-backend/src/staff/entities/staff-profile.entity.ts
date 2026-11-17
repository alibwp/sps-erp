import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { EmploymentType, StaffStatus } from '../staff.constants.js';

// A person's employment record at one campus (reference StaffProfile). A
// staff number is unique per campus ignoring case
// (staff_profiles_school_staff_number_unique, made in the migration).
@SchoolOwned()
@Entity({ name: 'staff_profiles' })
@Unique('staff_profiles_school_user_unique', ['schoolId', 'userId'])
@Index('staff_profiles_school_staff_number_unique', { synchronize: false })
@Index('staff_profiles_status_left_on_index', ['status', 'leftOn'])
@Check(
  'staff_profiles_employment_type_valid',
  "employment_type IN ('full_time', 'part_time', 'contract', 'volunteer', 'intern')",
)
@Check(
  'staff_profiles_status_valid',
  "status IN ('active', 'on_leave', 'suspended', 'left')",
)
@Check(
  'staff_profiles_left_after_joined',
  'left_on IS NULL OR joined_on IS NULL OR left_on >= joined_on',
)
export class StaffProfile extends AppBaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 30, nullable: true })
  staffNumber: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  jobTitle: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  department: string | null;

  @Column({ type: 'varchar', length: 20, default: 'full_time' })
  employmentType: EmploymentType;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: StaffStatus;

  @Column({ type: 'date', nullable: true })
  joinedOn: string | null;

  // The last working day.
  @Column({ type: 'date', nullable: true })
  leftOn: string | null;
}
