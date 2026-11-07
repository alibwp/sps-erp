import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../identity/entities/user.entity.js';

// The append-only audit log (a trigger refuses UPDATE and DELETE).
@Entity({ name: 'audit_events' })
@Index('audit_events_school_action_index', ['schoolId', 'action', 'createdAt'])
@Index('audit_events_actor_index', ['actorId', 'createdAt'])
@Index('audit_events_subject_index', ['subjectType', 'subjectId'])
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // No foreign key until the schools table exists (Stage 2).
  @Column({ type: 'uuid', nullable: true })
  schoolId: string | null;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  // Plain foreign key: users are only soft-deleted, and this table refuses
  // the UPDATE an ON DELETE SET NULL would make.
  @ManyToOne(() => User, { onDelete: 'NO ACTION', nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor: User | null;

  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  subjectType: string | null;

  @Column({ type: 'uuid', nullable: true })
  subjectId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  context: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
