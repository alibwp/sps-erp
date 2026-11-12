import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../common/database/base-entity.js';
import { NamesItsOwnSchool } from '../common/tenancy/school-scope.js';
import { User } from '../identity/entities/user.entity.js';
import { School } from '../organizations/entities/school.entity.js';
import type { Feature } from './features.js';

// One feature switched on or off. school_id null is the platform-wide
// setting a campus without its own setting follows. Switching a feature off
// never deletes the records it owns.
@NamesItsOwnSchool()
@Entity({ name: 'feature_settings' })
// Unique (school_id, feature) NULLS NOT DISTINCT, created by the migration,
// so there is one platform-wide setting per feature too.
@Index('feature_settings_school_feature_unique', { synchronize: false })
@Check(
  'feature_settings_feature_valid',
  "feature IN ('attendance', 'portal', 'discipline', 'wellbeing', 'staff_operations', 'events', 'ranking', 'imports', 'boarding', 'library', 'graduation_plans', 'programmes')",
)
export class FeatureSetting extends AppBaseEntity {
  @Column({ type: 'uuid', nullable: true })
  schoolId: string | null;

  @ManyToOne(() => School, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'school_id' })
  school: School | null;

  @Column({ type: 'varchar', length: 50 })
  feature: Feature;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'jsonb', nullable: true })
  config: Record<string, boolean> | null;

  // Named as in the reference.
  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'updated_by' })
  updatedBy: User | null;
}
