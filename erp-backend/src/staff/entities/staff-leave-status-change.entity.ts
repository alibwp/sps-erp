import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../identity/entities/user.entity.js';
import type { LeaveStatus } from '../staff.constants.js';
import { StaffLeaveRequest } from './staff-leave-request.entity.js';

// One step in a leave request's history (reference StaffLeaveStatusChange).
// Append-only.
@Entity({ name: 'staff_leave_status_changes' })
@Index('staff_leave_status_changes_request_index', ['staffLeaveRequestId'])
export class StaffLeaveStatusChange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  staffLeaveRequestId: string;

  @ManyToOne(() => StaffLeaveRequest, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'staff_leave_request_id' })
  staffLeaveRequest: StaffLeaveRequest;

  @Column({ type: 'varchar', length: 20 })
  fromStatus: LeaveStatus;

  @Column({ type: 'varchar', length: 20 })
  toStatus: LeaveStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @Column({ name: 'changed_by', type: 'uuid', nullable: true })
  changedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'changed_by' })
  changedBy: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
