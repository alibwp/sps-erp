import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { User } from '../../identity/entities/user.entity.js';
import { ParentRecord } from './parent-record.entity.js';

// A guardian linked to a learner (reference parent_record_user). The link
// is to the person, so it holds at every campus the learner attends.
@Entity({ name: 'parent_record_user' })
@Unique('parent_record_user_unique', ['parentRecordId', 'userId'])
@Index('parent_record_user_learner_index', ['userId'])
export class GuardianLink extends AppBaseEntity {
  @Column({ type: 'uuid' })
  parentRecordId: string;

  @ManyToOne(() => ParentRecord, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'parent_record_id' })
  parentRecord: ParentRecord;

  // The learner.
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
