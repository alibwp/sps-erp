import type { MigrationInterface, QueryRunner } from 'typeorm';

// Stage 2: organizations, campuses, memberships, billing groups, operating
// profiles, roles and permissions, feature settings, and the foreign key
// from audit_events.school_id to schools. The permission list is seeded by
// the next migration.

export class OrganizationsAndAccess1794140000000 implements MigrationInterface {
  name = 'OrganizationsAndAccess1794140000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "organizations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(100) NOT NULL, "code" character varying(50) NOT NULL, "address" character varying(1000), "email" character varying(100), "phone" character varying(100), CONSTRAINT "organizations_code_unique" UNIQUE ("code"), CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "billing_groups" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "name" character varying(100) NOT NULL, CONSTRAINT "PK_45a37d0317d12f23ba5432e15af" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "schools" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "billing_group_id" uuid, "name" character varying(100) NOT NULL, "initials" character varying(10), "code" character varying(100) NOT NULL, "address" character varying(255), "city" character varying(100), "state" character varying(100), "postal_code" character varying(30), "country" character varying(100), "timezone" character varying(64) NOT NULL, "phone" character varying(100), "email" character varying(100), "logo_path" character varying(2048), "setup_details_completed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "schools_code_unique" UNIQUE ("code"), CONSTRAINT "PK_95b932e47ac129dd8e23a0db548" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "schools_billing_group_index" ON "schools"  ("billing_group_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "schools_organization_index" ON "schools"  ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "feature_settings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid, "feature" character varying(50) NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "config" jsonb, "updated_by" uuid, CONSTRAINT "feature_settings_feature_valid" CHECK (feature IN ('attendance', 'portal', 'discipline', 'wellbeing', 'staff_operations', 'events', 'ranking', 'imports', 'boarding', 'library', 'graduation_plans', 'programmes')), CONSTRAINT "PK_26b9ecee13c6f3e447002b96ad3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "permissions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(100) NOT NULL, CONSTRAINT "permissions_name_unique" UNIQUE ("name"), CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "roles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid, "name" character varying(100) NOT NULL, "description" character varying(255), "archived_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "roles_school_index" ON "roles"  ("school_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "role_has_permissions" ("role_id" uuid NOT NULL, "permission_id" uuid NOT NULL, CONSTRAINT "PK_bc4792445e658ccfc1b7723d1f5" PRIMARY KEY ("role_id", "permission_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "role_has_permissions_permission_index" ON "role_has_permissions"  ("permission_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "model_has_roles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "role_id" uuid NOT NULL, "school_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b951b878afa160f556c1e69ba67" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "model_has_roles_role_index" ON "model_has_roles"  ("role_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "model_has_roles_school_role_index" ON "model_has_roles"  ("school_id", "role_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "organization_memberships" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "user_id" uuid NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'active', "permissions" jsonb, "joined_at" TIMESTAMP WITH TIME ZONE, "ended_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "organization_memberships_organization_user_unique" UNIQUE ("organization_id", "user_id"), CONSTRAINT "organization_memberships_status_valid" CHECK (status IN ('active', 'suspended', 'ended')), CONSTRAINT "PK_cd7be805730a4c778a5f45364af" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "organization_memberships_user_status_index" ON "organization_memberships"  ("user_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "school_memberships" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "school_id" uuid NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'active', "is_primary" boolean NOT NULL DEFAULT false, "joined_at" TIMESTAMP WITH TIME ZONE, "ended_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "school_memberships_user_school_unique" UNIQUE ("user_id", "school_id"), CONSTRAINT "school_memberships_status_valid" CHECK (status IN ('active', 'suspended', 'ended')), CONSTRAINT "PK_07a328e1d9134f7e7516758c240" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "school_memberships_school_status_index" ON "school_memberships"  ("school_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "school_operating_profiles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "preset" character varying(100) NOT NULL DEFAULT 'home_sections', "labels" jsonb NOT NULL, "setup_completed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "school_operating_profiles_school_unique" UNIQUE ("school_id"), CONSTRAINT "PK_1a5969910eb2c6e6f97b9c67e16" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_groups" ADD CONSTRAINT "FK_8c5b6df45989190137765ef2230" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" ADD CONSTRAINT "FK_9679a4d285712a38f85f9005622" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" ADD CONSTRAINT "FK_eaab24d5f655c21ee24f58efc5e" FOREIGN KEY ("billing_group_id") REFERENCES "billing_groups"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_events" ADD CONSTRAINT "FK_319538ad97e5045f06f1eabe9b2" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "feature_settings" ADD CONSTRAINT "FK_d100b5d488deaffaef6d2b3eaf8" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "feature_settings" ADD CONSTRAINT "FK_4d54f8caacea0756e1b036b67a7" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" ADD CONSTRAINT "FK_55dc8a573b4ceb933103cf999ba" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_has_permissions" ADD CONSTRAINT "FK_9135e97d2d840f7dfd6e6649116" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_has_permissions" ADD CONSTRAINT "FK_09ff9df62bd01f8cf45b1b1921a" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "model_has_roles" ADD CONSTRAINT "FK_a93f01654e88cd71aeeac2d834b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "model_has_roles" ADD CONSTRAINT "FK_b5dd1765d08875537905531964a" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "model_has_roles" ADD CONSTRAINT "FK_077ad2beff166b8cd68b6e485eb" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_memberships" ADD CONSTRAINT "FK_86ae2efbb9ce84dd652e0c96a49" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_memberships" ADD CONSTRAINT "FK_5352fc550034d507d6c76dd2901" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "school_memberships" ADD CONSTRAINT "FK_be21fa9ba92a42603629888ce63" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "school_memberships" ADD CONSTRAINT "FK_c856e6355c4c2fb39c42b7830ea" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "school_operating_profiles" ADD CONSTRAINT "FK_20b998c35908629272f61c3736b" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Unique keys TypeORM cannot declare. NULLS NOT DISTINCT: a null campus
    // (a shared role, a global role, the platform-wide feature setting)
    // counts as one value, so it cannot be repeated either.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "billing_groups_organization_name_unique" ON "billing_groups" ("organization_id", lower("name"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "roles_school_name_unique" ON "roles" ("school_id", lower("name")) NULLS NOT DISTINCT`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "model_has_roles_unique" ON "model_has_roles" ("user_id", "role_id", "school_id") NULLS NOT DISTINCT`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "feature_settings_school_feature_unique" ON "feature_settings" ("school_id", "feature") NULLS NOT DISTINCT`,
    );
    // One primary campus per person.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "school_memberships_one_primary" ON "school_memberships" ("user_id") WHERE "is_primary"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."school_memberships_one_primary"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."feature_settings_school_feature_unique"`,
    );
    await queryRunner.query(`DROP INDEX "public"."model_has_roles_unique"`);
    await queryRunner.query(`DROP INDEX "public"."roles_school_name_unique"`);
    await queryRunner.query(
      `DROP INDEX "public"."billing_groups_organization_name_unique"`,
    );
    await queryRunner.query(
      `ALTER TABLE "school_operating_profiles" DROP CONSTRAINT "FK_20b998c35908629272f61c3736b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "school_memberships" DROP CONSTRAINT "FK_c856e6355c4c2fb39c42b7830ea"`,
    );
    await queryRunner.query(
      `ALTER TABLE "school_memberships" DROP CONSTRAINT "FK_be21fa9ba92a42603629888ce63"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_memberships" DROP CONSTRAINT "FK_5352fc550034d507d6c76dd2901"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_memberships" DROP CONSTRAINT "FK_86ae2efbb9ce84dd652e0c96a49"`,
    );
    await queryRunner.query(
      `ALTER TABLE "model_has_roles" DROP CONSTRAINT "FK_077ad2beff166b8cd68b6e485eb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "model_has_roles" DROP CONSTRAINT "FK_b5dd1765d08875537905531964a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "model_has_roles" DROP CONSTRAINT "FK_a93f01654e88cd71aeeac2d834b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_has_permissions" DROP CONSTRAINT "FK_09ff9df62bd01f8cf45b1b1921a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_has_permissions" DROP CONSTRAINT "FK_9135e97d2d840f7dfd6e6649116"`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" DROP CONSTRAINT "FK_55dc8a573b4ceb933103cf999ba"`,
    );
    await queryRunner.query(
      `ALTER TABLE "feature_settings" DROP CONSTRAINT "FK_4d54f8caacea0756e1b036b67a7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "feature_settings" DROP CONSTRAINT "FK_d100b5d488deaffaef6d2b3eaf8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_events" DROP CONSTRAINT "FK_319538ad97e5045f06f1eabe9b2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" DROP CONSTRAINT "FK_eaab24d5f655c21ee24f58efc5e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" DROP CONSTRAINT "FK_9679a4d285712a38f85f9005622"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_groups" DROP CONSTRAINT "FK_8c5b6df45989190137765ef2230"`,
    );
    await queryRunner.query(`DROP TABLE "school_operating_profiles"`);
    await queryRunner.query(
      `DROP INDEX "public"."school_memberships_school_status_index"`,
    );
    await queryRunner.query(`DROP TABLE "school_memberships"`);
    await queryRunner.query(
      `DROP INDEX "public"."organization_memberships_user_status_index"`,
    );
    await queryRunner.query(`DROP TABLE "organization_memberships"`);
    await queryRunner.query(
      `DROP INDEX "public"."model_has_roles_school_role_index"`,
    );
    await queryRunner.query(`DROP INDEX "public"."model_has_roles_role_index"`);
    await queryRunner.query(`DROP TABLE "model_has_roles"`);
    await queryRunner.query(
      `DROP INDEX "public"."role_has_permissions_permission_index"`,
    );
    await queryRunner.query(`DROP TABLE "role_has_permissions"`);
    await queryRunner.query(`DROP INDEX "public"."roles_school_index"`);
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(`DROP TABLE "permissions"`);
    await queryRunner.query(`DROP TABLE "feature_settings"`);
    await queryRunner.query(`DROP INDEX "public"."schools_organization_index"`);
    await queryRunner.query(
      `DROP INDEX "public"."schools_billing_group_index"`,
    );
    await queryRunner.query(`DROP TABLE "schools"`);
    await queryRunner.query(`DROP TABLE "billing_groups"`);
    await queryRunner.query(`DROP TABLE "organizations"`);
  }
}
