import type { MigrationInterface, QueryRunner } from 'typeorm';
import { dropAppendOnly, makeAppendOnly } from '../append-only.js';

// Stage 3: academic years and periods with their status history, calendar
// templates, setup phases, working-period preferences, instructional model
// settings and migrations, weekdays, and the foreign keys from
// schools.academic_year_id, academic_period_id and calendar_template_id.
// Weekdays are seeded by the next migration.

export class AcademicCalendar1794150000000 implements MigrationInterface {
  name = 'AcademicCalendar1794150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "academic_period_status_changes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "period_type" character varying(20) NOT NULL, "period_id" uuid NOT NULL, "from_status" character varying(20) NOT NULL, "to_status" character varying(20) NOT NULL, "changed_by" uuid, "reason" character varying(500), "checklist" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "academic_period_status_changes_period_type_valid" CHECK (period_type IN ('academic_year', 'academic_period')), CONSTRAINT "PK_eae5aa8ef08205779e19757cc85" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "academic_period_status_changes_period_index" ON "academic_period_status_changes"  ("period_type", "period_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "academic_years" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "start_year" integer NOT NULL, "stop_year" integer NOT NULL, "starts_on" date, "ends_on" date, "status" character varying(20) NOT NULL DEFAULT 'draft', CONSTRAINT "academic_years_status_valid" CHECK (status IN ('draft', 'scheduled', 'open', 'closing', 'closed', 'archived')), CONSTRAINT "PK_2021b90bfbfa6c9da7df34ca1cf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "academic_years_school_status_index" ON "academic_years"  ("school_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "academic_periods" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "parent_id" uuid, "name" character varying(100) NOT NULL, "label" character varying(100), "type" character varying(20) NOT NULL, "position" smallint NOT NULL DEFAULT '1', "starts_on" date, "ends_on" date, "status" character varying(20) NOT NULL DEFAULT 'draft', CONSTRAINT "academic_periods_type_valid" CHECK (type IN ('term', 'semester', 'trimester', 'quarter', 'exam_window', 'holiday', 'reporting_period', 'other')), CONSTRAINT "academic_periods_status_valid" CHECK (status IN ('draft', 'scheduled', 'open', 'closing', 'closed', 'archived')), CONSTRAINT "PK_911f414fba24e3855a5ba1f51ad" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "academic_periods_school_status_index" ON "academic_periods"  ("school_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "academic_periods_parent_index" ON "academic_periods"  ("parent_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "academic_periods_year_position_index" ON "academic_periods"  ("academic_year_id", "position") `,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_templates" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "name" character varying(100) NOT NULL, "description" character varying(500), "is_default" boolean NOT NULL DEFAULT false, "cycle_length_days" smallint NOT NULL DEFAULT '365', "auto_open" boolean NOT NULL DEFAULT false, "generate_ahead_weeks" smallint NOT NULL DEFAULT '0', "remind_days_before" smallint NOT NULL DEFAULT '14', "created_by" uuid, CONSTRAINT "PK_ce676f0705d2fba672348ea7f59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "calendar_templates_organization_index" ON "calendar_templates"  ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_template_periods" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "calendar_template_id" uuid NOT NULL, "parent_id" uuid, "name" character varying(100) NOT NULL, "label" character varying(100), "type" character varying(30) NOT NULL, "position" smallint NOT NULL DEFAULT '1', "start_offset_days" smallint NOT NULL DEFAULT '0', "length_days" smallint NOT NULL, CONSTRAINT "PK_26a97da69f4bb5f0fcac4f2cdc5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "calendar_template_periods_parent_index" ON "calendar_template_periods"  ("parent_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "calendar_template_periods_template_position_index" ON "calendar_template_periods"  ("calendar_template_id", "position") `,
    );
    await queryRunner.query(
      `CREATE TABLE "instructional_model_migrations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "school_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "from_model" character varying(40), "to_model" character varying(40) NOT NULL, "reason" text NOT NULL, "impact" jsonb, "migrated_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "instructional_model_migrations_to_model_valid" CHECK (to_model IN ('fixed_home_sections', 'hybrid', 'subject_based_schedule')), CONSTRAINT "PK_bdaa32a3f911e397ab6d53eaed5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "instructional_model_migrations_year_index" ON "instructional_model_migrations"  ("school_id", "academic_year_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "instructional_model_settings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "model" character varying(40) NOT NULL, "updated_by" uuid, CONSTRAINT "instructional_model_settings_school_year_unique" UNIQUE ("school_id", "academic_year_id"), CONSTRAINT "instructional_model_settings_model_valid" CHECK (model IN ('fixed_home_sections', 'hybrid', 'subject_based_schedule')), CONSTRAINT "PK_e72e65efc5a0818e7188a156b50" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "school_setup_phases" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "academic_year_id" uuid, "phase_key" character varying(150) NOT NULL, "status" character varying(30) NOT NULL DEFAULT 'in_progress', "completed_at" TIMESTAMP WITH TIME ZONE, "acknowledged_at" TIMESTAMP WITH TIME ZONE, "acknowledged_by" uuid, CONSTRAINT "school_setup_phases_school_phase_unique" UNIQUE ("school_id", "phase_key"), CONSTRAINT "PK_b5af2da3b1d0387df02f32b408e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "school_setup_phases_school_status_index" ON "school_setup_phases"  ("school_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_academic_period_preferences" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "school_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "academic_period_id" uuid NOT NULL, CONSTRAINT "user_academic_period_preferences_unique" UNIQUE ("user_id", "school_id", "academic_year_id"), CONSTRAINT "PK_ba58b3a03ed0c5084722673736c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "user_academic_period_preferences_lookup_index" ON "user_academic_period_preferences"  ("school_id", "academic_year_id", "academic_period_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "weekdays" ("id" smallint NOT NULL, "name" character varying(20) NOT NULL, CONSTRAINT "weekdays_name_unique" UNIQUE ("name"), CONSTRAINT "PK_ff746550a4920cf6773b53177e4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" ADD "academic_year_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" ADD "academic_period_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" ADD "calendar_template_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" ADD CONSTRAINT "FK_de974d5b9bbfbe8f50f59f2e9df" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" ADD CONSTRAINT "FK_6783dceff38d41a34a39d6e01c3" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" ADD CONSTRAINT "FK_b0b778fecec22bb629454757349" FOREIGN KEY ("calendar_template_id") REFERENCES "calendar_templates"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_period_status_changes" ADD CONSTRAINT "FK_621ecf54860c206250f6c0bdf1f" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_years" ADD CONSTRAINT "FK_b293eb7909d2a3aae86c4380713" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_periods" ADD CONSTRAINT "FK_860f0eb9a19950ad8bc325177bd" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_periods" ADD CONSTRAINT "FK_cb5afeaf0a2b686fb0d6cb0d24e" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_periods" ADD CONSTRAINT "FK_3b713035faf80931ff197a43773" FOREIGN KEY ("parent_id") REFERENCES "academic_periods"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_templates" ADD CONSTRAINT "FK_9046d3ce0ee39bf7420526ee305" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_templates" ADD CONSTRAINT "FK_019c4813bc4dae517449c763bed" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_template_periods" ADD CONSTRAINT "FK_50b4aabf1c95adda9c5da8f6d6f" FOREIGN KEY ("calendar_template_id") REFERENCES "calendar_templates"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_template_periods" ADD CONSTRAINT "FK_b58c8436f53ac2717a1c19af26b" FOREIGN KEY ("parent_id") REFERENCES "calendar_template_periods"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_migrations" ADD CONSTRAINT "FK_a8b8204ba9fa65e3af983eb404c" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_migrations" ADD CONSTRAINT "FK_d80dab6fcdd7a11eeeedad8951c" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_migrations" ADD CONSTRAINT "FK_c7f47c92f307fbc889b1c6b30d8" FOREIGN KEY ("migrated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_settings" ADD CONSTRAINT "FK_e688bd6fd896aad26eb9760dbce" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_settings" ADD CONSTRAINT "FK_e22c0e045e0abdb75da179fadd6" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_settings" ADD CONSTRAINT "FK_aec3960c0ddfdc4c95d7a79be96" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "school_setup_phases" ADD CONSTRAINT "FK_316ce43f7b6335a9739e67d9140" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "school_setup_phases" ADD CONSTRAINT "FK_5404dae78651d206ce485ddb4d6" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "school_setup_phases" ADD CONSTRAINT "FK_e096ab7d6e0a0bbc2fffe6c91de" FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_academic_period_preferences" ADD CONSTRAINT "FK_cbefdb76fc122298d2b8506ffcb" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_academic_period_preferences" ADD CONSTRAINT "FK_db53fa2d37bdd02352bc9173d6e" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_academic_period_preferences" ADD CONSTRAINT "FK_49ef3311532727ef1408f07fd4f" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_academic_period_preferences" ADD CONSTRAINT "FK_26001dc88bd5e85cb289ec13909" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Histories are only ever inserted.
    await makeAppendOnly(queryRunner, 'academic_period_status_changes');
    await makeAppendOnly(queryRunner, 'instructional_model_migrations');
    // At most one default calendar template per organization.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "calendar_templates_one_default" ON "calendar_templates" ("organization_id") WHERE "is_default"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."calendar_templates_one_default"`,
    );
    await dropAppendOnly(queryRunner, 'instructional_model_migrations');
    await dropAppendOnly(queryRunner, 'academic_period_status_changes');
    await queryRunner.query(
      `ALTER TABLE "user_academic_period_preferences" DROP CONSTRAINT "FK_26001dc88bd5e85cb289ec13909"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_academic_period_preferences" DROP CONSTRAINT "FK_49ef3311532727ef1408f07fd4f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_academic_period_preferences" DROP CONSTRAINT "FK_db53fa2d37bdd02352bc9173d6e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_academic_period_preferences" DROP CONSTRAINT "FK_cbefdb76fc122298d2b8506ffcb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "school_setup_phases" DROP CONSTRAINT "FK_e096ab7d6e0a0bbc2fffe6c91de"`,
    );
    await queryRunner.query(
      `ALTER TABLE "school_setup_phases" DROP CONSTRAINT "FK_5404dae78651d206ce485ddb4d6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "school_setup_phases" DROP CONSTRAINT "FK_316ce43f7b6335a9739e67d9140"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_settings" DROP CONSTRAINT "FK_aec3960c0ddfdc4c95d7a79be96"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_settings" DROP CONSTRAINT "FK_e22c0e045e0abdb75da179fadd6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_settings" DROP CONSTRAINT "FK_e688bd6fd896aad26eb9760dbce"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_migrations" DROP CONSTRAINT "FK_c7f47c92f307fbc889b1c6b30d8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_migrations" DROP CONSTRAINT "FK_d80dab6fcdd7a11eeeedad8951c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "instructional_model_migrations" DROP CONSTRAINT "FK_a8b8204ba9fa65e3af983eb404c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_template_periods" DROP CONSTRAINT "FK_b58c8436f53ac2717a1c19af26b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_template_periods" DROP CONSTRAINT "FK_50b4aabf1c95adda9c5da8f6d6f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_templates" DROP CONSTRAINT "FK_019c4813bc4dae517449c763bed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_templates" DROP CONSTRAINT "FK_9046d3ce0ee39bf7420526ee305"`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_periods" DROP CONSTRAINT "FK_3b713035faf80931ff197a43773"`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_periods" DROP CONSTRAINT "FK_cb5afeaf0a2b686fb0d6cb0d24e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_periods" DROP CONSTRAINT "FK_860f0eb9a19950ad8bc325177bd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_years" DROP CONSTRAINT "FK_b293eb7909d2a3aae86c4380713"`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_period_status_changes" DROP CONSTRAINT "FK_621ecf54860c206250f6c0bdf1f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" DROP CONSTRAINT "FK_b0b778fecec22bb629454757349"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" DROP CONSTRAINT "FK_6783dceff38d41a34a39d6e01c3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" DROP CONSTRAINT "FK_de974d5b9bbfbe8f50f59f2e9df"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" DROP COLUMN "calendar_template_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" DROP COLUMN "academic_period_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" DROP COLUMN "academic_year_id"`,
    );
    await queryRunner.query(`DROP TABLE "weekdays"`);
    await queryRunner.query(
      `DROP INDEX "public"."user_academic_period_preferences_lookup_index"`,
    );
    await queryRunner.query(`DROP TABLE "user_academic_period_preferences"`);
    await queryRunner.query(
      `DROP INDEX "public"."school_setup_phases_school_status_index"`,
    );
    await queryRunner.query(`DROP TABLE "school_setup_phases"`);
    await queryRunner.query(`DROP TABLE "instructional_model_settings"`);
    await queryRunner.query(
      `DROP INDEX "public"."instructional_model_migrations_year_index"`,
    );
    await queryRunner.query(`DROP TABLE "instructional_model_migrations"`);
    await queryRunner.query(
      `DROP INDEX "public"."calendar_template_periods_template_position_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."calendar_template_periods_parent_index"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_template_periods"`);
    await queryRunner.query(
      `DROP INDEX "public"."calendar_templates_organization_index"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_templates"`);
    await queryRunner.query(
      `DROP INDEX "public"."academic_periods_year_position_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."academic_periods_parent_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."academic_periods_school_status_index"`,
    );
    await queryRunner.query(`DROP TABLE "academic_periods"`);
    await queryRunner.query(
      `DROP INDEX "public"."academic_years_school_status_index"`,
    );
    await queryRunner.query(`DROP TABLE "academic_years"`);
    await queryRunner.query(
      `DROP INDEX "public"."academic_period_status_changes_period_index"`,
    );
    await queryRunner.query(`DROP TABLE "academic_period_status_changes"`);
  }
}
