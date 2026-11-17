import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { User } from '../../identity/entities/user.entity.js';
import { StaffProfile } from './staff-profile.entity.js';

// A qualification, licence or check a staff member holds (reference
// StaffCredential). Verified by somebody else, who is recorded.
@Entity({ name: 'staff_credentials' })
@Index('staff_credentials_profile_index', ['staffProfileId'])
@Check(
  'staff_credentials_expiry_after_issue',
  'expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on',
)
export class StaffCredential extends AppBaseEntity {
  @Column({ type: 'uuid' })
  staffProfileId: string;

  @ManyToOne(() => StaffProfile, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'staff_profile_id' })
  staffProfile: StaffProfile;

  @Column({ type: 'varchar', length: 50 })
  type: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  issuer: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  @Column({ type: 'date', nullable: true })
  issuedOn: string | null;

  @Column({ type: 'date', nullable: true })
  expiresOn: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'verified_by', type: 'uuid', nullable: true })
  verifiedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'verified_by' })
  verifiedBy: User | null;
}
