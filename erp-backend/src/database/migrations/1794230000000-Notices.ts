import type { MigrationInterface, QueryRunner } from 'typeorm';

// Stage 7: the campus calendar and notices. An event covers a span of
// time for the whole campus, chosen sections or chosen people; a notice
// keeps its audience as asked for and, once published, the people it
// reached. Revisions point at the notice they replace; email preferences
// are one per person and campus.

export class Notices1794230000000 implements MigrationInterface {
  name = 'Notices1794230000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "calendar_events" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "academic_year_id" uuid, "academic_period_id" uuid, "title" character varying(255) NOT NULL, "description" text, "type" character varying(30) NOT NULL DEFAULT 'other', "location" character varying(255), "is_all_day" boolean NOT NULL DEFAULT true, "is_published" boolean NOT NULL DEFAULT false, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_by" uuid, CONSTRAINT "calendar_events_ends_after_start" CHECK (ends_at >= starts_at), CONSTRAINT "calendar_events_type_valid" CHECK (type IN ('holiday', 'closure', 'special_day', 'assembly', 'activity', 'parent_meeting', 'appointment', 'examination', 'other')), CONSTRAINT "PK_faf5391d232322a87cdd1c6f30c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "calendar_events_school_starts_index" ON "calendar_events"  ("school_id", "starts_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "calendar_event_audiences" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "calendar_event_id" uuid NOT NULL, "academic_cycle_section_id" uuid, "user_id" uuid, CONSTRAINT "calendar_event_audiences_one_target" CHECK ((academic_cycle_section_id IS NULL) <> (user_id IS NULL)), CONSTRAINT "PK_3eb244ba2e50490a79252415b6f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "calendar_event_audiences_user_index" ON "calendar_event_audiences"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "calendar_event_audiences_section_index" ON "calendar_event_audiences"  ("academic_cycle_section_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "calendar_event_audiences_event_index" ON "calendar_event_audiences"  ("calendar_event_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "notice_notification_preferences" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "school_id" uuid NOT NULL, "email_enabled" boolean NOT NULL DEFAULT true, CONSTRAINT "notice_notification_preferences_user_school_unique" UNIQUE ("user_id", "school_id"), CONSTRAINT "PK_aa108646812b6d998371da3e6cf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "notices" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "title" character varying(255) NOT NULL, "content" text NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'draft', "audience" jsonb NOT NULL, "send_email" boolean NOT NULL DEFAULT false, "start_date" date NOT NULL, "stop_date" date NOT NULL, "scheduled_for" TIMESTAMP WITH TIME ZONE, "published_at" TIMESTAMP WITH TIME ZONE, "published_by" uuid, "revision" smallint NOT NULL DEFAULT '1', "revision_of_id" uuid, "attachment_key" character varying(1024), "attachment_name" character varying(255), "attachment_mime_type" character varying(127), "attachment_size" integer, "created_by" uuid, CONSTRAINT "notices_stop_after_start" CHECK (stop_date >= start_date), CONSTRAINT "notices_status_valid" CHECK (status IN ('draft', 'scheduled', 'published', 'expired', 'superseded', 'archived')), CONSTRAINT "PK_3eb18c29da25d6935fcbe584237" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "notices_status_scheduled_index" ON "notices"  ("status", "scheduled_for") `,
    );
    await queryRunner.query(
      `CREATE INDEX "notices_school_status_index" ON "notices"  ("school_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "notice_recipients" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "notice_id" uuid NOT NULL, "user_id" uuid NOT NULL, "state" character varying(20) NOT NULL DEFAULT 'pending', "delivered_at" TIMESTAMP WITH TIME ZONE, "read_at" TIMESTAMP WITH TIME ZONE, "dismissed_at" TIMESTAMP WITH TIME ZONE, "failure_reason" character varying(255), CONSTRAINT "notice_recipients_notice_user_unique" UNIQUE ("notice_id", "user_id"), CONSTRAINT "notice_recipients_state_valid" CHECK (state IN ('pending', 'delivered', 'read', 'dismissed', 'failed')), CONSTRAINT "PK_f9718517aad7cbcc66d56557502" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "notice_recipients_user_index" ON "notice_recipients"  ("user_id", "state") `,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_events" ADD CONSTRAINT "FK_2952376eeaf6e7785b9a60f33dc" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_events" ADD CONSTRAINT "FK_545d0201e9225176b1324aef86a" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_events" ADD CONSTRAINT "FK_a10afe5d6eac73626221ee9a699" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_events" ADD CONSTRAINT "FK_29b10e413d1a7ccd621915e2586" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_event_audiences" ADD CONSTRAINT "FK_9b592ab52ef6936ab1fb3342876" FOREIGN KEY ("calendar_event_id") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_event_audiences" ADD CONSTRAINT "FK_6a26957c0621a9c84f8f13e960c" FOREIGN KEY ("academic_cycle_section_id") REFERENCES "academic_cycle_sections"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_event_audiences" ADD CONSTRAINT "FK_f833670635060a776a4111989d9" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notice_notification_preferences" ADD CONSTRAINT "FK_df0f9069e32a79796acc5e8891b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notice_notification_preferences" ADD CONSTRAINT "FK_9331d51ee3c900002f69cf700df" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notices" ADD CONSTRAINT "FK_acec01bdcfeb2952e2d9e283f8e" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notices" ADD CONSTRAINT "FK_974a8f0ae0d21e48436b3815bdb" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notices" ADD CONSTRAINT "FK_b44f85fea503ed8d7d09acb3dc4" FOREIGN KEY ("revision_of_id") REFERENCES "notices"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notices" ADD CONSTRAINT "FK_5091560ec8975434a5add94c411" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notice_recipients" ADD CONSTRAINT "FK_3cf056ea1eeeadb0fa4068382d1" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notice_recipients" ADD CONSTRAINT "FK_feb75a58e16451ff78db3e2256c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notice_recipients" DROP CONSTRAINT "FK_feb75a58e16451ff78db3e2256c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notice_recipients" DROP CONSTRAINT "FK_3cf056ea1eeeadb0fa4068382d1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notices" DROP CONSTRAINT "FK_5091560ec8975434a5add94c411"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notices" DROP CONSTRAINT "FK_b44f85fea503ed8d7d09acb3dc4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notices" DROP CONSTRAINT "FK_974a8f0ae0d21e48436b3815bdb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notices" DROP CONSTRAINT "FK_acec01bdcfeb2952e2d9e283f8e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notice_notification_preferences" DROP CONSTRAINT "FK_9331d51ee3c900002f69cf700df"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notice_notification_preferences" DROP CONSTRAINT "FK_df0f9069e32a79796acc5e8891b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_event_audiences" DROP CONSTRAINT "FK_f833670635060a776a4111989d9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_event_audiences" DROP CONSTRAINT "FK_6a26957c0621a9c84f8f13e960c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_event_audiences" DROP CONSTRAINT "FK_9b592ab52ef6936ab1fb3342876"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_events" DROP CONSTRAINT "FK_29b10e413d1a7ccd621915e2586"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_events" DROP CONSTRAINT "FK_a10afe5d6eac73626221ee9a699"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_events" DROP CONSTRAINT "FK_545d0201e9225176b1324aef86a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "calendar_events" DROP CONSTRAINT "FK_2952376eeaf6e7785b9a60f33dc"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."notice_recipients_user_index"`,
    );
    await queryRunner.query(`DROP TABLE "notice_recipients"`);
    await queryRunner.query(
      `DROP INDEX "public"."notices_school_status_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."notices_status_scheduled_index"`,
    );
    await queryRunner.query(`DROP TABLE "notices"`);
    await queryRunner.query(`DROP TABLE "notice_notification_preferences"`);
    await queryRunner.query(
      `DROP INDEX "public"."calendar_event_audiences_event_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."calendar_event_audiences_section_index"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."calendar_event_audiences_user_index"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_event_audiences"`);
    await queryRunner.query(
      `DROP INDEX "public"."calendar_events_school_starts_index"`,
    );
    await queryRunner.query(`DROP TABLE "calendar_events"`);
  }
}
