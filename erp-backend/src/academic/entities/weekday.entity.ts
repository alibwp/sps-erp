import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

// Monday to Sunday. The id is the ISO day number (1 = Monday): a fixed
// lookup list that timetables (Stage 8) point at, seeded by a migration.
@Entity({ name: 'weekdays' })
@Unique('weekdays_name_unique', ['name'])
export class Weekday {
  @PrimaryColumn({ type: 'smallint' })
  id: number;

  @Column({ type: 'varchar', length: 20 })
  name: string;
}
