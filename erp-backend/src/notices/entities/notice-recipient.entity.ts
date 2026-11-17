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
import { User } from '../../identity/entities/user.entity.js';
import type { RecipientState } from '../notices.constants.js';
import { Notice } from './notice.entity.js';

// One person a published notice reached (reference NoticeRecipient). Fixed
// at publishing, so later changes in classes do not change who received
// it.
@Entity({ name: 'notice_recipients' })
@Unique('notice_recipients_notice_user_unique', ['noticeId', 'userId'])
@Index('notice_recipients_user_index', ['userId', 'state'])
@Check(
  'notice_recipients_state_valid',
  "state IN ('pending', 'delivered', 'read', 'dismissed', 'failed')",
)
export class NoticeRecipient extends AppBaseEntity {
  @Column({ type: 'uuid' })
  noticeId: string;

  @ManyToOne(() => Notice, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'notice_id' })
  notice: Notice;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  state: RecipientState;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  dismissedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  failureReason: string | null;
}
