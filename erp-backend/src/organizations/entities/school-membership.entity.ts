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
import { NamesItsOwnSchool } from '../../common/tenancy/school-scope.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from './school.entity.js';

export const SCHOOL_MEMBERSHIP_STATUSES = [
  'active',
  'suspended',
  'ended',
] as const;
export type SchoolMembershipStatus =
  (typeof SCHOOL_MEMBERSHIP_STATUSES)[number];

// A person's access to one campus. Separate from the account state and from
// enrollment: ending it removes access but keeps the person and the records.
@NamesItsOwnSchool()
@Entity({ name: 'school_memberships' })
@Unique('school_memberships_user_school_unique', ['userId', 'schoolId'])
@Index('school_memberships_school_status_index', ['schoolId', 'status'])
// At most one primary campus per person (partial unique index, migration).
@Index('school_memberships_one_primary', { synchronize: false })
@Check(
  'school_memberships_status_valid',
  "status IN ('active', 'suspended', 'ended')",
)
export class SchoolMembership extends AppBaseEntity {
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

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: SchoolMembershipStatus;

  // The campus the person opens by default.
  @Column({ type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  joinedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;
}
