import type { MigrationInterface, QueryRunner } from 'typeorm';
import { dropAppendOnly, makeAppendOnly } from '../append-only.js';

// Stage 5 part 1: learners' enrollments with their placement and status
// histories (append-only), the section of each school year, and the named
// learners of course offerings. A person has at most one open (active or
// suspended) enrollment anywhere; an admission number is unique per campus
// ignoring case.

export class Enrollments1794170000000 implements MigrationInterface {
  name = 'Enrollments1794170000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "student_records" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "user_id" uuid NOT NULL, "admission_number" character varying(100) NOT NULL, "admission_date" date NOT NULL, "academic_cycle_section_id" uuid, "status" character varying(20) NOT NULL DEFAULT 'active', "is_primary" boolean NOT NULL DEFAULT true, "transferred_from_id" uuid, CONSTRAINT "student_records_status_valid" CHECK (status IN ('active', 'suspended', 'withdrawn', 'transferred', 'graduated', 'archived')), CONSTRAINT "PK_5e3832860c9a6bb6d6fb5ed3c8e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "student_records_section_index" ON "student_records"  ("academic_cycle_section_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "student_records_user_index" ON "student_records"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "student_records_school_status_index" ON "student_records"  ("school_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "course_offering_student_records" ("course_offering_id" uuid NOT NULL, "student_record_id" uuid NOT NULL, CONSTRAINT "PK_4d58c05c97c0828e8910bda56db" PRIMARY KEY ("course_offering_id", "student_record_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "course_offering_student_records_enrollment_index" ON "course_offering_student_records"  ("student_record_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "academic_year_student_records" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "student_record_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "academic_cycle_section_id" uuid NOT NULL, CONSTRAINT "PK_17dcd6eac11d4ddb8937ec5b2b7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "academic_year_student_records_year_section_index" ON "academic_year_student_records"  ("academic_year_id", "academic_cycle_section_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "academic_year_student_records_enrollment_year_unique" ON "academic_year_student_records"  ("student_record_id", "academic_year_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "enrollment_placements" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "student_record_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "academic_period_id" uuid, "academic_cycle_section_id" uuid NOT NULL, "effective_on" date NOT NULL, "changed_by" uuid, "reason" character varying(500), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5f8842dc5f526a43a0c7d29ffaf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "enrollment_placements_section_day_index" ON "enrollment_placements"  ("academic_cycle_section_id", "effective_on") `,
    );
    await queryRunner.query(
      `CREATE INDEX "enrollment_placements_enrollment_day_index" ON "enrollment_placements"  ("student_record_id", "effective_on") `,
    );
    await queryRunner.query(
      `CREATE TABLE "enrollment_status_changes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "student_record_id" uuid NOT NULL, "from_status" character varying(20), "to_status" character varying(20) NOT NULL, "effective_on" date NOT NULL, "changed_by" uuid, "reason" character varying(500), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "enrollment_status_changes_to_status_valid" CHECK (to_status IN ('active', 'suspended', 'withdrawn', 'transferred', 'graduated', 'archived')), CONSTRAINT "PK_08cb0e324acd46294b12426af50" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "enrollment_status_changes_enrollment_day_index" ON "enrollment_status_changes"  ("student_record_id", "effective_on") `,
    );
    await queryRunner.query(
      `ALTER TABLE "student_records" ADD CONSTRAINT "FK_2b159589400702b03c372806a40" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_records" ADD CONSTRAINT "FK_697449786c220ba23da7efc15fd" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_records" ADD CONSTRAINT "FK_9f8bf8e4cd3ba4d82a8e74a0485" FOREIGN KEY ("academic_cycle_section_id") REFERENCES "academic_cycle_sections"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_records" ADD CONSTRAINT "FK_5b0895aee799baab33a1146c2ea" FOREIGN KEY ("transferred_from_id") REFERENCES "student_records"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "course_offering_student_records" ADD CONSTRAINT "FK_a2b4694c6ec46cddefce2ee45a1" FOREIGN KEY ("course_offering_id") REFERENCES "course_offerings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "course_offering_student_records" ADD CONSTRAINT "FK_1ae8b9e0045af06f82f4fd9e1ef" FOREIGN KEY ("student_record_id") REFERENCES "student_records"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_year_student_records" ADD CONSTRAINT "FK_804e19c67b4ed4b451b815a26ca" FOREIGN KEY ("student_record_id") REFERENCES "student_records"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_year_student_records" ADD CONSTRAINT "FK_247731812fbc050f1d1f8610f9c" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_year_student_records" ADD CONSTRAINT "FK_b4fd8d49335d07cebca5245ec0e" FOREIGN KEY ("academic_cycle_section_id") REFERENCES "academic_cycle_sections"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollment_placements" ADD CONSTRAINT "FK_1d0ae480f2a7752c0062c349208" FOREIGN KEY ("student_record_id") REFERENCES "student_records"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollment_placements" ADD CONSTRAINT "FK_abaf6d861d38d98ea5fe2cb63d3" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollment_placements" ADD CONSTRAINT "FK_f694b49f05d7a5be844c897c142" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollment_placements" ADD CONSTRAINT "FK_9671b9ab28e0868c02cb7f296d1" FOREIGN KEY ("academic_cycle_section_id") REFERENCES "academic_cycle_sections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollment_placements" ADD CONSTRAINT "FK_67b075aa23760e586da78046525" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollment_status_changes" ADD CONSTRAINT "FK_66c5ce01b41d616e611ea74fe3f" FOREIGN KEY ("student_record_id") REFERENCES "student_records"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollment_status_changes" ADD CONSTRAINT "FK_2e20ec8382a6f6d5305f02af6de" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "student_records_one_open_enrollment" ON "student_records" ("user_id") WHERE "status" IN ('active', 'suspended')`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "student_records_school_admission_number_unique" ON "student_records" ("school_id", lower("admission_number"))`,
    );
    await makeAppendOnly(queryRunner, 'enrollment_placements');
    await makeAppendOnly(queryRunner, 'enrollment_status_changes');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await dropAppendOnly(queryRunner, 'enrollment_status_changes');
    await dropAppendOnly(queryRunner, 'enrollment_placements');
    await queryRunner.query(
      `DROP INDEX "public"."student_records_school_admission_number_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."student_records_one_open_enrollment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollment_status_changes" DROP CONSTRAINT "FK_2e20ec8382a6f6d5305f02af6de"`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollment_status_changes" DROP CONSTRAINT "FK_66c5ce01b41d616e611ea74fe3f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollment_placements" DROP CONSTRAINT "FK_67b075aa23760e586da78046525"`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollment_placements" DROP CONSTRAINT "FK_9671b9ab28e0868c02cb7f296d1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollment_placements" DROP CONSTRAINT "FK_f694b49f05d7a5be844c897c142"`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollment_placements" DROP CONSTRAINT "FK_abaf6d861d38d98ea5fe2cb63d3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollment_placements" DROP CONSTRAINT "FK_1d0ae480f2a7752c0062c349208"`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_year_student_records" DROP CONSTRAINT "FK_b4fd8d49335d07cebca5245ec0e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_year_student_records" DROP CONSTRAINT "FK_247731812fbc050f1d1f8610f9c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_year_student_records" DROP CONSTRAINT "FK_804e19c67b4ed4b451b815a26ca"`,
    );
    await queryRunner.query(
      `ALTER TABLE "course_offering_student_records" DROP CONSTRAINT "FK_1ae8b9e0045af06f82f4fd9e1ef"`,
    );
    await queryRunner.query(
      `ALTER TABLE "course_offering_student_records" DROP CONSTRAINT "FK_a2b4694c6ec46cddefce2ee45a1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_records" DROP CONSTRAINT "FK_5b0895aee799baab33a1146c2ea"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_records" DROP CONSTRAINT "FK_9f8bf8e4cd3ba4d82a8e74a0485"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_records" DROP CONSTRAINT "FK_697449786c220ba23da7efc15fd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_records" DROP CONSTRAINT "FK_2b159589400702b03c372806a40"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."enrollment_status_changes_enrollment_day_index"`,
    );
    await queryRunner.query(`DROP TABLE "enrollment_status_changes"`);
    await queryRunner.query(
      `DROP INDEX "public"."enrollment_placements_enrollment_day_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."enrollment_placements_section_day_index"`,
    );
    await queryRunner.query(`DROP TABLE "enrollment_placements"`);
    await queryRunner.query(
      `DROP INDEX "public"."academic_year_student_records_enrollment_year_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."academic_year_student_records_year_section_index"`,
    );
    await queryRunner.query(`DROP TABLE "academic_year_student_records"`);
    await queryRunner.query(
      `DROP INDEX "public"."course_offering_student_records_enrollment_index"`,
    );
    await queryRunner.query(`DROP TABLE "course_offering_student_records"`);
    await queryRunner.query(
      `DROP INDEX "public"."student_records_school_status_index"`,
    );
    await queryRunner.query(`DROP INDEX "public"."student_records_user_index"`);
    await queryRunner.query(
      `DROP INDEX "public"."student_records_section_index"`,
    );
    await queryRunner.query(`DROP TABLE "student_records"`);
  }
}
