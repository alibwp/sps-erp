import type { MigrationInterface, QueryRunner } from 'typeorm';

// Stage 6: cohorts and programmes. Cohort and programme names are unique
// per campus ignoring case; a learner has one open membership per cohort
// (every past one kept) and one running place per programme.

export class Cohorts1794220000000 implements MigrationInterface {
  name = 'Cohorts1794220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "cohorts" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "name" character varying(150) NOT NULL, "type" character varying(30) NOT NULL DEFAULT 'other', "description" character varying(500), "is_restricted" boolean NOT NULL DEFAULT false, "is_active" boolean NOT NULL DEFAULT true, "academic_year_id" uuid, "created_by" uuid, CONSTRAINT "cohorts_watchlist_restricted" CHECK (type <> 'watchlist' OR is_restricted), CONSTRAINT "cohorts_type_valid" CHECK (type IN ('graduation_year', 'scholarship', 'club', 'watchlist', 'ranking_group', 'other')), CONSTRAINT "PK_fd38f76b135e907b834fda1e752" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "cohort_members" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cohort_id" uuid NOT NULL, "student_record_id" uuid NOT NULL, "joined_on" date NOT NULL, "left_on" date, "added_by" uuid, CONSTRAINT "cohort_members_left_after_joined" CHECK (left_on IS NULL OR left_on >= joined_on), CONSTRAINT "PK_d0caa8ae723dba3e41fe36a4faf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "cohort_members_enrollment_index" ON "cohort_members"  ("student_record_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "cohort_members_cohort_index" ON "cohort_members"  ("cohort_id", "left_on") `,
    );
    await queryRunner.query(
      `CREATE TABLE "programs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "name" character varying(150) NOT NULL, "type" character varying(30) NOT NULL DEFAULT 'club', "description" character varying(500), "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "programs_type_valid" CHECK (type IN ('club', 'intervention', 'support_service', 'extracurricular', 'special')), CONSTRAINT "PK_d43c664bcaafc0e8a06dfd34e05" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "program_participations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "program_id" uuid NOT NULL, "student_record_id" uuid NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'requested', "starts_on" date, "ends_on" date, "schedule" character varying(255), "note" character varying(500), "staff_id" uuid, "academic_year_id" uuid, CONSTRAINT "program_participations_status_valid" CHECK (status IN ('requested', 'active', 'completed', 'withdrawn')), CONSTRAINT "PK_3bec5f272af2054bce298499fb1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "program_participations_enrollment_index" ON "program_participations"  ("student_record_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "program_participations_school_status_index" ON "program_participations"  ("school_id", "status") `,
    );
    await queryRunner.query(
      `ALTER TABLE "cohorts" ADD CONSTRAINT "FK_042fb8c865bd2798c10dc34f092" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cohorts" ADD CONSTRAINT "FK_784b6bfcf04e517445deb69546e" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cohorts" ADD CONSTRAINT "FK_be480729a8dc513fa346cdfcec1" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cohort_members" ADD CONSTRAINT "FK_bde9c54a6a6fa9bf6fcecad1e03" FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cohort_members" ADD CONSTRAINT "FK_29714e9321249a8e55d6f1431b1" FOREIGN KEY ("student_record_id") REFERENCES "student_records"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cohort_members" ADD CONSTRAINT "FK_11f6f3428ba6144ac0700c4f85d" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "programs" ADD CONSTRAINT "FK_d7a5344bdbf4566726fdc7c0a27" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "program_participations" ADD CONSTRAINT "FK_c24b2118f0f8eca26d97a2ab485" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "program_participations" ADD CONSTRAINT "FK_eb33034899cbff585bb7dc1b79a" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "program_participations" ADD CONSTRAINT "FK_acef267a5c9760ba31e9bab3560" FOREIGN KEY ("student_record_id") REFERENCES "student_records"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "program_participations" ADD CONSTRAINT "FK_7bbf099ce59b809c0284e50b93b" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "program_participations" ADD CONSTRAINT "FK_6906da661aca3322910a810ab5c" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "cohorts_school_name_unique" ON "cohorts" ("school_id", lower("name"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "programs_school_name_unique" ON "programs" ("school_id", lower("name"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "cohort_members_one_open" ON "cohort_members" ("cohort_id", "student_record_id") WHERE left_on IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "program_participations_one_running" ON "program_participations" ("program_id", "student_record_id") WHERE status IN ('requested', 'active')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."program_participations_one_running"`,
    );
    await queryRunner.query(`DROP INDEX "public"."cohort_members_one_open"`);
    await queryRunner.query(
      `DROP INDEX "public"."programs_school_name_unique"`,
    );
    await queryRunner.query(`DROP INDEX "public"."cohorts_school_name_unique"`);
    await queryRunner.query(
      `ALTER TABLE "program_participations" DROP CONSTRAINT "FK_6906da661aca3322910a810ab5c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "program_participations" DROP CONSTRAINT "FK_7bbf099ce59b809c0284e50b93b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "program_participations" DROP CONSTRAINT "FK_acef267a5c9760ba31e9bab3560"`,
    );
    await queryRunner.query(
      `ALTER TABLE "program_participations" DROP CONSTRAINT "FK_eb33034899cbff585bb7dc1b79a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "program_participations" DROP CONSTRAINT "FK_c24b2118f0f8eca26d97a2ab485"`,
    );
    await queryRunner.query(
      `ALTER TABLE "programs" DROP CONSTRAINT "FK_d7a5344bdbf4566726fdc7c0a27"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cohort_members" DROP CONSTRAINT "FK_11f6f3428ba6144ac0700c4f85d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cohort_members" DROP CONSTRAINT "FK_29714e9321249a8e55d6f1431b1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cohort_members" DROP CONSTRAINT "FK_bde9c54a6a6fa9bf6fcecad1e03"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cohorts" DROP CONSTRAINT "FK_be480729a8dc513fa346cdfcec1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cohorts" DROP CONSTRAINT "FK_784b6bfcf04e517445deb69546e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cohorts" DROP CONSTRAINT "FK_042fb8c865bd2798c10dc34f092"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."program_participations_school_status_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."program_participations_enrollment_index"`,
    );
    await queryRunner.query(`DROP TABLE "program_participations"`);
    await queryRunner.query(`DROP TABLE "programs"`);
    await queryRunner.query(
      `DROP INDEX "public"."cohort_members_cohort_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."cohort_members_enrollment_index"`,
    );
    await queryRunner.query(`DROP TABLE "cohort_members"`);
    await queryRunner.query(`DROP TABLE "cohorts"`);
  }
}
