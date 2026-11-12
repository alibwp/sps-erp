import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { Organization } from './organization.entity.js';

// Campuses of one organization that keep one purse.
@Entity({ name: 'billing_groups' })
// Unique (organization_id, lower(name)), created by the migration.
@Index('billing_groups_organization_name_unique', { synchronize: false })
export class BillingGroup extends AppBaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'varchar', length: 100 })
  name: string;
}
