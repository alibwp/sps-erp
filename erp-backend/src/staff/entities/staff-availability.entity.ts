import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { StaffProfile } from './staff-profile.entity.js';

// Hours a staff member is available on one day of the week (reference
// StaffAvailability): 1 is Monday, 7 Sunday. Hours of one day never
// overlap.
@Entity({ name: 'staff_availabilities' })
@Index('staff_availabilities_profile_day_index', [
  'staffProfileId',
  'dayOfWeek',
])
@Check('staff_availabilities_day_valid', 'day_of_week BETWEEN 1 AND 7')
@Check('staff_availabilities_ends_after_start', 'ends_at > starts_at')
export class StaffAvailability extends AppBaseEntity {
  @Column({ type: 'uuid' })
  staffProfileId: string;

  @ManyToOne(() => StaffProfile, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'staff_profile_id' })
  staffProfile: StaffProfile;

  @Column({ type: 'smallint' })
  dayOfWeek: number;

  @Column({ type: 'time' })
  startsAt: string;

  @Column({ type: 'time' })
  endsAt: string;
}
