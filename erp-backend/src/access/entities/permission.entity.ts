import { Column, Entity, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';

// One permission name, exactly as the reference spells it ("read student").
// The list is seeded by migrations, never by a seeder.
@Entity({ name: 'permissions' })
@Unique('permissions_name_unique', ['name'])
export class Permission extends AppBaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;
}
