import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { User } from '../../identity/entities/user.entity.js';

// A guardian (reference ParentRecord): one per person, shared by every
// campus they join. Made when the person is first created as a parent.
@Entity({ name: 'parent_records' })
@Unique('parent_records_user_unique', ['userId'])
export class ParentRecord extends AppBaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
