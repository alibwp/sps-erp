import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { User } from './user.entity.js';

// One signed-in device. While a two-factor challenge is pending the row has
// a challenge and no refresh token; it becomes a session when the challenge
// is answered.
@Entity({ name: 'auth_sessions' })
@Unique('auth_sessions_challenge_token_hash_unique', ['challengeTokenHash'])
@Index('auth_sessions_user_index', ['userId', 'revokedAt'])
export class AuthSession extends AppBaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // SHA-256 of the current refresh token's random part.
  @Column({ type: 'char', length: 64, nullable: true })
  refreshTokenHash: string | null;

  // The token it replaced and when, for the 30-second reuse grace period.
  @Column({ type: 'char', length: 64, nullable: true })
  previousRefreshTokenHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  rotatedAt: Date | null;

  @Column({ type: 'char', length: 64, nullable: true })
  challengeTokenHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  challengeExpiresAt: Date | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'timestamptz' })
  lastUsedAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  // Set by POST /auth/confirm-password; sensitive actions need it recent.
  @Column({ type: 'timestamptz', nullable: true })
  passwordConfirmedAt: Date | null;
}
