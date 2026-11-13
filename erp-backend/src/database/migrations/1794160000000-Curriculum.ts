import type { MigrationInterface, QueryRunner } from 'typeorm';

// Stage 4: academic levels, the sections of each school year, subjects,
// course offerings with their section rosters, teaching assignments and
// instructional-model exceptions. Foreign keys to years, periods, levels and
// subjects RESTRICT deletes; the code refuses them first with a message.
// Names are unique ignoring case (levels and codes per campus, sections per
// campus, year and level, subjects per campus among those not deleted).

export class Curriculum1794160000000 implements MigrationInterface {
  name = 'Curriculum1794160000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "academic_levels" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "parent_id" uuid, "is_group" boolean NOT NULL DEFAULT false, "name" character varying(100) NOT NULL, "code" character varying(100), "position" smallint NOT NULL DEFAULT '0', "status" character varying(20) NOT NULL DEFAULT 'active', CONSTRAINT "academic_levels_status_valid" CHECK (status IN ('draft', 'active', 'archived')), CONSTRAINT "PK_02959b1b6327a1cabe3be015146" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "academic_levels_parent_index" ON "academic_levels"  ("parent_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "academic_levels_school_status_position_index" ON "academic_levels"  ("school_id", "status", "position") `,
    );
    await queryRunner.query(
      `CREATE TABLE "academic_cycle_sections" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "academic_level_id" uuid NOT NULL, "homeroom_teacher_id" uuid, "name" character varying(100) NOT NULL, "label" character varying(100), "stream" character varying(100), "shift" character varying(100), "language" character varying(100), "room" character varying(100), "capacity" smallint, "position" smallint NOT NULL DEFAULT '0', "status" character varying(20) NOT NULL DEFAULT 'draft', CONSTRAINT "academic_cycle_sections_capacity_positive" CHECK (capacity IS NULL OR capacity > 0), CONSTRAINT "academic_cycle_sections_status_valid" CHECK (status IN ('draft', 'active', 'archived')), CONSTRAINT "PK_c988e870531486bec7169a9136f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "academic_cycle_sections_homeroom_teacher_index" ON "academic_cycle_sections"  ("homeroom_teacher_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "academic_cycle_sections_level_index" ON "academic_cycle_sections"  ("academic_level_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "academic_cycle_sections_listing_index" ON "academic_cycle_sections"  ("school_id", "academic_year_id", "status", "position") `,
    );
    await queryRunner.query(
      `CREATE TABLE "subjects" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "name" character varying(100) NOT NULL, "short_name" character varying(100) NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_1a023685ac2b051b4e557b0b280" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "course_offerings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "academic_period_id" uuid NOT NULL, "subject_id" uuid NOT NULL, "name" character varying(100), "academic_level_id" uuid NOT NULL, "roster_mode" character varying(32) NOT NULL DEFAULT 'home_section', "status" character varying(20) NOT NULL DEFAULT 'draft', "planned_periods_per_week" smallint, "capacity" smallint, "active_key" character varying(64), CONSTRAINT "course_offerings_roster_mode_valid" CHECK (roster_mode IN ('home_section', 'combined_home_sections', 'academic_level', 'individual_roster')), CONSTRAINT "course_offerings_status_valid" CHECK (status IN ('draft', 'active', 'archived')), CONSTRAINT "PK_f174de9e3b3a04f05870a8684c8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "course_offerings_level_index" ON "course_offerings"  ("academic_level_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "course_offerings_subject_index" ON "course_offerings"  ("subject_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "course_offerings_year_level_index" ON "course_offerings"  ("academic_year_id", "academic_level_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "course_offerings_school_period_status_index" ON "course_offerings"  ("school_id", "academic_period_id", "status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "course_offerings_active_key_unique" ON "course_offerings"  ("active_key") `,
    );
    await queryRunner.query(
      `CREATE TABLE "course_offering_cycle_sections" ("course_offering_id" uuid NOT NULL, "academic_cycle_section_id" uuid NOT NULL, CONSTRAINT "PK_310f7485993d94b4a2504e7cd00" PRIMARY KEY ("course_offering_id", "academic_cycle_section_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "course_offering_cycle_sections_section_index" ON "course_offering_cycle_sections"  ("academic_cycle_section_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "instructional_model_exceptions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "subject_id" uuid NOT NULL, "academic_level_id" uuid, "roster_mode" character varying(40) NOT NULL, "reason" text NOT NULL, "granted_by" uuid, "revoked_at" TIMESTAMP WITH TIME ZONE, "revoked_by" uuid, CONSTRAINT "instructional_model_exceptions_roster_mode_valid" CHECK (roster_mode IN ('home_section', 'combined_home_sections', 'academic_level', 'individual_roster')), CONSTRAINT "PK_55d47af058b019e8131e1fd5caf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "instructional_model_exceptions_level_index" ON "instructional_model_exceptions"  ("academic_level_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "instructional_model_exceptions_subject_index" ON "instructional_model_exceptions"  ("subject_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "instructional_model_exceptions_cycle_index" ON "instructional_model_exceptions"  ("school_id", "academic_year_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "teaching_assignments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "subject_id" uuid NOT NULL, "user_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "academic_period_id" uuid, "course_offering_id" uuid NOT NULL, "academic_cycle_section_id" uuid, "role" character varying(20) NOT NULL DEFAULT 'lead', "starts_on" date NOT NULL, "ends_on" date, CONSTRAINT "teaching_assignments_role_valid" CHECK (role IN ('lead', 'supporting')), CONSTRAINT "PK_baf0d10098561a9840957b512e0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "teaching_assignments_section_index" ON "teaching_assignments"  ("academic_cycle_section_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "teaching_assignments_offering_index" ON "teaching_assignments"  ("course_offering_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "teaching_assignments_user_year_index" ON "teaching_assignments"  ("user_id", "academic_year_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "teaching_assignments_school_subject_year_index" ON "teaching_assignments"  ("school_id", "subject_id", "academic_year_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_levels" ADD CONSTRAINT "FK_3787a09a7005983f8d1e57f0f7b" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_levels" ADD CONSTRAINT "FK_4013ecc30ce3637e7684f593763" FOREIGN KEY ("parent_id") REFERENCES "academic_levels"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_cycle_sections" ADD CONSTRAINT "FK_f7ef6bfebeb40c035e2b4026900" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_cycle_sections" ADD CONSTRAINT "FK_5806f48296f0d98ebb81e1172f0" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_cycle_sections" ADD CONSTRAINT "FK_5d9bedf26f8bdf4857bdb893b3f" FOREIGN KEY ("academic_level_id") REFERENCES "academic_levels"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_cycle_sections" ADD CONSTRAINT "FK_26f2916909623f09f0999939f66" FOREIGN KEY ("homeroom_teacher_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "subjects" ADD CONSTRAINT "FK_07a82eb883094a6990b914cc15e" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "course_offerings" ADD CONSTRAINT "FK_39064b7668beb00bce3420bc416" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "course_offerings" ADD CONSTRAINT "FK_b6c55312afc8ad8058daa824e11" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "course_offerings" ADD CONSTRAINT "FK_696546d084e8c03d5a91098e778" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "course_offerings" ADD CONSTRAINT "FK_26c5042522c45c254b9d324a5d7" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "course_offerings" ADD CONSTRAINT "FK_e2b3b671320f28baacb781a3b83" FOREIGN KEY ("academic_level_id") REFERENCES "academic_levels"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "course_offering_cycle_sections" ADD CONSTRAINT "FK_0557bd6745dc520b627bca833af" FOREIGN KEY ("course_offering_id") REFERENCES "course_offerings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "course_offering_cycle_sections" ADD CONSTRAINT "FK_8e66071b64d442e4db57e1f63ea" FOREIGN KEY ("academic_cycle_section_id") REFERENCES "academic_cycle_sections"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_exceptions" ADD CONSTRAINT "FK_af206698a209508ded02b40844d" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_exceptions" ADD CONSTRAINT "FK_f1ef10486b28973b1eb4b8eb2df" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_exceptions" ADD CONSTRAINT "FK_b14c0cb38afe2a9cf154cb946f2" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_exceptions" ADD CONSTRAINT "FK_a92c3fb612714596eae1e8581d6" FOREIGN KEY ("academic_level_id") REFERENCES "academic_levels"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_exceptions" ADD CONSTRAINT "FK_aa1a1b99bfa00fb82b28aaca9e0" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_exceptions" ADD CONSTRAINT "FK_2a768dd333cfe2bab420c73b22a" FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "teaching_assignments" ADD CONSTRAINT "FK_5d88d65d9552feb82d5f6e7fe0e" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "teaching_assignments" ADD CONSTRAINT "FK_41ec23a5853e01d7607405c4a8e" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "teaching_assignments" ADD CONSTRAINT "FK_d6692276020c82bae5638d2168a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "teaching_assignments" ADD CONSTRAINT "FK_e3e771d506c6233ceffe5ae7192" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "teaching_assignments" ADD CONSTRAINT "FK_3d491fee5db4c51e32102d7e201" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "teaching_assignments" ADD CONSTRAINT "FK_87855e0797aa7344a0b58cc56a9" FOREIGN KEY ("course_offering_id") REFERENCES "course_offerings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "teaching_assignments" ADD CONSTRAINT "FK_98416c0c7095aa346bc9eef4326" FOREIGN KEY ("academic_cycle_section_id") REFERENCES "academic_cycle_sections"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "academic_levels_school_name_unique" ON "academic_levels" ("school_id", lower("name"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "academic_levels_school_code_unique" ON "academic_levels" ("school_id", lower("code")) WHERE "code" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "academic_cycle_sections_identity_unique" ON "academic_cycle_sections" ("school_id", "academic_year_id", "academic_level_id", lower("name"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "subjects_school_name_unique" ON "subjects" ("school_id", lower("name")) WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."subjects_school_name_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."academic_cycle_sections_identity_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."academic_levels_school_code_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."academic_levels_school_name_unique"`,
    );
    await queryRunner.query(
      `ALTER TABLE "teaching_assignments" DROP CONSTRAINT "FK_98416c0c7095aa346bc9eef4326"`,
    );
    await queryRunner.query(
      `ALTER TABLE "teaching_assignments" DROP CONSTRAINT "FK_87855e0797aa7344a0b58cc56a9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "teaching_assignments" DROP CONSTRAINT "FK_3d491fee5db4c51e32102d7e201"`,
    );
    await queryRunner.query(
      `ALTER TABLE "teaching_assignments" DROP CONSTRAINT "FK_e3e771d506c6233ceffe5ae7192"`,
    );
    await queryRunner.query(
      `ALTER TABLE "teaching_assignments" DROP CONSTRAINT "FK_d6692276020c82bae5638d2168a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "teaching_assignments" DROP CONSTRAINT "FK_41ec23a5853e01d7607405c4a8e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "teaching_assignments" DROP CONSTRAINT "FK_5d88d65d9552feb82d5f6e7fe0e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_exceptions" DROP CONSTRAINT "FK_2a768dd333cfe2bab420c73b22a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_exceptions" DROP CONSTRAINT "FK_aa1a1b99bfa00fb82b28aaca9e0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_exceptions" DROP CONSTRAINT "FK_a92c3fb612714596eae1e8581d6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_exceptions" DROP CONSTRAINT "FK_b14c0cb38afe2a9cf154cb946f2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_exceptions" DROP CONSTRAINT "FK_f1ef10486b28973b1eb4b8eb2df"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_exceptions" DROP CONSTRAINT "FK_af206698a209508ded02b40844d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "course_offering_cycle_sections" DROP CONSTRAINT "FK_8e66071b64d442e4db57e1f63ea"`,
    );
    await queryRunner.query(
      `ALTER TABLE "course_offering_cycle_sections" DROP CONSTRAINT "FK_0557bd6745dc520b627bca833af"`,
    );
    await queryRunner.query(
      `ALTER TABLE "course_offerings" DROP CONSTRAINT "FK_e2b3b671320f28baacb781a3b83"`,
    );
    await queryRunner.query(
      `ALTER TABLE "course_offerings" DROP CONSTRAINT "FK_26c5042522c45c254b9d324a5d7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "course_offerings" DROP CONSTRAINT "FK_696546d084e8c03d5a91098e778"`,
    );
    await queryRunner.query(
      `ALTER TABLE "course_offerings" DROP CONSTRAINT "FK_b6c55312afc8ad8058daa824e11"`,
    );
    await queryRunner.query(
      `ALTER TABLE "course_offerings" DROP CONSTRAINT "FK_39064b7668beb00bce3420bc416"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subjects" DROP CONSTRAINT "FK_07a82eb883094a6990b914cc15e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_cycle_sections" DROP CONSTRAINT "FK_26f2916909623f09f0999939f66"`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_cycle_sections" DROP CONSTRAINT "FK_5d9bedf26f8bdf4857bdb893b3f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_cycle_sections" DROP CONSTRAINT "FK_5806f48296f0d98ebb81e1172f0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_cycle_sections" DROP CONSTRAINT "FK_f7ef6bfebeb40c035e2b4026900"`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_levels" DROP CONSTRAINT "FK_4013ecc30ce3637e7684f593763"`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_levels" DROP CONSTRAINT "FK_3787a09a7005983f8d1e57f0f7b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."teaching_assignments_school_subject_year_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."teaching_assignments_user_year_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."teaching_assignments_offering_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."teaching_assignments_section_index"`,
    );
    await queryRunner.query(`DROP TABLE "teaching_assignments"`);
    await queryRunner.query(
      `DROP INDEX "public"."instructional_model_exceptions_cycle_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."instructional_model_exceptions_subject_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."instructional_model_exceptions_level_index"`,
    );
    await queryRunner.query(`DROP TABLE "instructional_model_exceptions"`);
    await queryRunner.query(
      `DROP INDEX "public"."course_offering_cycle_sections_section_index"`,
    );
    await queryRunner.query(`DROP TABLE "course_offering_cycle_sections"`);
    await queryRunner.query(
      `DROP INDEX "public"."course_offerings_active_key_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."course_offerings_school_period_status_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."course_offerings_year_level_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."course_offerings_subject_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."course_offerings_level_index"`,
    );
    await queryRunner.query(`DROP TABLE "course_offerings"`);
    await queryRunner.query(`DROP TABLE "subjects"`);
    await queryRunner.query(
      `DROP INDEX "public"."academic_cycle_sections_listing_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."academic_cycle_sections_level_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."academic_cycle_sections_homeroom_teacher_index"`,
    );
    await queryRunner.query(`DROP TABLE "academic_cycle_sections"`);
    await queryRunner.query(
      `DROP INDEX "public"."academic_levels_school_status_position_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."academic_levels_parent_index"`,
    );
    await queryRunner.query(`DROP TABLE "academic_levels"`);
  }
}
