import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { AppBaseEntity } from '../../common/database/base-entity.js';
import { SchoolOwned } from '../../common/tenancy/school-scope.js';
import { School } from '../../organizations/entities/school.entity.js';

// A subject in the campus's catalog (reference Subject). Deleting it keeps
// the row (soft delete), and only a subject nobody teaches can go. Its name
// is unique per campus among subjects not deleted, ignoring case
// (subjects_school_name_unique, a partial index created in the migration).
@SchoolOwned()
@Entity({ name: 'subjects' })
@Index('subjects_school_name_unique', { synchronize: false })
export class Subject extends AppBaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 100 })
  shortName: string;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
