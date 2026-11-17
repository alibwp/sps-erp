import type { MigrationInterface, QueryRunner } from 'typeorm';

// Stage 5 part 2: promotions, the admission waitlist and campus move
// requests. A candidate has at most one open (pending or offered) entry per
// section, and an enrollment at most one open campus move request.

export class MovingLearners1794190000000 implements MigrationInterface {
  name = 'MovingLearners1794190000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "admission_waitlist_entries" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "academic_cycle_section_id" uuid NOT NULL, "user_id" uuid NOT NULL, "created_by" uuid, "offered_by" uuid, "decided_by" uuid, "status" character varying(20) NOT NULL DEFAULT 'pending', "priority" integer NOT NULL DEFAULT '0', "position" integer NOT NULL, "decision_reason" text, "offered_at" TIMESTAMP WITH TIME ZONE, "decided_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "admission_waitlist_entries_priority_valid" CHECK (priority >= 0), CONSTRAINT "admission_waitlist_entries_status_valid" CHECK (status IN ('pending', 'offered', 'accepted', 'declined', 'withdrawn', 'placed')), CONSTRAINT "PK_9be524cd2049f536601b7fd710f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "admission_waitlist_person_index" ON "admission_waitlist_entries"  ("school_id", "user_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "admission_waitlist_queue_index" ON "admission_waitlist_entries"  ("school_id", "academic_cycle_section_id", "status", "priority", "position") `,
    );
    await queryRunner.query(
      `CREATE TABLE "campus_move_requests" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "student_record_id" uuid NOT NULL, "from_school_id" uuid NOT NULL, "to_school_id" uuid NOT NULL, "academic_cycle_section_id" uuid NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'requested', "reason" character varying(500), "effective_on" date NOT NULL, "requested_by" uuid, "decided_by" uuid, "decided_at" TIMESTAMP WITH TIME ZONE, "decision_note" character varying(500), CONSTRAINT "campus_move_requests_status_valid" CHECK (status IN ('requested', 'approved', 'rejected', 'cancelled')), CONSTRAINT "PK_dd4a17c461bc710070b0cb3d4b4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "campus_move_requests_enrollment_status_index" ON "campus_move_requests"  ("student_record_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "campus_move_requests_to_school_status_index" ON "campus_move_requests"  ("to_school_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "promotions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "source_academic_cycle_section_id" uuid NOT NULL, "destination_academic_cycle_section_id" uuid NOT NULL, "student_record_ids" jsonb NOT NULL, CONSTRAINT "PK_380cecbbe3ac11f0e5a7c452c34" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "promotions_school_year_index" ON "promotions"  ("school_id", "academic_year_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "admission_waitlist_entries" ADD CONSTRAINT "FK_4705c1e44d789c2f9976884aa4a" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "admission_waitlist_entries" ADD CONSTRAINT "FK_0ace322e5bb73d5e82d8c4c9254" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "admission_waitlist_entries" ADD CONSTRAINT "FK_0ed20aab325c8ade20f47413995" FOREIGN KEY ("academic_cycle_section_id") REFERENCES "academic_cycle_sections"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "admission_waitlist_entries" ADD CONSTRAINT "FK_4279560194e7beece7a79a4e780" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "admission_waitlist_entries" ADD CONSTRAINT "FK_9ada9bb34b2c267ca662726b3e8" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "admission_waitlist_entries" ADD CONSTRAINT "FK_8cd658c6eb24088a942aeface3d" FOREIGN KEY ("offered_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "admission_waitlist_entries" ADD CONSTRAINT "FK_b9f364ed52b0a9ab1ebcdf8ce80" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "campus_move_requests" ADD CONSTRAINT "FK_aa04e0907a24c62c6f0716234fe" FOREIGN KEY ("student_record_id") REFERENCES "student_records"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "campus_move_requests" ADD CONSTRAINT "FK_c7d00cf0bf19a70c1782f84e7b0" FOREIGN KEY ("from_school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "campus_move_requests" ADD CONSTRAINT "FK_f0b596f7c1e628c8abe9f46bce4" FOREIGN KEY ("to_school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "campus_move_requests" ADD CONSTRAINT "FK_1287099ab0e77f2894830461659" FOREIGN KEY ("academic_cycle_section_id") REFERENCES "academic_cycle_sections"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "campus_move_requests" ADD CONSTRAINT "FK_752878c4f00a1ebbb596b34543a" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "campus_move_requests" ADD CONSTRAINT "FK_352940fd2fbe12003c842b1ebaa" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "promotions" ADD CONSTRAINT "FK_3aafbb83eb7797415454c34b380" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "promotions" ADD CONSTRAINT "FK_6734e0c8b0749e9eda17bbf6078" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "promotions" ADD CONSTRAINT "FK_47637109fdd6e94ce41127c01c6" FOREIGN KEY ("source_academic_cycle_section_id") REFERENCES "academic_cycle_sections"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "promotions" ADD CONSTRAINT "FK_0293d4cf961d5062e9f7eb07b0a" FOREIGN KEY ("destination_academic_cycle_section_id") REFERENCES "academic_cycle_sections"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "admission_waitlist_entries_one_open" ON "admission_waitlist_entries" ("academic_cycle_section_id", "user_id") WHERE status IN ('pending', 'offered')`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "campus_move_requests_one_open" ON "campus_move_requests" ("student_record_id") WHERE status = 'requested'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."campus_move_requests_one_open"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."admission_waitlist_entries_one_open"`,
    );
    await queryRunner.query(
      `ALTER TABLE "promotions" DROP CONSTRAINT "FK_0293d4cf961d5062e9f7eb07b0a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "promotions" DROP CONSTRAINT "FK_47637109fdd6e94ce41127c01c6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "promotions" DROP CONSTRAINT "FK_6734e0c8b0749e9eda17bbf6078"`,
    );
    await queryRunner.query(
      `ALTER TABLE "promotions" DROP CONSTRAINT "FK_3aafbb83eb7797415454c34b380"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campus_move_requests" DROP CONSTRAINT "FK_352940fd2fbe12003c842b1ebaa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campus_move_requests" DROP CONSTRAINT "FK_752878c4f00a1ebbb596b34543a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campus_move_requests" DROP CONSTRAINT "FK_1287099ab0e77f2894830461659"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campus_move_requests" DROP CONSTRAINT "FK_f0b596f7c1e628c8abe9f46bce4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campus_move_requests" DROP CONSTRAINT "FK_c7d00cf0bf19a70c1782f84e7b0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campus_move_requests" DROP CONSTRAINT "FK_aa04e0907a24c62c6f0716234fe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admission_waitlist_entries" DROP CONSTRAINT "FK_b9f364ed52b0a9ab1ebcdf8ce80"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admission_waitlist_entries" DROP CONSTRAINT "FK_8cd658c6eb24088a942aeface3d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admission_waitlist_entries" DROP CONSTRAINT "FK_9ada9bb34b2c267ca662726b3e8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admission_waitlist_entries" DROP CONSTRAINT "FK_4279560194e7beece7a79a4e780"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admission_waitlist_entries" DROP CONSTRAINT "FK_0ed20aab325c8ade20f47413995"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admission_waitlist_entries" DROP CONSTRAINT "FK_0ace322e5bb73d5e82d8c4c9254"`,
    );
    await queryRunner.query(
      `ALTER TABLE "admission_waitlist_entries" DROP CONSTRAINT "FK_4705c1e44d789c2f9976884aa4a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."promotions_school_year_index"`,
    );
    await queryRunner.query(`DROP TABLE "promotions"`);
    await queryRunner.query(
      `DROP INDEX "public"."campus_move_requests_to_school_status_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."campus_move_requests_enrollment_status_index"`,
    );
    await queryRunner.query(`DROP TABLE "campus_move_requests"`);
    await queryRunner.query(
      `DROP INDEX "public"."admission_waitlist_queue_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."admission_waitlist_person_index"`,
    );
    await queryRunner.query(`DROP TABLE "admission_waitlist_entries"`);
  }
}
