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
import { Organization } from './organization.entity.js';

export const ORGANIZATION_MEMBERSHIP_STATUSES = [
  'active',
  'suspended',
  'ended',
] as const;
export type OrganizationMembershipStatus =
  (typeof ORGANIZATION_MEMBERSHIP_STATUSES)[number];

// Organization scope for one person. Authority needs both the global
// organization-admin role and an active membership whose permission list
// carries the permission (null = every organization permission).
@Entity({ name: 'organization_memberships' })
@Unique('organization_memberships_organization_user_unique', [
  'organizationId',
  'userId',
])
@Index('organization_memberships_user_status_index', ['userId', 'status'])
@Check(
  'organization_memberships_status_valid',
  "status IN ('active', 'suspended', 'ended')",
)
export class OrganizationMembership extends AppBaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: OrganizationMembershipStatus;

  @Column({ type: 'jsonb', nullable: true })
  permissions: string[] | null;

  @Column({ type: 'timestamptz', nullable: true })
  joinedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;
}
