import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { User } from './user.entity.js';

// A one-time link that lets a provisioned person set a password.
@Entity({ name: 'account_invitations' })
@Unique('account_invitations_token_hash_unique', ['tokenHash'])
@Index('account_invitations_user_state_index', [
  'userId',
  'acceptedAt',
  'revokedAt',
])
export class AccountInvitation extends AppBaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Named as in the reference.
  @Column({ name: 'invited_by', type: 'uuid', nullable: true })
  invitedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'invited_by' })
  invitedBy: User | null;

  // SHA-256 of the 64-character token; the token itself is never stored.
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
