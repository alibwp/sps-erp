import type { MigrationInterface, QueryRunner } from 'typeorm';
import { dropAppendOnly, makeAppendOnly } from '../append-only.js';

// Stage 5 part 4: staff operations. Employment records (a staff number
// unique per campus ignoring case), weekly availability, credentials, and
// leave with its append-only history.

export class Staff1794210000000 implements MigrationInterface {
  name = 'Staff1794210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "staff_profiles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "user_id" uuid NOT NULL, "staff_number" character varying(30), "job_title" character varying(150), "department" character varying(150), "employment_type" character varying(20) NOT NULL DEFAULT 'full_time', "status" character varying(20) NOT NULL DEFAULT 'active', "joined_on" date, "left_on" date, CONSTRAINT "staff_profiles_school_user_unique" UNIQUE ("school_id", "user_id"), CONSTRAINT "staff_profiles_left_after_joined" CHECK (left_on IS NULL OR joined_on IS NULL OR left_on >= joined_on), CONSTRAINT "staff_profiles_status_valid" CHECK (status IN ('active', 'on_leave', 'suspended', 'left')), CONSTRAINT "staff_profiles_employment_type_valid" CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'volunteer', 'intern')), CONSTRAINT "PK_6d4c6c0b447e39147b4a6dcbede" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "staff_profiles_status_left_on_index" ON "staff_profiles"  ("status", "left_on") `,
    );
    await queryRunner.query(
      `CREATE TABLE "staff_availabilities" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "staff_profile_id" uuid NOT NULL, "day_of_week" smallint NOT NULL, "starts_at" TIME NOT NULL, "ends_at" TIME NOT NULL, CONSTRAINT "staff_availabilities_ends_after_start" CHECK (ends_at > starts_at), CONSTRAINT "staff_availabilities_day_valid" CHECK (day_of_week BETWEEN 1 AND 7), CONSTRAINT "PK_d123956232ee92f870c6027b66a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "staff_availabilities_profile_day_index" ON "staff_availabilities"  ("staff_profile_id", "day_of_week") `,
    );
    await queryRunner.query(
      `CREATE TABLE "staff_credentials" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "staff_profile_id" uuid NOT NULL, "type" character varying(50) NOT NULL, "name" character varying(200) NOT NULL, "issuer" character varying(200), "reference" character varying(100), "issued_on" date, "expires_on" date, "verified_at" TIMESTAMP WITH TIME ZONE, "verified_by" uuid, CONSTRAINT "staff_credentials_expiry_after_issue" CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on), CONSTRAINT "PK_62eb1687203f7f745847facdc15" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "staff_credentials_profile_index" ON "staff_credentials"  ("staff_profile_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "staff_leave_requests" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "staff_profile_id" uuid NOT NULL, "type" character varying(20) NOT NULL DEFAULT 'annual', "status" character varying(20) NOT NULL DEFAULT 'requested', "starts_on" date NOT NULL, "ends_on" date NOT NULL, "reason" character varying(500), "requested_by" uuid, "decided_by" uuid, "decided_at" TIMESTAMP WITH TIME ZONE, "decision_note" character varying(500), CONSTRAINT "staff_leave_requests_ends_after_start" CHECK (ends_on >= starts_on), CONSTRAINT "staff_leave_requests_status_valid" CHECK (status IN ('requested', 'approved', 'declined', 'cancelled', 'taken')), CONSTRAINT "staff_leave_requests_type_valid" CHECK (type IN ('annual', 'sick', 'compassionate', 'study', 'maternity', 'unpaid')), CONSTRAINT "PK_066c3ab8534c6675f094d717d2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "staff_leave_requests_profile_days_index" ON "staff_leave_requests"  ("staff_profile_id", "starts_on", "ends_on") `,
    );
    await queryRunner.query(
      `CREATE INDEX "staff_leave_requests_school_status_index" ON "staff_leave_requests"  ("school_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "staff_leave_status_changes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "staff_leave_request_id" uuid NOT NULL, "from_status" character varying(20) NOT NULL, "to_status" character varying(20) NOT NULL, "reason" character varying(500), "changed_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a396e02e6929c2e1bf835d3547f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "staff_leave_status_changes_request_index" ON "staff_leave_status_changes"  ("staff_leave_request_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_profiles" ADD CONSTRAINT "FK_89a4fc6067d1f88f61362443826" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_profiles" ADD CONSTRAINT "FK_223deb3f390b28562fad70eefed" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_availabilities" ADD CONSTRAINT "FK_1c433cac435cc1a88584aba97bb" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_credentials" ADD CONSTRAINT "FK_15e239feb9fad7a0eb2724923f5" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_credentials" ADD CONSTRAINT "FK_c4168724c51ce36804989d633ed" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_leave_requests" ADD CONSTRAINT "FK_d314c7d35d485d4e5d5c37c29c3" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_leave_requests" ADD CONSTRAINT "FK_e62373dae318ee212680e3d2ec5" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_leave_requests" ADD CONSTRAINT "FK_96f0c0dce4af711cb47e3e35ca9" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_leave_requests" ADD CONSTRAINT "FK_7292a49a37e82bcfd5d79b601e9" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_leave_status_changes" ADD CONSTRAINT "FK_402ded285cae8eae57e659caf1f" FOREIGN KEY ("staff_leave_request_id") REFERENCES "staff_leave_requests"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_leave_status_changes" ADD CONSTRAINT "FK_949b70173705c4e8a1e73d821f9" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "staff_profiles_school_staff_number_unique" ON "staff_profiles" ("school_id", lower("staff_number")) WHERE staff_number IS NOT NULL`,
    );
    await makeAppendOnly(queryRunner, 'staff_leave_status_changes');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await dropAppendOnly(queryRunner, 'staff_leave_status_changes');
    await queryRunner.query(
      `DROP INDEX "public"."staff_profiles_school_staff_number_unique"`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_leave_status_changes" DROP CONSTRAINT "FK_949b70173705c4e8a1e73d821f9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_leave_status_changes" DROP CONSTRAINT "FK_402ded285cae8eae57e659caf1f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_leave_requests" DROP CONSTRAINT "FK_7292a49a37e82bcfd5d79b601e9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_leave_requests" DROP CONSTRAINT "FK_96f0c0dce4af711cb47e3e35ca9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_leave_requests" DROP CONSTRAINT "FK_e62373dae318ee212680e3d2ec5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_leave_requests" DROP CONSTRAINT "FK_d314c7d35d485d4e5d5c37c29c3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_credentials" DROP CONSTRAINT "FK_c4168724c51ce36804989d633ed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_credentials" DROP CONSTRAINT "FK_15e239feb9fad7a0eb2724923f5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_availabilities" DROP CONSTRAINT "FK_1c433cac435cc1a88584aba97bb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_profiles" DROP CONSTRAINT "FK_223deb3f390b28562fad70eefed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_profiles" DROP CONSTRAINT "FK_89a4fc6067d1f88f61362443826"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."staff_leave_status_changes_request_index"`,
    );
    await queryRunner.query(`DROP TABLE "staff_leave_status_changes"`);
    await queryRunner.query(
      `DROP INDEX "public"."staff_leave_requests_school_status_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."staff_leave_requests_profile_days_index"`,
    );
    await queryRunner.query(`DROP TABLE "staff_leave_requests"`);
    await queryRunner.query(
      `DROP INDEX "public"."staff_credentials_profile_index"`,
    );
    await queryRunner.query(`DROP TABLE "staff_credentials"`);
    await queryRunner.query(
      `DROP INDEX "public"."staff_availabilities_profile_day_index"`,
    );
    await queryRunner.query(`DROP TABLE "staff_availabilities"`);
    await queryRunner.query(
      `DROP INDEX "public"."staff_profiles_status_left_on_index"`,
    );
    await queryRunner.query(`DROP TABLE "staff_profiles"`);
  }
}
