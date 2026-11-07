import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { User } from './user.entity.js';

@Entity({ name: 'password_reset_tokens' })
@Unique('password_reset_tokens_token_hash_unique', ['tokenHash'])
@Index('password_reset_tokens_user_index', ['userId'])
export class PasswordResetToken extends AppBaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;
}
