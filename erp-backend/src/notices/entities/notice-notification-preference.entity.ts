import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { User } from '../../identity/entities/user.entity.js';
import { School } from '../../organizations/entities/school.entity.js';

// Whether a person wants notice emails from one campus (reference
// NoticeNotificationPreference). Without a row, they do.
@SchoolOwned()
@Entity({ name: 'notice_notification_preferences' })
@Unique('notice_notification_preferences_user_school_unique', [
  'userId',
  'schoolId',
])
export class NoticeNotificationPreference extends AppBaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'boolean', default: true })
  emailEnabled: boolean;
}
