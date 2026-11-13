import type { MigrationInterface, QueryRunner } from 'typeorm';

// Demo accounts (seed-demo-users): one sign-in per role for trying the app.
// Their addresses may belong to strangers, so nothing is emailed to them.

export class DemoAccounts1794180000000 implements MigrationInterface {
  name = 'DemoAccounts1794180000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "demo_account" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "demo_account"`);
  }
}
