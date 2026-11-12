import { Check, Column, DeleteDateColumn, Entity, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import type { AccountStatus, Gender } from '../account-status.js';

// A person. Global: access to a campus comes from memberships (Stage 2).
@Entity({ name: 'users' })
@Unique('users_email_unique', ['email'])
@Check('users_email_lower_case', 'email = lower(email)')
@Check(
  'users_account_status_valid',
  "account_status IN ('invited', 'active', 'suspended', 'archived')",
)
@Check(
  'users_gender_valid',
  "gender IN ('Male', 'Female', 'Non-binary', 'Prefer not to say')",
)
export class User extends AppBaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  // Always stored lower-case, so the unique key compares lower-case.
  @Column({ type: 'varchar', length: 100 })
  email: string;

  // Null until the person accepts an invitation.
  @Column({ type: 'varchar', length: 255, nullable: true })
  passwordHash: string | null;

  @Column({ type: 'date', nullable: true })
  birthday: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: Gender | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({
    name: 'address_line_2',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  addressLine2: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  postalCode: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  nationality: string | null;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  profilePhotoPath: string | null;

  @Column({ type: 'varchar', length: 20, default: 'invited' })
  accountStatus: AccountStatus;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  passwordChangeRequiredAt: Date | null;

  // Encrypted with APP_KEY: it must be read back to check codes.
  @Column({ type: 'text', nullable: true })
  twoFactorSecret: string | null;

  // SHA-256 hashes of the unused recovery codes.
  @Column({ type: 'jsonb', nullable: true })
  twoFactorRecoveryCodes: string[] | null;

  @Column({ type: 'timestamptz', nullable: true })
  twoFactorConfirmedAt: Date | null;

  // The last TOTP time step accepted, so a code cannot be used twice.
  @Column({ type: 'integer', nullable: true })
  twoFactorLastTimeStep: number | null;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
