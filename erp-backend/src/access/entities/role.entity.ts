import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { School } from '../../organizations/entities/school.entity.js';

// A named set of permissions. school_id null: a shared role every campus
// can give out (the built-in ones, and librarian and accountant); otherwise
// a role one campus wrote or tailored for itself.
@SchoolOwned()
@Entity({ name: 'roles' })
// Unique (school_id, lower(name)) NULLS NOT DISTINCT, created by the
// migration: two shared roles cannot share a name either.
@Index('roles_school_name_unique', { synchronize: false })
@Index('roles_school_index', ['schoolId'])
export class Role extends AppBaseEntity {
  @Column({ type: 'uuid', nullable: true })
  schoolId: string | null;

  @ManyToOne(() => School, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'school_id' })
  school: School | null;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  // No longer offered. People who hold it keep it and what it grants.
  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;
}
