import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Every table's id, created_at and updated_at. The id is a UUID made by
// PostgreSQL (gen_random_uuid()); sequential ids are never exposed.
// Named AppBaseEntity so it is not confused with TypeORM's own BaseEntity.
export abstract class AppBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
