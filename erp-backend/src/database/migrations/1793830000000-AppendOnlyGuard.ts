import type { MigrationInterface, QueryRunner } from 'typeorm';

// The trigger function behind makeAppendOnly(): histories, the audit log and
// ledger lines are only ever inserted.
export class AppendOnlyGuard1793830000000 implements MigrationInterface {
  name = 'AppendOnlyGuard1793830000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION refuse_append_only_change() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
          USING ERRCODE = 'restrict_violation';
      END;
      $$
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP FUNCTION refuse_append_only_change()');
  }
}
