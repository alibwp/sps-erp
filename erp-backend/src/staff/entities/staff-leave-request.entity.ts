import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from '../../organizations/entities/school.entity.js';
import type { LeaveStatus, LeaveType } from '../staff.constants.js';
import { StaffProfile } from './staff-profile.entity.js';

// Days away a staff member asks for (reference StaffLeaveRequest). Its
// state changes are kept in staff_leave_status_changes.
@SchoolOwned()
@Entity({ name: 'staff_leave_requests' })
@Index('staff_leave_requests_school_status_index', ['schoolId', 'status'])
@Index('staff_leave_requests_profile_days_index', [
  'staffProfileId',
  'startsOn',
  'endsOn',
])
@Check(
  'staff_leave_requests_type_valid',
  "type IN ('annual', 'sick', 'compassionate', 'study', 'maternity', 'unpaid')",
)
@Check(
  'staff_leave_requests_status_valid',
  "status IN ('requested', 'approved', 'declined', 'cancelled', 'taken')",
)
@Check('staff_leave_requests_ends_after_start', 'ends_on >= starts_on')
export class StaffLeaveRequest extends AppBaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'uuid' })
  staffProfileId: string;

  @ManyToOne(() => StaffProfile, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'staff_profile_id' })
  staffProfile: StaffProfile;

  @Column({ type: 'varchar', length: 20, default: 'annual' })
  type: LeaveType;

  @Column({ type: 'varchar', length: 20, default: 'requested' })
  status: LeaveStatus;

  @Column({ type: 'date' })
  startsOn: string;

  @Column({ type: 'date' })
  endsOn: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'requested_by' })
  requestedBy: User | null;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'decided_by' })
  decidedBy: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  decisionNote: string | null;
}
