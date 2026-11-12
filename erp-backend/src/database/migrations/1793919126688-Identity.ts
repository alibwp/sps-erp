import type { MigrationInterface, QueryRunner } from 'typeorm';
import { dropAppendOnly, makeAppendOnly } from '../append-only.js';

// Stage 1: people, invitations, sessions, password resets and the audit log.

export class Identity1793919126688 implements MigrationInterface {
  name = 'Identity1793919126688';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(100) NOT NULL, "email" character varying(100) NOT NULL, "password_hash" character varying(255), "birthday" date, "gender" character varying(20), "phone" character varying(100), "address" character varying(255), "address_line_2" character varying(255), "city" character varying(100), "state" character varying(100), "postal_code" character varying(30), "country" character varying(100), "nationality" character varying(100), "profile_photo_path" character varying(2048), "account_status" character varying(20) NOT NULL DEFAULT 'invited', "email_verified_at" TIMESTAMP WITH TIME ZONE, "password_change_required_at" TIMESTAMP WITH TIME ZONE, "two_factor_secret" text, "two_factor_recovery_codes" jsonb, "two_factor_confirmed_at" TIMESTAMP WITH TIME ZONE, "two_factor_last_time_step" integer, "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "users_email_unique" UNIQUE ("email"), CONSTRAINT "users_gender_valid" CHECK (gender IN ('Male', 'Female', 'Non-binary', 'Prefer not to say')), CONSTRAINT "users_account_status_valid" CHECK (account_status IN ('invited', 'active', 'suspended', 'archived')), CONSTRAINT "users_email_lower_case" CHECK (email = lower(email)), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_events" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "school_id" uuid, "actor_id" uuid, "action" character varying(100) NOT NULL, "subject_type" character varying(100), "subject_id" uuid, "context" jsonb, "ip_address" character varying(45), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_910f64d901a5c3e9878f0d4a407" PRIMARY KEY ("id"))`,
    );
    await makeAppendOnly(queryRunner, 'audit_events');
    await queryRunner.query(
      `CREATE INDEX "audit_events_subject_index" ON "audit_events"  ("subject_type", "subject_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "audit_events_actor_index" ON "audit_events"  ("actor_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "audit_events_school_action_index" ON "audit_events"  ("school_id", "action", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "account_invitations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "invited_by" uuid, "token_hash" character(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "accepted_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "account_invitations_token_hash_unique" UNIQUE ("token_hash"), CONSTRAINT "PK_549ced110476548ed49316795d5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "account_invitations_user_state_index" ON "account_invitations"  ("user_id", "accepted_at", "revoked_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "auth_sessions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "refresh_token_hash" character(64), "previous_refresh_token_hash" character(64), "rotated_at" TIMESTAMP WITH TIME ZONE, "challenge_token_hash" character(64), "challenge_expires_at" TIMESTAMP WITH TIME ZONE, "user_agent" character varying(512), "ip_address" character varying(45), "last_used_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "password_confirmed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "auth_sessions_challenge_token_hash_unique" UNIQUE ("challenge_token_hash"), CONSTRAINT "PK_641507381f32580e8479efc36cd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "auth_sessions_user_index" ON "auth_sessions"  ("user_id", "revoked_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "token_hash" character(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE ("token_hash"), CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "password_reset_tokens_user_index" ON "password_reset_tokens"  ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_events" ADD CONSTRAINT "FK_04c7c044146c6632491a370fc04" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_invitations" ADD CONSTRAINT "FK_40d272468a218cf7f89c129b179" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_invitations" ADD CONSTRAINT "FK_7a4f82bb6fdc0cf3c0e1b22e846" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth_sessions" ADD CONSTRAINT "FK_50ccaa6440288a06f0ba693ccc6" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth_sessions" DROP CONSTRAINT "FK_50ccaa6440288a06f0ba693ccc6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_invitations" DROP CONSTRAINT "FK_7a4f82bb6fdc0cf3c0e1b22e846"`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_invitations" DROP CONSTRAINT "FK_40d272468a218cf7f89c129b179"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_events" DROP CONSTRAINT "FK_04c7c044146c6632491a370fc04"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."password_reset_tokens_user_index"`,
    );
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."auth_sessions_user_index"`);
    await queryRunner.query(`DROP TABLE "auth_sessions"`);
    await queryRunner.query(
      `DROP INDEX "public"."account_invitations_user_state_index"`,
    );
    await queryRunner.query(`DROP TABLE "account_invitations"`);
    await dropAppendOnly(queryRunner, 'audit_events');
    await queryRunner.query(
      `DROP INDEX "public"."audit_events_school_action_index"`,
    );
    await queryRunner.query(`DROP INDEX "public"."audit_events_actor_index"`);
    await queryRunner.query(`DROP INDEX "public"."audit_events_subject_index"`);
    await queryRunner.query(`DROP TABLE "audit_events"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
