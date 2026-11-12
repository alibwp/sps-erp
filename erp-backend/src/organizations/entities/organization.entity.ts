import { Column, Entity, Unique } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';

// Owns one or more campuses. Organization authority never opens campus
// records: that still takes a campus membership.
@Entity({ name: 'organizations' })
@Unique('organizations_code_unique', ['code'])
export class Organization extends AppBaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  phone: string | null;
}
