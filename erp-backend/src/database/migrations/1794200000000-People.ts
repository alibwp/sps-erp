import type { MigrationInterface, QueryRunner } from 'typeorm';

// Stage 5 part 3: guardians. One parent record per person, shared by every
// campus they join, and the links from a guardian to the learners they look
// after.

export class People1794200000000 implements MigrationInterface {
  name = 'People1794200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "parent_records" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, CONSTRAINT "parent_records_user_unique" UNIQUE ("user_id"), CONSTRAINT "PK_2aa5b868930b2b344632dcdfdad" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "parent_record_user" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "parent_record_id" uuid NOT NULL, "user_id" uuid NOT NULL, CONSTRAINT "parent_record_user_unique" UNIQUE ("parent_record_id", "user_id"), CONSTRAINT "PK_52a284b3fe9c3c5edf63988e71c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "parent_record_user_learner_index" ON "parent_record_user"  ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "parent_records" ADD CONSTRAINT "FK_a6637f8bd403231824d7f1213fb" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "parent_record_user" ADD CONSTRAINT "FK_a8baeee8363ca72a196e765047c" FOREIGN KEY ("parent_record_id") REFERENCES "parent_records"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "parent_record_user" ADD CONSTRAINT "FK_0c7a224212c94988421904c744c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "parent_record_user" DROP CONSTRAINT "FK_0c7a224212c94988421904c744c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "parent_record_user" DROP CONSTRAINT "FK_a8baeee8363ca72a196e765047c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "parent_records" DROP CONSTRAINT "FK_a6637f8bd403231824d7f1213fb"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."parent_record_user_learner_index"`,
    );
    await queryRunner.query(`DROP TABLE "parent_record_user"`);
    await queryRunner.query(`DROP TABLE "parent_records"`);
  }
}
