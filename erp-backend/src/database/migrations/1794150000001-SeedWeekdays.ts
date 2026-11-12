import type { MigrationInterface, QueryRunner } from 'typeorm';

// Monday to Sunday with their ISO day numbers (reference WeekdaySeeder).
const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export class SeedWeekdays1794150000001 implements MigrationInterface {
  name = 'SeedWeekdays1794150000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "weekdays" ("id", "name")
       SELECT ordinality, name FROM unnest($1::varchar[]) WITH ORDINALITY AS t(name, ordinality)`,
      [WEEKDAYS],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "weekdays" WHERE "id" BETWEEN 1 AND 7`,
    );
  }
}
